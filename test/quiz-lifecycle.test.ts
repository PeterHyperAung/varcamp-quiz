import { afterEach, beforeEach, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { ZodError } from "zod";

import { fixedClock } from "@/lib/clock";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { Database } from "@/lib/db/types";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";
import { getCertificateForAttempt } from "@/modules/certificates/application/issue-certificate";
import { createTestDb } from "./test-db";

/**
 * Integration tests for the quiz lifecycle.
 *
 * These run the real SQL migrations against an in-process Postgres, so partial
 * unique indexes, CHECK constraints and transaction semantics are all
 * exercised rather than mocked.
 */

let db: Kysely<Database>;
let destroy: () => Promise<void>;
let administratorId: string;

beforeEach(async () => {
  const harness = await createTestDb();
  db = harness.db;
  destroy = harness.destroy;

  const administrator = await db
    .insertInto("administrators")
    .values({ email: "organiser@example.test", name: "Organiser", password_hash: "x" })
    .returning("id")
    .executeTakeFirstOrThrow();

  administratorId = administrator.id;
});

afterEach(async () => {
  await destroy();
});

/**
 * Reads the questions of a quiz's *published* version.
 *
 * Opening the editor after publishing produces a separate draft copy with new
 * ids, so a submission must be built from the published version's own
 * questions — exactly what the server grades against.
 */
async function publishedQuestions(
  database: Kysely<Database>,
  quizId: string,
): Promise<Array<{ id: string; points: number; options: Array<{ id: string; label: string; isCorrect: boolean }> }>> {
  const rows = await database
    .selectFrom("questions")
    .innerJoin("quiz_versions", "quiz_versions.id", "questions.quiz_version_id")
    .selectAll("questions")
    .where("quiz_versions.quiz_id", "=", quizId)
    .where("quiz_versions.status", "=", "published")
    .orderBy("questions.position", "asc")
    .execute();

  if (rows.length === 0) return [];

  const options = await database
    .selectFrom("answer_options")
    .selectAll()
    .where(
      "question_id",
      "in",
      rows.map((row) => row.id),
    )
    .orderBy("position", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    points: row.points,
    options: options
      .filter((option) => option.question_id === row.id)
      .map((option) => ({
        id: option.id,
        label: option.label,
        isCorrect: option.is_correct,
      })),
  }));
}

it("creates a quiz with an editable draft version", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Welcome", description: "Hi" }, administratorId);

  expect(quiz.publication_status).toBe("draft");
  expect(quiz.published_version_id).toBeNull();
  expect(quiz.editable_version_id).not.toBeNull();

  const detail = await manage.getForEditing(quiz.id);
  expect(detail.editableVersion?.status).toBe("draft");
  expect(detail.questions).toHaveLength(0);
});

it("refuses to publish a quiz with no questions", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Empty", description: null }, administratorId);

  await expect(manage.publish(quiz.id)).rejects.toBeInstanceOf(ValidationError);
});

it("publishes a valid quiz and exposes it publicly", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Basics", description: null }, administratorId);

  await manage.updateSettings(quiz.id, {
    instructions: "Answer carefully.",
    passingScore: null,
    certificateEnabled: "false",
  });

  await manage.addQuestion(quiz.id, {
    prompt: "2 + 2?",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "3", isCorrect: false },
      { label: "4", isCorrect: true },
    ],
  });

  const published = await manage.publish(quiz.id);

  expect(published.status).toBe("published");
  expect(published.published_at).not.toBeNull();

  const view = await new TakeQuiz(db).getPublicQuiz(quiz.public_id);
  expect(view).not.toBeNull();
  expect(view?.questions).toHaveLength(1);
});

it("never exposes correct answers to the public quiz payload", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Secrets", description: null }, administratorId);

  await manage.addQuestion(quiz.id, {
    prompt: "Pick the right one",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "Wrong", isCorrect: false },
      { label: "Right", isCorrect: true },
    ],
  });

  await manage.publish(quiz.id);

  const view = await new TakeQuiz(db).getPublicQuiz(quiz.public_id);

  // The raw serialised payload must not contain the correctness flag at all.
  expect(JSON.stringify(view)).not.toContain("isCorrect");
  expect(JSON.stringify(view)).not.toContain("is_correct");
});

