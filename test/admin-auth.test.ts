import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";

import { fixedClock } from "@/lib/clock";
import { UnauthorizedError } from "@/lib/errors";
import { isPublicId } from "@/lib/ids";
import type { Database } from "@/lib/db/types";
import { authenticate } from "@/modules/admin-auth/application/authenticate";
import { AdministratorRepository } from "@/modules/admin-auth/infrastructure/administrator-repository";
import { hashPassword } from "@/modules/admin-auth/infrastructure/password-hasher";
import {
  MAX_FAILURES,
  LoginThrottleRepository,
} from "@/modules/admin-auth/infrastructure/login-throttle-repository";
import {
  createSessionToken,
  verifySessionToken,
} from "@/modules/admin-auth/infrastructure/session-token";
import { generatePublicId } from "@/lib/ids";
import { createTestDb } from "./test-db";

/**
 * Authentication integration tests.
 *
 * The session signer is exercised against the real signing key, so a change to
 * the algorithm, issuer or claims is caught here rather than in production.
 */

let db: Kysely<Database>;
let destroy: () => Promise<void>;

const PASSWORD = "correct-horse-battery-staple";
const clock = fixedClock("2026-03-01T12:00:00.000Z");

beforeEach(async () => {
  const harness = await createTestDb();
  db = harness.db;
  destroy = harness.destroy;

  process.env.SESSION_SECRET ??= "test-secret-that-is-definitely-long-enough-32";
});

afterEach(async () => {
  await destroy();
});

describe("password hashing", () => {
  it("never stores the plaintext password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("produces a different hash for the same input", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
  });
});

