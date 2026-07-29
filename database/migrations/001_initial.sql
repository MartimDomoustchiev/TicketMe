BEGIN;

CREATE TABLE IF NOT EXISTS event_inventory (
  event_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  PRIMARY KEY (event_id, ticket_type)
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  seat_label TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  storage_key TEXT NOT NULL DEFAULT '',
  storage_url TEXT NOT NULL DEFAULT '',
  qr_secret TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'checked_in'))
);

CREATE INDEX IF NOT EXISTS tickets_buyer_email_idx
  ON tickets (buyer_email);

CREATE TABLE IF NOT EXISTS purchase_queue (
  position BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS purchase_queue_lane_idx
  ON purchase_queue (event_id, ticket_type, position);

CREATE INDEX IF NOT EXISTS purchase_queue_lease_idx
  ON purchase_queue (lease_expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL
);

COMMIT;
