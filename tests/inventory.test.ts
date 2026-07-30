import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CATALOG_EVENTS,
  EVENT,
  PRIMARY_SALE_EVENT,
} from "../src/lib/event";

test("external catalogue listings cannot allocate or reserve local inventory", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = await mkdtemp(
    path.join(tmpdir(), "ticketme-external-inventory-test-"),
  );

  try {
    process.chdir(isolatedCwd);
    const store = await import("../src/lib/store-file");

    const externalSeed = CATALOG_EVENTS.find(
      (event) => event.saleMode === "external" && event.id !== EVENT.id,
    );
    assert.ok(externalSeed);

    for (const event of [EVENT, externalSeed]) {
      const availability = await store.getAvailability(event.id);
      assert.equal(availability.totalCapacity, 0);
      assert.equal(availability.totalRemaining, 0);
      assert.deepEqual(availability.byType, {});

      await assert.rejects(
        store.issueTicket({
          eventId: event.id,
          buyerName: "External Listing Buyer",
          buyerEmail: "buyer@example.com",
          ticketType: "standard",
          storageKey: "",
          storageUrl: "",
          qrSecret: "must-not-be-used",
        }),
        /INVALID_TICKET_TYPE/,
      );

      await assert.rejects(
        store.reserveCheckoutTicket({
          eventId: event.id,
          buyerName: "External Listing Buyer",
          buyerEmail: "buyer@example.com",
          ticketType: "standard",
        }),
        /INVALID_TICKET_TYPE/,
      );
    }

    const before = await store.getPurchaseActivity(
      PRIMARY_SALE_EVENT.id,
    );
    const availabilityBefore = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    assert.deepEqual(before, {
      queueDepth: 0,
      activeCheckouts: 0,
    });

    const reservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Verified Buyer",
      buyerEmail: "verified@example.com",
      ticketType: "standard",
    });
    const whileCheckingOut = await store.getPurchaseActivity(
      PRIMARY_SALE_EVENT.id,
    );
    assert.deepEqual(whileCheckingOut, {
      queueDepth: 0,
      activeCheckouts: 1,
    });
    const availabilityWhileCheckingOut = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    assert.equal(
      availabilityWhileCheckingOut.totalRemaining,
      availabilityBefore.totalRemaining - 1,
    );

    await store.cancelCheckoutReservation(reservation.id);
    const afterCancellation = await store.getPurchaseActivity(
      PRIMARY_SALE_EVENT.id,
    );
    assert.deepEqual(afterCancellation, {
      queueDepth: 0,
      activeCheckouts: 0,
    });
    const availabilityAfterCancellation = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    assert.equal(
      availabilityAfterCancellation.totalRemaining,
      availabilityBefore.totalRemaining,
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
