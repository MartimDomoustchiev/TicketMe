import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogSearchText,
  localizedEventDescription,
  localizedEventTitle,
} from "../src/components/marketplace/catalog-ui";
import { mapDiscoveredCatalogEvent } from "../src/lib/catalog-mapper";
import type { CatalogEventRecord } from "../src/lib/catalog-types";
import {
  completedDiscoveryFeedOutcomes,
  discoveryFeedOutcomeMetadata,
  MAX_STORED_DISCOVERY_FEED_REFERENCE_LENGTH,
  pendingDiscoveryFeedOutcomes,
  readDiscoveryFeedOutcomes,
  redactDiscoveryFeedReference,
} from "../src/lib/discovery-run-metadata";

const RECORD: CatalogEventRecord = {
  id: "evt-discovered",
  slug: "otkrit-koncert",
  title: "Открит концерт",
  tagline: "Музика на живо",
  description: "Описание на български.",
  category: "Concerts",
  city: "София",
  venue: "Зала България",
  address: "ул. Аксаков 1",
  startsAt: "2099-09-20T17:00:00.000Z",
  timezone: "Europe/Sofia",
  priceFromMinor: null,
  currency: "EUR",
  imageUrl: null,
  heroImageUrl: null,
  saleMode: "external",
  status: "published",
  featured: false,
  bangerScore: 82,
  sourceConfidence: 90,
  canonicalFingerprint: "a".repeat(64),
  contentHash: "b".repeat(64),
  discoveredByRunId: "run-1",
  lastDiscoveredRunId: "run-1",
  firstSeenAt: "2099-01-01T00:00:00.000Z",
  lastSeenAt: "2099-01-01T00:00:00.000Z",
  publishedAt: "2099-01-01T00:00:00.000Z",
  reviewedAt: "2099-01-01T00:00:00.000Z",
  reviewedBy: "admin@example.com",
  reviewNote: null,
  createdAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
  primarySource: {
    provider: "official-feed",
    providerEventId: "source-1",
    sourceUrl: "https://events.example/concert",
    isOfficial: true,
    extractedFacts: {
      titleEn: "Open-air concert",
      descriptionEn: "An English description from the reviewed source.",
    },
  },
};

test("reviewed English discovery facts reach public titles and search", () => {
  const event = mapDiscoveredCatalogEvent(RECORD);

  assert.equal(localizedEventTitle(event, "bg"), RECORD.title);
  assert.equal(localizedEventTitle(event, "en"), "Open-air concert");
  assert.equal(
    localizedEventDescription(event, "en"),
    "An English description from the reviewed source.",
  );
  assert.match(catalogSearchText(event), /open-air concert/);
  assert.match(catalogSearchText(event), /english description/);
});

test("invalid translated source facts fail closed to the original text", () => {
  const event = mapDiscoveredCatalogEvent({
    ...RECORD,
    primarySource: {
      ...RECORD.primarySource!,
      extractedFacts: {
        titleEn: "x".repeat(301),
        descriptionEn: 42,
      },
    },
  });

  assert.equal(event.titleEn, undefined);
  assert.equal(event.descriptionEn, undefined);
  assert.equal(localizedEventTitle(event, "en"), RECORD.title);
});

test("feed outcomes redact secrets and survive strict metadata parsing", () => {
  const first = new URL(
    "https://user:password@feeds.example/events.json?token=secret#private",
  );
  const second = new URL("https://feeds.example/other.xml");
  const safeFirst = redactDiscoveryFeedReference(first);

  assert.match(
    safeFirst,
    /^https:\/\/feeds\.example\/\.tiketko-feed\/[a-f0-9]{24}$/,
  );
  assert.doesNotMatch(
    safeFirst,
    /user|password|events\.json|secret|private/,
  );
  assert.deepEqual(pendingDiscoveryFeedOutcomes([first, second]), [
    { feedUrl: safeFirst, status: "pending" },
    {
      feedUrl: redactDiscoveryFeedReference(second),
      status: "pending",
    },
  ]);

  const completed = completedDiscoveryFeedOutcomes(
    [first, second],
    [{ feedUrl: safeFirst, code: "FEED_TIMEOUT" }],
  );
  assert.deepEqual(completed, [
    {
      feedUrl: safeFirst,
      status: "failed",
      failureCode: "FEED_TIMEOUT",
    },
    {
      feedUrl: redactDiscoveryFeedReference(second),
      status: "succeeded",
    },
  ]);
  assert.deepEqual(
    readDiscoveryFeedOutcomes(discoveryFeedOutcomeMetadata(completed)),
    completed,
  );
});

test("query-distinguished feeds retain separate non-secret outcomes", () => {
  const first = new URL(
    "https://feeds.example/events.json?calendar=private-one",
  );
  const second = new URL(
    "https://feeds.example/events.json?calendar=private-two",
  );
  const firstReference = redactDiscoveryFeedReference(first);
  const secondReference = redactDiscoveryFeedReference(second);

  assert.notEqual(firstReference, secondReference);
  assert.doesNotMatch(firstReference, /private-one/);
  assert.doesNotMatch(secondReference, /private-two/);

  const outcomes = completedDiscoveryFeedOutcomes(
    [first, second],
    [{ feedUrl: firstReference, code: "FEED_TIMEOUT" }],
  );
  assert.equal(outcomes[0].status, "failed");
  assert.equal(outcomes[1].status, "succeeded");
  assert.deepEqual(
    readDiscoveryFeedOutcomes(discoveryFeedOutcomeMetadata(outcomes)),
    outcomes,
  );
});

test("feed references never persist path credentials", () => {
  const reference = redactDiscoveryFeedReference(
    new URL("https://feeds.example/private-token-123/calendar.json"),
  );

  assert.match(
    reference,
    /^https:\/\/feeds\.example\/\.tiketko-feed\/[a-f0-9]{24}$/,
  );
  assert.doesNotMatch(reference, /private-token|calendar\.json/);
  assert.equal(
    redactDiscoveryFeedReference(new URL(reference)),
    reference,
  );
});

test("malformed feed outcome metadata is rejected as a whole", () => {
  assert.equal(
    readDiscoveryFeedOutcomes({
      feedOutcomes: [
        {
          feedUrl: "https://feeds.example/events.json",
          status: "failed",
        },
      ],
    }),
    null,
  );
  assert.equal(
    readDiscoveryFeedOutcomes({
      feedOutcomes: [
        {
          feedUrl: "http://feeds.example/events.json",
          status: "succeeded",
        },
      ],
    }),
    null,
  );
});

test("maximum feed counts cannot overflow discovery run metadata", () => {
  const feeds = Array.from({ length: 50 }, (_, index) =>
    new URL(
      `https://feed-${index}.events.example/${"segment/".repeat(260)}`,
    ),
  );
  const outcomes = pendingDiscoveryFeedOutcomes(feeds);
  const metadata = discoveryFeedOutcomeMetadata(outcomes);

  assert.equal(outcomes.length, 50);
  assert.ok(
    outcomes.every(
      (outcome) =>
        outcome.feedUrl.length <=
        MAX_STORED_DISCOVERY_FEED_REFERENCE_LENGTH,
    ),
  );
  assert.ok(JSON.stringify(metadata).length < 100_000);
  assert.deepEqual(readDiscoveryFeedOutcomes(metadata), outcomes);
});
