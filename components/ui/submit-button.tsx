"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  pendingLabel?: string;
  className?: string;
}

/**
 * Submit button that reflects the enclosing form's pending state.
 *
 * Double submits are prevented on the client, but the server is the authority:
 * quiz submission is idempotent server-side regardless.
 */
export function SubmitButton({
  children,
  variant = "primary",
  pendingLabel,
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${variant === "primary" ? "vc-pill-cta" : "vc-pill-secondary"} ${className ?? ""}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}