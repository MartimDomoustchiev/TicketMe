import "server-only";

import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  databaseSql,
  type SqlClient,
} from "@/lib/database";
import {
  EVENT_DISCOVERY_TRIGGERS,
  prepareDiscoveredCatalogEvent,
  type CatalogEventCategory,
  type CatalogEventRecord,
  type CatalogEventSourceRecord,
  type DiscoveredCatalogEventInput,
  type EventDiscoveryRunRecord,
  type EventDiscoveryTrigger,
  type JsonValue,
} from "@/lib/catalog-types";

type CatalogSqlClient = SqlClient | postgres.ReservedSql;
type CatalogQueryable = CatalogSqlClient | postgres.TransactionSql;

export type PublishedCatalogSort =
  | "date"
  | "banger"
  | "price-asc"
  | "price-desc";

export type PublishedCatalogQuery = {
  asOf?: Date | string;
  category?: CatalogEventCategory | "";
  city?: string;
  limit?: number;
  offset?: number;
  query?: string;
  sort?: PublishedCatalogSort;
};

export type CatalogEventPage = {
  events: CatalogEventRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type PendingCatalogQuery = {
  limit?: number;
  offset?: number;
};

export type CatalogReviewInput = {
  eventId: string;
  reviewedBy: string;
  note?: string;
  reviewedAt?: Date | string;
};

export type EventDiscoveryRunInput = {
  id?: string;
  model: string;
  promptVersion: string;
  triggerSource: EventDiscoveryTrigger;
  requestedBy?: string | null;
  windowStart: Date | string;
  windowEnd: Date | string;
  metadata?: Record<string, JsonValue>;
};

export type EventDiscoveryRunCounts = {
  candidatesFound?: number;
  eventsCreated?: number;
  eventsUpdated?: number;
  eventsUnchanged?: number;
  candidatesRejected?: number;
  metadata?: Record<string, JsonValue>;
};

export type UpsertDiscoveredEventOptions = {
  client?: CatalogSqlClient;
  observedAt?: Date | string;
  runId?: string | null;
};

export type UpsertDiscoveredEventResult = {
  action: "created" | "updated" | "unchanged";
  event: CatalogEventRecord;
  matchedBy: "new" | "fingerprint" | "source";
};

export type EventDiscoveryLockResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

type MatchedSourceRow = {
  id: string | number;
  event_id: string;
  provider: string;
  provider_event_id: string | null;
  source_url: string;
  source_url_hash: string;
};

const DISCOVERY_TRIGGER_SET = new Set<string>(EVENT_DISCOVERY_TRIGGERS);
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function jsonObject(value: unknown): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return {};
}

function mapCatalogEvent(
  row: Record<string, unknown>,
): CatalogEventRecord {
  const primarySourceProvider = nullableString(
    row.primary_source_provider,
  );

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    tagline: String(row.tagline),
    description: String(row.description),
    category: String(row.category) as CatalogEventRecord["category"],
    city: String(row.city),
    venue: String(row.venue),
    address: String(row.address),
    startsAt: iso(row.starts_at),
    timezone: String(row.timezone),
    priceFromMinor:
      row.price_from_minor === null || row.price_from_minor === undefined
        ? null
        : Number(row.price_from_minor),
    currency: String(row.currency),
    imageUrl: nullableString(row.image_url),
    heroImageUrl: nullableString(row.hero_image_url),
    saleMode: String(row.sale_mode) as CatalogEventRecord["saleMode"],
    status: String(row.status) as CatalogEventRecord["status"],
    featured: Boolean(row.featured),
    bangerScore: Number(row.banger_score),
    sourceConfidence: Number(row.source_confidence),
    canonicalFingerprint: String(row.canonical_fingerprint),
    contentHash: String(row.content_hash),
    discoveredByRunId: nullableString(row.discovered_by_run_id),
    lastDiscoveredRunId: nullableString(row.last_discovered_run_id),
    firstSeenAt: iso(row.first_seen_at),
    lastSeenAt: iso(row.last_seen_at),
    publishedAt: nullableIso(row.published_at),
    reviewedAt: nullableIso(row.reviewed_at),
    reviewedBy: nullableString(row.reviewed_by),
    reviewNote: nullableString(row.review_note),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    primarySource: primarySourceProvider
      ? {
          provider: primarySourceProvider,
          providerEventId: nullableString(
            row.primary_source_provider_event_id,
          ),
          sourceUrl: String(row.primary_source_url),
          isOfficial: Boolean(row.primary_source_is_official),
          extractedFacts: jsonObject(
            row.primary_source_extracted_facts,
          ),
        }
      : null,
  };
}

