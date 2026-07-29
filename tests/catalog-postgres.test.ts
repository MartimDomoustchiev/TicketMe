import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  buildCatalogEventFingerprint,
  buildCatalogSourceUrlHash,
  canonicalizeCatalogSourceUrl,
  prepareDiscoveredCatalogEvent,
} from "../src/lib/catalog-types";

const BASE_CANDIDATE = {
  title: "  Arctic   Monkeys — Live! ",
  category: "Concerts" as const,
  city: " София ",
  venue: " Arena 8888 ",
  startsAt: "2026-11-04T20:00:37+02:00",
  source: {
    provider: " Eventim BG ",
    providerEventId: "concert-42",
    sourceUrl:
      "https://EVENTIM.example/events/arctic/?utm_source=google&seat=fan#tickets",
    isOfficial: true,
  },
};

test("catalog fingerprint is deterministic across harmless formatting and offsets", () => {
  const left = buildCatalogEventFingerprint({
    title: "Arctic   Monkeys — Live!",
    city: "София",
    venue: "Arena 8888",
    startsAt: "2026-11-04T20:00:37+02:00",
  });
  const right = buildCatalogEventFingerprint({
    title: " arctic monkeys live ",
    city: " СОФИЯ ",
    venue: "arena 8888",
    startsAt: "2026-11-04T18:00:05.000Z",
  });

  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/);
  assert.notEqual(
    left,
    buildCatalogEventFingerprint({
      title: "Arctic Monkeys Live",
      city: "Пловдив",
      venue: "Arena 8888",
      startsAt: "2026-11-04T18:00:00.000Z",
    }),
  );
});

test("source URL identity removes tracking noise and sorts useful parameters", () => {
  const canonical = canonicalizeCatalogSourceUrl(
    "https://EXAMPLE.com/events/show/?utm_campaign=x&zone=vip&a=1&fbclid=secret#buy",
  );

  assert.equal(
    canonical,
    "https://example.com/events/show?a=1&zone=vip",
  );
  assert.equal(
    buildCatalogSourceUrlHash(canonical),
    buildCatalogSourceUrlHash(
      "https://example.com/events/show/?zone=vip&a=1&utm_medium=cpc",
    ),
  );
  assert.throws(
    () => canonicalizeCatalogSourceUrl("http://example.com/event"),
    /CATALOG_INVALID_SOURCE_URL/,
  );
  assert.throws(
    () =>
      canonicalizeCatalogSourceUrl(
        "https://user:password@example.com/event",
      ),
    /CATALOG_INVALID_SOURCE_URL/,
  );
});

test("candidate preparation creates stable event and source dedupe keys", () => {
  const first = prepareDiscoveredCatalogEvent(BASE_CANDIDATE);
  const second = prepareDiscoveredCatalogEvent({
    ...BASE_CANDIDATE,
    title: "Arctic Monkeys Live",
    city: "СОФИЯ",
    venue: "arena 8888",
    startsAt: "2026-11-04T18:00:00Z",
    source: {
      ...BASE_CANDIDATE.source,
      provider: "eventim bg",
      sourceUrl:
        "https://eventim.example/events/arctic?seat=fan&utm_medium=social",
    },
  });

  assert.equal(first.canonicalFingerprint, second.canonicalFingerprint);
  assert.equal(first.id, second.id);
  assert.equal(first.slug, second.slug);
  assert.equal(first.source.sourceUrlHash, second.source.sourceUrlHash);
  assert.equal(first.source.provider, "eventim-bg");
  assert.equal(first.saleMode, "external");
  assert.equal(first.priceFromMinor, null);
  assert.equal(first.currency, "EUR");
  assert.equal(first.source.isOfficial, true);
});

test("candidate preparation rejects invalid model-produced facts", () => {
  assert.throws(
    () =>
      prepareDiscoveredCatalogEvent({
        ...BASE_CANDIDATE,
        bangerScore: 101,
      }),
    /CATALOG_INVALID_BANGER_SCORE/,
  );
  assert.throws(
    () =>
      prepareDiscoveredCatalogEvent({
        ...BASE_CANDIDATE,
        timezone: "Mars/Olympus_Mons",
      }),
    /CATALOG_INVALID_TIMEZONE/,
  );
  assert.throws(
    () =>
      prepareDiscoveredCatalogEvent({
        ...BASE_CANDIDATE,
        startsAt: "not-a-date",
      }),
    /CATALOG_INVALID_STARTS_AT/,
  );
});

test("event discovery migration enforces lifecycle and dedupe constraints", async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      "database",
      "migrations",
      "004_event_discovery.sql",
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS catalog_events/);
  assert.match(
    migration,
    /status IN \(\s*'pending',\s*'published',\s*'rejected'/,
  );
  assert.match(migration, /sale_mode IN \('external', 'internal'\)/);
  assert.match(migration, /canonical_fingerprint CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS catalog_event_sources_provider_id_idx/,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS event_discovery_runs/,
  );
});
