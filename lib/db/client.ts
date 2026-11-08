import "server-only";

import { Pool } from "@neondatabase/serverless";
import { Kysely, PostgresDialect, type PostgresPool } from "kysely";

import { getServerEnv } from "@/lib/config/env";
import type { Database } from "@/lib/db/types";

/**
 * A single pooled Kysely instance for the whole server runtime.
 *
 * The Neon serverless `Pool` speaks the Postgres wire protocol over WebSockets
 * in Node, which means `db.transaction()` and advisory locks work exactly as
 * they do on a long-lived Node server.
 */
declare global {
  var __quizDb: Kysely<Database> | undefined;
}

function createDb(): Kysely<Database> {
  const { DATABASE_URL } = getServerEnv();

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    // Neon serverless connections are cheap to recycle and long-lived sockets
    // stall on serverless platforms, so cap the idle lifetime.
    idleTimeoutMillis: 30_000,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      // The Neon serverless pool speaks the Postgres wire protocol and exposes
      // the same `connect()`/`release()` contract Kysely's Postgres dialect
      // expects; its published type is simply narrower than the dialect's
      // structural requirement.
      pool: pool as unknown as PostgresPool,
    }),
  });
}

export function getDb(): Kysely<Database> {
  if (!globalThis.__quizDb) {
    globalThis.__quizDb = createDb();
  }
  return globalThis.__quizDb;
}

export type { Database };