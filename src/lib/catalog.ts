import "server-only";

import {
  CATALOG_EVENTS,
  formatEventDate,
  formatEventTime,
  formatPrice,
  getCategoryImage,
  getEventById,
  getEventBySlug,
  type CatalogEvent,
  type CurrencyCode,
  type EventCategory,
} from "@/lib/event";
import {
  getPublishedCatalogEventById,
  getPublishedCatalogEventBySlug,
  listPublishedCatalogEvents,
} from "@/lib/catalog-postgres";
import type { CatalogEventRecord } from "@/lib/catalog-types";
import { isDatabaseConfigured } from "@/lib/database";

/**
 * Async catalogue boundary. The static seed catalogue remains a dependable
 * local-development fallback; published PostgreSQL discoveries are composed
 * here when the database repository is available.
 */
export async function listCatalogEvents(): Promise<readonly CatalogEvent[]> {
  const staticEvents = upcomingStaticEvents();
  if (!isDatabaseConfigured()) {
    return staticEvents;
  }

  try {
    const discovered = await loadPublishedDiscoveries();
    return mergeCatalogues(
      staticEvents,
      discovered.map(mapDiscoveredEvent),
    );
  } catch (error) {
    reportCatalogFallback(error);
    return staticEvents;
  }
}

async function loadPublishedDiscoveries(): Promise<CatalogEventRecord[]> {
  const pageSize = 100;
  const firstPage = await listPublishedCatalogEvents({
    limit: pageSize,
    sort: "banger",
  });
  const total = Math.min(firstPage.total, 500);
  if (total <= firstPage.events.length) {
    return firstPage.events;
  }

  const offsets: number[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    offsets.push(offset);
  }
  const remainingPages = await Promise.all(
    offsets.map((offset) =>
      listPublishedCatalogEvents({
        limit: pageSize,
        offset,
        sort: "banger",
      }),
    ),
  );
  return [
    ...firstPage.events,
    ...remainingPages.flatMap((page) => page.events),
  ].slice(0, total);
}

export async function findCatalogEventById(
  id: string,
): Promise<CatalogEvent | undefined> {
  const staticEvent = getEventById(id);
  if (staticEvent || !isDatabaseConfigured()) {
    return staticEvent;
  }

  try {
    const discovered = await getPublishedCatalogEventById(id);
    return discovered ? mapDiscoveredEvent(discovered) : undefined;
  } catch (error) {
    reportCatalogFallback(error);
    return undefined;
  }
}

export async function findCatalogEventBySlug(
  slug: string,
): Promise<CatalogEvent | undefined> {
  const staticEvent = getEventBySlug(slug);
  if (staticEvent || !isDatabaseConfigured()) {
    return staticEvent;
  }

  try {
    const discovered = await getPublishedCatalogEventBySlug(slug);
    return discovered ? mapDiscoveredEvent(discovered) : undefined;
  } catch (error) {
    reportCatalogFallback(error);
    return undefined;
  }
}

export async function listRelatedCatalogEvents(
  event: CatalogEvent,
  limit = 4,
): Promise<readonly CatalogEvent[]> {
  return (await listCatalogEvents()).filter(
    (candidate) =>
      candidate.id !== event.id && candidate.category === event.category,
  ).slice(0, limit);
}

export function isInternallySoldEvent(event: CatalogEvent): boolean {
  return event.saleMode !== "external";
}

function upcomingStaticEvents(now = new Date()): readonly CatalogEvent[] {
  const threshold = now.getTime() - 2 * 60 * 60 * 1_000;
  return CATALOG_EVENTS.filter((event) => {
    const startsAt = Date.parse(event.startsAt);
    return Number.isFinite(startsAt) && startsAt >= threshold;
  });
}

function mapDiscoveredEvent(record: CatalogEventRecord): CatalogEvent {
  if (!record.primarySource) {
    throw new Error("Published discovered event is missing its source.");
  }

  const category = record.category as EventCategory;
  const priceFrom = (record.priceFromMinor ?? 0) / 100;
  const currency =
    record.currency === "EUR"
      ? (record.currency as CurrencyCode)
      : ("EUR" as CurrencyCode);
  const image =
    record.imageUrl?.startsWith("https://images.unsplash.com/")
      ? record.imageUrl
      : getCategoryImage(category, record.bangerScore);
  const sourceName =
    record.primarySource.provider
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "Event source";

  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    name: record.title,
    tagline: record.tagline,
    description: record.description,
    category,
    city: record.city,
    venue: record.venue,
    address: record.address,
    startsAt: record.startsAt,
    date: formatEventDate(record.startsAt),
    time: formatEventTime(record.startsAt),
    priceFrom,
    priceLabel:
      record.priceFromMinor === null
        ? "Източник"
        : `от ${formatPrice(priceFrom, currency)}`,
    currency,
    image,
    heroImage:
      record.heroImageUrl?.startsWith("https://images.unsplash.com/")
        ? record.heroImageUrl
        : image,
    ticketTypes: [],
    sourceName,
    sourceUrl: record.primarySource.sourceUrl,
    saleMode: "external",
    aiEnhanced: record.lastDiscoveredRunId !== null,
    featured: record.featured,
  };
}

function mergeCatalogues(
  staticEvents: readonly CatalogEvent[],
  discoveredEvents: readonly CatalogEvent[],
): readonly CatalogEvent[] {
  const ids = new Set(staticEvents.map((event) => event.id));
  const slugs = new Set(staticEvents.map((event) => event.slug));
  return [
    ...staticEvents,
    ...discoveredEvents.filter(
      (event) => !ids.has(event.id) && !slugs.has(event.slug),
    ),
  ];
}

function reportCatalogFallback(error: unknown): void {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error(
    `Published discovery catalogue is unavailable (${code}); using the static fallback.`,
  );
}
