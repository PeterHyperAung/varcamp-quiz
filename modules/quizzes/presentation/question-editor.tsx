"use client";

import { useActionState, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { idleState, type ActionState } from "@/lib/forms";
import type { Question } from "@/modules/quizzes/domain/quiz-content";
import {
  addQuestionAction,
  deleteQuestionAction,
  moveQuestionAction,
  updateQuestionAction,
} from "@/modules/quizzes/presentation/actions";

const TRUE_FALSE_OPTIONS = [
  { label: "True", isCorrect: true },
  { label: "False", isCorrect: false },
] as const;

interface DraftOption {
  label: string;
  isCorrect: boolean;
}

/**
 * Question editor.
 *
 * Options are managed client-side for usability, but the payload is
 * re-validated on the server: a forged request with zero or several correct
 * answers is rejected by the domain validator.
 */
export function QuestionForm({
  quizId,
  question,
}: {
  quizId: string;
  question?: Question;
}) {
  const isEditing = Boolean(question);
  const action = isEditing ? updateQuestionAction : addQuestionAction;
  const formRef = useRef<HTMLFormElement>(null);

  const [questionType, setQuestionType] = useState<
    "multiple_choice" | "true_false"
  >(question?.questionType ?? "multiple_choice");

  const [options, setOptions] = useState<DraftOption[]>(() => {
    if (question) {
      return question.options.map((option) => ({
        label: option.label,
        isCorrect: option.isCorrect,
      }));
    }
    if (questionType === "true_false") {
      return TRUE_FALSE_OPTIONS.map((option) => ({ ...option }));
    }
    return [
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
    ];
  });

  const [state, formAction] = useActionState(
    async (previousState: ActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);

      if (!isEditing && nextState.status === "success") {
        formRef.current?.reset();
        setQuestionType("multiple_choice");
        setOptions([
          { label: "", isCorrect: true },
          { label: "", isCorrect: false },
        ]);
      }

      return nextState;
    },
    idleState,
  );

  function changeType(next: "multiple_choice" | "true_false") {
    setQuestionType(next);

    if (next === "true_false") {
      // True/false is a fixed pair; the labels are not editable.
      setOptions(TRUE_FALSE_OPTIONS.map((option) => ({ ...option })));
      return;
    }

    // Back to multiple choice: restore at least two blank options if the
    // current set is the fixed true/false pair.
    if (options.length === 2 && options[0]?.label === "True") {
      setOptions([
        { label: "", isCorrect: true },
        { label: "", isCorrect: false },
      ]);
    }
  }

  function setOptionLabel(index: number, label: string) {
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, label } : option)),
    );
  }

  function setCorrect(index: number) {
    setOptions((current) =>
      // Exactly one option is correct at a time.
      current.map((option, i) => ({ ...option, isCorrect: i === index })),
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="quizId" value={quizId} />
      {question ? (
        <input type="hidden" name="questionId" value={question.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="vc-field-label" htmlFor={`prompt-${question?.id ?? "new"}`}>
            Question
          </label>
          <textarea
            id={`prompt-${question?.id ?? "new"}`}
            name="prompt"
            defaultValue={question?.prompt}
            rows={2}
            required
            maxLength={500}
            className="vc-field"
          />
          {state.fieldErrors?.[`questions.0.prompt`] ? (
            <p className="vc-error-text">
              {state.fieldErrors[`questions.0.prompt`][0]}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
          <div>
            <label
              className="vc-field-label"
              htmlFor={`questionType-${question?.id ?? "new"}`}
            >
              Type
            </label>
            <select
              id={`questionType-${question?.id ?? "new"}`}
              name="questionType"
              value={questionType}
              onChange={(event) =>
                changeType(event.target.value as "multiple_choice" | "true_false")
              }
              className="vc-field"
            >
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">True / False</option>
            </select>
          </div>
          <div>
            <label className="vc-field-label" htmlFor={`points-${question?.id ?? "new"}`}>
              Points
            </label>
            <input
              id={`points-${question?.id ?? "new"}`}
              name="points"
              type="number"
              min={1}
              max={100}
              defaultValue={question?.points ?? 1}
              required
              className="vc-field"
            />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="vc-field-label">Answer options</legend>

        <div className="space-y-2.5">
          {options.map((option, index) => {
            const isFixed = questionType === "true_false";

            return (
              <div key={index} className="flex min-w-0 items-center gap-3">
                <label className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="correct"
                    value={index}
                    checked={option.isCorrect}
                    onChange={() => setCorrect(index)}
                    className="size-4 accent-sun-500"
                    aria-label={`Mark option ${index + 1} as correct`}
                  />
                  <span className="sr-only">Correct</span>
                </label>

                <input
                  name="optionLabel"
                  value={option.label}
                  onChange={(event) => setOptionLabel(index, event.target.value)}
                  readOnly={isFixed}
                  required
                  maxLength={300}
                  placeholder={`Option ${index + 1}`}
                  className="vc-field min-w-0 flex-1"
                  aria-label={`Option ${index + 1} label`}
                />

                {!isFixed && options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((current) => current.filter((_, i) => i !== index))
                    }
                    className="vc-pill-secondary shrink-0 !px-3 !py-2 !text-xs"
                  >
                    Remove
                    <span className="sr-only"> option {index + 1}</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {!questionType || questionType === "multiple_choice" ? (
          options.length < 8 ? (
            <button
              type="button"
              onClick={() =>
                setOptions((current) => [...current, { label: "", isCorrect: false }])
              }
              className="vc-pill-secondary mt-3 !px-4 !py-2 !text-sm"
            >
              Add option
            </button>
          ) : null
        ) : null}

        {state.fieldErrors?.["questions.0.options"] ? (
          <p className="vc-error-text">
            {state.fieldErrors["questions.0.options"][0]}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Saving…">
          {isEditing ? "Save question" : "Add question"}
        </SubmitButton>
        {state.status !== "idle" && state.message ? (
          <p
            role="status"
            className={
              state.status === "error" ? "vc-error-text" : "text-sm text-sun-500"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Reorder and remove controls for one question in the draft. */
export function QuestionAdminActions({
  quizId,
  question,
  isFirst,
  isLast,
}: {
  quizId: string;
  question: Question;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [moveState, moveAction] = useActionState(moveQuestionAction, idleState);
  const [deleteState, deleteAction] = useActionState(deleteQuestionAction, idleState);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={moveAction} className="flex gap-2">
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="questionId" value={question.id} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={isFirst}
          className="vc-pill-secondary !px-3 !py-1.5 !text-xs"
          aria-label={`Move question ${question.position} up`}
        >
          ↑ Up
        </button>
      </form>

      <form action={moveAction} className="flex gap-2">
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="questionId" value={question.id} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={isLast}
          className="vc-pill-secondary !px-3 !py-1.5 !text-xs"
          aria-label={`Move question ${question.position} down`}
        >
          ↓ Down
        </button>
      </form>

      <form action={deleteAction}>
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="questionId" value={question.id} />
        <button
          type="submit"
          className="vc-pill-secondary !border-crimson-500 !px-3 !py-1.5 !text-xs hover:!bg-crimson-500/15"
          aria-label={`Remove question ${question.position}`}
        >
          Remove
        </button>
      </form>

      {moveState.status === "error" && moveState.message ? (
        <p role="alert" className="vc-error-text">
          {moveState.message}
        </p>
      ) : null}

      {deleteState.status === "error" && deleteState.message ? (
        <p role="alert" className="vc-error-text">
          {deleteState.message}
        </p>
      ) : null}
    </div>
  );
}
