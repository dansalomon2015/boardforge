CREATE TABLE IF NOT EXISTS blueprint_revisions (
  id text PRIMARY KEY,
  spec jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'validating', 'playtesting', 'release_ready', 'needs_review')),
  provider text NOT NULL,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playtest_reports (
  blueprint_id text PRIMARY KEY REFERENCES blueprint_revisions(id) ON DELETE CASCADE,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blueprint_revisions_status_idx ON blueprint_revisions(status);
CREATE INDEX IF NOT EXISTS blueprint_revisions_created_at_idx ON blueprint_revisions(created_at DESC);
