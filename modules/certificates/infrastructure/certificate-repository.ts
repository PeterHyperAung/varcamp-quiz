import { Kysely } from "kysely";

import { runInTransaction } from "@/lib/db/transaction";
import { generatePublicId } from "@/lib/ids";
import type {
  CertificateRow,
  Database,
  NewCertificate,
  QuizAttemptRow,
} from "@/lib/db/types";

export interface IssueCertificateInput {
  attempt: QuizAttemptRow;
  quizTitle: string;
  participantName: string;
  score: number;
  maxScore: number;
  percentage: number;
  templateVersion: string;
}

export interface CertificateEligibilitySource {
  attempt: QuizAttemptRow;
  certificateEnabled: boolean;
  passingScore: number | null;
  templateVersion: string;
  quizTitle: string;
}

export class CertificateRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Single-query read model for eligibility.
   *
   * The certificates module needs the attempt, the version settings and the
   * quiz title. Reading them together here keeps eligibility a pure function of
   * trusted database state and avoids reaching into the quizzes or
   * quiz-attempts repositories.
   */
  async loadEligibilitySource(
    attemptId: string,
  ): Promise<CertificateEligibilitySource | null> {
    const row = await this.db
      .selectFrom("quiz_attempts as a")
      .innerJoin("quiz_versions as v", "v.id", "a.quiz_version_id")
      .innerJoin("quizzes as q", "q.id", "a.quiz_id")
      .select([
        "a.id",
        "a.public_id",
        "a.quiz_id",
        "a.quiz_version_id",
        "a.status",
        "a.participant_name",
        "a.score",
        "a.max_score",
        "a.percentage",
        "a.passed",
        "a.started_at",
        "a.submitted_at",
        "a.created_at",
        "a.updated_at",
        "v.certificate_enabled",
        "v.passing_score",
        "v.certificate_template_version as template_version",
        "q.title as quiz_title",
      ])
      .where("a.id", "=", attemptId)
      .executeTakeFirst();

    if (!row) return null;

    const {
      certificate_enabled: certificateEnabled,
      passing_score: passingScore,
      template_version: templateVersion,
      quiz_title: quizTitle,
      ...attempt
    } = row;

    return {
      attempt,
      certificateEnabled,
      passingScore,
      templateVersion,
      quizTitle,
    };
  }

  async findByAttemptId(attemptId: string): Promise<CertificateRow | null> {
    const certificate = await this.db
      .selectFrom("certificates")
      .selectAll()
      .where("attempt_id", "=", attemptId)
      .executeTakeFirst();

    return certificate ?? null;
  }

  async findByPublicId(publicId: string): Promise<CertificateRow | null> {
    const certificate = await this.db
      .selectFrom("certificates")
      .selectAll()
      .where("public_id", "=", publicId)
      .executeTakeFirst();

    return certificate ?? null;
  }

  /**
   * Issues a certificate for an attempt, or returns the existing one.
   *
   * The unique constraint on `attempt_id` is the real guard against duplicate
   * issuance; the insert simply reports the conflict back to the caller.
   */
  async issue(input: IssueCertificateInput): Promise<CertificateRow> {
    return runInTransaction(this.db, async (trx) => {
      const existing = await trx
        .selectFrom("certificates")
        .selectAll()
        .where("attempt_id", "=", input.attempt.id)
        .forUpdate()
        .executeTakeFirst();

      if (existing) return existing;

      try {
        return await trx
          .insertInto("certificates")
          .values({
            public_id: generatePublicId(),
            attempt_id: input.attempt.id,
            quiz_id: input.attempt.quiz_id,
            quiz_version_id: input.attempt.quiz_version_id,
            participant_name: input.participantName,
            quiz_title: input.quizTitle,
            score: input.score,
            max_score: input.maxScore,
            percentage: input.percentage,
            template_version: input.templateVersion,
          } satisfies NewCertificate)
          .returningAll()
          .executeTakeFirstOrThrow();
      } catch (error) {
        // Lost the race against a concurrent issuance: fall back to the winner.
        const raced = await trx
          .selectFrom("certificates")
          .selectAll()
          .where("attempt_id", "=", input.attempt.id)
          .executeTakeFirst();

        if (raced) return raced;
        throw error;
      }
    });
  }

  async listForQuiz(
    quizId: string,
    options: { limit: number; offset: number },
  ): Promise<{ rows: CertificateRow[]; total: number }> {
    const rows = await this.db
      .selectFrom("certificates")
      .selectAll()
      .where("quiz_id", "=", quizId)
      .orderBy("issued_at", "desc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();

    const countRow = await this.db
      .selectFrom("certificates")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("quiz_id", "=", quizId)
      .executeTakeFirstOrThrow();

    return { rows, total: Number(countRow.count) };
  }

  async revoke(certificateId: string, at: Date): Promise<void> {
    await this.db
      .updateTable("certificates")
      .set({ revoked_at: at })
      .where("id", "=", certificateId)
      .execute();
  }
}