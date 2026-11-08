"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { idleState } from "@/lib/forms";
import { createQuizAction } from "@/modules/quizzes/presentation/actions";

/** Creates a quiz and navigates straight into its editor. */
export function CreateQuizForm() {
  const [state, action] = useActionState(createQuizAction, idleState);
  const router = useRouter();

  // On success the action returns the new quiz id; open it rather than forcing
  // a manual click.
  useEffect(() => {
    if (state.status === "success" && state.message) {
      router.push(`/admin/quizzes/${state.message}`);
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="vc-field-label" htmlFor="new-title">
          Title
        </label>
        <input
          id="new-title"
          name="title"
          required
          maxLength={200}
          placeholder="e.g. VarCamp Welcome Quiz"
          className="vc-field"
        />
        {state.fieldErrors?.title ? (
          <p className="vc-error-text">{state.fieldErrors.title[0]}</p>
        ) : null}
      </div>

      <div>
        <label className="vc-field-label" htmlFor="new-description">
          Description
        </label>
        <textarea
          id="new-description"
          name="description"
          rows={2}
          maxLength={2000}
          placeholder="Shown on the public quiz list."
          className="vc-field"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton pendingLabel="Creating…">Create quiz</SubmitButton>
        {state.status === "error" && state.message ? (
          <p role="alert" className="vc-error-text">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}