ALTER TABLE room_sessions
  ADD COLUMN IF NOT EXISTS story_book jsonb;
