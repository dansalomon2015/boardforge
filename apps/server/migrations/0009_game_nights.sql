CREATE TABLE IF NOT EXISTS game_nights (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{6}$'),
  host_player_id uuid NOT NULL,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  state jsonb NOT NULL,
  current_room_code text REFERENCES room_sessions(code) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_night_games (
  id uuid PRIMARY KEY,
  game_night_id uuid NOT NULL REFERENCES game_nights(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  blueprint_id text NOT NULL REFERENCES blueprint_revisions(id),
  room_code text UNIQUE REFERENCES room_sessions(code) ON DELETE SET NULL,
  result_idempotency_key text NOT NULL,
  winner jsonb NOT NULL,
  awarded_team_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_night_id, ordinal),
  UNIQUE (game_night_id, result_idempotency_key)
);

CREATE TABLE IF NOT EXISTS game_night_score_events (
  game_night_id uuid NOT NULL REFERENCES game_nights(id) ON DELETE CASCADE,
  id text NOT NULL,
  game_instance_id uuid NOT NULL REFERENCES game_night_games(id) ON DELETE CASCADE,
  team_id text NOT NULL,
  points integer NOT NULL CHECK (points >= 0),
  reason text NOT NULL CHECK (reason IN ('win', 'tie')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_night_id, id)
);

CREATE INDEX IF NOT EXISTS game_nights_updated_at_idx ON game_nights(updated_at DESC);
CREATE INDEX IF NOT EXISTS game_night_games_night_idx ON game_night_games(game_night_id, ordinal);
CREATE INDEX IF NOT EXISTS game_night_score_events_game_idx ON game_night_score_events(game_instance_id);
