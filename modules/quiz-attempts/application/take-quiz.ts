import type { Kysely } from "kysely";

import { systemClock, type Clock } from "@/lib/clock";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { isPublicId } from "@/lib/ids";
import type { CertificateRow, Database, QuizAttemptRow } from "@/lib/db/types";
import {
  startAttemptInputSchema,
  submitAttemptInputSchema,
} from "@/lib/validation/attempts";
import {
  assertCertificateNameProvided,
  assertParticipantNameProvided,
  assertResultAvailable,
  assertSubmittable,
  normaliseParticipantName,
} from "../domain/attempt";
import { gradeSubmission, type SubmittedAnswer } from "../domain/scoring";
import {
  QuizAttemptRepository,
  type AttemptQuestionResult,
} from "../infrastructure/quiz-attempt-repository";
import { QuizRepository } from "@/modules/quizzes/infrastructure/quiz-repository";
import {
  getCertificateForAttempt,
  issueCertificateIfEligible,
} from "@/modules/certificates/application/issue-certificate";

export interface PublicQuizView {
  quizId: string;
  title: string;
  description: string | null;
  instructions: string | null;
  passingScore: number | null;
  certificateEnabled: boolean;
  questions: Array<{
    id: string;
    position: number;
    prompt: string;
    questionType: "multiple_choice" | "true_false";
    options: Array<{ id: string; label: string }>;
  }>;
}

export interface AttemptResultView {
  attemptPublicId: string;
  quizTitle: string;
  participantName: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  passingScore: number | null;
  submittedAt: Date;
  elapsedMs: number;
  review: AttemptQuestionResult[];
  certificate: CertificateRow | null;
}

export interface LeaderboardEntry {
  rank: number;
  participantName: string;
  score: number;
  maxScore: number;
  percentage: number;
  elapsedMs: number;
  isCurrentPlayer: boolean;
}

export interface QuizLeaderboard {
  entries: LeaderboardEntry[];
  currentPlayer: LeaderboardEntry | null;
}

export const LEADERBOARD_LIMIT = 100;

/**
 * Public, anonymous quiz participation.
 *
 * Attempts pin the exact published version at start time, so a quiz edited or
 * republished mid-session can never change what a participant is scored
 * against. No account is required at any point.
 */
