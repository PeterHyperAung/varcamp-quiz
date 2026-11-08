"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/forms";
import type { QuizVersionRow } from "@/lib/db/types";
import {
  saveQuizSettingsAction,
  updateQuizDetailsAction,
} from "@/modules/quizzes/presentation/actions";

function StateMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  if (status === "idle" || !message) return null;

  return (
    <p
      role="status"
      className={status === "error" ? "vc-error-text" : "text-sm text-sun-500"}
    >
      {message}
    </p>
  );
}

export function QuizDetailsForm({
  quizId,
  title,
  description,
}: {
  quizId: string;
  title: string;
  description: string | null;
}) {
  const [state, action] = useActionState(updateQuizDetailsAction, idleState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="quizId" value={quizId} />

      <div>
        <label className="vc-field-label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          defaultValue={title}
          required
          maxLength={200}
          className="vc-field"
        />
        {state.fieldErrors?.title ? (
          <p className="vc-error-text">{state.fieldErrors.title[0]}</p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={description ?? ""}
          rows={3}
          maxLength={2000}
          className="vc-field"
        />
        {state.fieldErrors?.description ? (
          <p className="vc-error-text">{state.fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
        <StateMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}

export function QuizSettingsForm({
  quizId,
  version,
}: {
  quizId: string;
  version: QuizVersionRow;
}) {
  const [state, action] = useActionState(saveQuizSettingsAction, idleState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="quizId" value={quizId} />

      <div>
        <label className="vc-field-label" htmlFor="instructions">
          Instructions shown to participants
        </label>
        <textarea
          id="instructions"
          name="instructions"
          defaultValue={version.instructions ?? ""}
          rows={4}
          maxLength={4000}
          className="vc-field"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="vc-field-label" htmlFor="passingScore">
            Passing score (%)
          </label>
          <input
            id="passingScore"
            name="passingScore"
            type="number"
            min={0}
            max={100}
            defaultValue={version.passing_score ?? ""}
            className="vc-field"
            aria-describedby="passingScore-hint"
          />
          <p id="passingScore-hint" className="vc-field-hint">
            Leave empty for no pass mark.
          </p>
          {state.fieldErrors?.passingScore ? (
            <p className="vc-error-text">{state.fieldErrors.passingScore[0]}</p>
          ) : null}
        </div>

        <div className="flex min-w-0 items-start gap-3 pt-0 sm:pt-6">
          <input
            id="certificateEnabled"
            name="certificateEnabled"
            type="checkbox"
            value="true"
            defaultChecked={version.certificate_enabled}
            className="size-5 shrink-0 accent-sun-500"
          />
          <label htmlFor="certificateEnabled" className="min-w-0 break-words font-semibold">
            Issue certificates
            <span className="vc-field-hint block">
              Requires a name and a passing score.
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
        <StateMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}
