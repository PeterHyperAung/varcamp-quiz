import { Kysely } from "kysely";

import { runInTransaction } from "@/lib/db/transaction";
import { generatePublicId } from "@/lib/ids";
import type {
  AnswerOptionRow,
  Database,
  NewAnswerOption,
  NewQuestion,
  NewQuiz,
  PublicationStatus,
  QuestionRow,
  QuestionType,
  QuizRow,
  QuizVersionRow,
} from "@/lib/db/types";
import type {
  AnswerOptionInput,
  Question,
  QuizVersionContent,
} from "@/modules/quizzes/domain/quiz-content";

export interface CreateQuizInput {
  title: string;
  description: string | null;
  createdBy: string;
}

export interface VersionSettingsInput {
  instructions: string | null;
  passingScore: number | null;
  certificateEnabled: boolean;
}

export interface CreateQuestionInput {
  prompt: string;
  questionType: QuestionType;
  points: number;
  options: AnswerOptionInput[];
}

export interface LoadedVersionContent {
  version: QuizVersionRow;
  questions: Question[];
}

/** A published question with the correct-answer flags stripped out. */
export type PublicQuestion = Omit<Question, "options"> & {
  options: Array<{ id: string; label: string }>;
};

export class QuizRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /* ------------------------------- quizzes ------------------------------ */

  async create(input: CreateQuizInput): Promise<QuizRow> {
    return runInTransaction(this.db, async (trx) => {
      const quiz = await trx
        .insertInto("quizzes")
        .values({
          public_id: generatePublicId(),
          title: input.title,
          description: input.description,
          publication_status: "draft",
          created_by: input.createdBy,
        } satisfies NewQuiz)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Every quiz starts with an editable draft so the editor always has a
      // version to write into, even when the quiz has no questions yet.
      const version = await trx
        .insertInto("quiz_versions")
        .values({ quiz_id: quiz.id, version: 1, status: "draft" })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable("quizzes")
        .set({ editable_version_id: version.id, updated_at: new Date() })
        .where("id", "=", quiz.id)
        .execute();

      return { ...quiz, editable_version_id: version.id };
    });
  }

  async findById(id: string): Promise<QuizRow | null> {
    const quiz = await this.db
      .selectFrom("quizzes")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return quiz ?? null;
  }

  async findByPublicId(publicId: string): Promise<QuizRow | null> {
    const quiz = await this.db
      .selectFrom("quizzes")
      .selectAll()
      .where("public_id", "=", publicId)
      .executeTakeFirst();

    return quiz ?? null;
  }

  async updateDetails(
    quizId: string,
    details: { title: string; description: string | null },
  ): Promise<void> {
    await this.db
      .updateTable("quizzes")
      .set({ ...details, updated_at: new Date() })
      .where("id", "=", quizId)
      .execute();
  }

  async setPublicationStatus(
    quizId: string,
    publicationStatus: PublicationStatus,
  ): Promise<void> {
    await this.db
      .updateTable("quizzes")
      .set({ publication_status: publicationStatus, updated_at: new Date() })
      .where("id", "=", quizId)
      .execute();
  }

  /**
   * Published quizzes for public discovery.
   *
   * A small projection: the public listing never needs editing pointers.
   */
  async listPublished(options: {
    limit: number;
    offset: number;
  }): Promise<Array<Pick<QuizRow, "id" | "public_id" | "title" | "description">>> {
    return this.db
      .selectFrom("quizzes")
      .select(["id", "public_id", "title", "description"])
      .where("publication_status", "=", "published")
      .orderBy("title", "asc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();
  }

  /** Paginated admin listing with a submitted-attempt count per quiz. */
  async listForAdmin(options: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ rows: Array<QuizRow & { attempt_count: number }>; total: number }> {
    const search = options.search?.trim();
    const pattern = search ? `%${search.toLowerCase()}%` : null;

    let base = this.db.selectFrom("quizzes as q");

    if (pattern) {
      base = base.where((eb) =>
        eb.or([
          eb("q.title", "ilike", pattern),
          eb("q.description", "ilike", pattern),
        ]),
      );
    }

    const rows = await base
      .selectAll("q")
      .select((eb) =>
        eb
          .selectFrom("quiz_attempts as a")
          .select((inner) => inner.fn.count<string>("a.id").as("attempt_count"))
          .whereRef("a.quiz_id", "=", "q.id")
          .where("a.status", "=", "submitted")
          .as("attempt_count"),
      )
      .orderBy("q.updated_at", "desc")
      .limit(options.limit)
      .offset(options.offset)
      .execute();

    let countQuery = this.db
      .selectFrom("quizzes")
      .select((eb) => eb.fn.countAll<string>().as("count"));

    if (pattern) {
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb("title", "ilike", pattern),
          eb("description", "ilike", pattern),
        ]),
      );
    }

    const countRow = await countQuery.executeTakeFirst();

    return {
      rows: rows.map((row) => ({
        ...row,
        attempt_count: Number(row.attempt_count ?? 0),
      })),
      total: Number(countRow?.count ?? 0),
    };
  }

  /* ------------------------------- versions ----------------------------- */

  async findVersion(versionId: string): Promise<QuizVersionRow | null> {
    const version = await this.db
      .selectFrom("quiz_versions")
      .selectAll()
      .where("id", "=", versionId)
      .executeTakeFirst();

    return version ?? null;
  }

  async updateVersionSettings(
    versionId: string,
    settings: VersionSettingsInput,
  ): Promise<void> {
    await this.db
      .updateTable("quiz_versions")
      .set({
        // Map explicitly: the domain shape is camelCase, the columns are not.
        instructions: settings.instructions,
        passing_score: settings.passingScore,
        certificate_enabled: settings.certificateEnabled,
        updated_at: new Date(),
      })
      .where("id", "=", versionId)
      .execute();
  }

  async nextVersionNumber(quizId: string): Promise<number> {
    const result = await this.db
      .selectFrom("quiz_versions")
      .select((eb) => eb.fn.max<number>("version").as("max"))
      .where("quiz_id", "=", quizId)
      .executeTakeFirst();

    return Number(result?.max ?? 0) + 1;
  }

  /**
   * Loads questions and options for a version in two queries, never N+1.
   */
  async loadQuestions(versionId: string): Promise<Question[]> {
    const questions = await this.db
      .selectFrom("questions")
      .selectAll()
      .where("quiz_version_id", "=", versionId)
      .orderBy("position", "asc")
      .execute();

    if (questions.length === 0) return [];

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

    const byQuestion = new Map<string, AnswerOptionRow[]>();
    for (const option of options) {
      const bucket = byQuestion.get(option.question_id) ?? [];
      bucket.push(option);
      byQuestion.set(option.question_id, bucket);
    }

    return questions.map((question) => ({
      id: question.id,
      position: question.position,
      prompt: question.prompt,
      questionType: question.question_type,
      points: question.points,
      options: (byQuestion.get(question.id) ?? []).map((option) => ({
        id: option.id,
        position: option.position,
        label: option.label,
        isCorrect: option.is_correct,
      })),
    }));
  }

  async loadVersionContent(versionId: string): Promise<LoadedVersionContent> {
    const version = await this.findVersion(versionId);
    if (!version) {
      throw new Error(`Quiz version ${versionId} not found`);
    }

    return { version, questions: await this.loadQuestions(versionId) };
  }

  /** The domain content object used by validation and publishing. */
  async loadDomainContent(versionId: string): Promise<QuizVersionContent> {
    const { version, questions } = await this.loadVersionContent(versionId);

    return {
      instructions: version.instructions,
      passingScore: version.passing_score,
      certificateEnabled: version.certificate_enabled,
      questions,
    };
  }

  /* ------------------------------- questions ---------------------------- */

  async addQuestion(
    versionId: string,
    input: CreateQuestionInput,
  ): Promise<QuestionRow> {
    return runInTransaction(this.db, async (trx) => {
      const last = await trx
        .selectFrom("questions")
        .select((eb) => eb.fn.max<number>("position").as("max"))
        .where("quiz_version_id", "=", versionId)
        .executeTakeFirst();

      return trx
        .insertInto("questions")
        .values({
          quiz_version_id: versionId,
          position: Number(last?.max ?? 0) + 1,
          prompt: input.prompt,
          question_type: input.questionType,
          points: input.points,
        } satisfies NewQuestion)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async replaceQuestionOptions(
    questionId: string,
    options: AnswerOptionInput[],
  ): Promise<void> {
    await runInTransaction(this.db, async (trx) => {
      await trx.deleteFrom("answer_options").where("question_id", "=", questionId).execute();

      if (options.length === 0) return;

      await trx
        .insertInto("answer_options")
        .values(
          options.map((option, index) => ({
            question_id: questionId,
            position: index + 1,
            label: option.label,
            is_correct: option.isCorrect,
          })) satisfies NewAnswerOption[],
        )
        .execute();
    });
  }

  async findQuestion(questionId: string): Promise<QuestionRow | null> {
    const question = await this.db
      .selectFrom("questions")
      .selectAll()
      .where("id", "=", questionId)
      .executeTakeFirst();

    return question ?? null;
  }

  async updateQuestion(
    questionId: string,
    update: { prompt: string; questionType: QuestionType; points: number },
  ): Promise<void> {
    await this.db
      .updateTable("questions")
      .set({
        prompt: update.prompt,
        question_type: update.questionType,
        points: update.points,
        updated_at: new Date(),
      })
      .where("id", "=", questionId)
      .execute();
  }

  async deleteQuestion(questionId: string): Promise<void> {
    await this.db.deleteFrom("questions").where("id", "=", questionId).execute();
  }

  /**
   * Applies an explicit ordering.
   *
   * Positions are unique per version, so the whole set is moved out of the way
   * first and then written back at its final position.
   */
  async reorderQuestions(versionId: string, orderedIds: string[]): Promise<void> {
    const existing = await this.db
      .selectFrom("questions")
      .select("id")
      .where("quiz_version_id", "=", versionId)
      .execute();

    const known = new Set(existing.map((row) => row.id));
    const ordered = orderedIds.filter((id) => known.has(id));

    // Anything the caller omitted keeps its relative order at the end.
    for (const row of existing) {
      if (!ordered.includes(row.id)) ordered.push(row.id);
    }

    if (ordered.length === 0) return;

    await runInTransaction(this.db, async (trx) => {
      // `(quiz_version_id, position)` is unique, so every row cannot be parked
      // on a single placeholder value. Each one first takes its own negative
      // slot, which collides with nothing, and then moves to its final positive
      // position.
      for (const [index, id] of ordered.entries()) {
        await trx
          .updateTable("questions")
          .set({ position: -(index + 1) })
          .where("id", "=", id)
          .execute();
      }

      for (const [index, id] of ordered.entries()) {
        await trx
          .updateTable("questions")
          .set({ position: index + 1, updated_at: new Date() })
          .where("id", "=", id)
          .execute();
      }
    });
  }

  /* ------------------------------ publishing ---------------------------- */

  /**
   * Freezes the current draft and makes it the live published version.
   *
   * The previous published version is retired rather than deleted, so attempts
   * that reference it keep working.
   */
  async publishDraftVersion(quizId: string, now: Date): Promise<QuizVersionRow> {
    return runInTransaction(this.db, async (trx) => {
      const quiz = await trx
        .selectFrom("quizzes")
        .selectAll()
        .where("id", "=", quizId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (!quiz.editable_version_id) {
        throw new Error(`Quiz ${quizId} has no editable version`);
      }

      const draft = await trx
        .selectFrom("quiz_versions")
        .selectAll()
        .where("id", "=", quiz.editable_version_id)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (draft.status !== "draft") {
        throw new Error("The editable version is not a draft");
      }

      // Retire the outgoing version first: a partial unique index allows only
      // one `published` row per quiz.
      if (quiz.published_version_id) {
        await trx
          .updateTable("quiz_versions")
          .set({ status: "retired", updated_at: now })
          .where("id", "=", quiz.published_version_id)
          .execute();
      }

      const published = await trx
        .updateTable("quiz_versions")
        .set({ status: "published", published_at: now, updated_at: now })
        .where("id", "=", draft.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable("quizzes")
        .set({
          publication_status: "published",
          published_version_id: published.id,
          updated_at: now,
        })
        .where("id", "=", quizId)
        .execute();

      return published;
    });
  }

  /**
   * Returns the editable draft, creating one when needed.
   *
   * If the quiz was never published the current draft is reused; otherwise the
   * published content is copied, so historical attempts are never mutated.
   */
  async ensureDraftVersion(quizId: string, now: Date): Promise<QuizVersionRow> {
    return runInTransaction(this.db, async (trx) => {
      const quiz = await trx
        .selectFrom("quizzes")
        .selectAll()
        .where("id", "=", quizId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (quiz.editable_version_id) {
        const editable = await trx
          .selectFrom("quiz_versions")
          .selectAll()
          .where("id", "=", quiz.editable_version_id)
          .executeTakeFirst();

        if (editable?.status === "draft") return editable;
      }

      const sourceId = quiz.published_version_id ?? quiz.editable_version_id;
      const nextVersion = await this.nextVersionNumber(quizId);

      const draft = await trx
        .insertInto("quiz_versions")
        .values({ quiz_id: quizId, version: nextVersion, status: "draft" })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (sourceId) {
        const source = await trx
          .selectFrom("quiz_versions")
          .selectAll()
          .where("id", "=", sourceId)
          .executeTakeFirst();

        if (source) {
          await trx
            .updateTable("quiz_versions")
            .set({
              instructions: source.instructions,
              passing_score: source.passing_score,
              certificate_enabled: source.certificate_enabled,
              certificate_template_version: source.certificate_template_version,
              updated_at: now,
            })
            .where("id", "=", draft.id)
            .execute();

          await this.copyQuestions(trx, source.id, draft.id, now);
        }
      }

      // Always repoint the quiz at the new draft, whether or not it was seeded
      // from a published version.
      await trx
        .updateTable("quizzes")
        .set({ editable_version_id: draft.id, updated_at: now })
        .where("id", "=", quizId)
        .execute();

      return draft;
    });
  }

  private async copyQuestions(
    trx: Kysely<Database>,
    fromVersionId: string,
    toVersionId: string,
    now: Date,
  ): Promise<void> {
    const sourceQuestions = await trx
      .selectFrom("questions")
      .selectAll()
      .where("quiz_version_id", "=", fromVersionId)
      .orderBy("position", "asc")
      .execute();

    if (sourceQuestions.length === 0) return;

    const sourceOptions = await trx
      .selectFrom("answer_options")
      .selectAll()
      .where(
        "question_id",
        "in",
        sourceQuestions.map((question) => question.id),
      )
      .orderBy("position", "asc")
      .execute();

    const optionsByQuestion = new Map<string, AnswerOptionRow[]>();
    for (const option of sourceOptions) {
      const bucket = optionsByQuestion.get(option.question_id) ?? [];
      bucket.push(option);
      optionsByQuestion.set(option.question_id, bucket);
    }

    const inserted = await trx
      .insertInto("questions")
      .values(
        sourceQuestions.map((question) => ({
          quiz_version_id: toVersionId,
          position: question.position,
          prompt: question.prompt,
          question_type: question.question_type,
          points: question.points,
          created_at: now,
          updated_at: now,
        })) satisfies NewQuestion[],
      )
      .returningAll()
      .execute();

    // Copied questions keep their source position, which is enough to carry the
    // correct-answer flags across.
    const originalByPosition = new Map(
      sourceQuestions.map((question) => [question.position, question]),
    );

    const optionRows: NewAnswerOption[] = [];
    for (const question of inserted) {
      const original = originalByPosition.get(question.position);
      if (!original) continue;

      for (const option of optionsByQuestion.get(original.id) ?? []) {
        optionRows.push({
          question_id: question.id,
          position: option.position,
          label: option.label,
          is_correct: option.is_correct,
          created_at: now,
          updated_at: now,
        });
      }
    }

    if (optionRows.length > 0) {
      await trx.insertInto("answer_options").values(optionRows).execute();
    }
  }

  /* -------------------------------- public ------------------------------ */

  /**
   * Loads everything the public quiz page needs.
   *
   * Correct-answer flags are stripped here so they can never reach the client
   * before submission.
   */
  async loadPublishedQuizByPublicId(publicId: string): Promise<{
    quiz: QuizRow;
    version: QuizVersionRow;
    questions: PublicQuestion[];
  } | null> {
    const quiz = await this.findByPublicId(publicId);
    if (!quiz || quiz.publication_status !== "published" || !quiz.published_version_id) {
      return null;
    }

    const version = await this.findVersion(quiz.published_version_id);
    if (!version || version.status !== "published") return null;

    const questions = await this.loadQuestions(version.id);

    return {
      quiz,
      version,
      questions: questions.map((question) => ({
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        questionType: question.questionType,
        points: question.points,
        options: question.options.map((option) => ({ id: option.id, label: option.label })),
      })),
    };
  }
}