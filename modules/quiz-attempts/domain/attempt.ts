import { ValidationError } from "@/lib/errors";

export const MAX_PARTICIPANT_NAME_LENGTH = 80;

export type AttemptState = "in_progress" | "submitted";

export interface AttemptSummary {
  publicId: string;
  status: AttemptState;
  participantName: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
}

/**
 * Normalises the participant's public leaderboard name.
 *
 * Empty names collapse to null so callers can return a field-specific error.
 */
export function normaliseParticipantName(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";

  if (value.length === 0) return null;
  if (value.length > MAX_PARTICIPANT_NAME_LENGTH) {
    throw new ValidationError("Your name is too long.", {
      participantName: [`Use at most ${MAX_PARTICIPANT_NAME_LENGTH} characters.`],
    });
  }

  return value;
}

export function assertCertificateNameProvided(
  certificateEnabled: boolean,
  participantName: string | null,
): void {
  if (!certificateEnabled) return;

  if (!participantName) {
    throw new ValidationError("Enter your name to receive a certificate.", {
      participantName: ["Enter your name."],
    });
  }
}

export function assertParticipantNameProvided(participantName: string | null): void {
  if (!participantName) {
    throw new ValidationError("Enter your name to appear on the leaderboard.", {
      participantName: ["Enter your name."],
    });
  }
}

/**
 * Submissions are one-shot: an attempt that already has a result cannot be
 * re-submitted, which keeps scores auditable.
 */
export function assertSubmittable(status: AttemptState): void {
  if (status === "submitted") {
    throw new ValidationError("This quiz has already been submitted.");
  }
}

export function assertResultAvailable(status: AttemptState): void {
  if (status !== "submitted") {
    throw new ValidationError("This quiz has not been submitted yet.");
  }
}
