CREATE TABLE IF NOT EXISTS game_critiques (
  blueprint_id text PRIMARY KEY REFERENCES blueprint_revisions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  critique jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
