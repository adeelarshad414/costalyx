CREATE TABLE IF NOT EXISTS account_groups (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_group_members (
  account_group_id uuid NOT NULL REFERENCES account_groups(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_group_id, account_id)
);

CREATE TABLE IF NOT EXISTS cloud_credentials (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  account_id uuid NOT NULL,
  display_name text NOT NULL,
  vault_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

CREATE TABLE IF NOT EXISTS roles (
  name text PRIMARY KEY,
  fixed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (name, fixed)
VALUES ('viewer', true), ('analyst', true), ('admin', true)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id),
  role_name text NOT NULL REFERENCES roles(name),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_name)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  prev_hash text,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_group_members_account_id_idx
  ON account_group_members (account_id);

CREATE INDEX IF NOT EXISTS cloud_credentials_account_id_idx
  ON cloud_credentials (account_id);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON audit_log (created_at DESC);
