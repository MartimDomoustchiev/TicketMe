BEGIN;

ALTER TABLE checkout_reservations
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1
    CHECK (quantity BETWEEN 1 AND 10);

-- A paid reservation can now issue more than one ticket. Stripe identifiers
-- remain unique on checkout_reservations, while each ticket in that
-- reservation deliberately shares those identifiers.
DROP INDEX IF EXISTS tickets_checkout_reservation_idx;
DROP INDEX IF EXISTS tickets_stripe_checkout_session_idx;
DROP INDEX IF EXISTS tickets_stripe_payment_intent_idx;

CREATE INDEX tickets_checkout_reservation_idx
  ON tickets (checkout_reservation_id)
  WHERE checkout_reservation_id IS NOT NULL;

CREATE INDEX tickets_stripe_checkout_session_idx
  ON tickets (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX tickets_stripe_payment_intent_idx
  ON tickets (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
