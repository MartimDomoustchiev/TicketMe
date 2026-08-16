import "server-only";

import { unstable_cache } from "next/cache";
import type { Availability, PurchaseActivity } from "@/lib/store";
import {
  getAvailability,
  getPurchaseActivity,
} from "@/lib/store";
import { singleFlight } from "@/lib/single-flight";
import { PUBLIC_TICKETING_CACHE_TAG } from "@/lib/ticketing-cache";
import { retryTransientPostgresRead } from "@/lib/transient-postgres-read";

type AvailabilityLoader = (eventId: string) => Promise<Availability>;
type PurchaseActivityLoader = (
  eventId: string,
) => Promise<PurchaseActivity>;

// Public pages and realtime streams run across many Vercel instances. Caching
// these snapshots in Next's shared Data Cache prevents every instance from
// opening its own RDS connection while keeping visible inventory within the
// required five-second freshness window.
const loadSharedAvailability = unstable_cache(
  async (eventId: string) =>
    singleFlight(
      `database-availability:${eventId}`,
      () =>
        retryTransientPostgresRead("availability", () =>
          getAvailability(eventId),
        ),
    ),
  ["ticketme-public-availability-v1"],
  { revalidate: 2, tags: [PUBLIC_TICKETING_CACHE_TAG] },
);

const loadSharedPurchaseActivity = unstable_cache(
  async (eventId: string) =>
    singleFlight(
      `database-purchase-activity:${eventId}`,
      () =>
        retryTransientPostgresRead("purchase-activity", () =>
          getPurchaseActivity(eventId),
        ),
    ),
  ["ticketme-public-purchase-activity-v1"],
  { revalidate: 2, tags: [PUBLIC_TICKETING_CACHE_TAG] },
);

export async function getSharedAvailability(
  eventId: string,
): Promise<Availability> {
  return loadSharedAvailability(eventId);
}

export async function getSharedPurchaseActivity(
  eventId: string,
): Promise<PurchaseActivity> {
  return loadSharedPurchaseActivity(eventId);
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return "unavailable";
}

/**
 * Public catalogue pages should remain browsable during a database outage.
 * Transactional routes continue to use getAvailability directly and fail
 * closed, so a fallback can never allocate or sell a ticket.
 */
export async function getPublicAvailability(
  eventId: string,
  loadAvailability: AvailabilityLoader = getSharedAvailability,
): Promise<Availability | null> {
  try {
    return await loadAvailability(eventId);
  } catch (error) {
    console.error(
      `Live availability is temporarily unavailable (${errorCode(error)}).`,
    );
    return null;
  }
}

export async function getPublicPurchaseActivity(
  eventId: string,
  loadActivity: PurchaseActivityLoader = getSharedPurchaseActivity,
): Promise<PurchaseActivity> {
  try {
    return await loadActivity(eventId);
  } catch (error) {
    console.error(
      `Live purchase activity is temporarily unavailable (${errorCode(error)}).`,
    );
    return {
      queueDepth: 0,
      activeCheckouts: 0,
    };
  }
}
