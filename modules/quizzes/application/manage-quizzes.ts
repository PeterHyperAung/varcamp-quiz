import type { Kysely } from "kysely";

import { systemClock, type Clock } from "@/lib/clock";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type {
  Database,
  QuestionType,
  QuizRow,
  QuizVersionRow,
} from "@/lib/db/types";
import type { Question } from "@/modules/quizzes/domain/quiz-content";
import {
  quizInputSchema,
  quizSettingsInputSchema,
  type QuestionInput,
} from "@/lib/validation/quizzes";
import { validateQuestion } from "../domain/quiz-content";
import {
  assertCanArchive,
  assertCanPublish,
  assertCanUnpublish,
  assertVersionEditable,
} from "../domain/publishing";
import { QuizRepository } from "../infrastructure/quiz-repository";

export interface AdminQuizDetail {
  quiz: QuizRow;
  editableVersion: QuizVersionRow | null;
  publishedVersion: QuizVersionRow | null;
  questions: Question[];
}

export class ManageQuizzes {
  private readonly quizzes: QuizRepository;

  constructor(
    db: Kysely<Database>,
    private readonly clock: Clock = systemClock,
  ) {
    this.quizzes = new QuizRepository(db);
  }

  async create(rawInput: unknown, createdBy: string): Promise<QuizRow> {
    const input = quizInputSchema.parse(rawInput);
    return this.quizzes.create({
      title: input.title,
      description: input.description || null,
      createdBy,
    });
  }

  async updateDetails(quizId: string, rawInput: unknown): Promise<void> {
    const input = quizInputSchema.parse(rawInput);
    await this.requireUnpublishedQuiz(quizId);
    await this.quizzes.updateDetails(quizId, {
      title: input.title,
      description: input.description || null,
    });
  }

  /**
   * Loads the admin editor view, opening a draft when needed.
   *
   * Published quizzes stay read-only. A draft is opened only after a quiz is
   * unpublished, so administrators cannot accidentally edit a version that is
   * still live.
   */
  async getForEditing(quizId: string): Promise<AdminQuizDetail> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    const now = this.clock.now();

    let editableVersion =
      quiz.editable_version_id !== null
        ? await this.quizzes.findVersion(quiz.editable_version_id)
        : null;

    if (editableVersion?.status !== "draft") {
      editableVersion = null;
    }

    if (!editableVersion && quiz.publication_status === "draft") {
      editableVersion = await this.quizzes.ensureDraftVersion(quizId, now);
    }

    const publishedVersion = quiz.published_version_id
      ? await this.quizzes.findVersion(quiz.published_version_id)
      : null;

    const displayVersionId = editableVersion?.id ?? publishedVersion?.id;

