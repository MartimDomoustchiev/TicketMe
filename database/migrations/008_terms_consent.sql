BEGIN;

-- Existing accounts remain NULL because no historical acceptance timestamp
-- or terms version can be reconstructed safely. New signups persist both.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_terms_acceptance_check'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_terms_acceptance_check CHECK (
        NUM_NONNULLS(terms_accepted_version, terms_accepted_at) IN (0, 2)
        AND (
          terms_accepted_version IS NULL
          OR LENGTH(BTRIM(terms_accepted_version)) BETWEEN 1 AND 64
        )
      );
  END IF;
END
$$;

COMMIT;
