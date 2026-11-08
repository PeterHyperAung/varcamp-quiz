import { ValidationError } from "@/lib/errors";
import type { QuestionType } from "@/lib/domain/enums";

export interface ScorableOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

export interface ScorableQuestion {
  id: string;
  position: number;
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: ScorableOption[];
}

/**
 * The trusted, published quiz content used for scoring.
 *
 * This is always loaded from the database on the server. Client-supplied
 * scores, correctness or correct-answer ids are never consulted.
 */
export interface ScoringContext {
  quizVersionId: string;
  questions: ScorableQuestion[];
  /** Percentage 0-100 required to pass, or null when nothing can be failed. */
  passingScore: number | null;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface GradedAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface AttemptResult {
  answers: GradedAnswer[];
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
}

/**
 * Grades a submission against trusted published content.
 *
 * Rules, made explicit rather than implied by the UI:
 *   * Every question in the published version must be answered exactly once.
 *   * A selection that does not belong to the question it was submitted for is
 *     a client error, not a wrong answer.
 *   * `passed` is true when the quiz defines no passing score, because there is
 *     then nothing to fail.
 */
export function gradeSubmission(
  context: ScoringContext,
  submitted: readonly SubmittedAnswer[],
): AttemptResult {
  const byQuestionId = new Map(context.questions.map((q) => [q.id, q]));
  const errors: Record<string, string[]> = {};

  if (submitted.length !== context.questions.length) {
    throw new ValidationError("Answer every question before submitting.", {
      answers: [
        `Expected ${context.questions.length} answers but received ${submitted.length}.`,
      ],
    });
  }

  const seen = new Set<string>();
  const answers: GradedAnswer[] = [];

  submitted.forEach((answer, index) => {
    const question = byQuestionId.get(answer.questionId);

    if (!question) {
      errors[`answers.${index}`] = ["This answer does not belong to the quiz."];
      return;
    }

    if (seen.has(answer.questionId)) {
      errors[`answers.${index}`] = ["This question was answered more than once."];
      return;
    }
    seen.add(answer.questionId);

    if (answer.selectedOptionId === null) {
      errors[`answers.${index}`] = ["Choose an option for every question."];
      return;
    }

    const option = question.options.find((o) => o.id === answer.selectedOptionId);

    if (!option) {
      errors[`answers.${index}`] = ["The selected option is not valid for this question."];
      return;
    }

    answers.push({
      questionId: question.id,
      selectedOptionId: option.id,
      isCorrect: option.isCorrect,
      pointsAwarded: option.isCorrect ? question.points : 0,
    });
  });

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("Your answers could not be submitted.", errors);
  }

  const score = answers.reduce((sum, answer) => sum + answer.pointsAwarded, 0);
  const maxScore = context.questions.reduce((sum, question) => sum + question.points, 0);
  const percentage = maxScore === 0 ? 0 : round2((score / maxScore) * 100);
  const passed =
    context.passingScore === null ? true : percentage >= context.passingScore;

  return { answers, score, maxScore, percentage, passed };
}

/** Progress helper for the client-side quiz UI (never used for scoring). */
export function answeredQuestionCount(
  context: Pick<ScoringContext, "questions">,
  selectedOptionIds: Readonly<Record<string, string | undefined>>,
): number {
  return context.questions.filter((q) => Boolean(selectedOptionIds[q.id])).length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}