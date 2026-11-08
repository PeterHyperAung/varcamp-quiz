/**
 * Shared domain vocabulary.
 *
 * Kept separate from `lib/db/types.ts` so domain modules never have to import a
 * Kysely-flavoured module for a simple string union — the dependency direction
 * stays presentation → application → domain → (nothing).
 */

export const PUBLICATION_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const QUIZ_VERSION_STATUSES = ["draft", "published", "retired"] as const;
export type QuizVersionStatus = (typeof QUIZ_VERSION_STATUSES)[number];

export const QUESTION_TYPES = ["multiple_choice", "true_false"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ATTEMPT_STATUSES = ["in_progress", "submitted"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];