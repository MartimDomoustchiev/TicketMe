import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PRIMARY_SALE_EVENT } from "../src/lib/event";

test("delivery retries prefer fewer attempts, then oldest-first order", async () => {
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
      assert.ok(reservation.purchaseSnapshot);
      assert.deepEqual(
        fulfillment.ticket.purchaseSnapshot,
        reservation.purchaseSnapshot,
      );
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

    const poisonReservations = [];
    for (let index = 0; index < 20; index += 1) {
      const poison = await createPendingDelivery(
        `retry-poison-${index}@example.com`,
        `poison-${index}`,
      );
      const poisonClaim = await store.claimTicketDelivery({
        reservationId: poison.id,
      });
      assert.ok(poisonClaim);
      assert.equal(
        await store.releaseTicketDelivery({
          reservationId: poison.id,
          claimToken: poisonClaim.claimToken,
        }),
        true,
      );
      poisonReservations.push(poison.id);
    }

    const fresh = await createPendingDelivery(
      "retry-fresh@example.com",
      "fresh",
    );
    const fairBatch = await store.listTicketDeliveriesForRetry(20);
    assert.equal(fairBatch.length, 20);
    assert.equal(fairBatch[0]?.id, fresh.id);
    assert.equal(fairBatch[0]?.deliveryAttempts, 0);
    assert.ok(fairBatch.slice(1).every((item) => item.deliveryAttempts === 1));
    assert.ok(
      poisonReservations.some(
        (reservationId) =>
          !fairBatch.some((candidate) => candidate.id === reservationId),
      ),
      "The retry limit should omit a poison delivery, never the fresh ticket.",
    );
  } finally {
    process.chdir(originalCwd);
    await rm(isolatedCwd, { recursive: true, force: true });
  }
});
