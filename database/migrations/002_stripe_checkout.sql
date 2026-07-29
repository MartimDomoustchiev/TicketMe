BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS checkout_reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_checkout_reservation_idx
  ON tickets (checkout_reservation_id)
  WHERE checkout_reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_stripe_checkout_session_idx
  ON tickets (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_stripe_payment_intent_idx
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS checkout_reservations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'bg'
    CHECK (locale IN ('bg', 'en')),
  status TEXT NOT NULL
    CHECK (
      status IN (
        'reserved',
        'checkout_created',
        'fulfilled',
        'cancelled',
        'expired'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  ticket_id TEXT UNIQUE REFERENCES tickets(id) ON DELETE SET NULL,
  delivery_status TEXT
    CHECK (
      delivery_status IS NULL OR
      delivery_status IN ('pending', 'processing', 'completed')
    ),
  delivery_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (delivery_attempts >= 0),
  delivery_lease_token TEXT,
  delivery_lease_expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS checkout_reservations_expiry_idx
  ON checkout_reservations (expires_at)
  WHERE status IN ('reserved', 'checkout_created');

CREATE INDEX IF NOT EXISTS checkout_reservations_inventory_idx
  ON checkout_reservations (event_id, ticket_type, status);

COMMIT;
