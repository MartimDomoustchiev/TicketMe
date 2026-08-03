import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("public catalogue reads use one short tagged shared-cache policy", async () => {
  const catalog = await source("src/lib/catalog.ts");
  const revalidation = catalog.match(
    /PUBLIC_CATALOG_CACHE_REVALIDATE_SECONDS\s*=\s*(\d+)/,
  );

  assert.match(catalog, /import \{ unstable_cache \} from "next\/cache"/);
  assert.match(
    catalog,
    /PUBLIC_CATALOG_CACHE_TAG\s*=\s*"ticketme-public-catalog"/,
  );
  assert.ok(revalidation);
  assert.ok(Number(revalidation[1]) >= 5);
  assert.ok(Number(revalidation[1]) <= 60);
  assert.match(catalog, /tags:\s*\[PUBLIC_CATALOG_CACHE_TAG\]/);
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
