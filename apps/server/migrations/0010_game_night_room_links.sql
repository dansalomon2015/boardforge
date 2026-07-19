ALTER TABLE game_nights
  ADD COLUMN IF NOT EXISTS reconnect_token_hashes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE room_sessions
  ADD COLUMN IF NOT EXISTS game_night_id uuid REFERENCES game_nights(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_instance_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS room_sessions_game_instance_idx
  ON room_sessions(game_instance_id)
  WHERE game_instance_id IS NOT NULL;
