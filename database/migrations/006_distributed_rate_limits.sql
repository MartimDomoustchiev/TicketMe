BEGIN;

CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash TEXT PRIMARY KEY CHECK (LENGTH(key_hash) = 64),
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  resets_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS request_rate_limits_expiry_idx
  ON request_rate_limits (resets_at);

COMMIT;
