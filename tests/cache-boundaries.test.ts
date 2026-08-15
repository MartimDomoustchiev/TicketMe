import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("public catalogue reads use explicit invalidation with a safety TTL", async () => {
  const [catalog, cache] = await Promise.all([
    source("src/lib/catalog.ts"),
    source("src/lib/catalog-cache.ts"),
  ]);

  assert.match(catalog, /import \{ unstable_cache \} from "next\/cache"/);
  assert.match(
    cache,
    /PUBLIC_CATALOG_CACHE_TAG\s*=\s*"ticketme-public-catalog"/,
  );
  assert.match(
    catalog,
    /PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS\s*=\s*15 \* 60/,
  );
  assert.match(
    catalog,
    /revalidate:\s*PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS/,
  );
  assert.match(catalog, /tags:\s*\[PUBLIC_CATALOG_CACHE_TAG\]/);
  assert.match(
    cache,
    /revalidateTag\(PUBLIC_CATALOG_CACHE_TAG, \{ expire: 0 \}\)/,
  );
  assert.match(cache, /Public catalog cache invalidation failed\./);
  assert.match(
    catalog,
    /const loadCachedPublishedDiscoveries = unstable_cache\(/,
  );
  assert.match(
    catalog,
    /const getCachedPublishedCatalogEventById = unstable_cache\(/,
  );
  assert.match(
    catalog,
    /const getCachedPublishedCatalogEventBySlug = unstable_cache\(/,
  );
  assert.equal(
    [...catalog.matchAll(/publicCatalogCacheOptions/g)].length,
    4,
  );
  assert.match(
    catalog,
    /singleFlight\("database-catalog:list", \(\) =>\s*retryTransientPostgresRead\(/,
  );
  assert.match(
    catalog,
    /singleFlight\(\s*`database-catalog:id:\$\{id\}`,[\s\S]*?retryTransientPostgresRead\("catalog-id"/,
  );
  assert.match(
    catalog,
    /singleFlight\(\s*`database-catalog:slug:\$\{slug\}`,[\s\S]*?retryTransientPostgresRead\("catalog-slug"/,
  );
});

test("live public reads retry inside their single-flight boundary", async () => {
  const availability = await source("src/lib/public-availability.ts");

  assert.match(
    availability,
    /singleFlight\(\s*`database-availability:\$\{eventId\}`,[\s\S]*?retryTransientPostgresRead\("availability"/,
  );
  assert.match(
    availability,
    /singleFlight\(\s*`database-purchase-activity:\$\{eventId\}`,[\s\S]*?retryTransientPostgresRead\("purchase-activity"/,
  );
});

test("all possibly committed catalogue mutations invalidate the shared tag", async () => {
  const [review, adminDiscovery, cronDiscovery] = await Promise.all([
    source("src/app/api/admin/event-discovery/review/route.ts"),
    source("src/app/api/admin/event-discovery/route.ts"),
    source("src/app/api/cron/events/discover/route.ts"),
  ]);

  assert.match(
    review,
    /finally \{[\s\S]*?if \(body\.action === "publish"\) \{\s*invalidatePublicCatalogCache\(\);\s*\}/,
  );
  assert.equal(
    [...review.matchAll(/invalidatePublicCatalogCache\(\)/g)].length,
    1,
  );

  for (const route of [adminDiscovery, cronDiscovery]) {
    assert.match(
      route,
      /finally \{[\s\S]*?invalidatePublicCatalogCache\(\);[\s\S]*?\}/,
    );
    assert.equal(
      [...route.matchAll(/invalidatePublicCatalogCache\(\)/g)].length,
      1,
    );
  }
});

test("authentication deduplicates sessions only within the React request cache", async () => {
  const auth = await source("src/lib/auth.ts");

  assert.match(auth, /import \{ cache \} from "react"/);
  assert.match(auth, /const sessionFromCookie = cache\(\s*async \(\)/);
  assert.match(
    auth,
    /return token \? findSession\(token\) : null;\s*},\s*\);/,
  );
  assert.doesNotMatch(auth, /unstable_cache/);
});
