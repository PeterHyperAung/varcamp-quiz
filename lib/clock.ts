/**
 * Time is injected so that schedule-status and certificate eligibility logic
 * can be tested deterministically.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Deterministic clock for tests. */
export function fixedClock(iso: string): Clock {
  const at = new Date(iso);
  return { now: () => new Date(at.getTime()) };
}