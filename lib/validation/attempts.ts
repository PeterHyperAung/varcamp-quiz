import { z } from "zod";

const trimmed = z.string().trim();

export const startAttemptInputSchema = z
  .object({
    participantName: trimmed.min(1, "Enter your name.").max(80),
  })
  .strict();

/**
 * A submission payload.
 *
 * Note what is *absent*: score, correctness and correct-answer ids. The server
 * derives all of those from the published quiz version.
 */
export const submitAttemptInputSchema = z
  .object({
    participantName: trimmed.max(80).optional().default(""),
    answers: z
      .array(
        z
          .object({
            questionId: z.string().uuid(),
            selectedOptionId: z.string().uuid().nullable(),
          })
          .strict(),
      )
      .min(1, "Answer every question before submitting."),
  })
  .strict();

export const loginInputSchema = z
  .object({
    email: trimmed.min(1, "Enter your email.").email("Enter a valid email address."),
    password: z.string().min(1, "Enter your password."),
  })
  .strict();

export type StartAttemptInput = z.infer<typeof startAttemptInputSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;

/** Flattens a Zod error into the `Record<field, string[]>` shape used by forms. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}
