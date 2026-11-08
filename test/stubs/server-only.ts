/**
 * Stub for the `server-only` package.
 *
 * The real module throws when it is imported outside a React Server Component
 * tree. Under Vitest there is no such tree, so the guard is replaced with a
 * no-op; the tests still exercise the same code paths.
 */
export {};