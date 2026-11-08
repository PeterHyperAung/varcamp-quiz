/**
 * Global test environment.
 *
 * The server env contract is validated lazily on first access, so a stub is
 * installed here rather than in every suite. Tests never open a network
 * connection: the integration suites run against in-process PGlite.
 */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.SESSION_SECRET ??= "test-secret-that-is-definitely-long-enough-32";
process.env.DISPLAY_TIMEZONE ??= "Asia/Yangon";