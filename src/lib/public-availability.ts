import "server-only";

import type { Availability } from "@/lib/store";
import { getAvailability } from "@/lib/store";

type AvailabilityLoader = (eventId: string) => Promise<Availability>;

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
