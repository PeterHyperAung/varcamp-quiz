import "server-only";

import { Kysely, sql } from "kysely";

import type { Database } from "@/lib/db/types";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const BLOCK_MS = 15 * 60 * 1000;

export interface ThrottleStatus {
  blocked: boolean;
  retryAfterSeconds: number;
}

/**
 * Database-backed login throttling.
 *
 * Kept in Postgres so the limit is shared across every serverless instance
 * rather than resetting whenever the process recycles.
 */
export class LoginThrottleRepository {
  constructor(private readonly db: Kysely<Database>) {}

  private keyFor(email: string, ip: string): string {
    return `${email.toLowerCase()}|${ip}`;
  }

  async status(email: string, ip: string, now: Date): Promise<ThrottleStatus> {
    const row = await this.db
      .selectFrom("login_throttles")
      .select(["blocked_until", "failures", "window_start"])
      .where("key", "=", this.keyFor(email, ip))
      .executeTakeFirst();

    if (!row?.blocked_until) return { blocked: false, retryAfterSeconds: 0 };

    const blockedUntil = row.blocked_until.getTime();
    if (blockedUntil <= now.getTime()) {
      return { blocked: false, retryAfterSeconds: 0 };
    }

    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((blockedUntil - now.getTime()) / 1000),
    };
  }

  async recordFailure(email: string, ip: string, now: Date): Promise<void> {
    const key = this.keyFor(email, ip);

    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("login_throttles")
        .selectAll()
        .where("key", "=", key)
        .forUpdate()
        .executeTakeFirst();

      // The window resets once it is older than the throttle window.
      const windowExpired =
        !existing || now.getTime() - existing.window_start.getTime() > WINDOW_MS;

      const failures = windowExpired ? 1 : existing.failures + 1;
      const windowStart = windowExpired ? now : existing.window_start;
      const blockedUntil =
        failures >= MAX_FAILURES
          ? new Date(now.getTime() + BLOCK_MS)
          : null;

      if (existing) {
        await trx
          .updateTable("login_throttles")
          .set({
            failures,
            window_start: windowStart,
            blocked_until: blockedUntil,
            updated_at: now,
          })
          .where("key", "=", key)
          .execute();
      } else {
        await trx
          .insertInto("login_throttles")
          .values({
            key,
            failures,
            window_start: windowStart,
            blocked_until: blockedUntil,
          })
          .execute();
      }
    });
  }

  async reset(email: string, ip: string, now: Date): Promise<void> {
    await this.db
      .deleteFrom("login_throttles")
      .where("key", "=", this.keyFor(email, ip))
      .where("updated_at", "<=", now)
      .execute();

    await this.db
      .insertInto("login_throttles")
      .values({ key: this.keyFor(email, ip), failures: 0, window_start: now })
      .onConflict((oc) =>
        oc.column("key").doUpdateSet({ failures: 0, blocked_until: null, updated_at: now }),
      )
      .execute();
  }

  /** Housekeeping so abandoned rows do not accumulate forever. */
  async purgeStale(olderThan: Date): Promise<void> {
    await sql`
      DELETE FROM login_throttles
      WHERE window_start < ${olderThan}
        AND (blocked_until IS NULL OR blocked_until < ${olderThan})
    `.execute(this.db);
  }
}