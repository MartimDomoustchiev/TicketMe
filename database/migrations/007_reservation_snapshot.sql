BEGIN;

ALTER TABLE checkout_reservations
  ADD COLUMN IF NOT EXISTS purchase_offer_kind TEXT,
  ADD COLUMN IF NOT EXISTS purchase_unit_amount_minor INTEGER,
  ADD COLUMN IF NOT EXISTS purchase_currency TEXT,
  ADD COLUMN IF NOT EXISTS purchase_event_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_event_date TEXT,
  ADD COLUMN IF NOT EXISTS purchase_venue TEXT,
  ADD COLUMN IF NOT EXISTS purchase_ticket_label TEXT,
  ADD COLUMN IF NOT EXISTS purchase_source_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_source_url TEXT;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS purchase_offer_kind TEXT,
  ADD COLUMN IF NOT EXISTS purchase_unit_amount_minor INTEGER,
  ADD COLUMN IF NOT EXISTS purchase_currency TEXT,
  ADD COLUMN IF NOT EXISTS purchase_event_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_event_date TEXT,
  ADD COLUMN IF NOT EXISTS purchase_venue TEXT,
  ADD COLUMN IF NOT EXISTS purchase_ticket_label TEXT,
  ADD COLUMN IF NOT EXISTS purchase_source_name TEXT,
  ADD COLUMN IF NOT EXISTS purchase_source_url TEXT;

-- These two offers existed before purchase snapshots were introduced. Their
-- price and admission semantics are known from the deployed checkout contract,
-- while every unknown legacy offer deliberately remains NULL and fails closed.
UPDATE tickets
SET purchase_offer_kind =
      CASE event_id
        WHEN 'ticketme-live-next-wave-2027' THEN 'admission'
        WHEN 'deep-purple-live-sofia-2026' THEN 'test-simulation'
      END,
    purchase_unit_amount_minor =
      CASE
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'fan'
          THEN 6900
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'standard'
          THEN 3900
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'premium'
          THEN 10900
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'fan'
          THEN 4653
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'standard'
          THEN 6545
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'premium'
          THEN 9663
      END,
    purchase_currency = 'EUR',
    purchase_event_name = event_name,
    purchase_event_date = event_date,
    purchase_venue = venue,
    purchase_ticket_label =
      CASE
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'fan'
          THEN 'Fan zone'
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'standard'
          THEN 'Standard'
        WHEN event_id = 'ticketme-live-next-wave-2027' AND ticket_type = 'premium'
          THEN 'Premium'
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'fan'
          THEN 'Test fan zone'
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'standard'
          THEN 'Test standard seat'
        WHEN event_id = 'deep-purple-live-sofia-2026' AND ticket_type = 'premium'
          THEN 'Test premium'
      END,
    purchase_source_name =
      CASE event_id
        WHEN 'ticketme-live-next-wave-2027' THEN 'Tiketko'
        WHEN 'deep-purple-live-sofia-2026' THEN 'Eventim'
      END,
    purchase_source_url =
      CASE event_id
        WHEN 'ticketme-live-next-wave-2027'
          THEN 'https://www.tiketko.top/events/ticketme-live-next-wave-2027'
        WHEN 'deep-purple-live-sofia-2026'
          THEN 'https://www.eventim.bg/en/artist/deep-purple/'
      END
WHERE purchase_offer_kind IS NULL
  AND event_id IN (
    'ticketme-live-next-wave-2027',
    'deep-purple-live-sofia-2026'
  )
  AND ticket_type IN ('fan', 'standard', 'premium');

UPDATE checkout_reservations AS reservation
SET purchase_offer_kind = ticket.purchase_offer_kind,
    purchase_unit_amount_minor = ticket.purchase_unit_amount_minor,
    purchase_currency = ticket.purchase_currency,
    purchase_event_name = ticket.purchase_event_name,
    purchase_event_date = ticket.purchase_event_date,
    purchase_venue = ticket.purchase_venue,
    purchase_ticket_label = ticket.purchase_ticket_label,
    purchase_source_name = ticket.purchase_source_name,
    purchase_source_url = ticket.purchase_source_url
FROM tickets AS ticket
WHERE reservation.ticket_id = ticket.id
  AND reservation.purchase_offer_kind IS NULL
  AND ticket.purchase_offer_kind IS NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'checkout_reservations_purchase_snapshot_valid'
  ) THEN
    ALTER TABLE checkout_reservations
      ADD CONSTRAINT checkout_reservations_purchase_snapshot_valid
      CHECK (
        num_nonnulls(
          purchase_offer_kind,
          purchase_unit_amount_minor,
          purchase_currency,
          purchase_event_name,
          purchase_event_date,
          purchase_venue,
          purchase_ticket_label,
          purchase_source_name,
          purchase_source_url
        ) IN (0, 9)
        AND (
          purchase_offer_kind IS NULL OR
          purchase_offer_kind IN ('admission', 'test-simulation')
        )
        AND (
          purchase_unit_amount_minor IS NULL OR
          purchase_unit_amount_minor BETWEEN 0 AND 99999999
        )
        AND (
          purchase_currency IS NULL OR
          purchase_currency ~ '^[A-Z]{3}$'
        )
        AND (
          purchase_source_url IS NULL OR
          purchase_source_url ~ '^https://'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_purchase_snapshot_valid'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_purchase_snapshot_valid
      CHECK (
        num_nonnulls(
          purchase_offer_kind,
          purchase_unit_amount_minor,
          purchase_currency,
          purchase_event_name,
          purchase_event_date,
          purchase_venue,
          purchase_ticket_label,
          purchase_source_name,
          purchase_source_url
        ) IN (0, 9)
        AND (
          purchase_offer_kind IS NULL OR
          purchase_offer_kind IN ('admission', 'test-simulation')
        )
        AND (
          purchase_unit_amount_minor IS NULL OR
          purchase_unit_amount_minor BETWEEN 0 AND 99999999
        )
        AND (
          purchase_currency IS NULL OR
          purchase_currency ~ '^[A-Z]{3}$'
        )
        AND (
          purchase_source_url IS NULL OR
          purchase_source_url ~ '^https://'
        )
      );
  END IF;
END
$migration$;

COMMIT;
