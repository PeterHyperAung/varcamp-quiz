import "server-only";

import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Validated lazily (not at import time) so that builds and public pages which
 * never touch the database do not fail when the database is not configured.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  DISPLAY_TIMEZONE: z
    .string()
    .min(1)
    .default("Asia/Yangon"),
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment configuration -> ${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test seam: drop the memoised value so a new environment can be applied. */
export function resetServerEnvCache(): void {
  cached = null;
}