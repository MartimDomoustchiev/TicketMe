import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PRIMARY_SALE_EVENT } from "../src/lib/event";

test("delivery retries include pending and expired claims in oldest-first order", async () => {
  const originalCwd = process.cwd();
  const isolatedCwd = await mkdtemp(
    path.join(tmpdir(), "ticketme-delivery-retry-test-"),
  );

  try {
    process.chdir(isolatedCwd);
    const store = await import("../src/lib/store-file");

    const createPendingDelivery = async (buyerEmail: string, suffix: string) => {
      const reservation = await store.reserveCheckoutTicket({
        eventId: PRIMARY_SALE_EVENT.id,
        buyerName: `Retry Buyer ${suffix}`,
        buyerEmail,
        ticketType: "standard",
      });
      const stripeCheckoutSessionId = `cs_test_delivery_retry_${suffix}`;
      await store.attachCheckoutSession({
        reservationId: reservation.id,
        stripeCheckoutSessionId,
      });
      const fulfillment = await store.fulfillCheckoutReservation({
        reservationId: reservation.id,
        stripeCheckoutSessionId,
        stripePaymentIntentId: `pi_test_delivery_retry_${suffix}`,
        storageKey: "",
        storageUrl: "",
        qrSecret: `retry-secret-${suffix}`,
      });
      assert.ok(fulfillment);
      return fulfillment.reservation;
    };

    const first = await createPendingDelivery(
      "retry-first@example.com",
      "first",
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createPendingDelivery(
      "retry-second@example.com",
      "second",
    );

    const oldest = await store.listTicketDeliveriesForRetry(1);
    assert.deepEqual(oldest.map((reservation) => reservation.id), [first.id]);

    const firstClaim = await store.claimTicketDelivery({
      reservationId: first.id,
      leaseMs: 200,
    });
    assert.ok(firstClaim);

    const secondClaim = await store.claimTicketDelivery({
      reservationId: second.id,
    });
    assert.ok(secondClaim);
    await store.completeTicketDelivery({
      reservationId: second.id,
      claimToken: secondClaim.claimToken,
      storageKey: `tickets/${secondClaim.ticket.id}.pdf`,
      storageUrl: `/api/tickets/${secondClaim.ticket.id}/download`,
    });

    assert.deepEqual(await store.listTicketDeliveriesForRetry(20), []);

    await new Promise((resolve) => setTimeout(resolve, 220));
    const expiredClaim = await store.listTicketDeliveriesForRetry(20);
    assert.deepEqual(
      expiredClaim.map((reservation) => reservation.id),
      [first.id],
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
