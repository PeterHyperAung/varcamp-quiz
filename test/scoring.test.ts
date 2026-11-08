import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  answeredQuestionCount,
  gradeSubmission,
  type ScoringContext,
} from "@/modules/quiz-attempts/domain/scoring";
import {
  assertCertificateNameProvided,
  assertResultAvailable,
  assertSubmittable,
  normaliseParticipantName,
} from "@/modules/quiz-attempts/domain/attempt";

const context: ScoringContext = {
  quizVersionId: "version-1",
  passingScore: 50,
  questions: [
    {
      id: "q1",
      position: 1,
      prompt: "2 + 2?",
      questionType: "multiple_choice",
      points: 1,
      options: [
        { id: "q1a", label: "3", isCorrect: false },
        { id: "q1b", label: "4", isCorrect: true },
      ],
    },
    {
      id: "q2",
      position: 2,
      prompt: "Water freezes at 0°C.",
      questionType: "true_false",
      points: 3,
      options: [
        { id: "q2a", label: "True", isCorrect: true },
        { id: "q2b", label: "False", isCorrect: false },
      ],
    },
  ],
};

/**
 * Grading failures surface as a summary message plus per-field detail, so the
 * detail is what the tests assert on.
 */
function expectFieldError(run: () => unknown, pattern: RegExp): void {
  try {
    run();
    expect.unreachable("expected a ValidationError");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const messages = Object.values((error as ValidationError).fieldErrors).flat();
    expect(messages.some((message) => pattern.test(message))).toBe(true);
  }
}

describe("gradeSubmission", () => {
  it("awards full points for a perfect submission", () => {
    const result = gradeSubmission(context, [
      { questionId: "q1", selectedOptionId: "q1b" },
      { questionId: "q2", selectedOptionId: "q2a" },
    ]);

    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(4);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.answers.every((answer) => answer.isCorrect)).toBe(true);
  });

  it("awards nothing for all-wrong answers", () => {
    const result = gradeSubmission(context, [
      { questionId: "q1", selectedOptionId: "q1a" },
      { questionId: "q2", selectedOptionId: "q2b" },
    ]);

    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("honours per-question point weighting", () => {
    // Correct on the 3-point question, wrong on the 1-point one: 3 of 4 = 75%.
    const result = gradeSubmission(context, [
      { questionId: "q1", selectedOptionId: "q1a" },
      { questionId: "q2", selectedOptionId: "q2a" },
    ]);

    expect(result.score).toBe(3);
    expect(result.percentage).toBe(75);
    expect(result.passed).toBe(true);
  });

  it("applies the passing score exactly at the boundary", () => {
    // Correct on the 3-point question only: 3 of 4 = 75%.
    const scoring = [
      { questionId: "q1", selectedOptionId: "q1a" },
      { questionId: "q2", selectedOptionId: "q2a" },
    ];

    expect(gradeSubmission({ ...context, passingScore: 75 }, scoring).passed).toBe(true);
    expect(gradeSubmission({ ...context, passingScore: 76 }, scoring).passed).toBe(false);
  });

  it("treats a quiz with no passing score as always passing", () => {
    const result = gradeSubmission(
      { ...context, passingScore: null },
      [
        { questionId: "q1", selectedOptionId: "q1a" },
        { questionId: "q2", selectedOptionId: "q2b" },
      ],
    );

    expect(result.score).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("rejects a submission that omits a question", () => {
    expect(() =>
      gradeSubmission(context, [{ questionId: "q1", selectedOptionId: "q1b" }]),
    ).toThrow(ValidationError);
  });

  it("rejects an answer for a question outside this version", () => {
    expectFieldError(
      () =>
        gradeSubmission(context, [
          { questionId: "q1", selectedOptionId: "q1b" },
          { questionId: "unknown", selectedOptionId: "q1a" },
        ]),
      /does not belong/i,
    );
  });

  it("rejects an option that belongs to a different question", () => {
    expectFieldError(
      () =>
        gradeSubmission(context, [
          { questionId: "q1", selectedOptionId: "q2a" },
          { questionId: "q2", selectedOptionId: "q2a" },
        ]),
      /not valid for this question/i,
    );
  });

  it("rejects a duplicated answer for the same question", () => {
    expectFieldError(
      () =>
        gradeSubmission(context, [
          { questionId: "q1", selectedOptionId: "q1b" },
          { questionId: "q1", selectedOptionId: "q1a" },
        ]),
      /more than once/i,
    );
  });

  it("rejects an unanswered question", () => {
    expectFieldError(
      () =>
        gradeSubmission(context, [
          { questionId: "q1", selectedOptionId: null },
          { questionId: "q2", selectedOptionId: "q2a" },
        ]),
      /Choose an option/i,
    );
  });

  it("never derives correctness from anything but the trusted option flag", () => {
    // Selecting an option labelled "3" for a question whose correct label is
    // "4" must score zero.
    const result = gradeSubmission(context, [
      { questionId: "q1", selectedOptionId: "q1a" },
      { questionId: "q2", selectedOptionId: "q2a" },
    ]);

    expect(result.answers[0]).toMatchObject({
      selectedOptionId: "q1a",
      isCorrect: false,
      pointsAwarded: 0,
    });
  });
});

describe("answeredQuestionCount", () => {
  it("counts only questions with a selection", () => {
    expect(
      answeredQuestionCount(context, { q1: "q1b", q2: undefined }),
    ).toBe(1);
  });
});

describe("participant name handling", () => {
  it("normalises blank names to null", () => {
    expect(normaliseParticipantName("   ")).toBeNull();
    expect(normaliseParticipantName(undefined)).toBeNull();
    expect(normaliseParticipantName("  Ada  ")).toBe("Ada");
  });

  it("rejects an over-long name", () => {
    expect(() => normaliseParticipantName("x".repeat(81))).toThrow(ValidationError);
  });

  it("requires a name only when the quiz issues certificates", () => {
    expect(() => assertCertificateNameProvided(false, null)).not.toThrow();
    expect(() => assertCertificateNameProvided(true, null)).toThrow(/Enter your name/i);
    expect(() => assertCertificateNameProvided(true, "Ada")).not.toThrow();
  });
});

describe("attempt state transitions", () => {
  it("allows submitting only an in-progress attempt", () => {
    expect(() => assertSubmittable("in_progress")).not.toThrow();
    expect(() => assertSubmittable("submitted")).toThrow(/already been submitted/i);
  });

  it("exposes a result only after submission", () => {
    expect(() => assertResultAvailable("submitted")).not.toThrow();
    expect(() => assertResultAvailable("in_progress")).toThrow(/not been submitted/i);
  });
});