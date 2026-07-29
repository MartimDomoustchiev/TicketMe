import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CATALOG_EVENTS, EVENT } from "../src/lib/event";

test("external catalogue listings cannot allocate or reserve local inventory", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = await mkdtemp(
    path.join(tmpdir(), "ticketme-external-inventory-test-"),
  );

  try {
    process.chdir(isolatedCwd);
    const store = await import("../src/lib/store-file");

    for (const event of [EVENT, CATALOG_EVENTS[1]]) {
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
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
