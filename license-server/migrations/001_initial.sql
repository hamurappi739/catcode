CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY,
  key_prefix varchar(16) NOT NULL,
  key_hmac char(64) NOT NULL UNIQUE,
  product_code varchar(48) NOT NULL DEFAULT 'catcode-desktop',
  buyer_email varchar(320),
  payment_reference varchar(160),
  notes varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  max_devices smallint NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 10),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS licenses_key_prefix_idx ON licenses (key_prefix);

CREATE TABLE IF NOT EXISTS license_devices (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  installation_id_hmac char(64) NOT NULL,
  refresh_token_hmac char(64) NOT NULL,
  device_name varchar(80) NOT NULL,
  app_version varchar(48) NOT NULL,
  first_activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  UNIQUE (license_id, installation_id_hmac)
);

CREATE INDEX IF NOT EXISTS license_devices_active_by_license_idx
  ON license_devices (license_id, last_seen_at DESC)
  WHERE deactivated_at IS NULL;

CREATE TABLE IF NOT EXISTS license_events (
  id uuid PRIMARY KEY,
  license_id uuid REFERENCES licenses(id) ON DELETE SET NULL,
  device_id uuid REFERENCES license_devices(id) ON DELETE SET NULL,
  event_type varchar(48) NOT NULL,
  ip_hmac char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS license_events_license_created_idx
  ON license_events (license_id, created_at DESC);
