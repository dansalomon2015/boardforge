ALTER TABLE room_sessions
ADD COLUMN IF NOT EXISTS lobby_captain_by_team jsonb NOT NULL DEFAULT '{}'::jsonb;
