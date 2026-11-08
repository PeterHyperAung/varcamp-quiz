/**
 * CLI entry point for applying pending migrations.
 *
 * Usage: `pnpm db:migrate`
 */
import { loadEnvConfig } from "@next/env";

import { getDb } from "@/lib/db/client";
import { resetServerEnvCache } from "@/lib/config/env";
import { migrateToLatest } from "@/lib/db/migrate";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  resetServerEnvCache();

  const db = getDb();
  await migrateToLatest(db);

  console.log("Migrations applied.");
  await db.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
