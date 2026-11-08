import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  assertEventTitle,
  compareEventTimetableOrder,
  deriveScheduleStatus,
  isValidTimeZone,
  isVisibleOnPublicTimetable,
  MAX_TITLE_LENGTH,
  validateEventSchedule,
} from "@/modules/events/domain/schedule";
import {
  evaluateCertificateEligibility,
  type CertificateEligibilityInput,
} from "@/modules/certificates/domain/eligibility";

const HOUR = 60 * 60 * 1000;

/* ------------------------------- events --------------------------------- */

describe("deriveScheduleStatus", () => {
  const schedule = {
    startsAt: new Date("2026-03-01T10:00:00.000Z"),
    endsAt: new Date("2026-03-01T12:00:00.000Z"),
  };

  it("is upcoming strictly before the start", () => {
    expect(deriveScheduleStatus(schedule, new Date("2026-03-01T09:59:59.999Z"))).toBe(
      "upcoming",
    );
  });

  it("is ongoing exactly at the start", () => {
    expect(deriveScheduleStatus(schedule, new Date("2026-03-01T10:00:00.000Z"))).toBe(
      "ongoing",
    );
  });

  it("is ongoing strictly before the end", () => {
    expect(deriveScheduleStatus(schedule, new Date("2026-03-01T11:59:59.999Z"))).toBe(
      "ongoing",
    );
  });

  it("is ended exactly at the end", () => {
    expect(deriveScheduleStatus(schedule, new Date("2026-03-01T12:00:00.000Z"))).toBe(
      "ended",
    );
  });

  it("stays ended after the end", () => {
    expect(deriveScheduleStatus(schedule, new Date("2026-03-02T10:00:00.000Z"))).toBe(
      "ended",
    );
  });
});

