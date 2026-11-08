import { ValidationError } from "@/lib/errors";
import type { PublicationStatus } from "@/lib/domain/enums";

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_LOCATION_LENGTH = 300;
export const MAX_EVENT_DURATION_MS = 1000 * 60 * 60 * 24 * 31;

export const EVENT_SCHEDULE_STATUSES = ["upcoming", "ongoing", "ended"] as const;
export type EventScheduleStatus = (typeof EVENT_SCHEDULE_STATUSES)[number];

export interface EventSchedule {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

/**
 * Derives schedule status from the stored timestamps.
 *
 * No mutable status column exists, so an event can never be left stale by a
 * failed job or a missed cron run.
 */
export function deriveScheduleStatus(
  schedule: Pick<EventSchedule, "startsAt" | "endsAt">,
  now: Date,
): EventScheduleStatus {
  if (now.getTime() < schedule.startsAt.getTime()) return "upcoming";
  if (now.getTime() < schedule.endsAt.getTime()) return "ongoing";
  return "ended";
}

/**
 * Validates an event's schedule.
 *
 * Ordering is enforced here *and* by a database CHECK constraint, so a bad
 * write that bypasses the application layer is still rejected.
 */
export function validateEventSchedule(input: {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}): void {
  const errors: Record<string, string[]> = {};

  if (Number.isNaN(input.startsAt.getTime())) {
    errors.startsAt = ["Enter a valid start time."];
  }
  if (Number.isNaN(input.endsAt.getTime())) {
    errors.endsAt = ["Enter a valid end time."];
  }

  if (!errors.startsAt && !errors.endsAt) {
    if (input.startsAt.getTime() >= input.endsAt.getTime()) {
      errors.endsAt = ["The end time must be after the start time."];
    } else if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_EVENT_DURATION_MS) {
      errors.endsAt = ["An event cannot run for more than 31 days."];
    }
  }

  if (!isValidTimeZone(input.timezone)) {
    errors.timezone = ["Enter a valid IANA timezone, for example Asia/Yangon."];
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError("This event's schedule is not valid.", errors);
  }
}

export function isValidTimeZone(timezone: string): boolean {
  if (typeof timezone !== "string" || timezone.trim().length === 0) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Public timetable ordering: chronological by start time, with a fully
 * deterministic tie-break so events sharing a start time never reorder between
 * renders (which would cause React key churn and layout shift).
 */
export function compareEventTimetableOrder(
  a: { startsAt: Date; endsAt: Date; id: string },
  b: { startsAt: Date; endsAt: Date; id: string },
): number {
  const byStart = a.startsAt.getTime() - b.startsAt.getTime();
  if (byStart !== 0) return byStart;

  const byEnd = a.endsAt.getTime() - b.endsAt.getTime();
  if (byEnd !== 0) return byEnd;

  return a.id.localeCompare(b.id);
}

/** Publication status is deliberately separate from schedule status. */
export function isVisibleOnPublicTimetable(
  publicationStatus: PublicationStatus,
): boolean {
  return publicationStatus === "published";
}

export function assertEventTitle(title: string): void {
  const value = title.trim();
  if (value.length === 0) {
    throw new ValidationError("An event title is required.", {
      title: ["Enter a title."],
    });
  }
  if (value.length > MAX_TITLE_LENGTH) {
    throw new ValidationError("The event title is too long.", {
      title: [`Use at most ${MAX_TITLE_LENGTH} characters.`],
    });
  }
}