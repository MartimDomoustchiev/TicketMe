import { revalidateTag } from "next/cache";

export const PUBLIC_TICKETING_CACHE_TAG = "ticketme-public-ticketing";

export function invalidatePublicTicketingCache(): boolean {
  try {
    revalidateTag(PUBLIC_TICKETING_CACHE_TAG, { expire: 0 });
    return true;
  } catch (error) {
    console.error("Public ticketing cache invalidation failed.", error);
    return false;
  }
}
