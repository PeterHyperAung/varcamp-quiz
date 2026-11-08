import { DomainError } from "@/lib/errors";
import { ZodError } from "zod";
import { toFieldErrors } from "@/lib/validation/attempts";

export interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

export const idleState: ActionState = { status: "idle" };

export function failure(message: string, fieldErrors?: Record<string, string[]>): ActionState {
  return { status: "error", message, fieldErrors };
}

/**
 * Translates an expected failure into a safe form state.
 *
 * Only `DomainError` and `ZodError` messages reach the client. Anything else is
 * an unexpected bug: it is logged server-side and reported generically so SQL
 * errors, stack traces and secrets never reach the browser.
 */
export function toActionState(error: unknown, context: string): ActionState {
  if (error instanceof ZodError) {
    return failure("Please correct the highlighted fields.", toFieldErrors(error));
  }

  if (error instanceof DomainError) {
    return failure(error.message, error.fieldErrors);
  }

  console.error(`[${context}] unexpected error`, error);
  return failure("Something went wrong. Please try again.");
}

export function firstFieldError(fieldErrors?: Record<string, string[]>): string | undefined {
  if (!fieldErrors) return undefined;
  for (const messages of Object.values(fieldErrors)) {
    if (messages[0]) return messages[0];
  }
  return undefined;
}