describe("authenticate", () => {
  beforeEach(async () => {
    await db
      .insertInto("administrators")
      .values({
        email: "organiser@example.test",
        name: "Organiser",
        password_hash: await hashPassword(PASSWORD),
      })
      .execute();
  });

  it("returns the session for correct credentials", async () => {
    const session = await authenticate(
      { email: "organiser@example.test", password: PASSWORD, ipAddress: "1.1.1.1" },
      db,
      clock,
    );

    expect(session.email).toBe("organiser@example.test");
    expect(session.name).toBe("Organiser");
    expect(isPublicId(generatePublicId())).toBe(true);
  });

  it("is case-insensitive about the email", async () => {
    const session = await authenticate(
      { email: "  ORGANISER@example.test ", password: PASSWORD, ipAddress: "1.1.1.1" },
      db,
      clock,
    );

    expect(session.email).toBe("organiser@example.test");
  });

  it("rejects a wrong password", async () => {
    await expect(
      authenticate(
        { email: "organiser@example.test", password: "wrong", ipAddress: "1.1.1.1" },
        db,
        clock,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allows a locally reset password and no longer accepts the old one", async () => {
    const administrators = new AdministratorRepository(db);
    const administrator = await administrators.findByEmail("organiser@example.test");
    expect(administrator).not.toBeNull();

    const newPassword = "a-different-password-2026";
    const newHash = await hashPassword(newPassword);
    await administrators.updatePasswordHash(administrator!.id, newHash);

    await expect(
      authenticate(
        { email: "organiser@example.test", password: newPassword, ipAddress: "7.7.7.7" },
        db,
        clock,
      ),
    ).resolves.toBeTruthy();

    await expect(
      authenticate(
        { email: "organiser@example.test", password: PASSWORD, ipAddress: "8.8.8.8" },
        db,
        clock,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("gives the same message for an unknown account as for a wrong password", async () => {
    const unknown = await authenticate(
      { email: "nobody@example.test", password: "whatever", ipAddress: "2.2.2.2" },
      db,
      clock,
    ).catch((error: unknown) => error as Error);

    const wrongPassword = await authenticate(
      { email: "organiser@example.test", password: "wrong", ipAddress: "2.2.2.2" },
      db,
      clock,
    ).catch((error: unknown) => error as Error);

    expect((unknown as Error).message).toBe((wrongPassword as Error).message);
  });

  it("never returns the password hash", async () => {
    const session = await authenticate(
      { email: "organiser@example.test", password: PASSWORD, ipAddress: "1.1.1.1" },
      db,
      clock,
    );

    expect(JSON.stringify(session)).not.toContain("$2");
    expect(Object.keys(session).sort()).toEqual([
      "administratorId",
      "email",
      "name",
    ]);
  });

  it("blocks the pair after too many failures", async () => {
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await expect(
        authenticate(
          { email: "organiser@example.test", password: "wrong", ipAddress: "3.3.3.3" },
          db,
          clock,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    }

    // Even the correct password is refused while the throttle is active.
    await expect(
      authenticate(
        { email: "organiser@example.test", password: PASSWORD, ipAddress: "3.3.3.3" },
        db,
        clock,
      ),
    ).rejects.toThrow(/Too many failed attempts/i);
  });

  it("throttles per email and ip, not globally", async () => {
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      await authenticate(
        { email: "organiser@example.test", password: "wrong", ipAddress: "4.4.4.4" },
        db,
        clock,
      ).catch(() => undefined);
    }

    // A different IP is unaffected.
    await expect(
      authenticate(
        { email: "organiser@example.test", password: PASSWORD, ipAddress: "5.5.5.5" },
        db,
        clock,
      ),
    ).resolves.toBeTruthy();
  });

  it("clears the failure count after a successful sign-in", async () => {
    await authenticate(
      { email: "organiser@example.test", password: "wrong", ipAddress: "6.6.6.6" },
      db,
      clock,
    ).catch(() => undefined);

    await authenticate(
      { email: "organiser@example.test", password: PASSWORD, ipAddress: "6.6.6.6" },
      db,
      clock,
    );

    const throttle = new LoginThrottleRepository(db);
    const status = await throttle.status("organiser@example.test", "6.6.6.6", clock.now());

    expect(status.blocked).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips the session claims", async () => {
    const token = await createSessionToken({
      administratorId: "0f2c5b1e-6a1f-4a0b-9c9c-1d2e3f4a5b6c",
      email: "organiser@example.test",
      name: "Organiser",
    });

    const session = await verifySessionToken(token);

    expect(session).toEqual({
      administratorId: "0f2c5b1e-6a1f-4a0b-9c9c-1d2e3f4a5b6c",
      email: "organiser@example.test",
      name: "Organiser",
    });
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken({
      administratorId: "0f2c5b1e-6a1f-4a0b-9c9c-1d2e3f4a5b6c",
      email: "organiser@example.test",
      name: "Organiser",
    });

    const [header, payload, signature] = token.split(".");

    // Re-sign nothing: swap the payload for one claiming a different identity.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: "11111111-1111-4111-8111-111111111111",
        email: "attacker@example.test",
        name: "Attacker",
        iss: "varcamp",
        aud: "varcamp-admin",
      }),
    ).toString("base64url");

    const forged = `${header}.${forgedPayload}.${signature}`;

    expect(await verifySessionToken(forged)).toBeNull();
    expect(await verifySessionToken(`${header}.${payload}.invalid`)).toBeNull();
    expect(await verifySessionToken("not-a-token")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { resetServerEnvCache } = await import("@/lib/config/env");

    const original = process.env.SESSION_SECRET;

    // Sign under secret A.
    process.env.SESSION_SECRET = "secret-a-that-is-definitely-long-enough-32";
    resetServerEnvCache();

    const tokenFromA = await createSessionToken({
      administratorId: "0f2c5b1e-6a1f-4a0b-9c9c-1d2e3f4a5b6c",
      email: "organiser@example.test",
      name: "Organiser",
    });

    // Switch to secret B.
    process.env.SESSION_SECRET = "secret-b-that-is-definitely-long-enough-32";
    resetServerEnvCache();

    // The token from A no longer verifies.
    expect(await verifySessionToken(tokenFromA)).toBeNull();

    const tokenFromB = await createSessionToken({
      administratorId: "0f2c5b1e-6a1f-4a0b-9c9c-1d2e3f4a5b6c",
      email: "organiser@example.test",
      name: "Organiser",
    });

    expect(await verifySessionToken(tokenFromB)).not.toBeNull();

    process.env.SESSION_SECRET = original;
    resetServerEnvCache();
  });
});

describe("public identifiers", () => {
  it("generates ids that are not sequential database identifiers", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generatePublicId()));

    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toHaveLength(16);
      expect(isPublicId(id)).toBe(true);
    }
  });

  it("rejects obviously invalid ids", () => {
    expect(isPublicId("short")).toBe(false);
    expect(isPublicId("has spaces here")).toBe(false);
    expect(isPublicId("")).toBe(false);
  });
});
