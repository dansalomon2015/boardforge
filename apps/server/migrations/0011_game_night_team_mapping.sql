ALTER TABLE room_sessions
  ADD COLUMN IF NOT EXISTS game_night_team_by_game_team jsonb NOT NULL DEFAULT '{}'::jsonb;
