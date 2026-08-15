import { createHash } from "node:crypto";

export const CATALOG_EVENT_CATEGORIES = [
  "Concerts",
  "Festivals",
  "Theatre",
  "Sports",
  "Culture",
  "Nightlife",
  "Business",
  "Family",
] as const;

export const CATALOG_EVENT_STATUSES = [
  "pending",
  "published",
  "rejected",
  "cancelled",
  "expired",
  "hidden",
] as const;

export const CATALOG_EVENT_SALE_MODES = ["external", "internal"] as const;

export const EVENT_DISCOVERY_RUN_STATUSES = [
  "running",
  "completed",
  "failed",
] as const;

export const EVENT_DISCOVERY_TRIGGERS = [
  "cron",
  "admin",
  "manual",
  "test",
] as const;

export type CatalogEventCategory =
  (typeof CATALOG_EVENT_CATEGORIES)[number];
export type CatalogEventStatus = (typeof CATALOG_EVENT_STATUSES)[number];
export type CatalogEventSaleMode =
  (typeof CATALOG_EVENT_SALE_MODES)[number];
export type EventDiscoveryRunStatus =
  (typeof EVENT_DISCOVERY_RUN_STATUSES)[number];
export type EventDiscoveryTrigger =
  (typeof EVENT_DISCOVERY_TRIGGERS)[number];

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DiscoveredEventSourceInput = {
  provider: string;
  providerEventId?: string | null;
  sourceUrl: string;
  isOfficial?: boolean;
  extractedFacts?: Record<string, JsonValue>;
  grounding?: Record<string, JsonValue>;
  verifiedAt?: Date | string | null;
};

export type DiscoveredCatalogEventInput = {
  title: string;
  tagline?: string;
  description?: string;
  category: CatalogEventCategory;
  city: string;
  venue: string;
  address?: string;
  startsAt: Date | string;
  timezone?: string;
  priceFromMinor?: number | null;
  currency?: string;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  saleMode?: CatalogEventSaleMode;
  featured?: boolean;
  bangerScore?: number;
  sourceConfidence?: number;
  source: DiscoveredEventSourceInput;
};

export type PreparedDiscoveredCatalogEvent = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: CatalogEventCategory;
  city: string;
  venue: string;
  address: string;
  startsAt: string;
  timezone: string;
  priceFromMinor: number | null;
  currency: string;
  imageUrl: string | null;
  heroImageUrl: string | null;
  saleMode: CatalogEventSaleMode;
  featured: boolean;
  bangerScore: number;
  sourceConfidence: number;
  canonicalFingerprint: string;
  contentHash: string;
  source: {
    provider: string;
    providerEventId: string | null;
    sourceUrl: string;
    sourceUrlHash: string;
    isOfficial: boolean;
    extractedFacts: Record<string, JsonValue>;
    grounding: Record<string, JsonValue>;
    verifiedAt: string | null;
  };
};

export type CatalogEventSourceRecord = {
  id: string;
  eventId: string;
  provider: string;
  providerEventId: string | null;
  sourceUrl: string;
  sourceUrlHash: string;
  isOfficial: boolean;
  extractedFacts: Record<string, JsonValue>;
  grounding: Record<string, JsonValue>;
  discoveredByRunId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogEventRecord = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: CatalogEventCategory;
  city: string;
  venue: string;
  address: string;
  startsAt: string;
  timezone: string;
  priceFromMinor: number | null;
  currency: string;
  imageUrl: string | null;
  heroImageUrl: string | null;
  saleMode: CatalogEventSaleMode;
  status: CatalogEventStatus;
  featured: boolean;
  bangerScore: number;
  sourceConfidence: number;
  canonicalFingerprint: string;
  contentHash: string;
  discoveredByRunId: string | null;
  lastDiscoveredRunId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  publishedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  primarySource: Pick<
    CatalogEventSourceRecord,
    "provider" | "providerEventId" | "sourceUrl" | "isOfficial"
  > | null;
};

export type EventDiscoveryRunRecord = {
  id: string;
  status: EventDiscoveryRunStatus;
  model: string;
  promptVersion: string;
  triggerSource: EventDiscoveryTrigger;
  requestedBy: string | null;
  windowStart: string;
  windowEnd: string;
  candidatesFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  candidatesRejected: number;
  errorMessage: string | null;
  metadata: Record<string, JsonValue>;
  startedAt: string;
  completedAt: string | null;
};

