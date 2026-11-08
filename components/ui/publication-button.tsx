"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { idleState, type ActionState } from "@/lib/forms";

interface PublicationButtonProps {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  entityId: string;
  entityIdField: string;
  label: string;
  pendingLabel?: string;
  tone?: "primary" | "secondary" | "danger";
  extraFields?: Record<string, string>;
  confirmMessage?: string;
}

/**
 * Publish / unpublish / archive control.
 *
 * The button is only a convenience: the server action re-checks authorization
 * and re-validates the transition, so calling it directly gains nothing.
 */
export function PublicationButton({
  action,
  entityId,
  entityIdField,
  label,
  pendingLabel,
  tone = "secondary",
  extraFields,
  confirmMessage,
}: PublicationButtonProps) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-3"
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name={entityIdField} value={entityId} />
      {extraFields
        ? Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      <PublicationSubmitButton
        label={label}
        pendingLabel={pendingLabel}
        tone={tone}
        state={state}
      />

      {state.status !== "idle" && state.message ? (
        <span
          role="status"
          className={state.status === "error" ? "vc-error-text" : "text-sm text-sun-500"}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function PublicationSubmitButton({
  label,
  pendingLabel,
  tone,
  state,
}: {
  label: string;
  pendingLabel?: string;
  tone: "primary" | "secondary" | "danger";
  state: ActionState;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || state.status !== "idle"}
      className={
        tone === "primary"
          ? "vc-pill-cta !py-2 !text-sm"
          : tone === "danger"
            ? "vc-pill-secondary !border-crimson-500 !py-2 !text-sm hover:!bg-crimson-500/15"
            : "vc-pill-secondary !py-2 !text-sm"
      }
    >
      {pending || state.status !== "idle" ? (pendingLabel ?? "Working…") : label}
    </button>
  );
}