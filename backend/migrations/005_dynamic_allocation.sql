CREATE TABLE IF NOT EXISTS dimensions (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dimension_tag_mappings (
  id uuid PRIMARY KEY,
  dimension_id uuid NOT NULL REFERENCES dimensions(id),
  tag_key text NOT NULL,
  tag_value_pattern text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_tags (
  resource_id text NOT NULL,
  tag_key text NOT NULL,
  tag_value text NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, tag_key)
);

CREATE TABLE IF NOT EXISTS allocation_idempotency (
  idempotency_key text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dimensions_org_name_idx
  ON dimensions (org_id, name);

CREATE INDEX IF NOT EXISTS dimension_tag_mappings_dimension_id_idx
  ON dimension_tag_mappings (dimension_id);

CREATE INDEX IF NOT EXISTS dimension_tag_mappings_tag_lookup_idx
  ON dimension_tag_mappings (tag_key, tag_value_pattern);

CREATE INDEX IF NOT EXISTS resource_tags_lookup_idx
  ON resource_tags (tag_key, tag_value);

CREATE INDEX IF NOT EXISTS allocation_idempotency_created_at_idx
  ON allocation_idempotency (created_at);
