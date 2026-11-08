import { Kysely, sql } from "kysely";

import { runInTransaction } from "@/lib/db/transaction";
import { generatePublicId } from "@/lib/ids";
import type {
  AttemptAnswerRow,
  Database,
  NewAttemptAnswer,
  NewQuizAttempt,
  QuizAttemptRow,
} from "@/lib/db/types";
import type {
  AttemptResult,
  ScoringContext,
  ScorableQuestion,
  SubmittedAnswer,
} from "@/modules/quiz-attempts/domain/scoring";

export interface StartAttemptInput {
  quizId: string;
  quizVersionId: string;
  participantName: string | null;
  now: Date;
}

export interface AttemptQuestionResult {
  questionId: string;
  prompt: string;
  questionType: string;
  correct: boolean;
  pointsAwarded: number;
  selectedLabel: string | null;
  correctLabel: string | null;
}

export interface RankedAttemptRow {
  rank: number;
  attemptPublicId: string;
  participantName: string;
  score: number;
  maxScore: number;
  percentage: number;
  elapsedMs: number;
}

export class QuizAttemptRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: StartAttemptInput): Promise<QuizAttemptRow> {
    return this.db
      .insertInto("quiz_attempts")
      .values({
        public_id: generatePublicId(),
        quiz_id: input.quizId,
        quiz_version_id: input.quizVersionId,
        status: "in_progress",
        participant_name: input.participantName,
        started_at: input.now,
      } satisfies NewQuizAttempt)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<QuizAttemptRow | null> {
    const attempt = await this.db
      .selectFrom("quiz_attempts")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return attempt ?? null;
  }

  async findByPublicId(publicId: string): Promise<QuizAttemptRow | null> {
    const attempt = await this.db
      .selectFrom("quiz_attempts")
      .selectAll()
      .where("public_id", "=", publicId)
      .executeTakeFirst();

    return attempt ?? null;
  }

  /**
   * Loads trusted quiz content for scoring.
   *
   * This is the only source of truth for scoring; the client never supplies it.
   * A draft version returns `null` so it can never be scored against.
   */
  async loadScoringContext(quizVersionId: string): Promise<ScoringContext | null> {
    const version = await this.db
      .selectFrom("quiz_versions")
      .select(["id", "passing_score", "status"])
      .where("id", "=", quizVersionId)
      .executeTakeFirst();

    if (!version || version.status === "draft") return null;

    const questions = await this.db
      .selectFrom("questions")
      .selectAll()
      .where("quiz_version_id", "=", quizVersionId)
      .orderBy("position", "asc")
      .execute();

    if (questions.length === 0) return null;

    const options = await this.db
      .selectFrom("answer_options")
      .selectAll()
      .where(
        "question_id",
        "in",
        questions.map((question) => question.id),
      )
      .orderBy("position", "asc")
      .execute();

    const optionsByQuestion = new Map<string, ScorableQuestion["options"]>();
    for (const option of options) {
      const bucket = optionsByQuestion.get(option.question_id) ?? [];
      bucket.push({ id: option.id, label: option.label, isCorrect: option.is_correct });
      optionsByQuestion.set(option.question_id, bucket);
    }

    return {
      quizVersionId,
      passingScore: version.passing_score,
      questions: questions.map((question) => ({
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        questionType: question.question_type,
        points: question.points,
        options: optionsByQuestion.get(question.id) ?? [],
      })),
    };
  }

