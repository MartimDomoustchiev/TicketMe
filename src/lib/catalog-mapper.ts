import {
  formatEventDate,
  formatEventTime,
  formatPrice,
  getCategoryImage,
  type CatalogEvent,
  type CurrencyCode,
  type EventCategory,
} from "@/lib/event";
import type {
  CatalogEventRecord,
  JsonValue,
} from "@/lib/catalog-types";

const ENGLISH_TITLE_MAX_LENGTH = 300;
const ENGLISH_DESCRIPTION_MAX_LENGTH = 10_000;

function localizedSourceText(
  facts: Record<string, JsonValue>,
  key: "titleEn" | "descriptionEn",
  maxLength: number,
): string | undefined {
  const value = facts[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .normalize("NFC")
    .replace(/\p{C}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return normalized && normalized.length <= maxLength
    ? normalized
    : undefined;
}

/**
 * Maps a reviewed database discovery into the public catalogue shape. English
 * text is exposed only when the selected source actually stored a valid
 * enrichment fact; callers can therefore fall back without presenting a
 * generated summary as a translation.
 */
export function mapDiscoveredCatalogEvent(
  record: CatalogEventRecord,
): CatalogEvent {
  if (!record.primarySource) {
    throw new Error("Published discovered event is missing its source.");
  }

  const category = record.category as EventCategory;
  const hasSupportedPrice =
    record.currency === "EUR" && record.priceFromMinor !== null;
  const priceFrom = hasSupportedPrice
    ? (record.priceFromMinor ?? 0) / 100
    : 0;
  const currency = "EUR" as CurrencyCode;
  // Discovery artwork is source metadata, not automatically licensed for
  // republication. Render Tiketko-owned category art until an organizer
  // supplies an approved, durably stored asset with explicit usage rights.
  const image = getCategoryImage(category);
  const sourceName =
    record.primarySource.provider
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Event source";
  const titleEn = localizedSourceText(
    record.primarySource.extractedFacts ?? {},
    "titleEn",
    ENGLISH_TITLE_MAX_LENGTH,
  );
  const descriptionEn = localizedSourceText(
    record.primarySource.extractedFacts ?? {},
    "descriptionEn",
    ENGLISH_DESCRIPTION_MAX_LENGTH,
  );

  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    name: record.title,
    ...(titleEn ? { titleEn } : {}),
    tagline: record.tagline,
    description: record.description,
    ...(descriptionEn ? { descriptionEn } : {}),
    category,
    city: record.city,
    venue: record.venue,
    address: record.address,
    startsAt: record.startsAt,
    date: formatEventDate(record.startsAt),
    time: formatEventTime(record.startsAt),
    priceFrom,
    priceLabel:
      !hasSupportedPrice
        ? "Източник"
        : `от ${formatPrice(priceFrom, currency)}`,
    priceAvailable: hasSupportedPrice,
    currency,
    image,
    heroImage: image,
    ticketTypes: [],
    sourceName,
    sourceUrl: record.primarySource.sourceUrl,
    sourceSellsTickets: false,
    saleMode: record.saleMode,
    sourceOfficial: record.primarySource.isOfficial,
    aiEnhanced: record.lastDiscoveredRunId !== null,
    featured: record.featured,
    bangerScore: record.bangerScore,
  };
}
