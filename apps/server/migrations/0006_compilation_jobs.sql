CREATE TABLE IF NOT EXISTS compilation_jobs (
  id uuid PRIMARY KEY,
  prompt text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'queued', 'generating', 'validating', 'playtesting', 'reviewing',
    'release_ready', 'needs_review', 'failed'
  )),
  progress integer NOT NULL CHECK (progress BETWEEN 0 AND 100),
  message text NOT NULL,
  blueprint_id text REFERENCES blueprint_revisions(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS compilation_jobs_status_idx ON compilation_jobs(status);
CREATE INDEX IF NOT EXISTS compilation_jobs_created_at_idx ON compilation_jobs(created_at DESC);