it("does not expose an unpublished quiz publicly", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Hidden", description: null }, administratorId);

  await manage.addQuestion(quiz.id, {
    prompt: "Anything",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });

  await manage.publish(quiz.id);
  expect(await new TakeQuiz(db).getPublicQuiz(quiz.public_id)).not.toBeNull();

  await manage.unpublish(quiz.id);
  expect(await new TakeQuiz(db).getPublicQuiz(quiz.public_id)).toBeNull();

  await manage.archive(quiz.id);
  expect(await new TakeQuiz(db).getPublicQuiz(quiz.public_id)).toBeNull();
});

it("preserves historical results when a published quiz is edited and republished", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db, fixedClock("2026-03-01T10:00:00.000Z"));

  const quiz = await manage.create({ title: "Versioned", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Original question",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "Original answer", isCorrect: true },
      { label: "Other", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  const originalVersion = (
    await takeQuiz.getAttempt(attemptPublicId)
  )!.quiz_version_id;

  const published = (await publishedQuestions(db, quiz.id))[0]!;
  const correctOptionId = published.options.find((option) => option.isCorrect)!.id;

  await takeQuiz.submit({
    attemptPublicId,
    participantName: "Ada",
    answers: [{ questionId: published.id, selectedOptionId: correctOptionId }],
  });

  // Unpublish before opening a draft and changing the content.
  await manage.unpublish(quiz.id);
  const editing = await manage.getForEditing(quiz.id);
  expect(editing.editableVersion!.id).not.toBe(originalVersion);

  await manage.updateQuestion(quiz.id, editing.questions[0]!.id, {
    prompt: "Rewritten question",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "New answer", isCorrect: true },
      { label: "Old answer", isCorrect: false },
    ],
  });

  await manage.publish(quiz.id);

  // The recorded result is untouched.
  const result = await takeQuiz.getResult(attemptPublicId);
  expect(result.score).toBe(1);
  expect(result.maxScore).toBe(1);
  expect(result.review[0]!.prompt).toBe("Original question");
  expect(result.review[0]!.correctLabel).toBe("Original answer");

  // And the attempt still points at the version it was scored against.
  expect((await takeQuiz.getAttempt(attemptPublicId))!.quiz_version_id).toBe(
    originalVersion,
  );
});