  /**
   * Writes the graded result and its answers atomically.
   *
   * The `status = 'in_progress'` predicate makes submission idempotent: a
   * double-clicked submit button matches zero rows instead of overwriting a
   * recorded score.
   */
  async submit(
    attemptId: string,
    submitted: readonly SubmittedAnswer[],
    result: AttemptResult,
    now: Date,
  ): Promise<boolean> {
    return runInTransaction(this.db, async (trx) => {
      const updated = await trx
        .updateTable("quiz_attempts")
        .set({
          status: "submitted",
          score: result.score,
          max_score: result.maxScore,
          percentage: result.percentage,
          passed: result.passed,
          submitted_at: now,
          updated_at: now,
        })
        .where("id", "=", attemptId)
        .where("status", "=", "in_progress")
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows) === 0) return false;

      await trx
        .insertInto("attempt_answers")
        .values(
          result.answers.map((answer) => ({
            attempt_id: attemptId,
            question_id: answer.questionId,
            selected_option_id: answer.selectedOptionId,
            is_correct: answer.isCorrect,
            points_awarded: answer.pointsAwarded,
          })) satisfies NewAttemptAnswer[],
        )
        .execute();

      return true;
    });
  }

  async saveParticipantName(attemptId: string, name: string): Promise<void> {
    await this.db
      .updateTable("quiz_attempts")
      .set({ participant_name: name, updated_at: new Date() })
      .where("id", "=", attemptId)
      .execute();
  }

  /**
   * Builds the review shown on the result page.
   *
   * This is the one place correct answers are revealed, and only for an attempt
   * that already has a recorded result.
   */
  async loadReview(attemptId: string): Promise<AttemptQuestionResult[]> {
    const answers: AttemptAnswerRow[] = await this.db
      .selectFrom("attempt_answers")
      .selectAll()
      .where("attempt_id", "=", attemptId)
      .execute();

    if (answers.length === 0) return [];

    const questionIds = answers.map((answer) => answer.question_id);

    const questions = await this.db
      .selectFrom("questions")
      .select(["id", "prompt", "question_type"])
      .where("id", "in", questionIds)
      .execute();

    const questionById = new Map(questions.map((question) => [question.id, question]));

    // Correct options for the same questions, and the options the participant
    // actually picked — two batched queries, no N+1.
    const correctOptions = await this.db
      .selectFrom("answer_options")
      .select(["question_id", "label"])
      .where("is_correct", "=", true)
      .where("question_id", "in", questionIds)
      .execute();

    const selectedIds = answers
      .map((answer) => answer.selected_option_id)
      .filter((id): id is string => Boolean(id));

    const selectedOptions =
      selectedIds.length > 0
        ? await this.db
            .selectFrom("answer_options")
            .select(["id", "label"])
            .where("id", "in", selectedIds)
            .execute()
        : [];

    const correctByQuestion = new Map(
      correctOptions.map((option) => [option.question_id, option.label]),
    );
    const labelByOptionId = new Map(
      selectedOptions.map((option) => [option.id, option.label]),
    );

    return answers.map((answer) => {
      const question = questionById.get(answer.question_id);

      return {
        questionId: answer.question_id,
        prompt: question?.prompt ?? "",
        questionType: question?.question_type ?? "",
        correct: answer.is_correct,
        pointsAwarded: answer.points_awarded,
        selectedLabel: answer.selected_option_id
          ? (labelByOptionId.get(answer.selected_option_id) ?? null)
          : null,
        correctLabel: correctByQuestion.get(answer.question_id) ?? null,
      };
    });
  }

  async listSubmittedForQuiz(
    quizId: string,
    options: { limit: number; offset: number },
  ): Promise<{ rows: QuizAttemptRow[]; total: number }> {
    const rows = await this.db
      .selectFrom("quiz_attempts")
      .selectAll()
      .where("quiz_id", "=", quizId)
      .where("status", "=", "submitted")
      .orderBy("submitted_at", "desc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();

    const countRow = await this.db
      .selectFrom("quiz_attempts")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("quiz_id", "=", quizId)
      .where("status", "=", "submitted")
      .executeTakeFirstOrThrow();

    return { rows, total: Number(countRow.count) };
  }

  /**
   * Ranks named, submitted attempts by percentage first and server-recorded
   * elapsed time second. A stable final tie-break keeps ranks deterministic.
   * When supplied, the participant's own row is included even outside the top
   * `limit`, allowing the result page to show their overall position.
   */
  async listLeaderboard(
    quizId: string,
    options: { limit: number; currentAttemptPublicId?: string },
  ): Promise<RankedAttemptRow[]> {
    const elapsedMs = sql<number>`greatest(0, extract(epoch from (submitted_at - started_at)) * 1000)`;
    const rank = sql<number>`row_number() over (
      order by percentage desc,
        greatest(0, extract(epoch from (submitted_at - started_at)) * 1000) asc,
        submitted_at asc,
        id asc
    )`;

    const rankedAttempts = this.db
      .selectFrom("quiz_attempts")
      .select([
        "public_id",
        "participant_name",
        "score",
        "max_score",
        "percentage",
        elapsedMs.as("elapsed_ms"),
        rank.as("rank"),
      ])
      .where("quiz_id", "=", quizId)
      .where("status", "=", "submitted")
      .where("participant_name", "is not", null)
      .where("percentage", "is not", null)
      .where("submitted_at", "is not", null);

    let query = this.db.selectFrom(rankedAttempts.as("ranked")).select([
      "ranked.public_id",
      "ranked.participant_name",
      "ranked.score",
      "ranked.max_score",
      "ranked.percentage",
      "ranked.elapsed_ms",
      "ranked.rank",
    ]);

    query = query.where((eb) => {
      const conditions = [eb("ranked.rank", "<=", options.limit)];
      if (options.currentAttemptPublicId) {
        conditions.push(eb("ranked.public_id", "=", options.currentAttemptPublicId));
      }
      return eb.or(conditions);
    });

    const rows = await query.orderBy("ranked.rank", "asc").execute();

    return rows.map((row) => ({
      rank: Number(row.rank),
      attemptPublicId: row.public_id,
      participantName: row.participant_name!,
      score: Number(row.score),
      maxScore: Number(row.max_score),
      percentage: Number(row.percentage),
      elapsedMs: Number(row.elapsed_ms),
    }));
  }
}
