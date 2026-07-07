ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'succeeded';
