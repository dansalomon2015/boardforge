ALTER TABLE game_critiques
  ADD COLUMN IF NOT EXISTS suggested_patch jsonb;
