import { z } from "zod";

const trimmed = z.string().trim();

/**
 * Optional free text.
 *
 * Accepts `null` as well as a string: forms send `""`, programmatic callers
 * naturally pass `null`, and both collapse to an empty string here.
 */
const optionalText = (max: number) =>
  z.preprocess((value) => value ?? "", trimmed.max(max));

export const eventInputSchema = z
  .object({
    title: trimmed.min(1, "Enter a title.").max(200),
    description: optionalText(2000),
    location: optionalText(300),
    roomPublicId: optionalText(64),
    // Sent as datetime-local strings from the admin form.
    startsAt: z.string().min(1, "Enter a start time."),
    endsAt: z.string().min(1, "Enter an end time."),
    timezone: trimmed.min(1, "Enter a timezone."),
    publicationStatus: z.enum(["draft", "published", "archived"]).default("draft"),
  })
  .strict();

export const roomInputSchema = z
  .object({
    name: trimmed.min(1, "Enter a room name.").max(100),
    description: optionalText(500),
  })
  .strict();

export type EventInput = z.infer<typeof eventInputSchema>;
export type RoomInput = z.infer<typeof roomInputSchema>;

/**
 * Converts a `datetime-local` value into an absolute instant.
 *
 * The admin form collects wall-clock times in the event's own timezone, so the
 * local string is interpreted in that zone and converted to a UTC instant for
 * storage. Nothing depends on the server's local timezone.
 */
export function parseEventInstant(localValue: string, timezone: string): Date {
  // `YYYY-MM-DDTHH:mm` (or with seconds) is already the wall clock in the zone.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    localValue.trim(),
  );

  if (!match) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "Enter a valid date and time.",
        path: ["startsAt"],
      },
    ]);
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  // Resolve the zone's offset at that wall-clock time, then correct once in
  // case the offset itself shifts (DST boundaries).
  const offsetAt = (instant: number) => zoneOffsetMs(instant, timezone);
  let instant = utcGuess - offsetAt(utcGuess);
  instant = utcGuess - offsetAt(instant);

  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new z.ZodError([
      { code: "custom", message: "Enter a valid date and time.", path: ["startsAt"] },
    ]);
  }

  return date;
}

function zoneOffsetMs(instant: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return asUtc - instant;
}

/** Renders an absolute instant as a `datetime-local` value in the given zone. */
export function formatForEventInput(
  instant: Date,
  timezone: string,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

export function formatEventTimeRange(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(startsAt);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(startsAt)
    .concat(" – ")
    .concat(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(endsAt),
    );

  return { date, time };
}
