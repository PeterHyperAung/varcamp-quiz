# VarCamp — quizzes and event timetable

A public quiz platform with an administrative panel, built as a modular monolith
in a single Next.js application.

Two **independent** business domains, with no relationship between them:

| Domain | Public surface | Admin surface |
| --- | --- | --- |
| **Quizzes** | `/quizzes` — take a published quiz, see the result, leaderboard and certificate. No account. | `/admin/quizzes` — author, publish and archive quizzes; review submissions |
| **Events** | `/events` — the timetable of upcoming, ongoing and ended events, with a shareable schedule for each room | `/admin/events` — create rooms, assign events, schedule and publish |

Only administrators authenticate. Public visitors never do.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL and SESSION_SECRET
pnpm db:migrate              # apply migrations
pnpm db:seed                 # create the first admin + sample content
pnpm dev
```

The seed prints the published quiz link. Only administrators ever sign in, at
`/admin/login`.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Signs the admin session cookie (32+ chars) |
| `DISPLAY_TIMEZONE` | Default timezone for seeded content and admin form defaults |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Used only by `pnpm db:seed` |

## Scripts

```bash
pnpm dev            # development server
pnpm build          # production build
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest (unit + integration)
pnpm test:coverage  # with coverage
pnpm db:migrate     # apply pending migrations
pnpm db:seed        # seed an admin, a published quiz and sample events
pnpm db:reset-admin-password # reset an existing admin password in a hidden prompt
pnpm check          # lint + typecheck + test
```

Run the password reset command from a trusted interactive terminal. It prompts
for the administrator email and new password (without echoing the password),
then stores only a bcrypt hash. It does not invalidate existing sessions, which
expire after eight hours.

## Architecture

```
app/                        Routes (thin adapters)
  (public)/                 Public site
  admin/                    Admin panel; (protected) group is session-gated
modules/                    One directory per domain
  <domain>/
    domain/                 Pure rules. No Next.js, Kysely, HTTP or UI.
    application/            Use cases. Coordinates domain logic + repositories.
    infrastructure/         Kysely repositories, hashing, session tokens.
    presentation/           Server Actions and client components.
components/ui, layout/      Design-system and chrome
lib/                        db client + types, validation, errors, ids, clock
db/migrations, db/seeds
test/                       Vitest suites
```

Dependencies point inwards: presentation → application → domain. Domain modules
never import Next.js, Kysely or UI.

### Quiz versioning

Published content is immutable. Each quiz has exactly one editable **draft**
version and at most one **published** version, enforced by partial unique
indexes:

- Editing a published quiz copies its content into a fresh draft.
- Publishing retires the previous version and freezes the new one.
- An attempt pins `quiz_version_id` at start, so results can never change when a
  quiz is later edited or republished.

`test/quiz-lifecycle.test.ts` asserts this against a real Postgres.

### Security notes

- **Server-side scoring.** The client submits *which* option was chosen; the
  server grades against the published version loaded from the database. Scores,
  correctness and correct-answer ids are rejected outright — the submission
  schema is strict.
- **Opaque public identifiers.** Quiz, attempt and certificate URLs use 16-char
  random ids, never sequential database keys.
- **Bearing links.** Certificate URLs are bearer credentials, so that response
  is `private, no-store` and carries no personal data in the URL.
- **Authorization.** Every admin action calls `requireAdminSession()` before
  doing anything; UI visibility is never treated as authorization.
- **Login throttling** is stored in Postgres, so it holds across serverless
  instances, and unknown accounts still perform a password comparison so timing
  does not reveal which emails exist.
- Correct answers are stripped from the public quiz payload and are only
  revealed on the result page after a recorded submission.
- Every participant chooses a public display name before starting. The live
  elapsed timer is informational; ranking uses server-recorded start and submit
  timestamps. The leaderboard ranks percentage score first, then faster time,
  and combines attempts across quiz versions. The quiz page, quiz directory and
  result page link into the leaderboard; public tables show up to 100 entries.

### Room timetables

Rooms belong to the events domain. Administrators create and rename rooms on
`/admin/events`, then assign each event to a room while scheduling it. The
public `/events` page links to a filtered, shareable timetable for each room;
only rooms with published events are listed. Existing events remain valid
without a room assignment, and room schedules remain independent of quizzes.

### Caching and rendering

`cacheComponents` is on. Every route renders a prerendered static shell with
request-time content streaming behind `<Suspense>`:

- `/`, `/events`, `/quizzes` — static chrome, live listings streamed.
- Result pages — request-time only; they carry participant data.
- `/admin/*` — session-gated at request time in the `(protected)` layout.

Schedule status is always derived from the current time rather than stored, so a
prerendered page can never show a stale status.

### Testing

`pnpm test` runs two layers with no network access:

- **Domain unit tests** — validation, scoring, eligibility, schedule status,
  ordering, all against a fixed clock.
- **Integration tests** — [PGlite](https://pglite.dev), an in-process Postgres
  that runs the *real* `.sql` migrations. Partial unique indexes, `CHECK`
  constraints, transactions and cascade rules are therefore genuinely exercised.

## Design

The visual language is taken from `theme.png` and expressed as tokens in
`app/globals.css` (`@theme`), then used by the shared components:

| Token | Value | Role |
| --- | --- | --- |
| `navy-950` | `#000137` | Page backdrop |
| `plum-900` | `#200762` | Gradient wash |
| `crimson-500` | `#e21a4a` | Logo, headline accent, chart bars |
| `sun-500` | `#ffc940` | Primary calls to action |
| `electric-500` | `#2d81ff` | Secondary accent |
| `magenta-500` | `#e33e99` | Accent, error text |
| `lavender-300` | `#b9bde8` | Supporting copy |

Status is always communicated with a label and a glyph as well as colour, and
`prefers-reduced-motion` is honoured.

## Deployment

Targets a single Vercel project with Neon PostgreSQL. Set `DATABASE_URL`,
`SESSION_SECRET` and `DISPLAY_TIMEZONE` as encrypted environment variables,
then run `pnpm db:migrate` against the production database.
# varcamp-quiz
# varcamp-quiz
# varcamp-quiz
# varcamp-quiz
