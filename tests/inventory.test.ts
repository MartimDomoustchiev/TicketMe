import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CATALOG_EVENTS,
  EVENT,
  PRIMARY_SALE_EVENT,
} from "../src/lib/event";
import { MAX_TICKETS_PER_ORDER } from "../src/lib/ticket-quantity";

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
      stripeLivemode: false,
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

    const quantityAvailabilityBefore = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    const quantityReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Three Ticket Buyer",
      buyerEmail: "three-tickets@example.com",
      ticketType: "standard",
      quantity: 3,
    });
    assert.equal(quantityReservation.quantity, 3);

    const quantityReservedAvailability = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    assert.equal(
      quantityReservedAvailability.byType.standard,
      quantityAvailabilityBefore.byType.standard - 3,
    );

    const qrSecrets = [
      "quantity-secret-1",
      "quantity-secret-2",
      "quantity-secret-3",
    ];
    const fulfillment = await store.fulfillCheckoutReservation({
      reservationId: quantityReservation.id,
      stripePaymentIntentId: "pi_test_quantity_three",
      storageKey: "",
      storageUrl: "",
      qrSecret: qrSecrets[0],
      qrSecrets,
    });
    assert.ok(fulfillment);
    assert.equal(fulfillment.created, true);
    assert.equal(fulfillment.reservation.quantity, 3);
    assert.equal(fulfillment.tickets.length, 3);
    assert.equal(fulfillment.tickets[0]?.id, fulfillment.ticket.id);
    assert.equal(
      new Set(fulfillment.tickets.map((ticket) => ticket.id)).size,
      3,
    );
    assert.equal(
      new Set(fulfillment.tickets.map((ticket) => ticket.qrSecret)).size,
      3,
    );
    assert.ok(
      fulfillment.tickets.every(
        (ticket) =>
          ticket.checkoutReservationId === quantityReservation.id,
      ),
    );
    assert.deepEqual(
      await store.getAvailability(PRIMARY_SALE_EVENT.id),
      quantityReservedAvailability,
      "fulfillment must not decrement already-reserved inventory again",
    );

    const repeatedFulfillment = await store.fulfillCheckoutReservation({
      reservationId: quantityReservation.id,
      stripePaymentIntentId: "pi_test_quantity_three",
      storageKey: "unused-on-retry",
      storageUrl: "unused-on-retry",
      qrSecret: qrSecrets[0],
      qrSecrets,
    });
    assert.ok(repeatedFulfillment);
    assert.equal(repeatedFulfillment.created, false);
    assert.deepEqual(
      repeatedFulfillment.tickets.map((ticket) => ticket.id),
      fulfillment.tickets.map((ticket) => ticket.id),
    );
    assert.deepEqual(
      await store.getAvailability(PRIMARY_SALE_EVENT.id),
      quantityReservedAvailability,
    );

    const listedQuantityTickets =
      await store.listTicketsByCheckoutReservation(quantityReservation.id);
    assert.deepEqual(
      listedQuantityTickets.map((ticket) => ticket.id),
      fulfillment.tickets.map((ticket) => ticket.id),
    );
    assert.equal(listedQuantityTickets[0]?.id, fulfillment.ticket.id);

    const deliveryClaim = await store.claimTicketDelivery({
      ticketId: fulfillment.tickets[1]?.id,
    });
    assert.ok(deliveryClaim);
    assert.equal(deliveryClaim.ticket.id, fulfillment.ticket.id);
    assert.deepEqual(
      deliveryClaim.tickets.map((ticket) => ticket.id),
      fulfillment.tickets.map((ticket) => ticket.id),
    );
    assert.equal(
      await store.releaseTicketDelivery({
        reservationId: quantityReservation.id,
        claimToken: deliveryClaim.claimToken,
      }),
      true,
    );

    const cancellationAvailabilityBefore = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    const cancelledQuantityReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Quantity Cancellation Buyer",
      buyerEmail: "quantity-cancellation@example.com",
      ticketType: "fan",
      quantity: 3,
    });
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.fan,
      cancellationAvailabilityBefore.byType.fan - 3,
    );
    await store.cancelCheckoutReservation(cancelledQuantityReservation.id);
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.fan,
      cancellationAvailabilityBefore.byType.fan,
    );
    await store.cancelCheckoutReservation(cancelledQuantityReservation.id);
    await store.expireCheckoutReservation(cancelledQuantityReservation.id);
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.fan,
      cancellationAvailabilityBefore.byType.fan,
      "a released reservation must restore its quantity only once",
    );

    const expiringQuantityReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Quantity Expiry Buyer",
      buyerEmail: "quantity-expiry@example.com",
      ticketType: "fan",
      quantity: 3,
      expiresInMs: 20,
    });
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.fan,
      cancellationAvailabilityBefore.byType.fan - 3,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      await store.releaseExpiredCheckoutReservations(
        PRIMARY_SALE_EVENT.id,
      ),
      1,
    );
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.fan,
      cancellationAvailabilityBefore.byType.fan,
    );
    assert.equal(
      await store.releaseExpiredCheckoutReservations(
        PRIMARY_SALE_EVENT.id,
      ),
      0,
    );
    assert.equal(
      (
        await store.getCheckoutReservation(expiringQuantityReservation.id)
      )?.quantity,
      3,
    );

    const legacyReservation = await store.reserveCheckoutTicket({
      eventId: PRIMARY_SALE_EVENT.id,
      buyerName: "Legacy Quantity Buyer",
      buyerEmail: "legacy-quantity@example.com",
      ticketType: "fan",
    });
    const dbFile = path.join(isolatedCwd, ".data", "db.json");
    const legacyState = JSON.parse(await readFile(dbFile, "utf8")) as {
      version: number;
      checkoutReservations: Record<string, { quantity?: number }>;
    };
    legacyState.version = 4;
    delete legacyState.checkoutReservations[legacyReservation.id]?.quantity;
    await writeFile(dbFile, JSON.stringify(legacyState, null, 2));
    assert.equal(
      (await store.getCheckoutReservation(legacyReservation.id))?.quantity,
      1,
    );
    await store.cancelCheckoutReservation(legacyReservation.id);

    const invalidQuantityAvailability = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    for (const [index, quantity] of [
      0,
      -1,
      1.5,
      MAX_TICKETS_PER_ORDER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ].entries()) {
      await assert.rejects(
        store.reserveCheckoutTicket({
          eventId: PRIMARY_SALE_EVENT.id,
          buyerName: "Invalid Quantity Buyer",
          buyerEmail: `invalid-quantity-${index}@example.com`,
          ticketType: "premium",
          quantity,
        }),
        /INVALID_TICKET_QUANTITY/,
      );
    }
    assert.deepEqual(
      await store.getAvailability(PRIMARY_SALE_EVENT.id),
      invalidQuantityAvailability,
    );

    const nearSelloutAvailability = await store.getAvailability(
      PRIMARY_SALE_EVENT.id,
    );
    const nearSelloutReservations = [];
    let inventoryToReserve = nearSelloutAvailability.byType.premium - 1;
    let reservationIndex = 0;
    while (inventoryToReserve > 0) {
      const quantity = Math.min(
        MAX_TICKETS_PER_ORDER,
        inventoryToReserve,
      );
      nearSelloutReservations.push(
        await store.reserveCheckoutTicket({
          eventId: PRIMARY_SALE_EVENT.id,
          buyerName: `Near Sellout Buyer ${reservationIndex}`,
          buyerEmail: `near-sellout-${reservationIndex}@example.com`,
          ticketType: "premium",
          quantity,
        }),
      );
      inventoryToReserve -= quantity;
      reservationIndex += 1;
    }
    const oneRemaining = await store.getAvailability(PRIMARY_SALE_EVENT.id);
    assert.equal(oneRemaining.byType.premium, 1);
    await assert.rejects(
      store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: "Insufficient Stock Buyer",
        buyerEmail: "insufficient-stock@example.com",
        ticketType: "premium",
        quantity: 2,
      }),
      /SOLD_OUT/,
    );
    assert.deepEqual(
      await store.getAvailability(PRIMARY_SALE_EVENT.id),
      oneRemaining,
      "an insufficient-stock reservation must not change inventory",
    );

    const raceResults = await Promise.allSettled([
      store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: "Race Buyer One",
        buyerEmail: "race-one@example.com",
        ticketType: "premium",
      }),
      store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: "Race Buyer Two",
        buyerEmail: "race-two@example.com",
        ticketType: "premium",
      }),
    ]);
    const raceWinners = raceResults.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof store.reserveCheckoutTicket>>
      > => result.status === "fulfilled",
    );
    const raceLosers = raceResults.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    assert.equal(raceWinners.length, 1);
    assert.equal(raceLosers.length, 1);
    assert.match(String(raceLosers[0].reason), /SOLD_OUT/);
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.premium,
      0,
    );

    await Promise.all(
      [...nearSelloutReservations, raceWinners[0].value].map(
        (reservation) => store.cancelCheckoutReservation(reservation.id),
      ),
    );
    assert.equal(
      (await store.getAvailability(PRIMARY_SALE_EVENT.id)).byType.premium,
      nearSelloutAvailability.byType.premium,
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
