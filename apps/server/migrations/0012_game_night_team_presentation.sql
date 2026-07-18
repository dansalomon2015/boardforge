ALTER TABLE room_sessions
  ADD COLUMN IF NOT EXISTS game_night_team_presentation_by_game_team jsonb NOT NULL DEFAULT '{}'::jsonb;
