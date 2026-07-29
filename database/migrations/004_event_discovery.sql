BEGIN;

CREATE TABLE IF NOT EXISTS event_discovery_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'completed', 'failed')),
  model TEXT NOT NULL CHECK (BTRIM(model) <> ''),
  prompt_version TEXT NOT NULL CHECK (BTRIM(prompt_version) <> ''),
  trigger_source TEXT NOT NULL
    CHECK (trigger_source IN ('cron', 'admin', 'manual', 'test')),
  requested_by TEXT,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  candidates_found INTEGER NOT NULL DEFAULT 0
    CHECK (candidates_found >= 0),
  events_created INTEGER NOT NULL DEFAULT 0
    CHECK (events_created >= 0),
  events_updated INTEGER NOT NULL DEFAULT 0
    CHECK (events_updated >= 0),
  events_unchanged INTEGER NOT NULL DEFAULT 0
    CHECK (events_unchanged >= 0),
  candidates_rejected INTEGER NOT NULL DEFAULT 0
    CHECK (candidates_rejected >= 0),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (JSONB_TYPEOF(metadata) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (window_end > window_start),
  CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status IN ('completed', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_discovery_runs_started_idx
  ON event_discovery_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS event_discovery_runs_status_idx
  ON event_discovery_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS catalog_events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (
      BTRIM(slug) <> '' AND
      LENGTH(slug) <= 180 AND
      slug !~ '[/#?]'
    ),
  title TEXT NOT NULL
    CHECK (BTRIM(title) <> '' AND LENGTH(title) <= 300),
  tagline TEXT NOT NULL DEFAULT ''
    CHECK (LENGTH(tagline) <= 500),
  description TEXT NOT NULL DEFAULT ''
    CHECK (LENGTH(description) <= 10000),
  category TEXT NOT NULL
    CHECK (
      category IN (
        'Concerts',
        'Festivals',
        'Theatre',
        'Sports',
        'Culture',
        'Nightlife',
        'Business',
        'Family'
      )
    ),
  city TEXT NOT NULL
    CHECK (BTRIM(city) <> '' AND LENGTH(city) <= 160),
  venue TEXT NOT NULL
    CHECK (BTRIM(venue) <> '' AND LENGTH(venue) <= 300),
  address TEXT NOT NULL DEFAULT ''
    CHECK (LENGTH(address) <= 500),
  starts_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Sofia'
    CHECK (BTRIM(timezone) <> '' AND LENGTH(timezone) <= 100),
  price_from_minor INTEGER
    CHECK (price_from_minor IS NULL OR price_from_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR'
    CHECK (currency ~ '^[A-Z]{3}$'),
  image_url TEXT
    CHECK (
      image_url IS NULL OR
      (LENGTH(image_url) <= 2048 AND image_url ~ '^https://')
    ),
  hero_image_url TEXT
    CHECK (
      hero_image_url IS NULL OR
      (LENGTH(hero_image_url) <= 2048 AND hero_image_url ~ '^https://')
    ),
  sale_mode TEXT NOT NULL DEFAULT 'external'
    CHECK (sale_mode IN ('external', 'internal')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'published',
        'rejected',
        'cancelled',
        'expired',
        'hidden'
      )
    ),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  banger_score SMALLINT NOT NULL DEFAULT 0
    CHECK (banger_score BETWEEN 0 AND 100),
  source_confidence DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (source_confidence BETWEEN 0 AND 1),
  canonical_fingerprint CHAR(64) NOT NULL UNIQUE
    CHECK (canonical_fingerprint ~ '^[0-9a-f]{64}$'),
  content_hash CHAR(64) NOT NULL
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  discovered_by_run_id TEXT
    REFERENCES event_discovery_runs(id) ON DELETE SET NULL,
  last_discovered_run_id TEXT
    REFERENCES event_discovery_runs(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_note TEXT CHECK (review_note IS NULL OR LENGTH(review_note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (status <> 'published' OR published_at IS NOT NULL),
  CHECK (status <> 'rejected' OR reviewed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS catalog_events_public_date_idx
  ON catalog_events (starts_at, id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS catalog_events_category_date_idx
  ON catalog_events (category, starts_at, id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS catalog_events_city_date_idx
  ON catalog_events (city, starts_at, id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS catalog_events_featured_idx
  ON catalog_events (featured DESC, banger_score DESC, starts_at, id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS catalog_events_review_idx
  ON catalog_events (created_at, id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS catalog_event_sources (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL
    REFERENCES catalog_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL
    CHECK (
      BTRIM(provider) <> '' AND
      LENGTH(provider) <= 100 AND
      provider = LOWER(provider)
    ),
  provider_event_id TEXT
    CHECK (
      provider_event_id IS NULL OR
      (
        BTRIM(provider_event_id) <> '' AND
        LENGTH(provider_event_id) <= 300
      )
    ),
  source_url TEXT NOT NULL
    CHECK (LENGTH(source_url) <= 2048 AND source_url ~ '^https://'),
  source_url_hash CHAR(64) NOT NULL UNIQUE
    CHECK (source_url_hash ~ '^[0-9a-f]{64}$'),
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  extracted_facts JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (JSONB_TYPEOF(extracted_facts) = 'object'),
  grounding JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (JSONB_TYPEOF(grounding) = 'object'),
  discovered_by_run_id TEXT
    REFERENCES event_discovery_runs(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_event_sources_provider_id_idx
  ON catalog_event_sources (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_event_sources_event_idx
  ON catalog_event_sources (
    event_id,
    is_official DESC,
    verified_at DESC NULLS LAST,
    id
  );

CREATE INDEX IF NOT EXISTS catalog_event_sources_last_seen_idx
  ON catalog_event_sources (last_seen_at);

COMMIT;
