import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { Kysely, PostgresDialect, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateToLatest } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/types";
import { PGlitePoolAdapter } from "./test-db";

/**
 * The migration runner is the only thing standing between a schema change and
 * production data, so it is tested against a real Postgres rather than mocked.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

let db: Kysely<Database>;
let client: PGlite;

beforeEach(() => {
  client = new PGlite();
  db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new PGlitePoolAdapter(client) as never }),
  });
});

afterEach(async () => {
  await db.destroy();
});

async function appliedMigrations(): Promise<Array<{ name: string }>> {
  const rows = await sql<{ name: string }>`SELECT name FROM _migrations`.execute(db);
  return rows.rows;
}

describe("migrateToLatest", () => {
  it("applies every migration file in order and records them", async () => {
    await migrateToLatest(db);

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
    const applied = await appliedMigrations();

    expect(applied.map((row) => row.name)).toEqual(files);
  });

  it("is idempotent — running it twice applies nothing new", async () => {
    await migrateToLatest(db);
    const first = await appliedMigrations();

    await migrateToLatest(db);
    const second = await appliedMigrations();

    expect(second).toEqual(first);
  });

  it("creates every table the application expects", async () => {
    await migrateToLatest(db);

    const expected = [
      "administrators",
      "quizzes",
      "quiz_versions",
      "questions",
      "answer_options",
      "quiz_attempts",
      "attempt_answers",
      "certificates",
      "events",
      "rooms",
      "login_throttles",
    ];

    for (const table of expected) {
      const exists = await sql<{ regclass: string | null }>`
        SELECT to_regclass(${table}) AS regclass
      `.execute(db);

      expect(exists.rows[0]?.regclass, `table ${table} should exist`).toBe(table);
    }
  });

  it("refuses to run when an already-applied migration has been edited", async () => {
    await migrateToLatest(db);

    // Simulate an edited-but-applied migration by rewriting its recorded
    // checksum, which is exactly what the runner guards against.
    await sql`UPDATE _migrations SET checksum = 'tampered'`.execute(db);

    await expect(migrateToLatest(db)).rejects.toThrow(/already applied/i);
  });

  it("leaves the schema untouched when a migration fails", async () => {
    await migrateToLatest(db);
    const before = await appliedMigrations();

    // A syntactically broken migration must roll back, not half-apply.
    const broken = path.join(MIGRATIONS_DIR, "9999_broken.sql");
    await writeFile(broken, "CREATE TABLE oops (\n");

    try {
      await expect(migrateToLatest(db)).rejects.toThrow();
      expect(await appliedMigrations()).toEqual(before);
    } finally {
      await rm(broken, { force: true });
    }
  });
});
