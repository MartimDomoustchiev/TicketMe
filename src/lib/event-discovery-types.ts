import { createHash } from "node:crypto";
import {
  EVENT_CATEGORIES,
  type EventCategory,
} from "@/lib/event";
import { parseSafeDiscoveryUrl } from "@/lib/event-discovery-security";

export const MAX_DISCOVERY_CANDIDATES_PER_FEED = 500;

const MIN_EVENT_DATE_MS = Date.parse("2000-01-01T00:00:00.000Z");
const MAX_EVENT_DATE_MS = Date.parse("2100-01-01T00:00:00.000Z");

const FIELD_LIMITS = {
  address: 300,
  city: 120,
  description: 4_000,
  sourceId: 300,
  sourceName: 160,
  title: 200,
  venue: 200,
} as const;

const CANDIDATE_KEYS = new Set([
  "address",
  "city",
  "description",
  "endsAt",
  "feedUrl",
  "imageUrl",
  "sourceId",
  "sourceName",
  "sourceUrl",
  "startsAt",
  "title",
  "venue",
]);

export type DiscoveryEventCandidate = {
  title: string;
  startsAt: string;
  sourceUrl: string;
  feedUrl: string;
  address?: string;
  city?: string;
  description?: string;
  endsAt?: string;
  imageUrl?: string;
  sourceId?: string;
  sourceName?: string;
  venue?: string;
};

export type DiscoveryEnrichment = {
  appealScore: number;
  category: EventCategory;
  descriptionBg?: string;
  descriptionEn?: string;
  titleBg: string;
  titleEn: string;
};

export type EnrichedDiscoveryEvent = DiscoveryEventCandidate & {
  enrichedBy: "deterministic" | "gemini";
  enrichment: DiscoveryEnrichment;
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .normalize("NFC")
    .replace(/\p{C}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalized || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return normalizeText(value, maxLength);
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    timestamp < MIN_EVENT_DATE_MS ||
    timestamp >= MAX_EVENT_DATE_MS
  ) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeOptionalIsoDate(
  value: unknown,
): string | undefined | null {
  return value === undefined ? undefined : normalizeIsoDate(value);
}

function normalizeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) {
    return null;
  }

  try {
    return parseSafeDiscoveryUrl(value).href;
  } catch {
    return null;
  }
}

function normalizeOptionalHttpsUrl(
  value: unknown,
): string | undefined | null {
  return value === undefined ? undefined : normalizeHttpsUrl(value);
}

/**
 * Strict runtime boundary for all parser and model-adjacent event data.
 * Unknown keys and incorrectly typed optional fields are rejected.
 */
export function parseDiscoveryEventCandidate(
  value: unknown,
): DiscoveryEventCandidate | null {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !CANDIDATE_KEYS.has(key))
  ) {
    return null;
  }

  const title = normalizeText(value.title, FIELD_LIMITS.title);
  const startsAt = normalizeIsoDate(value.startsAt);
  const sourceUrl = normalizeHttpsUrl(value.sourceUrl);
  const feedUrl = normalizeHttpsUrl(value.feedUrl);
  const endsAt = normalizeOptionalIsoDate(value.endsAt);
  const imageUrl = normalizeOptionalHttpsUrl(value.imageUrl);
  const address = normalizeOptionalText(value.address, FIELD_LIMITS.address);
  const city = normalizeOptionalText(value.city, FIELD_LIMITS.city);
  const description = normalizeOptionalText(
    value.description,
    FIELD_LIMITS.description,
  );
  const sourceId = normalizeOptionalText(
    value.sourceId,
    FIELD_LIMITS.sourceId,
  );
  const sourceName = normalizeOptionalText(
    value.sourceName,
    FIELD_LIMITS.sourceName,
  );
  const venue = normalizeOptionalText(value.venue, FIELD_LIMITS.venue);

  if (
    !title ||
    !startsAt ||
    !sourceUrl ||
    !feedUrl ||
    endsAt === null ||
    imageUrl === null ||
    address === null ||
    city === null ||
    description === null ||
    sourceId === null ||
    sourceName === null ||
    venue === null ||
    (endsAt !== undefined &&
      Date.parse(endsAt) < Date.parse(startsAt))
  ) {
    return null;
  }

  return {
    title,
    startsAt,
    sourceUrl,
    feedUrl,
    ...(address === undefined ? {} : { address }),
    ...(city === undefined ? {} : { city }),
    ...(description === undefined ? {} : { description }),
    ...(endsAt === undefined ? {} : { endsAt }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(sourceName === undefined ? {} : { sourceName }),
    ...(venue === undefined ? {} : { venue }),
  };
}

function normalizeFingerprintText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("bg-BG")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function createDiscoveryFingerprint(
  candidate: DiscoveryEventCandidate,
): string {
  const canonical = [
    normalizeFingerprintText(candidate.title),
    candidate.startsAt.slice(0, 16),
    normalizeFingerprintText(candidate.venue),
    normalizeFingerprintText(candidate.city),
  ].join("\u001f");

  return createHash("sha256").update(canonical).digest("hex");
}

function candidateQuality(candidate: DiscoveryEventCandidate): number {
  const optionalFields = [
    candidate.address,
    candidate.city,
    candidate.description,
    candidate.endsAt,
    candidate.imageUrl,
    candidate.sourceId,
    candidate.sourceName,
    candidate.venue,
  ];

  return (
    optionalFields.filter(Boolean).length * 10 +
    Math.min(candidate.description?.length ?? 0, 1_000) / 1_000
  );
}

function candidateTieBreaker(candidate: DiscoveryEventCandidate): string {
  return [
    candidate.feedUrl,
    candidate.sourceUrl,
    candidate.sourceId ?? "",
    candidate.title,
  ].join("\u001f");
}

function compareCandidates(
  left: DiscoveryEventCandidate,
  right: DiscoveryEventCandidate,
): number {
  const qualityDifference = candidateQuality(right) - candidateQuality(left);
  if (qualityDifference !== 0) {
    return qualityDifference;
  }

  return candidateTieBreaker(left).localeCompare(
    candidateTieBreaker(right),
    "en",
  );
}

/**
 * Deduplicates independently of input order and returns a stable chronological
 * order. The richer candidate wins; equal candidates use a lexical tie-breaker.
 */
export function dedupeDiscoveryCandidates(
  candidates: readonly DiscoveryEventCandidate[],
): readonly DiscoveryEventCandidate[] {
  const grouped = new Map<string, DiscoveryEventCandidate[]>();

  for (const candidate of candidates) {
    const fingerprint = createDiscoveryFingerprint(candidate);
    const group = grouped.get(fingerprint) ?? [];
    group.push(candidate);
    grouped.set(fingerprint, group);
  }

  return [...grouped.values()]
    .map((group) => [...group].sort(compareCandidates)[0])
    .sort(
      (left, right) =>
        left.startsAt.localeCompare(right.startsAt) ||
        left.title.localeCompare(right.title, "bg-BG") ||
        left.sourceUrl.localeCompare(right.sourceUrl, "en"),
    );
}

export function isDiscoveryCategory(
  value: unknown,
): value is EventCategory {
  return (
    typeof value === "string" &&
    EVENT_CATEGORIES.includes(value as EventCategory)
  );
}
