"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { ElapsedTime } from "@/components/ui/elapsed-time";
import type { PublicQuizView } from "@/modules/quiz-attempts/application/take-quiz";
import {
  startAttemptAction,
  submitAttemptAction,
} from "@/modules/quiz-attempts/presentation/actions";
import { ANSWER_FIELD_PREFIX } from "@/modules/quiz-attempts/presentation/answer-field";

interface QuizTakingFormProps {
  quiz: PublicQuizView;
  quizPublicId: string;
  attemptPublicId: string | null;
  participantName: string | null;
  initialElapsedMs: number;
  errorMessage: string | null;
}

/**
 * Interactive quiz runner.
 *
 * This component only ever holds *which* option a participant picked. It never
 * computes a score and never receives correct answers — grading happens on the
 * server against the published quiz version.
 */
export function QuizTakingForm({
  quiz,
  quizPublicId,
  attemptPublicId,
  participantName,
  initialElapsedMs,
  errorMessage,
}: QuizTakingFormProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});

  const total = quiz.questions.length;
  const answered = useMemo(
    () => quiz.questions.filter((question) => selections[question.id]).length,
    [quiz.questions, selections],
  );

  const allAnswered = total > 0 && answered === total;

  if (!attemptPublicId) {
    return (
      <form action={startAttemptAction} className="space-y-5">
        <input type="hidden" name="quizPublicId" value={quizPublicId} />

        <div>
          <label className="vc-field-label" htmlFor="participantName">
            Your name
          </label>
          <input
            id="participantName"
            name="participantName"
            className="vc-field"
            required
            maxLength={80}
            autoComplete="name"
            defaultValue={participantName ?? ""}
            aria-describedby="participantName-hint"
          />
          <p id="participantName-hint" className="vc-field-hint">
            {quiz.certificateEnabled
              ? "This appears on the leaderboard and your certificate. No account is needed."
              : "This appears on the public leaderboard. No account is needed."}
          </p>
        </div>

        {errorMessage ? (
          <p role="alert" className="vc-error-text !text-sm">
            {errorMessage}
          </p>
        ) : null}

        <StartQuizButton />
      </form>
    );
  }

  return (
    <form action={submitAttemptAction} className="space-y-8">
      <input type="hidden" name="quizPublicId" value={quizPublicId} />
      <input type="hidden" name="attemptPublicId" value={attemptPublicId} />
      <input type="hidden" name="participantName" value={participantName ?? ""} />

      <div className="vc-surface-raised flex items-center justify-between gap-4 p-4">
        <span className="text-sm font-semibold text-lavender-300">Time elapsed</span>
        <span className="text-xl font-bold text-sun-500">
          <ElapsedTime initialElapsedMs={initialElapsedMs} running />
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>
            {answered} of {total} answered
          </span>
          <span className="text-lavender-300">{Math.round((answered / total) * 100)}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Quiz progress"
          className="mt-2 h-2 overflow-hidden rounded-full bg-navy-700"
        >
          <div
            className="h-full rounded-full bg-sun-500 transition-[width] duration-300"
            style={{ width: `${(answered / total) * 100}%` }}
          />
        </div>
      </div>

      <ol className="space-y-5">
        {quiz.questions.map((question, index) => (
          <li key={question.id} className="vc-surface p-5 sm:p-6">
            <fieldset>
              <legend className="vc-heading text-base sm:text-lg">
                <span className="mr-2 text-crimson-500">{index + 1}.</span>
                {question.prompt}
              </legend>

              <div className="mt-4 space-y-2.5">
                {question.options.map((option) => {
                  const checked = selections[question.id] === option.id;

                  return (
                    <label
                      key={option.id}
                      className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        checked
                          ? "border-sun-500 bg-sun-500/12"
                          : "border-outline-500/70 hover:border-electric-500"
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`${ANSWER_FIELD_PREFIX}${question.id}`}
                        value={option.id}
                        checked={checked}
                        onChange={() =>
                          setSelections((current) => ({
                            ...current,
                            [question.id]: option.id,
                          }))
                        }
                      />
                      <span
                        aria-hidden="true"
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          checked
                            ? "border-sun-500 bg-sun-500"
                            : "border-lavender-500"
                        }`}
                      >
                        {checked ? (
                          <span className="size-1.5 rounded-full bg-navy-950" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 break-words font-medium">
                        {option.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {errorMessage ? (
        <p role="alert" className="vc-error-text">
          {errorMessage}
        </p>
      ) : null}

      <div className="vc-surface-raised flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-lavender-300">
          {allAnswered
            ? "Every question is answered."
            : "Answer every question before submitting."}
        </p>
        <button
          type="submit"
          className="vc-pill-cta"
          // The guard is a convenience only; the server re-validates the whole
          // submission regardless of what the client allows.
          aria-disabled={!allAnswered}
          onClick={(event) => {
            if (!allAnswered) event.preventDefault();
          }}
        >
          Submit answers
        </button>
      </div>
    </form>
  );
}

function StartQuizButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="vc-pill-cta w-full sm:w-auto"
      disabled={pending}
    >
      {pending ? "Starting…" : "Start quiz"}
    </button>
  );
}
