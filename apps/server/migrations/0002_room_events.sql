CREATE TABLE IF NOT EXISTS room_sessions (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z2-9]{6}$'),
  blueprint_id text NOT NULL REFERENCES blueprint_revisions(id),
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  reconnect_token_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  lobby_team_by_player jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed text,
  checkpoint jsonb,
  checkpoint_checksum text,
  checkpoint_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_events (
  id uuid PRIMARY KEY,
  room_code text NOT NULL REFERENCES room_sessions(code) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  actor_id uuid NOT NULL,
  actor_is_host boolean NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision > 0),
  resulting_revision integer NOT NULL CHECK (resulting_revision > expected_revision),
  idempotency_key text NOT NULL,
  action jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_code, sequence),
  UNIQUE (room_code, idempotency_key)
);

CREATE INDEX IF NOT EXISTS room_events_room_sequence_idx ON room_events(room_code, sequence);
CREATE INDEX IF NOT EXISTS room_sessions_updated_at_idx ON room_sessions(updated_at DESC);