describe("validateEventSchedule", () => {
  const valid = {
    startsAt: new Date("2026-03-01T10:00:00.000Z"),
    endsAt: new Date("2026-03-01T12:00:00.000Z"),
    timezone: "Asia/Yangon",
  };

  it("accepts a valid schedule", () => {
    expect(() => validateEventSchedule(valid)).not.toThrow();
  });

  it("rejects an end that is not after the start", () => {
    expectScheduleFieldError(
      { ...valid, endsAt: valid.startsAt },
      "endsAt",
      /after the start/i,
    );
  });

  it("rejects an end before the start", () => {
    expectScheduleFieldError(
      { ...valid, endsAt: new Date(valid.startsAt.getTime() - HOUR) },
      "endsAt",
      /after the start/i,
    );
  });

  it("rejects an invalid timezone", () => {
    try {
      validateEventSchedule({ ...valid, timezone: "Mars/Olympus" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors.timezone).toBeDefined();
    }
  });

  it("rejects an absurdly long event", () => {
    expectScheduleFieldError(
      { ...valid, endsAt: new Date(valid.startsAt.getTime() + 40 * 24 * HOUR) },
      "endsAt",
      /31 days/i,
    );
  });
});

/** Schedule failures carry the offending field in `fieldErrors`. */
function expectScheduleFieldError(
  input: Parameters<typeof validateEventSchedule>[0],
  field: string,
  pattern: RegExp,
): void {
  try {
    validateEventSchedule(input);
    expect.unreachable("expected a ValidationError");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    const messages = (error as ValidationError).fieldErrors[field] ?? [];
    expect(messages.some((message) => pattern.test(message))).toBe(true);
  }
}

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Asia/Yangon")).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});

describe("compareEventTimetableOrder", () => {
  const at = (iso: string) => new Date(iso);

  it("orders chronologically by start", () => {
    const earlier = { startsAt: at("2026-03-01T09:00:00Z"), endsAt: at("2026-03-01T10:00:00Z"), id: "b" };
    const later = { startsAt: at("2026-03-01T11:00:00Z"), endsAt: at("2026-03-01T12:00:00Z"), id: "a" };

    expect(compareEventTimetableOrder(earlier, later)).toBeLessThan(0);
    expect(compareEventTimetableOrder(later, earlier)).toBeGreaterThan(0);
  });

  it("breaks ties on end time", () => {
    const short = { startsAt: at("2026-03-01T09:00:00Z"), endsAt: at("2026-03-01T10:00:00Z"), id: "b" };
    const long = { startsAt: at("2026-03-01T09:00:00Z"), endsAt: at("2026-03-01T14:00:00Z"), id: "a" };

    expect(compareEventTimetableOrder(short, long)).toBeLessThan(0);
  });

  it("is fully deterministic for identical events", () => {
    const a = { startsAt: at("2026-03-01T09:00:00Z"), endsAt: at("2026-03-01T10:00:00Z"), id: "aaa" };
    const b = { startsAt: at("2026-03-01T09:00:00Z"), endsAt: at("2026-03-01T10:00:00Z"), id: "bbb" };

    expect(compareEventTimetableOrder(a, b)).toBeLessThan(0);
    expect(compareEventTimetableOrder(b, a)).toBeGreaterThan(0);
    expect(compareEventTimetableOrder(a, a)).toBe(0);
  });
});

describe("event publication", () => {
  it("shows only published events on the public timetable", () => {
    expect(isVisibleOnPublicTimetable("published")).toBe(true);
    expect(isVisibleOnPublicTimetable("draft")).toBe(false);
    expect(isVisibleOnPublicTimetable("archived")).toBe(false);
  });
});

describe("assertEventTitle", () => {
  it("requires a title", () => {
    expect(() => assertEventTitle("   ")).toThrow(ValidationError);
  });

  it("caps the title length", () => {
    expect(() => assertEventTitle("x".repeat(MAX_TITLE_LENGTH + 1))).toThrow(
      ValidationError,
    );
  });
});

/* ---------------------------- certificates ------------------------------ */

describe("evaluateCertificateEligibility", () => {
  const eligible: CertificateEligibilityInput = {
    attemptStatus: "submitted",
    certificateEnabled: true,
    passingScore: 60,
    percentage: 80,
    participantName: "Ada",
    alreadyIssued: false,
    revoked: false,
  };

  it("is eligible for a passing attempt with a name", () => {
    expect(evaluateCertificateEligibility(eligible)).toEqual({ eligible: true });
  });

  it("is not eligible before submission", () => {
    const result = evaluateCertificateEligibility({
      ...eligible,
      attemptStatus: "in_progress",
    });

    expect(result).toEqual({ eligible: false, reason: "attempt_not_submitted" });
  });

  it("is not eligible when the quiz issues no certificates", () => {
    const result = evaluateCertificateEligibility({ ...eligible, certificateEnabled: false });
    expect(result.reason).toBe("certificates_disabled");
  });

  it("is not eligible without a participant name", () => {
    const result = evaluateCertificateEligibility({ ...eligible, participantName: null });
    expect(result.reason).toBe("name_missing");

    const blank = evaluateCertificateEligibility({ ...eligible, participantName: "   " });
    expect(blank.reason).toBe("name_missing");
  });

  it("is not eligible below the passing score", () => {
    const result = evaluateCertificateEligibility({ ...eligible, percentage: 59.99 });
    expect(result.reason).toBe("below_passing_score");
  });

  it("is eligible exactly at the passing score", () => {
    expect(
      evaluateCertificateEligibility({ ...eligible, percentage: 60 }).eligible,
    ).toBe(true);
  });

  it("does not re-issue a certificate", () => {
    expect(evaluateCertificateEligibility({ ...eligible, alreadyIssued: true })).toEqual({
      eligible: false,
      reason: "already_issued",
    });
  });

  it("does not re-issue a revoked certificate", () => {
    expect(evaluateCertificateEligibility({ ...eligible, revoked: true })).toEqual({
      eligible: false,
      reason: "certificate_revoked",
    });
  });

  it("defensively treats a missing threshold as zero", () => {
    const result = evaluateCertificateEligibility({ ...eligible, passingScore: null });
    expect(result.eligible).toBe(true);
  });
});