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

test("external test offers reserve atomically and remain isolated by event", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = await mkdtemp(
    path.join(tmpdir(), "ticketme-external-inventory-test-"),
  );

  try {
    process.chdir(isolatedCwd);
    const store = await import("../src/lib/store-file");

    const biletTestEvent = CATALOG_EVENTS.find(
      (event) =>
        event.saleMode === "external" && event.id.startsWith("bilet-8347"),
    );
    assert.ok(biletTestEvent);

    const testEvents = [EVENT, biletTestEvent] as const;
    const initialAvailability = new Map<
      string,
      Awaited<ReturnType<typeof store.getAvailability>>
    >();
    for (const event of testEvents) {
      const availability = await store.getAvailability(event.id);
      initialAvailability.set(event.id, availability);
      assert.equal(
        availability.totalCapacity,
        event.ticketTypes.reduce(
          (total, ticketType) => total + ticketType.capacity,
          0,
        ),
      );
      assert.equal(availability.totalRemaining, availability.totalCapacity);
      assert.deepEqual(
        availability.byType,
        Object.fromEntries(
          event.ticketTypes.map((ticketType) => [
            ticketType.id,
            ticketType.capacity,
          ]),
        ),
      );
    }

    const deepPurpleReservation = await store.reserveCheckoutTicket({
      eventId: EVENT.id,
      buyerName: "Deep Purple Test Buyer",
      buyerEmail: "deep-purple-test@example.com",
      ticketType: "standard",
    });
    const deepPurpleReserved = await store.getAvailability(EVENT.id);
    assert.equal(
      deepPurpleReserved.totalRemaining,
      initialAvailability.get(EVENT.id)!.totalRemaining - 1,
    );
    assert.equal(
      deepPurpleReserved.byType.standard,
      initialAvailability.get(EVENT.id)!.byType.standard - 1,
    );
    assert.deepEqual(
      await store.getAvailability(biletTestEvent.id),
      initialAvailability.get(biletTestEvent.id),
    );

    const biletReservation = await store.reserveCheckoutTicket({
      eventId: biletTestEvent.id,
      buyerName: "Bilet Test Buyer",
      buyerEmail: "bilet-test@example.com",
      ticketType: "premium",
    });
    const biletReserved = await store.getAvailability(biletTestEvent.id);
    assert.equal(
      biletReserved.totalRemaining,
      initialAvailability.get(biletTestEvent.id)!.totalRemaining - 1,
    );
    assert.equal(
      biletReserved.byType.premium,
      initialAvailability.get(biletTestEvent.id)!.byType.premium - 1,
    );

    await store.cancelCheckoutReservation(deepPurpleReservation.id);
    assert.deepEqual(
      await store.getAvailability(EVENT.id),
      initialAvailability.get(EVENT.id),
    );
    assert.deepEqual(
      await store.getAvailability(biletTestEvent.id),
      biletReserved,
    );

    await store.cancelCheckoutReservation(biletReservation.id);
    assert.deepEqual(
      await store.getAvailability(biletTestEvent.id),
      initialAvailability.get(biletTestEvent.id),
    );

    const directlyIssued = await store.issueTicket({
      eventId: EVENT.id,
      buyerName: "Store Adapter Test Buyer",
      buyerEmail: "store-adapter-test@example.com",
      ticketType: "fan",
      storageKey: "",
      storageUrl: "",
      qrSecret: "store-adapter-test-secret",
    });
    assert.equal(directlyIssued.eventId, EVENT.id);
    assert.equal(
      (await store.getAvailability(EVENT.id)).byType.fan,
      initialAvailability.get(EVENT.id)!.byType.fan - 1,
    );
    assert.equal(await store.rollbackIssuedTicket(directlyIssued.id), true);
    assert.deepEqual(
      await store.getAvailability(EVENT.id),
      initialAvailability.get(EVENT.id),
    );

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
