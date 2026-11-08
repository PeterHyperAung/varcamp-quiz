import { ValidationError } from "@/lib/errors";
import type { QuestionType } from "@/lib/domain/enums";

export const MIN_OPTION_COUNT = 2;
export const MAX_OPTION_COUNT = 8;
export const MAX_OPTIONS_PER_TRUE_FALSE = 2;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_OPTION_LABEL_LENGTH = 300;
export const MAX_POINTS = 100;

export interface AnswerOptionInput {
  label: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: AnswerOptionInput[];
}

export interface QuestionOption {
  id: string;
  position: number;
  label: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  position: number;
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: QuestionOption[];
}

export interface QuizVersionContent {
  instructions: string | null;
  passingScore: number | null;
  certificateEnabled: boolean;
  questions: Question[];
}

export interface Quiz {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  publicationStatus: "draft" | "published" | "archived";
}

function validateOptions(
  questionType: QuestionType,
  options: AnswerOptionInput[],
  pathPrefix: string,
  errors: Record<string, string[]>,
): void {
  const path = `${pathPrefix}.options`;

  if (!Array.isArray(options) || options.length < MIN_OPTION_COUNT) {
    errors[path] = ["A question needs at least two answer options."];
    return;
  }

  if (questionType === "true_false" && options.length !== MAX_OPTIONS_PER_TRUE_FALSE) {
    errors[path] = ["A true/false question needs exactly two options."];
    return;
  }

  if (options.length > MAX_OPTION_COUNT) {
    errors[path] = [`A question can have at most ${MAX_OPTION_COUNT} options.`];
    return;
  }

  const labels = new Set<string>();
  options.forEach((option, optionIndex) => {
    const label = option.label?.trim() ?? "";
    if (label.length === 0) {
      errors[`${path}.${optionIndex}.label`] = ["Option label is required."];
    } else if (label.length > MAX_OPTION_LABEL_LENGTH) {
      errors[`${path}.${optionIndex}.label`] = [
        `Option label must be at most ${MAX_OPTION_LABEL_LENGTH} characters.`,
      ];
    }

    const normalized = label.toLowerCase();
    if (labels.has(normalized)) {
      errors[`${path}.${optionIndex}.label`] = ["Option labels must be unique."];
    }
    labels.add(normalized);
  });

  const correct = options.filter((option) => option.isCorrect);
  if (correct.length !== 1) {
    errors[path] = [
      "Mark exactly one option as the correct answer.",
    ];
  }
}

/**
 * Validates a single question.
 *
 * Exposed separately so the admin editor can validate one question at a time
 * using exactly the same rules the publish path applies to a whole version.
 */
export function validateQuestion(
  question: {
    prompt: string;
    questionType: QuestionType;
    points: number;
    options: AnswerOptionInput[];
  },
  pathPrefix = "question",
): void {
  const errors: Record<string, string[]> = {};

  const prompt = question.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    errors[`${pathPrefix}.prompt`] = ["Question prompt is required."];
  } else if (prompt.length > MAX_PROMPT_LENGTH) {
    errors[`${pathPrefix}.prompt`] = [
      `Question prompt must be at most ${MAX_PROMPT_LENGTH} characters.`,
    ];
  }

  if (!Number.isInteger(question.points) || question.points < 1) {
    errors[`${pathPrefix}.points`] = ["Points must be at least 1."];
  } else if (question.points > MAX_POINTS) {
    errors[`${pathPrefix}.points`] = [`Points must be at most ${MAX_POINTS}.`];
  }

  validateOptions(question.questionType, question.options ?? [], pathPrefix, errors);

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("This question is not valid.", errors);
  }
}

/**
 * Validates the full content of a quiz version.
 *
 * Used when saving a draft question and again immediately before publishing,
 * so an incomplete version can never become public.
 */
export function validateQuizVersionContent(
  content: QuizVersionContent,
): void {
  const errors: Record<string, string[]> = {};

  if (content.passingScore !== null) {
    if (
      !Number.isInteger(content.passingScore) ||
      content.passingScore < 0 ||
      content.passingScore > 100
    ) {
      errors.passingScore = [
        "Passing score must be a whole number between 0 and 100.",
      ];
    }
  }

  if (content.questions.length === 0) {
    errors.questions = ["Add at least one question before saving."];
  }

  content.questions.forEach((question, index) => {
    try {
      validateQuestion(question, `questions.${index}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        Object.assign(errors, error.fieldErrors);
      } else {
        throw error;
      }
    }
  });

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("This quiz version is not ready to be saved.", errors);
  }
}

export function totalPoints(questions: Question[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0);
}