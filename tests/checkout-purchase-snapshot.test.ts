import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  checkoutPurchaseSnapshotsEqual,
  createCheckoutPurchaseSnapshot,
  isAdmissionPurchaseSnapshot,
  normalizeCheckoutPurchaseSnapshot,
} from "../src/lib/checkout-purchase-snapshot";
import { EVENT, PRIMARY_SALE_EVENT } from "../src/lib/event";

test("purchase snapshots capture the complete immutable offer contract", () => {
  const standard = PRIMARY_SALE_EVENT.ticketTypes.find(
    (ticketType) => ticketType.id === "standard",
  );
  assert.ok(standard);

  const snapshot = createCheckoutPurchaseSnapshot(
    PRIMARY_SALE_EVENT,
    standard,
  );
  assert.deepEqual(snapshot, {
    offerKind: "admission",
    unitAmountMinor: 3_900,
    currency: "EUR",
    eventName: PRIMARY_SALE_EVENT.name,
    eventDate: `${PRIMARY_SALE_EVENT.date}, ${PRIMARY_SALE_EVENT.time}`,
    venue: PRIMARY_SALE_EVENT.venue,
    ticketLabel: standard.label,
    sourceName: PRIMARY_SALE_EVENT.sourceName,
    sourceUrl: PRIMARY_SALE_EVENT.sourceUrl,
  });
  assert.equal(isAdmissionPurchaseSnapshot(snapshot), true);
  assert.equal(isAdmissionPurchaseSnapshot(null), false);

  const changedOffer = {
    ...snapshot,
    unitAmountMinor: snapshot.unitAmountMinor + 1,
  };
  assert.equal(checkoutPurchaseSnapshotsEqual(snapshot, changedOffer), false);
});

test("unknown or partial legacy purchase semantics fail closed", () => {
  assert.equal(normalizeCheckoutPurchaseSnapshot(null), null);
  assert.equal(
    normalizeCheckoutPurchaseSnapshot({
      offerKind: "admission",
      unitAmountMinor: 3_900,
      currency: "EUR",
    }),
    null,
  );

  const standard = EVENT.ticketTypes.find(
    (ticketType) => ticketType.id === "standard",
  );
  assert.ok(standard);
  const simulation = createCheckoutPurchaseSnapshot(EVENT, standard);
  assert.equal(simulation.offerKind, "test-simulation");
  assert.equal(isAdmissionPurchaseSnapshot(simulation), false);
});

test("snapshot migration backfills only known offers and allows all-null legacy rows", async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      "database/migrations/007_reservation_snapshot.sql",
    ),
    "utf8",
  );

  assert.match(migration, /num_nonnulls\([\s\S]+?\) IN \(0, 9\)/);
  assert.match(migration, /ticketme-live-next-wave-2027/);
  assert.match(migration, /deep-purple-live-sofia-2026/);
  assert.match(migration, /WHEN 'ticketme-live-next-wave-2027' THEN 'admission'/);
  assert.match(migration, /WHEN 'deep-purple-live-sofia-2026' THEN 'test-simulation'/);
  assert.match(migration, /WHERE purchase_offer_kind IS NULL/);
});
