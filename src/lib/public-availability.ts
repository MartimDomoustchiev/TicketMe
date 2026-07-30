import "server-only";

import type { Availability, PurchaseActivity } from "@/lib/store";
import {
  getAvailability,
  getPurchaseActivity,
} from "@/lib/store";

type AvailabilityLoader = (eventId: string) => Promise<Availability>;
type PurchaseActivityLoader = (
  eventId: string,
) => Promise<PurchaseActivity>;

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
  loadAvailability: AvailabilityLoader = getAvailability,
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
  loadActivity: PurchaseActivityLoader = getPurchaseActivity,
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
