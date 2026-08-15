import { revalidateTag } from "next/cache";

export const PUBLIC_CATALOG_CACHE_TAG = "ticketme-public-catalog";

export function invalidatePublicCatalogCache(): boolean {
  try {
    revalidateTag(PUBLIC_CATALOG_CACHE_TAG, { expire: 0 });
    return true;
  } catch (error) {
    console.error("Public catalog cache invalidation failed.", error);
    return false;
  }
}
