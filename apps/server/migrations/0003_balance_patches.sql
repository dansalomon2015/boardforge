CREATE TABLE IF NOT EXISTS balance_patches (
  id uuid PRIMARY KEY,
  source_blueprint_id text NOT NULL REFERENCES blueprint_revisions(id) ON DELETE CASCADE,
  derived_blueprint_id text NOT NULL UNIQUE REFERENCES blueprint_revisions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  patch jsonb NOT NULL,
  before_report jsonb NOT NULL,
  after_report jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS balance_patches_source_idx ON balance_patches(source_blueprint_id);
CREATE INDEX IF NOT EXISTS balance_patches_status_idx ON balance_patches(status);