it("only opens a draft for editing after a published quiz is unpublished", async () => {
  const manage = new ManageQuizzes(db);

  const quiz = await manage.create({ title: "Copying", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Kept question",
    questionType: "multiple_choice",
    points: 2,
    options: [
      { label: "Yes", isCorrect: true },
      { label: "No", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const publishedView = await manage.getForEditing(quiz.id);
  expect(publishedView.editableVersion).toBeNull();
  expect(publishedView.questions[0]!.prompt).toBe("Kept question");

  const versionsBeforeUnpublishing = await db
    .selectFrom("quiz_versions")
    .select("status")
    .where("quiz_id", "=", quiz.id)
    .execute();
  expect(versionsBeforeUnpublishing.filter((version) => version.status === "draft")).toHaveLength(0);

  await expect(
    manage.updateDetails(quiz.id, { title: "Changed", description: null }),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(
    manage.addQuestion(quiz.id, {
      prompt: "Blocked question",
      questionType: "multiple_choice",
      points: 1,
      options: [
        { label: "Yes", isCorrect: true },
        { label: "No", isCorrect: false },
      ],
    }),
  ).rejects.toBeInstanceOf(ConflictError);

  await manage.unpublish(quiz.id);
  const editing = await manage.getForEditing(quiz.id);

  expect(editing.editableVersion).not.toBeNull();
  expect(editing.editableVersion!.id).not.toBe(editing.publishedVersion!.id);
  expect(editing.questions[0]!.prompt).toBe("Kept question");
  expect(editing.questions[0]!.points).toBe(2);
  expect(editing.questions[0]!.options.filter((option) => option.isCorrect)).toHaveLength(1);
});

it("scores a submission on the server, not from the payload", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Scored", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Pick A",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.updateSettings(quiz.id, {
    instructions: null,
    passingScore: 50,
    certificateEnabled: "false",
  });
  await manage.publish(quiz.id);

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  const question = (await publishedQuestions(db, quiz.id))[0]!;
  const wrongOption = question.options.find((option) => !option.isCorrect)!;

  await takeQuiz.submit({
    attemptPublicId,
    participantName: null,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  });

  // The server looked at the trusted option flag and scored zero.
  const result = await takeQuiz.getResult(attemptPublicId);
  expect(result.score).toBe(0);
  expect(result.percentage).toBe(0);
  expect(result.passed).toBe(false);
});

it("ranks attempts across quiz versions by percentage, then fastest completion", async () => {
  let now = new Date("2026-03-01T10:00:00.000Z");
  const clock = { now: () => new Date(now) };
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db, clock);
  const quiz = await manage.create({ title: "Fast answers", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Original question",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "Right", isCorrect: true },
      { label: "Wrong", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  await expect(
    takeQuiz.start({ quizPublicId: quiz.public_id, participantName: " " }),
  ).rejects.toBeInstanceOf(ZodError);

  const originalQuestion = (await publishedQuestions(db, quiz.id))[0]!;
  const originalCorrect = originalQuestion.options.find((option) => option.isCorrect)!;
  now = new Date("2026-03-01T10:00:01.000Z");
  const slowerPerfect = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Slower",
  });
  now = new Date("2026-03-01T10:00:11.000Z");
  await takeQuiz.submit({
    attemptPublicId: slowerPerfect.attemptPublicId,
    answers: [{ questionId: originalQuestion.id, selectedOptionId: originalCorrect.id }],
  });

  await manage.unpublish(quiz.id);
  const draft = await manage.getForEditing(quiz.id);
  await manage.updateQuestion(quiz.id, draft.questions[0]!.id, {
    prompt: "Updated question",
    questionType: "multiple_choice",
    points: 5,
    options: [
      { label: "Right", isCorrect: true },
      { label: "Wrong", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const updatedQuestion = (await publishedQuestions(db, quiz.id))[0]!;
  const updatedCorrect = updatedQuestion.options.find((option) => option.isCorrect)!;
  now = new Date("2026-03-01T10:00:20.000Z");
  const fasterPerfect = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Faster",
  });
  now = new Date("2026-03-01T10:00:24.000Z");
  await takeQuiz.submit({
    attemptPublicId: fasterPerfect.attemptPublicId,
    answers: [{ questionId: updatedQuestion.id, selectedOptionId: updatedCorrect.id }],
  });

  now = new Date("2026-03-01T10:00:30.000Z");
  const quickWrong = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Quick but wrong",
  });
  now = new Date("2026-03-01T10:00:31.000Z");
  const updatedWrong = updatedQuestion.options.find((option) => !option.isCorrect)!;
  await takeQuiz.submit({
    attemptPublicId: quickWrong.attemptPublicId,
    answers: [{ questionId: updatedQuestion.id, selectedOptionId: updatedWrong.id }],
  });

  const leaderboard = await takeQuiz.getLeaderboard(quiz.id, slowerPerfect.attemptPublicId);
  expect(leaderboard.entries.map((entry) => entry.participantName)).toEqual([
    "Faster",
    "Slower",
    "Quick but wrong",
  ]);
  expect(leaderboard.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  expect(leaderboard.entries[0]!.elapsedMs).toBe(4_000);
  expect(leaderboard.currentPlayer?.rank).toBe(2);
});

it("rejects a submission payload carrying a score or correctness claim", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Strict", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  const question = (await publishedQuestions(db, quiz.id))[0]!;
  const wrongOption = question.options.find((option) => !option.isCorrect)!;

  // The schema is strict, so unknown fields are a client error rather than
  // something silently ignored.
  await expect(
    takeQuiz.submit({
      attemptPublicId,
      participantName: null,
      answers: [
        {
          questionId: question.id,
          selectedOptionId: wrongOption.id,
          score: 1000,
          isCorrect: true,
        } as never,
      ],
    }),
  ).rejects.toBeInstanceOf(ZodError);

  // Nothing was recorded.
  expect((await takeQuiz.getAttempt(attemptPublicId))!.status).toBe("in_progress");
});

it("rejects a second submission for the same attempt", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Once", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  const question = (await publishedQuestions(db, quiz.id))[0]!;
  const correct = question.options.find((option) => option.isCorrect)!;

  const answers = [{ questionId: question.id, selectedOptionId: correct.id }];

  await takeQuiz.submit({ attemptPublicId, answers });

  // Rejected by the one-shot submission rule; the recorded score is untouched.
  await expect(takeQuiz.submit({ attemptPublicId, answers })).rejects.toThrow(
    /already been submitted/i,
  );
  expect((await takeQuiz.getAttempt(attemptPublicId))!.status).toBe("submitted");
});

it("issues a certificate only to a passing participant", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Certified", description: null }, administratorId);
  await manage.updateSettings(quiz.id, {
    instructions: null,
    passingScore: 50,
    certificateEnabled: "true",
  });
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const question = (await publishedQuestions(db, quiz.id))[0]!;
  const correct = question.options.find((option) => option.isCorrect)!;
  const wrong = question.options.find((option) => !option.isCorrect)!;

  // Passing attempt with a name.
  const passing = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });
  const passOutcome = await takeQuiz.submit({
    attemptPublicId: passing.attemptPublicId,
    participantName: "Ada",
    answers: [{ questionId: question.id, selectedOptionId: correct.id }],
  });
  expect(passOutcome.certificatePublicId).not.toBeNull();

  const result = await takeQuiz.getResult(passing.attemptPublicId);
  expect(result.certificate).not.toBeNull();

  // Failing attempt: no certificate.
  const failing = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Bob",
  });
  const failOutcome = await takeQuiz.submit({
    attemptPublicId: failing.attemptPublicId,
    participantName: "Bob",
    answers: [{ questionId: question.id, selectedOptionId: wrong.id }],
  });
  expect(failOutcome.certificatePublicId).toBeNull();

  // Every participant must choose a leaderboard name.
  await expect(
    takeQuiz.start({ quizPublicId: quiz.public_id, participantName: "" }),
  ).rejects.toBeInstanceOf(ZodError);
});

