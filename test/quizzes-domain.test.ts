import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  MAX_OPTION_COUNT,
  MAX_PROMPT_LENGTH,
  validateQuestion,
  validateQuizVersionContent,
  type AnswerOptionInput,
} from "@/modules/quizzes/domain/quiz-content";
import {
  assertCanArchive,
  assertCanPublish,
  assertCanUnpublish,
  assertVersionEditable,
  publicQuizLinkIsAvailable,
} from "@/modules/quizzes/domain/publishing";
import type { QuizVersionContent } from "@/modules/quizzes/domain/quiz-content";

function option(label: string, isCorrect = false): AnswerOptionInput {
  return { label, isCorrect };
}

function validQuestion(overrides: Partial<QuizVersionContent["questions"][number]> = {}) {
  return {
    id: "q1",
    position: 1,
    prompt: "What is 2 + 2?",
    questionType: "multiple_choice" as const,
    points: 1,
    options: [
      { id: "o1", position: 1, label: "3", isCorrect: false },
      { id: "o2", position: 2, label: "4", isCorrect: true },
    ],
    ...overrides,
  };
}

function content(overrides: Partial<QuizVersionContent> = {}): QuizVersionContent {
  return {
    instructions: null,
    passingScore: null,
    certificateEnabled: false,
    questions: [validQuestion()],
    ...overrides,
  };
}

/**
 * Validation failures carry the summary message plus per-field detail; the
 * detail is what these tests assert on.
 */
function expectFieldError(
  run: (value: QuizVersionContent) => void,
  value: QuizVersionContent,
  pattern: RegExp,
): void {
  try {
    run(value);
    expect.unreachable("expected a ValidationError");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const messages = Object.values((error as ValidationError).fieldErrors).flat();
    expect(messages.some((message) => pattern.test(message))).toBe(true);
  }
}

describe("validateQuizVersionContent", () => {
  it("accepts a well-formed version", () => {
    expect(() => validateQuizVersionContent(content())).not.toThrow();
  });

  it("rejects a version with no questions", () => {
    expect(() => validateQuizVersionContent(content({ questions: [] }))).toThrow(
      ValidationError,
    );
  });

  it("rejects an out-of-range passing score", () => {
    try {
      validateQuizVersionContent(content({ passingScore: 140 }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.passingScore).toBeDefined();
    }
  });

  it("rejects a question with no correct answer", () => {
    const question = validQuestion({
      options: [
        { id: "o1", position: 1, label: "A", isCorrect: false },
        { id: "o2", position: 2, label: "B", isCorrect: false },
      ],
    });

    expectFieldError(
      validateQuizVersionContent,
      content({ questions: [question] }),
      /exactly one option/i,
    );
  });

  it("rejects a question with two correct answers", () => {
    const question = validQuestion({
      options: [
        { id: "o1", position: 1, label: "A", isCorrect: true },
        { id: "o2", position: 2, label: "B", isCorrect: true },
      ],
    });

    expectFieldError(
      validateQuizVersionContent,
      content({ questions: [question] }),
      /exactly one option/i,
    );
  });

  it("rejects duplicate option labels", () => {
    const question = validQuestion({
      options: [
        { id: "o1", position: 1, label: "Same", isCorrect: true },
        { id: "o2", position: 2, label: "same", isCorrect: false },
      ],
    });

    expectFieldError(validateQuizVersionContent, content({ questions: [question] }), /unique/i);
  });

  it("rejects an over-long prompt", () => {
    const question = validQuestion({ prompt: "x".repeat(MAX_PROMPT_LENGTH + 1) });
    expect(() => validateQuizVersionContent(content({ questions: [question] }))).toThrow(
      ValidationError,
    );
  });

  it("rejects non-positive points", () => {
    const question = validQuestion({ points: 0 });
    expect(() => validateQuizVersionContent(content({ questions: [question] }))).toThrow(
      ValidationError,
    );
  });

  it("enforces exactly two options for true/false questions", () => {
    const question = validQuestion({
      questionType: "true_false",
      options: [
        { id: "o1", position: 1, label: "True", isCorrect: true },
        { id: "o2", position: 2, label: "False", isCorrect: false },
        { id: "o3", position: 3, label: "Maybe", isCorrect: false },
      ],
    });

    expectFieldError(
      validateQuizVersionContent,
      content({ questions: [question] }),
      /exactly two options/i,
    );
  });

  it("caps the number of options per question", () => {
    const question = validQuestion({
      options: Array.from({ length: MAX_OPTION_COUNT + 1 }, (_, index) => ({
        id: `o${index}`,
        position: index + 1,
        label: `Option ${index}`,
        isCorrect: index === 0,
      })),
    });

    expectFieldError(
      validateQuizVersionContent,
      content({ questions: [question] }),
      /at most/i,
    );
  });
});

describe("validateQuestion", () => {
  it("accepts a valid multiple-choice question", () => {
    expect(() =>
      validateQuestion({
        prompt: "Pick one",
        questionType: "multiple_choice",
        points: 2,
        options: [option("A", true), option("B"), option("C")],
      }),
    ).not.toThrow();
  });

  it("reports the field that failed", () => {
    try {
      validateQuestion({
        prompt: "   ",
        questionType: "multiple_choice",
        points: 1,
        options: [option("A", true), option("B")],
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors["question.prompt"]).toBeDefined();
    }
  });
});

describe("publishing rules", () => {
  it("treats a draft version as editable and a published one as frozen", () => {
    expect(assertVersionEditable.bind(null, "draft")).not.toThrow();
    expect(() => assertVersionEditable("published")).toThrow(/cannot be edited/i);
    expect(() => assertVersionEditable("retired")).toThrow(/cannot be edited/i);
  });

  it("refuses to publish an archived quiz", () => {
    expect(() => assertCanPublish("archived", content())).toThrow(/archived/i);
  });

  it("requires a published quiz to be unpublished before publishing a new version", () => {
    expect(() => assertCanPublish("published", content())).toThrow(/unpublish/i);
  });

  it("refuses to publish incomplete content", () => {
    expect(() => assertCanPublish("draft", content({ questions: [] }))).toThrow(
      ValidationError,
    );
  });

  it("requires a passing score when certificates are enabled", () => {
    expect(() =>
      assertCanPublish("draft", content({ certificateEnabled: true, passingScore: null })),
    ).toThrow(/passing score/i);
  });

  it("allows publishing a certificate quiz that has a passing score", () => {
    expect(() =>
      assertCanPublish("draft", content({ certificateEnabled: true, passingScore: 60 })),
    ).not.toThrow();
  });

  it("only unpublishes a published quiz", () => {
    expect(() => assertCanUnpublish("draft")).toThrow();
    expect(() => assertCanUnpublish("published")).not.toThrow();
  });

  it("refuses to archive twice", () => {
    expect(() => assertCanArchive("archived")).toThrow(/already archived/i);
    expect(() => assertCanArchive("published")).not.toThrow();
  });

  it("exposes the public link only while published", () => {
    expect(publicQuizLinkIsAvailable("published")).toBe(true);
    expect(publicQuizLinkIsAvailable("draft")).toBe(false);
    expect(publicQuizLinkIsAvailable("archived")).toBe(false);
  });
});
