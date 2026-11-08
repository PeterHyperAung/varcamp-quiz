-- 0001_initial.sql
-- Core schema for the quiz platform and the independent event timetable.
--
-- Design notes:
--   * `*_public_id` columns are opaque bearer tokens for public URLs. They are
--     never sequential database ids.
--   * Quiz content lives in immutable `quiz_versions` rows. Editing always
--     targets the draft version, publishing freezes it, so historical attempts
--     keep pointing at the exact content they were scored against.

CREATE TABLE administrators (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  name          text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX administrators_email_key ON administrators (lower(email));

CREATE TABLE quizzes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id            text        NOT NULL,
  title                text        NOT NULL,
  description          text,
  publication_status   text        NOT NULL DEFAULT 'draft',
  editable_version_id  uuid,
  published_version_id uuid,
  created_by           uuid        NOT NULL REFERENCES administrators (id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quizzes_publication_status_check
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  CONSTRAINT quizzes_public_id_key UNIQUE (public_id)
);

CREATE INDEX quizzes_publication_status_idx ON quizzes (publication_status);

CREATE TABLE quiz_versions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id                    uuid        NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  version                    integer     NOT NULL,
  status                     text        NOT NULL DEFAULT 'draft',
  instructions               text,
  passing_score              integer,
  certificate_enabled        boolean     NOT NULL DEFAULT false,
  certificate_template_version text      NOT NULL DEFAULT 'v1',
  published_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_versions_status_check CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT quiz_versions_passing_score_check
    CHECK (passing_score IS NULL OR (passing_score >= 0 AND passing_score <= 100)),
  CONSTRAINT quiz_versions_quiz_id_version_key UNIQUE (quiz_id, version)
);

-- At most one editable draft per quiz at any time.
CREATE UNIQUE INDEX quiz_versions_single_draft_idx
  ON quiz_versions (quiz_id) WHERE status = 'draft';

-- At most one live published version per quiz at any time.
CREATE UNIQUE INDEX quiz_versions_single_published_idx
  ON quiz_versions (quiz_id) WHERE status = 'published';

ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_editable_version_fkey
  FOREIGN KEY (editable_version_id) REFERENCES quiz_versions (id) ON DELETE SET NULL,
  ADD CONSTRAINT quizzes_published_version_fkey
  FOREIGN KEY (published_version_id) REFERENCES quiz_versions (id) ON DELETE SET NULL;

CREATE TABLE questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_version_id uuid        NOT NULL REFERENCES quiz_versions (id) ON DELETE CASCADE,
  position        integer     NOT NULL,
  prompt          text        NOT NULL,
  question_type   text        NOT NULL,
  points          integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_type_check CHECK (question_type IN ('multiple_choice', 'true_false')),
  CONSTRAINT questions_points_check CHECK (points > 0),
  CONSTRAINT questions_version_position_key UNIQUE (quiz_version_id, position)
);

CREATE TABLE answer_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid        NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  position    integer     NOT NULL,
  label       text        NOT NULL,
  is_correct  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT answer_options_question_position_key UNIQUE (question_id, position)
);

-- Supports "load all options for a set of questions" without N+1 queries.
CREATE INDEX answer_options_question_id_idx ON answer_options (question_id);

CREATE TABLE quiz_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id       text        NOT NULL,
  quiz_id         uuid        NOT NULL REFERENCES quizzes (id) ON DELETE RESTRICT,
  quiz_version_id uuid        NOT NULL REFERENCES quiz_versions (id) ON DELETE RESTRICT,
  status          text        NOT NULL DEFAULT 'in_progress',
  participant_name text,
  score           integer,
  max_score       integer,
  percentage      numeric(5,2),
  passed          boolean,
  started_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_attempts_status_check CHECK (status IN ('in_progress', 'submitted')),
  -- Scoring is server-side: a submitted attempt must carry a complete result.
  CONSTRAINT quiz_attempts_submitted_result_check CHECK (
    status <> 'submitted'
    OR (score IS NOT NULL AND max_score IS NOT NULL AND percentage IS NOT NULL
        AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT quiz_attempts_public_id_key UNIQUE (public_id)
);

CREATE INDEX quiz_attempts_quiz_id_idx ON quiz_attempts (quiz_id, submitted_at DESC);
CREATE INDEX quiz_attempts_version_idx ON quiz_attempts (quiz_version_id);

CREATE TABLE attempt_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         uuid        NOT NULL REFERENCES quiz_attempts (id) ON DELETE CASCADE,
  question_id        uuid        NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
  selected_option_id uuid        REFERENCES answer_options (id) ON DELETE SET NULL,
  is_correct         boolean     NOT NULL DEFAULT false,
  points_awarded     integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attempt_answers_attempt_question_key UNIQUE (attempt_id, question_id)
);

CREATE TABLE certificates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id        text        NOT NULL,
  attempt_id       uuid        NOT NULL UNIQUE REFERENCES quiz_attempts (id) ON DELETE RESTRICT,
  quiz_id          uuid        NOT NULL REFERENCES quizzes (id) ON DELETE RESTRICT,
  quiz_version_id  uuid        NOT NULL REFERENCES quiz_versions (id) ON DELETE RESTRICT,
  participant_name text        NOT NULL,
  quiz_title       text        NOT NULL,
  score            integer     NOT NULL,
  max_score        integer     NOT NULL,
  percentage       numeric(5,2) NOT NULL,
  template_version text        NOT NULL,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificates_public_id_key UNIQUE (public_id)
);

CREATE INDEX certificates_quiz_id_idx ON certificates (quiz_id, issued_at DESC);

-- Login throttling is stored in the database rather than process memory so the
-- limit still holds when the app runs across many serverless instances.
CREATE TABLE login_throttles (
  key          text PRIMARY KEY,
  failures     integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id          text        NOT NULL,
  title              text        NOT NULL,
  description        text,
  location           text,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  timezone           text        NOT NULL,
  publication_status text        NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_publication_status_check
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  -- Schedule validity is enforced by the database, not only by the form.
  CONSTRAINT events_start_before_end_check CHECK (starts_at < ends_at),
  CONSTRAINT events_public_id_key UNIQUE (public_id)
);

-- The public timetable always filters by status then sorts by start time.
CREATE INDEX events_timetable_idx ON events (publication_status, starts_at, id);