function mapCatalogEventSource(
  row: Record<string, unknown>,
): CatalogEventSourceRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    provider: String(row.provider),
    providerEventId: nullableString(row.provider_event_id),
    sourceUrl: String(row.source_url),
    sourceUrlHash: String(row.source_url_hash),
    isOfficial: Boolean(row.is_official),
    extractedFacts: jsonObject(row.extracted_facts),
    grounding: jsonObject(row.grounding),
    discoveredByRunId: nullableString(row.discovered_by_run_id),
    firstSeenAt: iso(row.first_seen_at),
    lastSeenAt: iso(row.last_seen_at),
    verifiedAt: nullableIso(row.verified_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapDiscoveryRun(
  row: Record<string, unknown>,
): EventDiscoveryRunRecord {
  return {
    id: String(row.id),
    status: String(row.status) as EventDiscoveryRunRecord["status"],
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    triggerSource: String(
      row.trigger_source,
    ) as EventDiscoveryRunRecord["triggerSource"],
    requestedBy: nullableString(row.requested_by),
    windowStart: iso(row.window_start),
    windowEnd: iso(row.window_end),
    candidatesFound: Number(row.candidates_found),
    eventsCreated: Number(row.events_created),
    eventsUpdated: Number(row.events_updated),
    eventsUnchanged: Number(row.events_unchanged),
    candidatesRejected: Number(row.candidates_rejected),
    errorMessage: nullableString(row.error_message),
    metadata: jsonObject(row.metadata),
    startedAt: iso(row.started_at),
    completedAt: nullableIso(row.completed_at),
  };
}

function normalizeDate(value: Date | string, field: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  return parsed.toISOString();
}

function cleanRequiredText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function cleanOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  return Number.isInteger(value)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, value))
    : DEFAULT_PAGE_SIZE;
}

function normalizeOffset(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) > 0
    ? Math.min(value ?? 0, 1_000_000)
    : 0;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function selectCatalogEventById(
  client: CatalogQueryable,
  eventId: string,
): Promise<CatalogEventRecord | null> {
  const rows = await client`
    SELECT
      event.*,
      source.provider AS primary_source_provider,
      source.provider_event_id AS primary_source_provider_event_id,
      source.source_url AS primary_source_url,
      source.is_official AS primary_source_is_official,
      source.extracted_facts AS primary_source_extracted_facts
    FROM catalog_events AS event
    LEFT JOIN LATERAL (
      SELECT
        provider,
        provider_event_id,
        source_url,
        is_official,
        extracted_facts
      FROM catalog_event_sources
      WHERE event_id = event.id
      ORDER BY
        is_official DESC,
        verified_at DESC NULLS LAST,
        first_seen_at ASC,
        id ASC
      LIMIT 1
    ) AS source ON TRUE
    WHERE event.id = ${eventId}
    LIMIT 1
  `;
  return rows[0]
    ? mapCatalogEvent(rows[0] as Record<string, unknown>)
    : null;
}

