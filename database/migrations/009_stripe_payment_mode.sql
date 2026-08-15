BEGIN;

-- Stripe's livemode flag belongs to the completed transaction, not to the
-- deployment that later renders it. Historical rows stay NULL because their
-- original mode cannot be reconstructed safely from current configuration.
ALTER TABLE checkout_reservations
  ADD COLUMN IF NOT EXISTS stripe_livemode BOOLEAN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS stripe_livemode BOOLEAN;

COMMIT;
