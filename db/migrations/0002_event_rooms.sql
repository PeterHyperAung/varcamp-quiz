-- Rooms are independent event locations. Events may optionally be assigned to
-- one room; public room schedules are derived from published events.

CREATE TABLE rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   text        NOT NULL,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_public_id_key UNIQUE (public_id),
  CONSTRAINT rooms_name_check CHECK (char_length(trim(name)) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX rooms_name_ci_key ON rooms (lower(trim(name)));

ALTER TABLE events
  ADD COLUMN room_id uuid REFERENCES rooms (id) ON DELETE SET NULL;

CREATE INDEX events_room_timetable_idx
  ON events (room_id, publication_status, starts_at, ends_at, id);