export class TakeQuiz {
  private readonly quizzes: QuizRepository;
  private readonly attempts: QuizAttemptRepository;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly clock: Clock = systemClock,
  ) {
    this.quizzes = new QuizRepository(db);
    this.attempts = new QuizAttemptRepository(db);
  }

  async getPublicQuiz(publicId: string): Promise<PublicQuizView | null> {
    const published = await this.quizzes.loadPublishedQuizByPublicId(publicId);
    if (!published) return null;

    return {
      quizId: published.quiz.id,
      title: published.quiz.title,
      description: published.quiz.description,
      instructions: published.version.instructions,
      passingScore: published.version.passing_score,
      certificateEnabled: published.version.certificate_enabled,
      questions: published.questions.map((question) => ({
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        questionType: question.questionType,
        options: question.options,
      })),
    };
  }

  /** Opens an attempt against the currently published version. */
  async start(rawInput: {
    quizPublicId: string;
    /** `null` means "no name given"; the domain normaliser collapses blanks. */
    participantName?: string | null;
  }): Promise<{ attemptPublicId: string }> {
    const input = startAttemptInputSchema.parse({
      participantName: rawInput.participantName ?? "",
    });

    const publicId = rawInput.quizPublicId;
    if (typeof publicId !== "string" || !isPublicId(publicId)) {
      throw new NotFoundError("Quiz not found.");
    }

    const quiz = await this.quizzes.findByPublicId(publicId);
    if (!quiz || quiz.publication_status !== "published" || !quiz.published_version_id) {
      throw new NotFoundError("This quiz is not accepting participants.");
    }

    const version = await this.quizzes.findVersion(quiz.published_version_id);
    if (!version) throw new NotFoundError("This quiz is not accepting participants.");

    const participantName = normaliseParticipantName(input.participantName);
    assertParticipantNameProvided(participantName);
    assertCertificateNameProvided(version.certificate_enabled, participantName);

    const attempt = await this.attempts.create({
      quizId: quiz.id,
      quizVersionId: quiz.published_version_id,
      participantName,
      now: this.clock.now(),
    });

    return { attemptPublicId: attempt.public_id };
  }

  /**
   * Grades and stores a submission.
   *
   * Grading, the attempt result and certificate eligibility all commit in one
   * transaction, so a visible result always has a matching certificate
   * decision. A duplicate submit is rejected rather than overwriting a recorded
   * score.
   */
  async submit(rawInput: {
    attemptPublicId: string;
    participantName?: string | null;
    answers: unknown;
  }): Promise<{ attemptPublicId: string; certificatePublicId: string | null }> {
    const participantName = normaliseParticipantName(rawInput.participantName);
    const parsed = submitAttemptInputSchema.parse({ answers: rawInput.answers });

    const attempt = await this.attempts.findByPublicId(rawInput.attemptPublicId);
    if (!attempt) throw new NotFoundError("This attempt does not exist.");

    assertSubmittable(attempt.status);

    const context = await this.attempts.loadScoringContext(attempt.quiz_version_id);
    if (!context) {
      throw new NotFoundError("The quiz version for this attempt is unavailable.");
    }

    const version = await this.quizzes.findVersion(attempt.quiz_version_id);

    // The name may have been given on the start form or on this one; whichever
    // form supplied it, a certificate-bearing quiz needs it before submitting.
    const effectiveName = participantName ?? attempt.participant_name;
    assertCertificateNameProvided(version?.certificate_enabled ?? false, effectiveName);

    const submitted: SubmittedAnswer[] = parsed.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
    }));

    // Grading reads only trusted, pinned version content.
    const result = gradeSubmission(context, submitted);
    const now = this.clock.now();

    const certificate = await this.db.transaction().execute(async (trx) => {
      const scopedAttempts = new QuizAttemptRepository(trx);

      if (participantName && participantName !== attempt.participant_name) {
        await scopedAttempts.saveParticipantName(attempt.id, participantName);
      }

      const stored = await scopedAttempts.submit(attempt.id, submitted, result, now);

      if (!stored) {
        throw new ConflictError("This quiz has already been submitted.");
      }

      return issueCertificateIfEligible(trx, attempt.id);
    });

    return {
      attemptPublicId: attempt.public_id,
      certificatePublicId: certificate?.public_id ?? null,
    };
  }

  /** Loads the result page for a public attempt link. */
  async getResult(attemptPublicId: string): Promise<AttemptResultView> {
    const attempt = await this.attempts.findByPublicId(attemptPublicId);
    if (!attempt) throw new NotFoundError("This attempt does not exist.");

    assertResultAvailable(attempt.status);

    const quiz = await this.quizzes.findById(attempt.quiz_id);
    const version = await this.quizzes.findVersion(attempt.quiz_version_id);

    return {
      attemptPublicId: attempt.public_id,
      quizTitle: quiz?.title ?? "Quiz",
      participantName: attempt.participant_name,
      score: Number(attempt.score ?? 0),
      maxScore: Number(attempt.max_score ?? 0),
      percentage: Number(attempt.percentage ?? 0),
      passed: Boolean(attempt.passed),
      passingScore: version?.passing_score ?? null,
      submittedAt: attempt.submitted_at ?? attempt.updated_at,
      elapsedMs: elapsedMilliseconds(attempt.started_at, attempt.submitted_at ?? attempt.updated_at),
      review: await this.attempts.loadReview(attempt.id),
      certificate: await getCertificateForAttempt(this.db, attempt.id),
    };
  }

  async getAttempt(attemptPublicId: string): Promise<QuizAttemptRow | null> {
    return this.attempts.findByPublicId(attemptPublicId);
  }

  async listSubmittedForQuiz(
    quizId: string,
    options: { limit: number; offset: number },
  ): Promise<{ rows: QuizAttemptRow[]; total: number }> {
    return this.attempts.listSubmittedForQuiz(quizId, options);
  }

  async getLeaderboard(
    quizId: string,
    currentAttemptPublicId?: string,
  ): Promise<QuizLeaderboard> {
    const ranked = await this.attempts.listLeaderboard(quizId, {
      limit: LEADERBOARD_LIMIT,
      currentAttemptPublicId,
    });

    const current = currentAttemptPublicId
      ? ranked.find((entry) => entry.attemptPublicId === currentAttemptPublicId)
      : undefined;
    const entries = ranked
      .filter((entry) => entry.rank <= LEADERBOARD_LIMIT)
      .map((entry) => toLeaderboardEntry(entry, entry.attemptPublicId === currentAttemptPublicId));

    return {
      entries,
      currentPlayer: current ? toLeaderboardEntry(current, true) : null,
    };
  }
}

function elapsedMilliseconds(startedAt: Date, submittedAt: Date): number {
  return Math.max(0, submittedAt.getTime() - startedAt.getTime());
}

function toLeaderboardEntry(
  entry: {
    rank: number;
    attemptPublicId: string;
    participantName: string;
    score: number;
    maxScore: number;
    percentage: number;
    elapsedMs: number;
  },
  isCurrentPlayer = false,
): LeaderboardEntry {
  return {
    rank: Number(entry.rank),
    participantName: entry.participantName,
    score: Number(entry.score),
    maxScore: Number(entry.maxScore),
    percentage: Number(entry.percentage),
    elapsedMs: Number(entry.elapsedMs),
    isCurrentPlayer,
  };
}
