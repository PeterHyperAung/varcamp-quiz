import type { Kysely } from "kysely";

import type { Database } from "@/lib/db/types";

/**
 * Runs `work` inside a transaction, or directly when `db` is already one.
 *
 * Repository methods are written as if they own their transaction so they can be
 * called standalone, but the application layer composes several of them into one
 * atomic unit. Kysely rejects nested `transaction()` calls, so the two cases
 * are handled here rather than forcing callers to know which context they are in.
 */
export function runInTransaction<T>(
  db: Kysely<Database>,
  work: (trx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  if (db.isTransaction) {
    return work(db);
  }

  return db.transaction().execute((trx) => work(trx));
}