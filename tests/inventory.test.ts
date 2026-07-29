import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CATALOG_EVENTS, EVENT } from "../src/lib/event";

test("concurrent local allocation never oversells and rejects repeat check-in", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = await mkdtemp(
    path.join(tmpdir(), "ticketforge-inventory-test-"),
  );

  try {
    process.chdir(isolatedCwd);
    const store = await import("../src/lib/store-file");
    const ticketType = EVENT.ticketTypes.find(
      (candidate) => candidate.id === "premium",
    )!;
    const attempts = Array.from(
      { length: ticketType.capacity + 20 },
      (_, index) =>
        store.issueTicket({
          eventId: EVENT.id,
          buyerName: `Buyer ${index}`,
          buyerEmail: `buyer-${index}@example.com`,
          ticketType: ticketType.id,
          storageKey: "",
          storageUrl: "",
          qrSecret: `secret-${index}`,
        }),
    );

    const results = await Promise.allSettled(attempts);
    const issued = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const rejected = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as Error] : [],
    );

    assert.equal(issued.length, ticketType.capacity);
    assert.equal(rejected.length, 20);
    assert.ok(rejected.every((error) => error.message === "SOLD_OUT"));
    assert.equal(new Set(issued.map((ticket) => ticket.id)).size, issued.length);
    assert.equal(
      new Set(issued.map((ticket) => ticket.seatLabel)).size,
      issued.length,
    );

    const availability = await store.getAvailability(EVENT.id);
    assert.equal(availability.byType.premium, 0);
    assert.ok(availability.totalRemaining >= 0);

    const secondEvent = CATALOG_EVENTS.find((event) => event.id !== EVENT.id)!;
    const secondBefore = await store.getAvailability(secondEvent.id);
    await store.issueTicket({
      eventId: secondEvent.id,
      buyerName: "Second Event Buyer",
      buyerEmail: "second-event@example.com",
      ticketType: "fan",
      storageKey: "",
      storageUrl: "",
      qrSecret: "second-event-secret",
    });
    const [featuredAfter, secondAfter] = await Promise.all([
      store.getAvailability(EVENT.id),
      store.getAvailability(secondEvent.id),
    ]);
    assert.equal(featuredAfter.byType.premium, 0);
    assert.equal(secondAfter.byType.fan, secondBefore.byType.fan - 1);

    const reservationBaseline = await store.getAvailability(secondEvent.id);
    const [paidReservation, cancelledReservation] = await Promise.all([
      store.reserveCheckoutTicket({
        eventId: secondEvent.id,
        buyerName: "Paid Buyer",
        buyerEmail: "paid@example.com",
        ticketType: "standard",
        locale: "en",
      }),
      store.reserveCheckoutTicket({
        eventId: secondEvent.id,
        buyerName: "Cancelled Buyer",
        buyerEmail: "cancelled@example.com",
        ticketType: "standard",
      }),
    ]);
    assert.equal(
      (await store.getAvailability(secondEvent.id)).byType.standard,
      reservationBaseline.byType.standard - 2,
    );

    const checkoutSessionId = "cs_test_reservation_lifecycle";
    const attached = await store.attachCheckoutSession({
      reservationId: paidReservation.id,
      stripeCheckoutSessionId: checkoutSessionId,
    });
    assert.equal(attached.locale, "en");
    assert.equal(
      (
        await store.attachCheckoutSession({
          reservationId: paidReservation.id,
          stripeCheckoutSessionId: checkoutSessionId,
        })
      ).id,
      paidReservation.id,
    );
    await assert.rejects(
      store.attachCheckoutSession({
        reservationId: paidReservation.id,
        stripeCheckoutSessionId: "cs_test_different",
      }),
      /CHECKOUT_SESSION_ALREADY_ATTACHED/,
    );

    const fulfilled = await store.fulfillCheckoutReservation({
      reservationId: paidReservation.id,
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: "pi_test_reservation_lifecycle",
      storageKey: "",
      storageUrl: "",
      qrSecret: "paid-ticket-secret",
    });
    const duplicateFulfillment = await store.fulfillCheckoutReservation({
      reservationId: paidReservation.id,
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: "pi_test_reservation_lifecycle",
      storageKey: "",
      storageUrl: "",
      qrSecret: "ignored-on-retry",
    });
    assert.ok(fulfilled);
    assert.ok(duplicateFulfillment);
    assert.equal(fulfilled.created, true);
    assert.equal(duplicateFulfillment.created, false);
    assert.equal(duplicateFulfillment.ticket.id, fulfilled.ticket.id);

    const deliveryClaims = await Promise.all([
      store.claimTicketDelivery({ reservationId: paidReservation.id }),
      store.claimTicketDelivery({ reservationId: paidReservation.id }),
    ]);
    const winningClaims = deliveryClaims.filter(
      (claim): claim is NonNullable<typeof claim> => claim !== null,
    );
    assert.equal(winningClaims.length, 1);
    assert.equal(
      await store.releaseTicketDelivery({
        reservationId: paidReservation.id,
        claimToken: winningClaims[0].claimToken,
      }),
      true,
    );
    const retryClaim = await store.claimTicketDelivery({
      reservationId: paidReservation.id,
    });
    assert.ok(retryClaim);
    assert.equal(
      (
        await store.completeTicketDelivery({
          reservationId: paidReservation.id,
          claimToken: retryClaim.claimToken,
          storageKey: `tickets/${fulfilled.ticket.id}.pdf`,
          storageUrl: `/api/tickets/${fulfilled.ticket.id}/download`,
        })
      )?.deliveryStatus,
      "completed",
    );

    assert.equal(
      (await store.cancelCheckoutReservation(cancelledReservation.id))?.status,
      "cancelled",
    );
    assert.equal(
      (await store.cancelCheckoutReservation(cancelledReservation.id))?.status,
      "cancelled",
    );
    assert.equal(
      (await store.getAvailability(secondEvent.id)).byType.standard,
      reservationBaseline.byType.standard - 1,
    );

    const expiringReservation = await store.reserveCheckoutTicket({
      eventId: secondEvent.id,
      buyerName: "Expiring Buyer",
      buyerEmail: "expiring@example.com",
      ticketType: "premium",
      expiresInMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.getAvailability(secondEvent.id);
    assert.equal(
      (await store.getCheckoutReservation(expiringReservation.id))?.status,
      "expired",
    );

    const ticket = issued[0];
    const checkedIn = await store.markTicketCheckedIn(
      ticket.id,
      ticket.qrSecret,
      "test-admin",
    );
    assert.equal(checkedIn?.status, "checked_in");
    assert.equal(
      await store.markTicketCheckedIn(
        ticket.id,
        ticket.qrSecret,
        "test-admin",
      ),
      null,
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