    return {
      quiz: await this.quizzes.findById(quizId).then((q) => q ?? quiz),
      editableVersion,
      publishedVersion,
      questions: displayVersionId
        ? await this.quizzes.loadQuestions(displayVersionId)
        : [],
    };
  }

  async updateSettings(quizId: string, rawInput: unknown): Promise<void> {
    const input = quizSettingsInputSchema.parse(rawInput);
    const version = await this.requireEditableVersion(quizId);

    await this.quizzes.updateVersionSettings(version.id, {
      instructions: input.instructions || null,
      passingScore: input.passingScore,
      certificateEnabled: input.certificateEnabled,
    });
  }

  async addQuestion(quizId: string, rawInput: unknown): Promise<void> {
    const input = normaliseQuestion(rawInput);
    const version = await this.requireEditableVersion(quizId);

    const question = await this.quizzes.addQuestion(version.id, {
      prompt: input.prompt,
      questionType: input.questionType,
      points: input.points,
      options: [],
    });

    await this.quizzes.replaceQuestionOptions(
      question.id,
      input.options.map((option) => ({
        label: option.label,
        isCorrect: option.isCorrect,
      })),
    );
  }

  async updateQuestion(quizId: string, questionId: string, rawInput: unknown): Promise<void> {
    const input = normaliseQuestion(rawInput);
    const version = await this.requireEditableVersion(quizId);

    const existing = await this.quizzes.findQuestion(questionId);
    if (!existing || existing.quiz_version_id !== version.id) {
      throw new NotFoundError("Question not found in the current draft.");
    }

    await this.quizzes.updateQuestion(questionId, {
      prompt: input.prompt,
      questionType: input.questionType,
      points: input.points,
    });

    await this.quizzes.replaceQuestionOptions(
      questionId,
      input.options.map((option) => ({
        label: option.label,
        isCorrect: option.isCorrect,
      })),
    );
  }

  async deleteQuestion(quizId: string, questionId: string): Promise<void> {
    const version = await this.requireEditableVersion(quizId);
    const existing = await this.quizzes.findQuestion(questionId);

    if (!existing || existing.quiz_version_id !== version.id) {
      throw new NotFoundError("Question not found in the current draft.");
    }

    await this.quizzes.deleteQuestion(questionId);

    // Close the gap left in the position sequence so reordering stays simple.
    const remaining = await this.quizzes.loadQuestions(version.id);
    await this.quizzes.reorderQuestions(
      version.id,
      remaining.map((question) => question.id),
    );
  }

  async reorderQuestions(quizId: string, orderedQuestionIds: string[]): Promise<void> {
    const version = await this.requireEditableVersion(quizId);

    const current = await this.quizzes.loadQuestions(version.id);
    const known = new Set(current.map((question) => question.id));

    if (orderedQuestionIds.some((id) => !known.has(id))) {
      throw new ValidationError("The new order contains an unknown question.");
    }

    await this.quizzes.reorderQuestions(version.id, orderedQuestionIds);
  }

  /**
   * Freezes the draft and makes it the live version.
   *
   * Content validation runs again here (not just on save) so a version that was
   * left in an invalid state can never become public.
   */
  async publish(quizId: string): Promise<QuizVersionRow> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    const version = await this.requireEditableVersion(quizId);
    assertVersionEditable(version.status);

    const content = await this.quizzes.loadDomainContent(version.id);
    assertCanPublish(quiz.publication_status, content);

    return this.quizzes.publishDraftVersion(quizId, this.clock.now());
  }

  /**
   * Hides the public link but keeps the published version and every historical
   * attempt intact.
   */
  async unpublish(quizId: string): Promise<void> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    assertCanUnpublish(quiz.publication_status);
    await this.quizzes.setPublicationStatus(quizId, "draft");
  }

  async archive(quizId: string): Promise<void> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    assertCanArchive(quiz.publication_status);
    await this.quizzes.setPublicationStatus(quizId, "archived");
  }

  async restore(quizId: string): Promise<void> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    if (quiz.publication_status !== "archived") {
      throw new ConflictError("Only an archived quiz can be restored.");
    }

    // Restoring keeps the quiz unpublished until an administrator publishes
    // again, so archived content never silently goes live.
    await this.quizzes.setPublicationStatus(quizId, "draft");
  }

  async listForAdmin(options: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ rows: Array<QuizRow & { attempt_count: number }>; total: number }> {
    return this.quizzes.listForAdmin(options);
  }

  private async requireEditableVersion(quizId: string): Promise<QuizVersionRow> {
    const quiz = await this.requireUnpublishedQuiz(quizId);

    const version = quiz.editable_version_id
      ? await this.quizzes.findVersion(quiz.editable_version_id)
      : null;

    if (!version || version.status !== "draft") {
      throw new ConflictError(
        "This quiz has no editable draft. Reload the page to start a new draft.",
      );
    }

    return version;
  }

  private async requireUnpublishedQuiz(quizId: string): Promise<QuizRow> {
    const quiz = await this.quizzes.findById(quizId);
    if (!quiz) throw new NotFoundError("Quiz not found.");

    if (quiz.publication_status === "published") {
      throw new ConflictError("Unpublish this quiz before editing it.");
    }

    if (quiz.publication_status === "archived") {
      throw new ConflictError("Restore this quiz as a draft before editing it.");
    }

    return quiz;
  }
}

/**
 * Validates one question payload.
 *
 * Reuses the shared domain validator so admin edits and the public quiz reader
 * agree on exactly what a valid question is.
 */
function normaliseQuestion(rawInput: unknown): {
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: Array<{ label: string; isCorrect: boolean }>;
} {
  const input = rawInput as QuestionInput;

  const candidate = {
    prompt: input.prompt?.trim() ?? "",
    questionType: input.questionType,
    points: Number(input.points),
    options: (input.options ?? []).map((option) => ({
      label: (option.label ?? "").trim(),
      isCorrect: Boolean(option.isCorrect),
    })),
  };

  validateQuestion(candidate);

  return candidate;
}