export async function listPublishedCatalogEvents(
  options: PublishedCatalogQuery = {},
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventPage> {
  const asOf = normalizeDate(options.asOf ?? new Date(), "as_of");
  const category = options.category ?? "";
  const city = cleanOptionalText(options.city, 160) ?? "";
  const query = cleanOptionalText(options.query, 100) ?? "";
  const pattern = `%${escapeLikePattern(query.toLocaleLowerCase("bg-BG"))}%`;
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const sort = options.sort ?? "date";

  const countRows = await client`
    SELECT COUNT(*)::INTEGER AS total
    FROM catalog_events AS event
    WHERE event.status = 'published'
      AND event.starts_at >= ${asOf}
      AND (${category} = '' OR event.category = ${category})
      AND (${city} = '' OR event.city = ${city})
      AND (
        ${query} = '' OR
        LOWER(
          CONCAT_WS(
            ' ',
            event.title,
            event.tagline,
            event.description,
            event.category,
            event.city,
            event.venue,
            event.address
          )
        ) LIKE ${pattern} ESCAPE '\'
      )
  `;

  const runQuery = async (order: PublishedCatalogSort) => {
    if (order === "banger") {
      return client`
        SELECT
          event.*,
          source.provider AS primary_source_provider,
          source.provider_event_id AS primary_source_provider_event_id,
          source.source_url AS primary_source_url,
          source.is_official AS primary_source_is_official,
          source.extracted_facts AS primary_source_extracted_facts
        FROM catalog_events AS event
        LEFT JOIN LATERAL (
          SELECT
            provider,
            provider_event_id,
            source_url,
            is_official,
            extracted_facts
          FROM catalog_event_sources
          WHERE event_id = event.id
          ORDER BY
            is_official DESC,
            verified_at DESC NULLS LAST,
            first_seen_at ASC,
            id ASC
          LIMIT 1
        ) AS source ON TRUE
        WHERE event.status = 'published'
          AND event.starts_at >= ${asOf}
          AND (${category} = '' OR event.category = ${category})
          AND (${city} = '' OR event.city = ${city})
          AND (
            ${query} = '' OR
            LOWER(
              CONCAT_WS(
                ' ',
                event.title,
                event.tagline,
                event.description,
                event.category,
                event.city,
                event.venue,
                event.address
              )
            ) LIKE ${pattern} ESCAPE '\'
          )
        ORDER BY
          event.featured DESC,
          event.banger_score DESC,
          event.starts_at ASC,
          event.id ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    }
    if (order === "price-asc") {
      return client`
        SELECT
          event.*,
          source.provider AS primary_source_provider,
          source.provider_event_id AS primary_source_provider_event_id,
          source.source_url AS primary_source_url,
          source.is_official AS primary_source_is_official,
          source.extracted_facts AS primary_source_extracted_facts
        FROM catalog_events AS event
        LEFT JOIN LATERAL (
          SELECT
            provider,
            provider_event_id,
            source_url,
            is_official,
            extracted_facts
          FROM catalog_event_sources
          WHERE event_id = event.id
          ORDER BY
            is_official DESC,
            verified_at DESC NULLS LAST,
            first_seen_at ASC,
            id ASC
          LIMIT 1
        ) AS source ON TRUE
        WHERE event.status = 'published'
          AND event.starts_at >= ${asOf}
          AND (${category} = '' OR event.category = ${category})
          AND (${city} = '' OR event.city = ${city})
          AND (
            ${query} = '' OR
            LOWER(
              CONCAT_WS(
                ' ',
                event.title,
                event.tagline,
                event.description,
                event.category,
                event.city,
                event.venue,
                event.address
              )
            ) LIKE ${pattern} ESCAPE '\'
          )
        ORDER BY
          event.price_from_minor ASC NULLS LAST,
          event.starts_at ASC,
          event.id ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    }
    if (order === "price-desc") {
      return client`
        SELECT
          event.*,
          source.provider AS primary_source_provider,
          source.provider_event_id AS primary_source_provider_event_id,
          source.source_url AS primary_source_url,
          source.is_official AS primary_source_is_official,
          source.extracted_facts AS primary_source_extracted_facts
        FROM catalog_events AS event
        LEFT JOIN LATERAL (
          SELECT
            provider,
            provider_event_id,
            source_url,
            is_official,
            extracted_facts
          FROM catalog_event_sources
          WHERE event_id = event.id
          ORDER BY
            is_official DESC,
            verified_at DESC NULLS LAST,
            first_seen_at ASC,
            id ASC
          LIMIT 1
        ) AS source ON TRUE
        WHERE event.status = 'published'
          AND event.starts_at >= ${asOf}
          AND (${category} = '' OR event.category = ${category})
          AND (${city} = '' OR event.city = ${city})
          AND (
            ${query} = '' OR
            LOWER(
              CONCAT_WS(
                ' ',
                event.title,
                event.tagline,
                event.description,
                event.category,
                event.city,
                event.venue,
                event.address
              )
            ) LIKE ${pattern} ESCAPE '\'
          )
        ORDER BY
          event.price_from_minor DESC NULLS LAST,
          event.starts_at ASC,
          event.id ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    }
    return client`
      SELECT
        event.*,
        source.provider AS primary_source_provider,
        source.provider_event_id AS primary_source_provider_event_id,
        source.source_url AS primary_source_url,
        source.is_official AS primary_source_is_official,
        source.extracted_facts AS primary_source_extracted_facts
      FROM catalog_events AS event
      LEFT JOIN LATERAL (
        SELECT
          provider,
          provider_event_id,
          source_url,
          is_official,
          extracted_facts
        FROM catalog_event_sources
        WHERE event_id = event.id
        ORDER BY
          is_official DESC,
          verified_at DESC NULLS LAST,
          first_seen_at ASC,
          id ASC
        LIMIT 1
      ) AS source ON TRUE
      WHERE event.status = 'published'
        AND event.starts_at >= ${asOf}
        AND (${category} = '' OR event.category = ${category})
        AND (${city} = '' OR event.city = ${city})
        AND (
          ${query} = '' OR
          LOWER(
            CONCAT_WS(
              ' ',
              event.title,
              event.tagline,
              event.description,
              event.category,
              event.city,
              event.venue,
              event.address
            )
          ) LIKE ${pattern} ESCAPE '\'
        )
      ORDER BY event.starts_at ASC, event.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  };

  const rows = await runQuery(sort);
  return {
    events: rows.map((row) =>
      mapCatalogEvent(row as Record<string, unknown>),
    ),
    total: Number(countRows[0]?.total ?? 0),
    limit,
    offset,
  };
}

export async function getPublishedCatalogEventById(
  eventId: string,
  options: { asOf?: Date | string } = {},
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventRecord | null> {
  const normalizedId = cleanRequiredText(eventId, "event_id", 200);
  const asOf = normalizeDate(options.asOf ?? new Date(), "as_of");
  const rows = await client`
    SELECT
      event.*,
      source.provider AS primary_source_provider,
      source.provider_event_id AS primary_source_provider_event_id,
      source.source_url AS primary_source_url,
      source.is_official AS primary_source_is_official,
      source.extracted_facts AS primary_source_extracted_facts
    FROM catalog_events AS event
    LEFT JOIN LATERAL (
      SELECT
        provider,
        provider_event_id,
        source_url,
        is_official,
        extracted_facts
      FROM catalog_event_sources
      WHERE event_id = event.id
      ORDER BY
        is_official DESC,
        verified_at DESC NULLS LAST,
        first_seen_at ASC,
        id ASC
      LIMIT 1
    ) AS source ON TRUE
    WHERE event.id = ${normalizedId}
      AND event.status = 'published'
      AND event.starts_at >= ${asOf}
    LIMIT 1
  `;
  return rows[0]
    ? mapCatalogEvent(rows[0] as Record<string, unknown>)
    : null;
}

export async function getPublishedCatalogEventBySlug(
  slug: string,
  options: { asOf?: Date | string } = {},
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventRecord | null> {
  const normalizedSlug = cleanRequiredText(slug, "slug", 180);
  const asOf = normalizeDate(options.asOf ?? new Date(), "as_of");
  const rows = await client`
    SELECT
      event.*,
      source.provider AS primary_source_provider,
      source.provider_event_id AS primary_source_provider_event_id,
      source.source_url AS primary_source_url,
      source.is_official AS primary_source_is_official,
      source.extracted_facts AS primary_source_extracted_facts
    FROM catalog_events AS event
    LEFT JOIN LATERAL (
      SELECT
        provider,
        provider_event_id,
        source_url,
        is_official,
        extracted_facts
      FROM catalog_event_sources
      WHERE event_id = event.id
      ORDER BY
        is_official DESC,
        verified_at DESC NULLS LAST,
        first_seen_at ASC,
        id ASC
      LIMIT 1
    ) AS source ON TRUE
    WHERE event.slug = ${normalizedSlug}
      AND event.status = 'published'
      AND event.starts_at >= ${asOf}
    LIMIT 1
  `;
  return rows[0]
    ? mapCatalogEvent(rows[0] as Record<string, unknown>)
    : null;
}

export async function listPendingCatalogEvents(
  options: PendingCatalogQuery = {},
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventPage> {
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const [countRows, rows] = await Promise.all([
    client`
      SELECT COUNT(*)::INTEGER AS total
      FROM catalog_events
      WHERE status = 'pending'
    `,
    client`
      SELECT
        event.*,
        source.provider AS primary_source_provider,
        source.provider_event_id AS primary_source_provider_event_id,
        source.source_url AS primary_source_url,
        source.is_official AS primary_source_is_official,
        source.extracted_facts AS primary_source_extracted_facts
      FROM catalog_events AS event
      LEFT JOIN LATERAL (
        SELECT
          provider,
          provider_event_id,
          source_url,
          is_official,
          extracted_facts
        FROM catalog_event_sources
        WHERE event_id = event.id
        ORDER BY
          is_official DESC,
          verified_at DESC NULLS LAST,
          first_seen_at ASC,
          id ASC
        LIMIT 1
      ) AS source ON TRUE
      WHERE event.status = 'pending'
      ORDER BY event.created_at ASC, event.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
  ]);
  return {
    events: rows.map((row) =>
      mapCatalogEvent(row as Record<string, unknown>),
    ),
    total: Number(countRows[0]?.total ?? 0),
    limit,
    offset,
  };
}

export async function publishCatalogEvent(
  input: CatalogReviewInput,
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventRecord | null> {
  const eventId = cleanRequiredText(input.eventId, "event_id", 200);
  const reviewedBy = cleanRequiredText(
    input.reviewedBy,
    "reviewed_by",
    320,
  );
  const reviewedAt = normalizeDate(
    input.reviewedAt ?? new Date(),
    "reviewed_at",
  );
  const note = cleanOptionalText(input.note, 2_000);
  const rows = await client`
    UPDATE catalog_events AS event
    SET status = 'published',
        published_at = COALESCE(event.published_at, ${reviewedAt}),
        reviewed_at = ${reviewedAt},
        reviewed_by = ${reviewedBy},
        review_note = ${note},
        updated_at = ${reviewedAt}
    WHERE event.id = ${eventId}
      AND event.status = 'pending'
      AND event.starts_at >= ${reviewedAt}
      AND EXISTS (
        SELECT 1
        FROM catalog_event_sources AS source
        WHERE source.event_id = event.id
      )
    RETURNING event.id
  `;
  return rows[0]
    ? selectCatalogEventById(client, String(rows[0].id))
    : null;
}

export async function rejectCatalogEvent(
  input: CatalogReviewInput & { reason: string },
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventRecord | null> {
  const eventId = cleanRequiredText(input.eventId, "event_id", 200);
  const reviewedBy = cleanRequiredText(
    input.reviewedBy,
    "reviewed_by",
    320,
  );
  const reviewedAt = normalizeDate(
    input.reviewedAt ?? new Date(),
    "reviewed_at",
  );
  const reason = cleanRequiredText(input.reason, "review_reason", 2_000);
  const rows = await client`
    UPDATE catalog_events
    SET status = 'rejected',
        reviewed_at = ${reviewedAt},
        reviewed_by = ${reviewedBy},
        review_note = ${reason},
        updated_at = ${reviewedAt}
    WHERE id = ${eventId}
      AND status = 'pending'
    RETURNING id
  `;
  return rows[0]
    ? selectCatalogEventById(client, String(rows[0].id))
    : null;
}

export async function listCatalogEventSources(
  eventId: string,
  client: CatalogQueryable = databaseSql(),
): Promise<CatalogEventSourceRecord[]> {
  const normalizedId = cleanRequiredText(eventId, "event_id", 200);
  const rows = await client`
    SELECT *
    FROM catalog_event_sources
    WHERE event_id = ${normalizedId}
    ORDER BY
      is_official DESC,
      verified_at DESC NULLS LAST,
      first_seen_at ASC,
      id ASC
  `;
  return rows.map((row) =>
    mapCatalogEventSource(row as Record<string, unknown>),
  );
}

async function matchedSourceRows(
  client: postgres.TransactionSql,
  input: ReturnType<typeof prepareDiscoveredCatalogEvent>,
): Promise<MatchedSourceRow[]> {
  const rows = input.source.providerEventId
    ? await client`
        SELECT
          id,
          event_id,
          provider,
          provider_event_id,
          source_url,
          source_url_hash
        FROM catalog_event_sources
        WHERE source_url_hash = ${input.source.sourceUrlHash}
           OR (
             provider = ${input.source.provider}
             AND provider_event_id = ${input.source.providerEventId}
           )
        ORDER BY id
        FOR UPDATE
      `
    : await client`
        SELECT
          id,
          event_id,
          provider,
          provider_event_id,
          source_url,
          source_url_hash
        FROM catalog_event_sources
        WHERE source_url_hash = ${input.source.sourceUrlHash}
        ORDER BY id
        FOR UPDATE
      `;
  return rows as unknown as MatchedSourceRow[];
}

async function lockDedupeKeys(
  client: postgres.TransactionSql,
  input: ReturnType<typeof prepareDiscoveredCatalogEvent>,
): Promise<void> {
  const keys = [
    `fingerprint:${input.canonicalFingerprint}`,
    `url:${input.source.sourceUrlHash}`,
    ...(input.source.providerEventId
      ? [
          `provider:${input.source.provider}:${input.source.providerEventId}`,
        ]
      : []),
  ].sort();

  for (const key of keys) {
    await client`
      SELECT pg_advisory_xact_lock(
        hashtext('ticketforge-catalog-dedupe'),
        hashtext(${key})
      )
    `;
  }
}

async function upsertEventSource(
  client: postgres.TransactionSql,
  eventId: string,
  matchedSources: MatchedSourceRow[],
  input: ReturnType<typeof prepareDiscoveredCatalogEvent>,
  runId: string | null,
  observedAt: string,
): Promise<void> {
  if (matchedSources.length === 0) {
    await client`
      INSERT INTO catalog_event_sources (
        event_id,
        provider,
        provider_event_id,
        source_url,
        source_url_hash,
        is_official,
        extracted_facts,
        grounding,
        discovered_by_run_id,
        first_seen_at,
        last_seen_at,
        verified_at,
        created_at,
        updated_at
      )
      VALUES (
        ${eventId},
        ${input.source.provider},
        ${input.source.providerEventId},
        ${input.source.sourceUrl},
        ${input.source.sourceUrlHash},
        ${input.source.isOfficial},
        ${client.json(input.source.extractedFacts)},
        ${client.json(input.source.grounding)},
        ${runId},
        ${observedAt},
        ${observedAt},
        ${input.source.verifiedAt},
        ${observedAt},
        ${observedAt}
      )
    `;
    return;
  }

  const exactUrl = matchedSources.find(
    (source) => source.source_url_hash === input.source.sourceUrlHash,
  );
  const exactProvider = input.source.providerEventId
    ? matchedSources.find(
        (source) =>
          source.provider === input.source.provider &&
          source.provider_event_id === input.source.providerEventId,
      )
    : undefined;
  const selected = exactUrl ?? exactProvider ?? matchedSources[0];

  await client`
    UPDATE catalog_event_sources
    SET last_seen_at = GREATEST(last_seen_at, ${observedAt}),
        discovered_by_run_id =
          COALESCE(${runId}, discovered_by_run_id),
        updated_at = ${observedAt}
    WHERE id IN ${client(matchedSources.map((source) => source.id))}
  `;

  const sourceUrlOwnedByAnotherRow = matchedSources.some(
    (source) =>
      String(source.id) !== String(selected.id) &&
      source.source_url_hash === input.source.sourceUrlHash,
  );
  const providerIdentityOwnedByAnotherRow =
    input.source.providerEventId !== null &&
    matchedSources.some(
      (source) =>
        String(source.id) !== String(selected.id) &&
        source.provider === input.source.provider &&
        source.provider_event_id === input.source.providerEventId,
    );

  await client`
    UPDATE catalog_event_sources
    SET provider = ${
      providerIdentityOwnedByAnotherRow
        ? selected.provider
        : input.source.provider
    },
        provider_event_id = ${
          providerIdentityOwnedByAnotherRow
            ? selected.provider_event_id
            : input.source.providerEventId
        },
        source_url = ${
          sourceUrlOwnedByAnotherRow
            ? selected.source_url
            : input.source.sourceUrl
        },
        source_url_hash = ${
          sourceUrlOwnedByAnotherRow
            ? selected.source_url_hash
            : input.source.sourceUrlHash
        },
        is_official = is_official OR ${input.source.isOfficial},
        extracted_facts = ${client.json(input.source.extractedFacts)},
        grounding = ${client.json(input.source.grounding)},
        discovered_by_run_id =
          COALESCE(${runId}, discovered_by_run_id),
        last_seen_at = GREATEST(last_seen_at, ${observedAt}),
        verified_at = COALESCE(${input.source.verifiedAt}, verified_at),
        updated_at = ${observedAt}
    WHERE id = ${selected.id}
  `;
}

export async function upsertDiscoveredEvent(
  candidate: DiscoveredCatalogEventInput,
  options: UpsertDiscoveredEventOptions = {},
): Promise<UpsertDiscoveredEventResult> {
  const input = prepareDiscoveredCatalogEvent(candidate);
  const client = options.client ?? databaseSql();
  const observedAt = normalizeDate(
    options.observedAt ?? new Date(),
    "observed_at",
  );
  const runId = cleanOptionalText(options.runId, 200);

  return client.begin(async (transaction) => {
    await lockDedupeKeys(transaction, input);

    const sources = await matchedSourceRows(transaction, input);
    const fingerprintRows = await transaction`
      SELECT id
      FROM catalog_events
      WHERE canonical_fingerprint = ${input.canonicalFingerprint}
      FOR UPDATE
    `;
    const sourceEventIds = new Set(
      sources.map((source) => String(source.event_id)),
    );
    const matchedEventIds = new Set([
      ...sourceEventIds,
      ...fingerprintRows.map((row) => String(row.id)),
    ]);

    if (matchedEventIds.size > 1) {
      throw new Error("CATALOG_DEDUPE_CONFLICT");
    }

    const existingId = [...matchedEventIds][0] ?? null;
    let eventId = input.id;
    let action: UpsertDiscoveredEventResult["action"];
    let matchedBy: UpsertDiscoveredEventResult["matchedBy"];

    if (!existingId) {
      await transaction`
        INSERT INTO catalog_events (
          id,
          slug,
          title,
          tagline,
          description,
          category,
          city,
          venue,
          address,
          starts_at,
          timezone,
          price_from_minor,
          currency,
          image_url,
          hero_image_url,
          sale_mode,
          status,
          featured,
          banger_score,
          source_confidence,
          canonical_fingerprint,
          content_hash,
          discovered_by_run_id,
          last_discovered_run_id,
          first_seen_at,
          last_seen_at,
          created_at,
          updated_at
        )
        VALUES (
          ${eventId},
          ${input.slug},
          ${input.title},
          ${input.tagline},
          ${input.description},
          ${input.category},
          ${input.city},
          ${input.venue},
          ${input.address},
          ${input.startsAt},
          ${input.timezone},
          ${input.priceFromMinor},
          ${input.currency},
          ${input.imageUrl},
          ${input.heroImageUrl},
          ${input.saleMode},
          'pending',
          ${input.featured},
          ${input.bangerScore},
          ${input.sourceConfidence},
          ${input.canonicalFingerprint},
          ${input.contentHash},
          ${runId},
          ${runId},
          ${observedAt},
          ${observedAt},
          ${observedAt},
          ${observedAt}
        )
      `;
      action = "created";
      matchedBy = "new";
    } else {
      eventId = existingId;
      const existingRows = await transaction`
        SELECT sale_mode, content_hash
        FROM catalog_events
        WHERE id = ${eventId}
        FOR UPDATE
      `;
      const existing = existingRows[0];
      if (!existing) {
        throw new Error("CATALOG_EVENT_NOT_FOUND");
      }

      const managedInternally = existing.sale_mode === "internal";
      const contentChanged =
        !managedInternally &&
        String(existing.content_hash) !== input.contentHash;
      action = contentChanged ? "updated" : "unchanged";
      matchedBy =
        sourceEventIds.size > 0 ? "source" : "fingerprint";

      if (managedInternally) {
        await transaction`
          UPDATE catalog_events
          SET last_seen_at = GREATEST(last_seen_at, ${observedAt}),
              last_discovered_run_id =
                COALESCE(${runId}, last_discovered_run_id),
              updated_at = ${observedAt}
          WHERE id = ${eventId}
        `;
      } else {
        await transaction`
          UPDATE catalog_events
          SET title = ${input.title},
              tagline = ${input.tagline},
              description = ${input.description},
              category = ${input.category},
              city = ${input.city},
              venue = ${input.venue},
              address = ${input.address},
              starts_at = ${input.startsAt},
              timezone = ${input.timezone},
              price_from_minor = ${input.priceFromMinor},
              currency = ${input.currency},
              image_url = ${input.imageUrl},
              hero_image_url = ${input.heroImageUrl},
              banger_score = ${input.bangerScore},
              source_confidence = ${input.sourceConfidence},
              canonical_fingerprint = ${input.canonicalFingerprint},
              content_hash = ${input.contentHash},
              last_discovered_run_id =
                COALESCE(${runId}, last_discovered_run_id),
              last_seen_at = GREATEST(last_seen_at, ${observedAt}),
              updated_at = ${observedAt}
          WHERE id = ${eventId}
        `;
      }
    }

    await upsertEventSource(
      transaction,
      eventId,
      sources,
      input,
      runId,
      observedAt,
    );
    const event = await selectCatalogEventById(transaction, eventId);
    if (!event) {
      throw new Error("CATALOG_EVENT_PERSISTENCE_FAILED");
    }
    return { action, event, matchedBy };
  });
}

function normalizeRunMetadata(
  value: Record<string, JsonValue> | undefined,
): Record<string, JsonValue> {
  const metadata = value ?? {};
  const serialized = JSON.stringify(metadata);
  if (serialized.length > 100_000) {
    throw new Error("CATALOG_DISCOVERY_METADATA_TOO_LARGE");
  }
  return JSON.parse(serialized) as Record<string, JsonValue>;
}

function normalizeRunCount(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) >= 0
    ? Math.min(value ?? 0, 2_147_483_647)
    : 0;
}

export async function startEventDiscoveryRun(
  input: EventDiscoveryRunInput,
  client: CatalogQueryable = databaseSql(),
): Promise<EventDiscoveryRunRecord> {
  if (!DISCOVERY_TRIGGER_SET.has(input.triggerSource)) {
    throw new Error("CATALOG_INVALID_DISCOVERY_TRIGGER");
  }
  const id = input.id
    ? cleanRequiredText(input.id, "run_id", 200)
    : `run_${randomUUID()}`;
  const model = cleanRequiredText(input.model, "model", 200);
  const promptVersion = cleanRequiredText(
    input.promptVersion,
    "prompt_version",
    100,
  );
  const requestedBy = cleanOptionalText(input.requestedBy, 320);
  const windowStart = normalizeDate(input.windowStart, "window_start");
  const windowEnd = normalizeDate(input.windowEnd, "window_end");
  if (new Date(windowEnd) <= new Date(windowStart)) {
    throw new Error("CATALOG_INVALID_DISCOVERY_WINDOW");
  }
  const metadata = normalizeRunMetadata(input.metadata);
  const rows = await client`
    INSERT INTO event_discovery_runs (
      id,
      status,
      model,
      prompt_version,
      trigger_source,
      requested_by,
      window_start,
      window_end,
      metadata
    )
    VALUES (
      ${id},
      'running',
      ${model},
      ${promptVersion},
      ${input.triggerSource},
      ${requestedBy},
      ${windowStart},
      ${windowEnd},
      ${client.json(metadata)}
    )
    RETURNING *
  `;
  if (!rows[0]) {
    throw new Error("CATALOG_DISCOVERY_RUN_NOT_CREATED");
  }
  return mapDiscoveryRun(rows[0] as Record<string, unknown>);
}

export async function completeEventDiscoveryRun(
  runId: string,
  counts: EventDiscoveryRunCounts = {},
  client: CatalogQueryable = databaseSql(),
): Promise<EventDiscoveryRunRecord | null> {
  const id = cleanRequiredText(runId, "run_id", 200);
  const metadata = normalizeRunMetadata(counts.metadata);
  const rows = await client`
    UPDATE event_discovery_runs
    SET status = 'completed',
        candidates_found = ${normalizeRunCount(counts.candidatesFound)},
        events_created = ${normalizeRunCount(counts.eventsCreated)},
        events_updated = ${normalizeRunCount(counts.eventsUpdated)},
        events_unchanged = ${normalizeRunCount(counts.eventsUnchanged)},
        candidates_rejected = ${normalizeRunCount(
          counts.candidatesRejected,
        )},
        metadata = event_discovery_runs.metadata || ${client.json(metadata)},
        error_message = NULL,
        completed_at = NOW()
    WHERE id = ${id}
      AND status = 'running'
    RETURNING *
  `;
  return rows[0]
    ? mapDiscoveryRun(rows[0] as Record<string, unknown>)
    : null;
}

export async function failEventDiscoveryRun(
  runId: string,
  error: unknown,
  counts: EventDiscoveryRunCounts = {},
  client: CatalogQueryable = databaseSql(),
): Promise<EventDiscoveryRunRecord | null> {
  const id = cleanRequiredText(runId, "run_id", 200);
  const metadata = normalizeRunMetadata(counts.metadata);
  const errorMessage = cleanOptionalText(
    error instanceof Error ? error.message : String(error),
    4_000,
  );
  const rows = await client`
    UPDATE event_discovery_runs
    SET status = 'failed',
        candidates_found = ${normalizeRunCount(counts.candidatesFound)},
        events_created = ${normalizeRunCount(counts.eventsCreated)},
        events_updated = ${normalizeRunCount(counts.eventsUpdated)},
        events_unchanged = ${normalizeRunCount(counts.eventsUnchanged)},
        candidates_rejected = ${normalizeRunCount(
          counts.candidatesRejected,
        )},
        metadata = event_discovery_runs.metadata || ${client.json(metadata)},
        error_message = ${errorMessage ?? "Discovery failed."},
        completed_at = NOW()
    WHERE id = ${id}
      AND status = 'running'
    RETURNING *
  `;
  return rows[0]
    ? mapDiscoveryRun(rows[0] as Record<string, unknown>)
    : null;
}

export async function getEventDiscoveryRun(
  runId: string,
  client: CatalogQueryable = databaseSql(),
): Promise<EventDiscoveryRunRecord | null> {
  const id = cleanRequiredText(runId, "run_id", 200);
  const rows = await client`
    SELECT *
    FROM event_discovery_runs
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0]
    ? mapDiscoveryRun(rows[0] as Record<string, unknown>)
    : null;
}

export async function listEventDiscoveryRuns(
  options: { limit?: number } = {},
  client: CatalogQueryable = databaseSql(),
): Promise<EventDiscoveryRunRecord[]> {
  const limit = normalizeLimit(options.limit);
  const rows = await client`
    SELECT *
    FROM event_discovery_runs
    ORDER BY started_at DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) =>
    mapDiscoveryRun(row as Record<string, unknown>),
  );
}

export async function withEventDiscoveryLock<T>(
  callback: (client: postgres.ReservedSql) => Promise<T>,
  client: SqlClient = databaseSql(),
): Promise<EventDiscoveryLockResult<T>> {
  const connection = await client.reserve();
  let acquired = false;

  try {
    const rows = await connection`
      SELECT pg_try_advisory_lock(
        hashtext('ticketforge'),
        hashtext('event-discovery')
      ) AS acquired
    `;
    acquired = Boolean(rows[0]?.acquired);
    if (!acquired) {
      return { acquired: false };
    }
    return {
      acquired: true,
      value: await callback(connection),
    };
  } finally {
    if (acquired) {
      await connection`
        SELECT pg_advisory_unlock(
          hashtext('ticketforge'),
          hashtext('event-discovery')
        )
      `;
    }
    connection.release();
  }
}
