import type { Kysely } from "kysely";

import { systemClock, type Clock } from "@/lib/clock";
import { UnauthorizedError } from "@/lib/errors";
import type { Database } from "@/lib/db/types";
import { loginInputSchema } from "@/lib/validation/attempts";
import { AdministratorRepository } from "../infrastructure/administrator-repository";
import { LoginThrottleRepository } from "../infrastructure/login-throttle-repository";
import {
  burnPasswordComparison,
  verifyPassword,
} from "../infrastructure/password-hasher";
import type { AdminSession } from "../infrastructure/session-token";

const GENERIC_FAILURE = "Incorrect email or password.";

export interface AuthenticateInput {
  email: string;
  password: string;
  /** Client IP, used only to key the login throttle. */
  ipAddress: string;
}

/**
 * Verifies administrator credentials.
 *
 * Two behaviours are deliberate:
 *   * A password comparison always runs, even for unknown accounts, so response
 *     timing does not reveal which emails exist.
 *   * Failures are throttled per (email, ip) pair in the database, which holds
 *     across serverless instances.
 *
 * Failures always surface the same message; nothing here leaks whether an
 * account exists.
 */
export async function authenticate(
  rawInput: AuthenticateInput,
  db: Kysely<Database>,
  clock: Clock = systemClock,
): Promise<AdminSession> {
  const parsed = loginInputSchema.safeParse({
    email: rawInput.email,
    password: rawInput.password,
  });

  const now = clock.now();
  const email = parsed.success ? parsed.data.email : rawInput.email.trim().toLowerCase();
  const ipAddress = rawInput.ipAddress;

  const throttle = new LoginThrottleRepository(db);

  const limit = await throttle.status(email, ipAddress, now);
  if (limit.blocked) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    throw new UnauthorizedError(
      `Too many failed attempts. Try again in about ${minutes} minute(s).`,
    );
  }

  if (!parsed.success) {
    await burnPasswordComparison();
    await throttle.recordFailure(email, ipAddress, now);
    throw new UnauthorizedError(GENERIC_FAILURE);
  }

  const administrators = new AdministratorRepository(db);
  const administrator = await administrators.findByEmail(parsed.data.email);

  if (!administrator) {
    // Equalise timing against the "wrong password" path.
    await burnPasswordComparison();
    await throttle.recordFailure(email, ipAddress, now);
    throw new UnauthorizedError(GENERIC_FAILURE);
  }

  const matches = await verifyPassword(parsed.data.password, administrator.password_hash);

  if (!matches) {
    await throttle.recordFailure(email, ipAddress, now);
    throw new UnauthorizedError(GENERIC_FAILURE);
  }

  await throttle.reset(email, ipAddress, now);

  return {
    administratorId: administrator.id,
    email: administrator.email,
    name: administrator.name,
  };
}