it("issues at most one certificate per attempt", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Once only", description: null }, administratorId);
  await manage.updateSettings(quiz.id, {
    instructions: null,
    passingScore: 0,
    certificateEnabled: "true",
  });
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const question = (await publishedQuestions(db, quiz.id))[0]!;
  const correct = question.options.find((option) => option.isCorrect)!;

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  const answers = [{ questionId: question.id, selectedOptionId: correct.id }];
  const first = await takeQuiz.submit({
    attemptPublicId,
    participantName: "Ada",
    answers,
  });

  const attemptId = (await takeQuiz.getAttempt(attemptPublicId))!.id;
  const viaHelper = await getCertificateForAttempt(db, attemptId);

  expect(viaHelper?.public_id).toBe(first.certificatePublicId);

  const all = await db.selectFrom("certificates").selectAll().execute();
  expect(all).toHaveLength(1);
});

it("refuses to start an attempt on a draft quiz", async () => {
  const manage = new ManageQuizzes(db);
  const quiz = await manage.create({ title: "Draft only", description: null }, administratorId);

  await expect(
    new TakeQuiz(db).start({ quizPublicId: quiz.public_id, participantName: "Ada" }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

it("refuses published edits and edits to questions outside the current draft", async () => {
  const manage = new ManageQuizzes(db);

  const quiz = await manage.create({ title: "Scoped", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "First",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  // The published quiz is read-only until it is unpublished.
  const editing = await manage.getForEditing(quiz.id);
  const publishedQuestionId = editing.publishedVersion
    ? (
        await db
          .selectFrom("questions")
          .selectAll()
          .where("quiz_version_id", "=", editing.publishedVersion!.id)
          .executeTakeFirstOrThrow()
      ).id
    : null;

  await expect(
    manage.updateQuestion(quiz.id, publishedQuestionId!, {
      prompt: "Tampered",
      questionType: "multiple_choice",
      points: 1,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: false },
      ],
    }),
  ).rejects.toBeInstanceOf(ConflictError);

  await manage.unpublish(quiz.id);
  const draft = await manage.getForEditing(quiz.id);
  await expect(
    manage.updateQuestion(quiz.id, publishedQuestionId!, {
      prompt: "Tampered",
      questionType: "multiple_choice",
      points: 1,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: false },
      ],
    }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect(draft.editableVersion?.id).not.toBe(editing.publishedVersion?.id);
});

it("reorders and deletes questions in the draft", async () => {
  const manage = new ManageQuizzes(db);

  const quiz = await manage.create({ title: "Ordering", description: null }, administratorId);

  const questionInput = (prompt: string) => ({
    prompt,
    questionType: "multiple_choice" as const,
    points: 1,
    options: [
      { label: "Yes", isCorrect: true },
      { label: "No", isCorrect: false },
    ],
  });

  await manage.addQuestion(quiz.id, questionInput("One"));
  await manage.addQuestion(quiz.id, questionInput("Two"));
  await manage.addQuestion(quiz.id, questionInput("Three"));

  let questions = (await manage.getForEditing(quiz.id)).questions;
  expect(questions.map((q) => q.prompt)).toEqual(["One", "Two", "Three"]);

  await manage.reorderQuestions(quiz.id, [questions[2]!.id, questions[0]!.id, questions[1]!.id]);

  questions = (await manage.getForEditing(quiz.id)).questions;
  expect(questions.map((q) => q.prompt)).toEqual(["Three", "One", "Two"]);

  await manage.deleteQuestion(quiz.id, questions[0]!.id);

  questions = (await manage.getForEditing(quiz.id)).questions;
  expect(questions.map((q) => q.prompt)).toEqual(["One", "Two"]);
  // Positions are re-packed so the unique (version, position) index stays valid.
  expect(questions.map((q) => q.position)).toEqual([1, 2]);
});

it("allows only one draft and one published version per quiz at a time", async () => {
  const manage = new ManageQuizzes(db);

  const quiz = await manage.create({ title: "Unique", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  // Opening a published quiz does not create an editable draft.
  await manage.getForEditing(quiz.id);
  await manage.getForEditing(quiz.id);

  let versions = await db
    .selectFrom("quiz_versions")
    .select(["status"])
    .where("quiz_id", "=", quiz.id)
    .execute();

  expect(versions.filter((version) => version.status === "draft")).toHaveLength(0);
  expect(versions.filter((version) => version.status === "published")).toHaveLength(1);

  await manage.unpublish(quiz.id);
  await manage.getForEditing(quiz.id);
  await manage.getForEditing(quiz.id);

  versions = await db
    .selectFrom("quiz_versions")
    .select(["status"])
    .where("quiz_id", "=", quiz.id)
    .execute();
  expect(versions.filter((version) => version.status === "draft")).toHaveLength(1);
  expect(versions.filter((version) => version.status === "published")).toHaveLength(1);
});

it("keeps an in-progress attempt usable after the quiz is unpublished", async () => {
  const manage = new ManageQuizzes(db);
  const takeQuiz = new TakeQuiz(db);

  const quiz = await manage.create({ title: "Racing", description: null }, administratorId);
  await manage.addQuestion(quiz.id, {
    prompt: "Q",
    questionType: "multiple_choice",
    points: 1,
    options: [
      { label: "A", isCorrect: true },
      { label: "B", isCorrect: false },
    ],
  });
  await manage.publish(quiz.id);

  const { attemptPublicId } = await takeQuiz.start({
    quizPublicId: quiz.public_id,
    participantName: "Ada",
  });

  // The quiz is closed while the participant is mid-quiz.
  await manage.unpublish(quiz.id);

  // The attempt still scores against the version it pinned at start time.
  const question = await db
    .selectFrom("questions")
    .innerJoin("quiz_versions", "quiz_versions.id", "questions.quiz_version_id")
    .selectAll("questions")
    .where("quiz_versions.quiz_id", "=", quiz.id)
    .where("quiz_versions.status", "=", "published")
    .executeTakeFirstOrThrow();

  const rightOption = await db
    .selectFrom("answer_options")
    .select("id")
    .where("question_id", "=", question.id)
    .where("is_correct", "=", true)
    .executeTakeFirstOrThrow();

  const outcome = await takeQuiz.submit({
    attemptPublicId,
    answers: [{ questionId: question.id, selectedOptionId: rightOption.id }],
  });

  expect(outcome.attemptPublicId).toBe(attemptPublicId);
  expect((await takeQuiz.getResult(attemptPublicId)).score).toBe(1);
});
