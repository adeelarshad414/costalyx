CREATE TABLE IF NOT EXISTS views (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  filter_json jsonb NOT NULL,
  owner_id uuid NOT NULL,
  shared_role_scope text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS views_shared_role_scope_idx
  ON views USING gin (shared_role_scope);

CREATE INDEX IF NOT EXISTS views_created_at_idx
  ON views (created_at, id);
