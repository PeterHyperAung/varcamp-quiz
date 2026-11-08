import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { sql, type Kysely } from "kysely";

import type { Database } from "@/lib/db/types";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * A deliberately small migration runner.
 *
 * Applied files are recorded by checksum so an already-applied migration that
 * gets edited locally is reported instead of silently diverging from
 * production. Migrations are append-only: add a new file instead of rewriting
 * history.
 */
export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        text PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied = new Map<string, string>();
  const rows = await sql<{ name: string; checksum: string }>`
    SELECT name, checksum FROM _migrations
  `.execute(db);

  for (const row of rows.rows) {
    applied.set(row.name, row.checksum);
  }

  for (const file of files) {
    const source = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = await checksumOf(source);
    const previous = applied.get(file);

    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration "${file}" was already applied but its contents changed. ` +
            `Create a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }

    await db.transaction().execute(async (trx) => {
      await sql.raw(source).execute(trx);
      await sql`
        INSERT INTO _migrations (name, checksum) VALUES (${file}, ${checksum})
      `.execute(trx);
    });
  }
}

async function checksumOf(source: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(source).digest("hex");
}