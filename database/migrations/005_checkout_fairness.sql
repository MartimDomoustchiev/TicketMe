BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS
  checkout_reservations_active_buyer_event_idx
ON checkout_reservations (
  event_id,
  (LOWER(BTRIM(buyer_email)))
)
WHERE status IN ('reserved', 'checkout_created');

COMMIT;
