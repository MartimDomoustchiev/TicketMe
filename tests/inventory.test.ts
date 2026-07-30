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

    const duplicateAttempts = await Promise.allSettled([
      store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: "Fair Queue Buyer",
        buyerEmail: " Queue@example.com ",
        ticketType: "fan",
      }),
      store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: "Fair Queue Buyer",
        buyerEmail: "queue@EXAMPLE.com",
        ticketType: "premium",
      }),
    ]);
    const successfulReservations = duplicateAttempts.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof store.reserveCheckoutTicket>>
      > => result.status === "fulfilled",
    );
    const rejectedReservations = duplicateAttempts.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    assert.equal(successfulReservations.length, 1);
    assert.equal(rejectedReservations.length, 1);
    assert.match(
      String(rejectedReservations[0].reason),
      /ACTIVE_CHECKOUT_EXISTS/,
    );

    const availabilityWithDuplicateAttempt =
      await store.getAvailability(PRIMARY_SALE_EVENT.id);
    assert.equal(
      availabilityWithDuplicateAttempt.totalRemaining,
      availabilityBefore.totalRemaining - 1,
    );
    assert.equal(
      (
        await store.getPurchaseActivity(PRIMARY_SALE_EVENT.id)
      ).activeCheckouts,
      1,
    );
    await store.cancelCheckoutReservation(
      successfulReservations[0].value.id,
    );

    const attachedReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Deadline Buyer",
      buyerEmail: "deadline@example.com",
      ticketType: "standard",
      expiresInMs: 20,
    });
    await store.attachCheckoutSession({
      reservationId: attachedReservation.id,
      stripeCheckoutSessionId: "cs_test_deadline_authoritative",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(
      await store.releaseExpiredCheckoutReservations(
        PRIMARY_SALE_EVENT.id,
      ),
      0,
    );
    assert.equal(
      (
        await store.getCheckoutReservation(
          attachedReservation.id,
        )
      )?.status,
      "checkout_created",
    );
    assert.equal(
      (
        await store.getPurchaseActivity(PRIMARY_SALE_EVENT.id)
      ).activeCheckouts,
      1,
    );

    await store.expireCheckoutReservation(attachedReservation.id);
    assert.equal(
      (
        await store.getAvailability(PRIMARY_SALE_EVENT.id)
      ).totalRemaining,
      availabilityBefore.totalRemaining,
    );

    const unattachedReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Abandoned Buyer",
      buyerEmail: "abandoned@example.com",
      ticketType: "standard",
      expiresInMs: 100,
    });
    await new Promise((resolve) => setTimeout(resolve, 130));
    assert.equal(
      await store.releaseExpiredCheckoutReservations(
        PRIMARY_SALE_EVENT.id,
      ),
      1,
    );
    assert.equal(
      (
        await store.getCheckoutReservation(
          unattachedReservation.id,
        )
      )?.status,
      "expired",
    );
    assert.equal(
      (
        await store.getAvailability(PRIMARY_SALE_EVENT.id)
      ).totalRemaining,
      availabilityBefore.totalRemaining,
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
