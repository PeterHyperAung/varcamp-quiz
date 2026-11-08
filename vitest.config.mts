import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-env.ts"],
    // PGlite boots a fresh Postgres per file, so files can run in parallel.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` path mapping in tsconfig.json.
      "@": path.resolve(import.meta.dirname),
      // `server-only` throws outside a React Server Component tree; tests run
      // as plain Node modules.
      "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
    },
  },
});