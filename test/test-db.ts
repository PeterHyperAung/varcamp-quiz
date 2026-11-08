import { PGlite } from "@electric-sql/pglite";
import { Kysely, PostgresDialect } from "kysely";

import { migrateToLatest } from "@/lib/db/migrate";
import type { Database } from "@/lib/db/types";

/**
 * In-process Postgres used by the integration test suite.
 *
 * It runs the exact same `.sql` migrations as Neon, so the tests exercise real
 * constraints, partial unique indexes, `timestamptz` behaviour and transaction
 * semantics without needing a network database.
 */

/**
 * Minimal pool adapter around PGlite.
 *
 * Kysely's Postgres dialect expects a `pg`-style pool whose `connect()` resolves
 * to a client returning `{ command, rowCount, rows }`. PGlite is a single
 * embedded instance, so the "pool" is that instance wrapped in the expected
 * shape.
 */
/**
 * Pool adapter around PGlite, exported so other suites can build their own
 * Kysely instance (for example to test the migration runner).
 */
export class PGlitePoolAdapter {
  constructor(private readonly client: PGlite) {}

  async connect(): Promise<PGliteClient> {
    return new PGliteClient(this.client);
  }

  async end(): Promise<void> {
    await this.client.close();
  }
}

class PGliteClient {
  constructor(private readonly client: PGlite) {}

  async query<TRow>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ command: string; rowCount: number; rows: TRow[] }> {
    // With no parameters, use the simple query protocol. That is what lets a
    // multi-statement migration file run at all — the extended protocol rejects
    // it. `pg` behaves the same way, which is why the migration runner works
    // unchanged against Neon.
    if (!parameters || parameters.length === 0) {
      const results = await this.client.exec(sql);

      return {
        command: leadingKeyword(sql),
        rowCount: results.reduce((total, result) => total + (result.affectedRows ?? 0), 0),
        rows: results.flatMap((result) => result.rows) as TRow[],
      };
    }

    const result = await this.client.query<TRow>(sql, parameters as unknown[]);

    return {
      command: leadingKeyword(sql),
      rowCount: result.affectedRows ?? 0,
      rows: result.rows,
    };
  }

  release(): void {
    // PGlite holds a single connection; nothing to hand back.
  }
}

function leadingKeyword(sql: string): string {
  return (/^\s*([a-z]+)/i.exec(sql)?.[1] ?? "").toUpperCase();
}

export async function createTestDb(): Promise<{
  db: Kysely<Database>;
  destroy: () => Promise<void>;
}> {
  const client = new PGlite();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new PGlitePoolAdapter(client) as never,
    }),
  });

  // Apply the real migrations through the same runner production uses.
  await migrateToLatest(db);

  return {
    db,
    destroy: async () => {
      await db.destroy();
    },
  };
}