const CATEGORY_SET = new Set<string>(CATALOG_EVENT_CATEGORIES);
const SALE_MODE_SET = new Set<string>(CATALOG_EVENT_SALE_MODES);
const TRACKING_PARAMETERS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "wbraid",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cleanText(
  value: string,
  field: string,
  maxLength: number,
  options: { multiline?: boolean; required?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }

  const withoutControls = value
    .normalize("NFKC")
    .replace(options.multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, " ");
  const normalized = options.multiline
    ? withoutControls
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .trim()
    : withoutControls.replace(/\s+/g, " ").trim();

  if (options.required !== false && !normalized) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`CATALOG_${field.toUpperCase()}_TOO_LONG`);
  }
  return normalized;
}

function normalizeDate(
  value: Date | string,
  field: string,
): string {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  return date.toISOString();
}

function normalizeOptionalHttpsUrl(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null || !value.trim()) {
    return null;
  }
  const url = canonicalizeCatalogSourceUrl(value);
  if (url.length > 2048) {
    throw new Error(`CATALOG_${field.toUpperCase()}_TOO_LONG`);
  }
  return url;
}

function normalizeInteger(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const normalized = value ?? fallback;
  if (
    !Number.isInteger(normalized) ||
    normalized < min ||
    normalized > max
  ) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function normalizeConfidence(value: number | undefined): number {
  const normalized = value ?? 0;
  if (
    !Number.isFinite(normalized) ||
    normalized < 0 ||
    normalized > 1
  ) {
    throw new Error("CATALOG_INVALID_SOURCE_CONFIDENCE");
  }
  return normalized;
}

function normalizeJsonObject(
  value: Record<string, JsonValue> | undefined,
  field: string,
): Record<string, JsonValue> {
  const normalized = value ?? {};
  const serialized = JSON.stringify(normalized);
  if (serialized === undefined || serialized.length > 100_000) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  const parsed = JSON.parse(serialized) as JsonValue;
  if (
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== "object"
  ) {
    throw new Error(`CATALOG_INVALID_${field.toUpperCase()}`);
  }
  return parsed as Record<string, JsonValue>;
}

export function normalizeCatalogIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("bg-BG")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildCatalogEventFingerprint(input: {
  title: string;
  startsAt: Date | string;
  city: string;
  venue: string;
}): string {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("CATALOG_INVALID_STARTS_AT");
  }
  startsAt.setUTCSeconds(0, 0);

  return sha256(
    JSON.stringify([
      normalizeCatalogIdentityPart(input.title),
      startsAt.toISOString(),
      normalizeCatalogIdentityPart(input.city),
      normalizeCatalogIdentityPart(input.venue),
    ]),
  );
}

export function canonicalizeCatalogSourceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("CATALOG_INVALID_SOURCE_URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname
  ) {
    throw new Error("CATALOG_INVALID_SOURCE_URL");
  }

  url.hash = "";
  const parameters = [...url.searchParams.entries()]
    .filter(([key]) => {
      const normalizedKey = key.toLocaleLowerCase("en-US");
      return (
        !normalizedKey.startsWith("utm_") &&
        !TRACKING_PARAMETERS.has(normalizedKey)
      );
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey, "en-US") ||
      leftValue.localeCompare(rightValue, "en-US"),
    );

  url.search = "";
  for (const [key, parameterValue] of parameters) {
    url.searchParams.append(key, parameterValue);
  }

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function canPreserveTicketSellerClaim(
  sourceSellsTickets: boolean | undefined,
  trustedSourceUrl: string,
  refreshedSourceUrl: string,
): boolean {
  if (sourceSellsTickets !== true) {
    return false;
  }

  try {
    return (
      canonicalizeCatalogSourceUrl(trustedSourceUrl) ===
      canonicalizeCatalogSourceUrl(refreshedSourceUrl)
    );
  } catch {
    return false;
  }
}

export function buildCatalogSourceUrlHash(value: string): string {
  return sha256(canonicalizeCatalogSourceUrl(value));
}

export function normalizeCatalogProvider(value: string): string {
  const provider = normalizeCatalogIdentityPart(value).replace(/\s+/g, "-");
  if (!provider || provider.length > 100) {
    throw new Error("CATALOG_INVALID_PROVIDER");
  }
  return provider;
}

export function buildCatalogEventId(fingerprint: string): string {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error("CATALOG_INVALID_FINGERPRINT");
  }
  return `evt_${fingerprint.slice(0, 24)}`;
}

