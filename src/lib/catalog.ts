import "server-only";

import { unstable_cache } from "next/cache";
import {
  CATALOG_EVENTS,
  formatEventDate,
  formatEventTime,
  formatPrice,
  getCategoryImage,
  getEventById,
  getEventBySlug,
  isEventOpenForInternalSale,
  isEventUpcoming,
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
import { singleFlight } from "@/lib/single-flight";

export const PUBLIC_CATALOG_CACHE_TAG = "ticketme-public-catalog";

const PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS = 30;
const publicCatalogCacheOptions = {
  revalidate: PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CATALOG_CACHE_TAG],
};

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
    const discovered = await loadCachedPublishedDiscoveries();
    return mergeCatalogues(
      staticEvents,
      discovered
        .map(mapDiscoveredEvent)
        .filter((event) => isEventUpcoming(event)),
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

const loadCachedPublishedDiscoveries = unstable_cache(
  () => singleFlight("database-catalog:list", loadPublishedDiscoveries),
  ["ticketme-public-catalog-list-v1"],
  publicCatalogCacheOptions,
);

const getCachedPublishedCatalogEventById = unstable_cache(
  async (id: string) =>
    singleFlight(
      `database-catalog:id:${id}`,
      () => getPublishedCatalogEventById(id),
    ),
  ["ticketme-public-catalog-event-by-id-v1"],
  publicCatalogCacheOptions,
);

const getCachedPublishedCatalogEventBySlug = unstable_cache(
  async (slug: string) =>
    singleFlight(
      `database-catalog:slug:${slug}`,
      () => getPublishedCatalogEventBySlug(slug),
    ),
  ["ticketme-public-catalog-event-by-slug-v1"],
  publicCatalogCacheOptions,
);

export async function findCatalogEventById(
  id: string,
): Promise<CatalogEvent | undefined> {
  const staticEvent = getEventById(id);
  const fallback =
    staticEvent && isEventUpcoming(staticEvent) ? staticEvent : undefined;
  if (!isDatabaseConfigured()) {
    return fallback;
  }

  try {
    const discovered = await getCachedPublishedCatalogEventById(id);
    if (discovered) {
      const mapped = preserveStaticCheckout(
        mapDiscoveredEvent(discovered),
        staticEvent,
      );
      return isEventUpcoming(mapped) ? mapped : fallback;
    }
    return fallback;
  } catch (error) {
    reportCatalogFallback(error);
    return fallback;
  }
}

export async function findCatalogEventBySlug(
  slug: string,
): Promise<CatalogEvent | undefined> {
  const staticEvent = getEventBySlug(slug);
  const fallback =
    staticEvent && isEventUpcoming(staticEvent) ? staticEvent : undefined;
  if (!isDatabaseConfigured()) {
    return fallback;
  }

  try {
    const discovered = await getCachedPublishedCatalogEventBySlug(slug);
    if (discovered) {
      const mapped = preserveStaticCheckout(
        mapDiscoveredEvent(discovered),
        staticEvent,
      );
      return isEventUpcoming(mapped) ? mapped : fallback;
    }
    return fallback;
  } catch (error) {
    reportCatalogFallback(error);
    return fallback;
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
  return isEventOpenForInternalSale(event);
}

function upcomingStaticEvents(now = new Date()): readonly CatalogEvent[] {
  return CATALOG_EVENTS.filter((event) => isEventUpcoming(event, now));
}

function mapDiscoveredEvent(record: CatalogEventRecord): CatalogEvent {
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
  // republication. Render TicketMe-owned category art until an organizer
  // supplies an approved, durably stored asset with explicit usage rights.
  const image = getCategoryImage(category);
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
    saleMode: record.saleMode,
    sourceOfficial: record.primarySource.isOfficial,
    aiEnhanced: record.lastDiscoveredRunId !== null,
    featured: record.featured,
    bangerScore: record.bangerScore,
  };
}

function mergeCatalogues(
  staticEvents: readonly CatalogEvent[],
  discoveredEvents: readonly CatalogEvent[],
): readonly CatalogEvent[] {
  const discoveredById = new Map(
    discoveredEvents.map((event) => [event.id, event]),
  );
  const discoveredBySlug = new Map(
    discoveredEvents.map((event) => [event.slug, event]),
  );
  const discoveredBySource = new Map(
    discoveredEvents.map((event) => [event.sourceUrl, event]),
  );
  const consumed = new Set<string>();
  const refreshedStatic = staticEvents.map((event) => {
    const replacement =
      discoveredById.get(event.id) ??
      discoveredBySlug.get(event.slug) ??
      discoveredBySource.get(event.sourceUrl);
    if (replacement) {
      consumed.add(replacement.id);
      return preserveStaticCheckout(replacement, event);
    }
    return event;
  });

  return [
    ...refreshedStatic,
    ...discoveredEvents.filter((event) => !consumed.has(event.id)),
  ];
}

/**
 * A discovery may refresh the descriptive/source facts for a seeded event,
 * but the checkout backend resolves seeded IDs synchronously. Preserve that
 * stable identity and its server-owned offer so a refreshed listing cannot
 * expose a checkout that the inventory service cannot fulfill.
 */
function preserveStaticCheckout(
  event: CatalogEvent,
  staticEvent: CatalogEvent | undefined,
): CatalogEvent {
  if (!staticEvent?.checkoutMode || staticEvent.ticketTypes.length === 0) {
    return event;
  }

  return {
    ...event,
    id: staticEvent.id,
    slug: staticEvent.slug,
    checkoutMode: staticEvent.checkoutMode,
    saleMode: staticEvent.saleMode,
    ticketTypes: staticEvent.ticketTypes,
  };
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