export function buildCatalogEventSlug(input: {
  title: string;
  city: string;
  startsAt: Date | string;
  fingerprint: string;
}): string {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("CATALOG_INVALID_STARTS_AT");
  }
  const base = normalizeCatalogIdentityPart(
    `${input.title} ${input.city}`,
  )
    .replace(/\s+/g, "-")
    .slice(0, 145)
    .replace(/-+$/g, "");

  return `${base || "event"}-${startsAt.toISOString().slice(0, 10)}-${input.fingerprint.slice(0, 8)}`;
}

export function prepareDiscoveredCatalogEvent(
  input: DiscoveredCatalogEventInput,
): PreparedDiscoveredCatalogEvent {
  if (!CATEGORY_SET.has(input.category)) {
    throw new Error("CATALOG_INVALID_CATEGORY");
  }

  const title = cleanText(input.title, "title", 300);
  const city = cleanText(input.city, "city", 160);
  const venue = cleanText(input.venue, "venue", 300);
  const startsAt = normalizeDate(input.startsAt, "starts_at");
  const tagline = cleanText(
    input.tagline ?? `${input.category} · ${city}`,
    "tagline",
    500,
    { required: false },
  );
  const description = cleanText(
    input.description ?? "",
    "description",
    10_000,
    { multiline: true, required: false },
  );
  const address = cleanText(
    input.address ?? `${venue}, ${city}`,
    "address",
    500,
    { required: false },
  );
  const timezone = cleanText(
    input.timezone ?? "Europe/Sofia",
    "timezone",
    100,
  );

  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("CATALOG_INVALID_TIMEZONE");
  }

  const currency = cleanText(
    input.currency ?? "EUR",
    "currency",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("CATALOG_INVALID_CURRENCY");
  }

  const priceFromMinor =
    input.priceFromMinor === undefined || input.priceFromMinor === null
      ? null
      : normalizeInteger(
          input.priceFromMinor,
          "price_from_minor",
          0,
          2_147_483_647,
          0,
        );
  const saleMode = input.saleMode ?? "external";
  if (!SALE_MODE_SET.has(saleMode)) {
    throw new Error("CATALOG_INVALID_SALE_MODE");
  }

  const sourceUrl = canonicalizeCatalogSourceUrl(input.source.sourceUrl);
  const provider = normalizeCatalogProvider(input.source.provider);
  const providerEventId =
    input.source.providerEventId === undefined ||
    input.source.providerEventId === null
      ? null
      : cleanText(
          input.source.providerEventId,
          "provider_event_id",
          300,
        );
  const canonicalFingerprint = buildCatalogEventFingerprint({
    title,
    startsAt,
    city,
    venue,
  });
  const imageUrl = normalizeOptionalHttpsUrl(input.imageUrl, "image_url");
  const heroImageUrl = normalizeOptionalHttpsUrl(
    input.heroImageUrl,
    "hero_image_url",
  );
  const bangerScore = normalizeInteger(
    input.bangerScore,
    "banger_score",
    0,
    100,
    0,
  );
  const sourceConfidence = normalizeConfidence(input.sourceConfidence);
  const contentHash = sha256(
    JSON.stringify({
      title,
      tagline,
      description,
      category: input.category,
      city,
      venue,
      address,
      startsAt,
      timezone,
      priceFromMinor,
      currency,
      imageUrl,
      heroImageUrl,
      saleMode,
      featured: input.featured ?? false,
      bangerScore,
      sourceConfidence,
    }),
  );

  return {
    id: buildCatalogEventId(canonicalFingerprint),
    slug: buildCatalogEventSlug({
      title,
      city,
      startsAt,
      fingerprint: canonicalFingerprint,
    }),
    title,
    tagline,
    description,
    category: input.category,
    city,
    venue,
    address,
    startsAt,
    timezone,
    priceFromMinor,
    currency,
    imageUrl,
    heroImageUrl,
    saleMode,
    featured: input.featured ?? false,
    bangerScore,
    sourceConfidence,
    canonicalFingerprint,
    contentHash,
    source: {
      provider,
      providerEventId,
      sourceUrl,
      sourceUrlHash: sha256(sourceUrl),
      isOfficial: input.source.isOfficial ?? false,
      extractedFacts: normalizeJsonObject(
        input.source.extractedFacts,
        "extracted_facts",
      ),
      grounding: normalizeJsonObject(
        input.source.grounding,
        "grounding",
      ),
      verifiedAt: input.source.verifiedAt
        ? normalizeDate(input.source.verifiedAt, "verified_at")
        : null,
    },
  };
}
