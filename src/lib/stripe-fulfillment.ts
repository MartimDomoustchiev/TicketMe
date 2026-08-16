import "server-only";

import { randomBytes } from "crypto";
import type Stripe from "stripe";
import { checkoutPurchaseSnapshotsEqual } from "@/lib/checkout-purchase-snapshot";
import { sendTicketEmail } from "@/lib/email";
import { createTicketPdf } from "@/lib/pdf";
import {
  attachCheckoutSession,
  claimTicketDelivery,
  completeTicketDelivery,
  expireCheckoutReservation,
  fulfillCheckoutReservation,
  getCheckoutReservation,
  getCheckoutReservationBySession,
  getTicket,
  listTicketsByCheckoutReservation,
  releaseTicketDelivery,
  updateTicketStorage,
  type CheckoutFulfillmentResult,
  type StoredTicket,
} from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import { assertStripeCheckoutPurchaseSnapshot } from "@/lib/stripe-offer-safety";
import { readTicketPdf, storeTicketPdf } from "@/lib/storage";
import { invalidatePublicTicketingCache } from "@/lib/ticketing-cache";

export type CheckoutDeliveryResult = {
  ticket: StoredTicket;
  tickets: StoredTicket[];
  delivered: boolean;
  inProgress: boolean;
};

const TICKET_DELIVERY_CONCURRENCY = 3;

export async function runTicketDeliveryBatch<Item, Result>(
  items: readonly Item[],
  deliver: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await deliver(items[index], index);
      } catch (error) {
        failed = true;
        firstError = error;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(TICKET_DELIVERY_CONCURRENCY, items.length) },
      () => worker(),
    ),
  );

  if (failed) {
    throw firstError;
  }
  return results;
}

export function shouldStoreTicketPdf(input: {
  storedPdfFound: boolean;
  storageKey: string;
  storageUrl: string;
}): boolean {
  return (
    !input.storedPdfFound || !input.storageKey.trim() || !input.storageUrl.trim()
  );
}

function checkoutReservationId(session: Stripe.Checkout.Session): string {
  const clientReferenceId = session.client_reference_id;
  const metadataId = session.metadata?.reservationId;

  if (
    clientReferenceId &&
    metadataId &&
    clientReferenceId !== metadataId
  ) {
    throw new Error("CHECKOUT_REFERENCE_MISMATCH");
  }

  const reservationId = clientReferenceId || metadataId;
  if (!reservationId) {
    throw new Error("CHECKOUT_REFERENCE_MISSING");
  }

  return reservationId;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id;
}

function assertPaidSession(session: Stripe.Checkout.Session): void {
  if (
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid"
  ) {
    throw new Error("CHECKOUT_NOT_PAID");
  }
}

export async function recordPaidCheckout(
  session: Stripe.Checkout.Session,
): Promise<CheckoutFulfillmentResult> {
  assertPaidSession(session);

  const reservationId = checkoutReservationId(session);
  let reservation = await getCheckoutReservationBySession(session.id);

  // Close the small crash window between Stripe creating a Session and the
  // checkout route persisting its ID. A signed webhook or server-side Stripe
  // retrieval is trusted to complete that linkage idempotently.
  if (!reservation) {
    const unattached = await getCheckoutReservation(reservationId);
    if (unattached && !unattached.stripeCheckoutSessionId) {
      reservation = await attachCheckoutSession({
        reservationId,
        stripeCheckoutSessionId: session.id,
        stripeLivemode: session.livemode,
      });
    }
  }

  // Reservations attached before migration 009 have a trusted Session ID but
  // no persisted mode. Backfill from the signed/retrieved Stripe object before
  // fulfillment so the issued ticket never inherits deployment-time config.
  if (
    reservation &&
    typeof reservation.stripeLivemode !== "boolean" &&
    (reservation.status === "reserved" ||
      reservation.status === "checkout_created")
  ) {
    reservation = await attachCheckoutSession({
      reservationId,
      stripeCheckoutSessionId: session.id,
      stripeLivemode: session.livemode,
    });
  }

  if (!reservation || reservation.id !== reservationId) {
    throw new Error("CHECKOUT_RESERVATION_NOT_FOUND");
  }

  assertStripeCheckoutPurchaseSnapshot(session, reservation);

  const qrSecrets = Array.from({ length: reservation.quantity }, () =>
    randomBytes(18).toString("base64url"),
  );

  const result = await fulfillCheckoutReservation({
    reservationId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    storageKey: "",
    storageUrl: "",
    qrSecret: qrSecrets[0],
    qrSecrets,
  });

  if (!result) {
    throw new Error("CHECKOUT_RESERVATION_NOT_ACTIVE");
  }

  return result;
}

export async function deliverCheckoutTicket(
  reservationId: string,
  baseUrl: string,
): Promise<CheckoutDeliveryResult> {
  const claim = await claimTicketDelivery({
    reservationId,
    leaseMs: 2 * 60_000,
  });

  if (!claim) {
    const reservation = await getCheckoutReservation(reservationId);
    const tickets = reservation
      ? await listTicketsByCheckoutReservation(reservation.id)
      : [];
    const ticket = tickets[0] ??
      (reservation?.ticketId ? await getTicket(reservation.ticketId) : null);

    if (!reservation || !ticket) {
      throw new Error("CHECKOUT_TICKET_NOT_FOUND");
    }
    const resolvedTickets = tickets.length > 0 ? tickets : [ticket];
    if (resolvedTickets.length !== reservation.quantity) {
      throw new Error("CHECKOUT_TICKET_QUANTITY_MISMATCH");
    }

    return {
      ticket,
      tickets: resolvedTickets,
      delivered: reservation.deliveryStatus === "completed",
      inProgress: reservation.deliveryStatus === "processing",
    };
  }

  try {
    const purchaseSnapshot = claim.reservation.purchaseSnapshot;
    if (!purchaseSnapshot) {
      throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_MISSING");
    }
    const ticketPresentation = {
      offerKind: purchaseSnapshot.offerKind,
      sourceName: purchaseSnapshot.sourceName,
      sourceUrl: purchaseSnapshot.sourceUrl,
      ticketLabel: purchaseSnapshot.ticketLabel,
      unitAmountMinor: purchaseSnapshot.unitAmountMinor,
      currency: purchaseSnapshot.currency,
    };
    if (claim.tickets.length !== claim.reservation.quantity) {
      throw new Error("CHECKOUT_TICKET_QUANTITY_MISMATCH");
    }

    const deliveredTickets = await runTicketDeliveryBatch(
      claim.tickets,
      async (claimedTicket) => {
        const ticketSnapshot = claimedTicket.purchaseSnapshot;
        if (!ticketSnapshot) {
          throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_MISSING");
        }
        if (
          !checkoutPurchaseSnapshotsEqual(purchaseSnapshot, ticketSnapshot)
        ) {
          throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_MISMATCH");
        }

        const presentationTicket = {
          ...claimedTicket,
          eventName: purchaseSnapshot.eventName,
          eventDate: purchaseSnapshot.eventDate,
          venue: purchaseSnapshot.venue,
        };
        const verificationUrl = `${baseUrl}/api/tickets/${claimedTicket.id}/verify?secret=${claimedTicket.qrSecret}`;
        let pdf =
          claimedTicket.storageKey &&
          (await readTicketPdf({
            id: claimedTicket.id,
            storageKey: claimedTicket.storageKey,
          }));
        const storedPdfFound = Boolean(pdf);

        if (!pdf) {
          pdf = await createTicketPdf({
            ticket: presentationTicket,
            verificationUrl,
            locale: claim.reservation.locale,
            ...ticketPresentation,
          });
        }

        let storage = {
          storageKey: claimedTicket.storageKey,
          storageUrl: claimedTicket.storageUrl,
        };

        if (
          shouldStoreTicketPdf({
            storedPdfFound,
            ...storage,
          })
        ) {
          storage = await storeTicketPdf({
            id: claimedTicket.id,
            pdf,
            baseUrl,
          });
          const updated = await updateTicketStorage({
            id: claimedTicket.id,
            ...storage,
          });
          if (!updated) {
            throw new Error("TICKET_STORAGE_METADATA_FAILED");
          }
        }

        await sendTicketEmail({
          to: claimedTicket.buyerEmail,
          name: claimedTicket.buyerName,
          ticketId: claimedTicket.id,
          eventName: purchaseSnapshot.eventName,
          downloadUrl: storage.storageUrl,
          pdf,
          locale: claim.reservation.locale,
          ...ticketPresentation,
        });

        const deliveredTicket = await getTicket(claimedTicket.id);
        if (!deliveredTicket) {
          throw new Error("CHECKOUT_TICKET_NOT_FOUND");
        }
        return deliveredTicket;
      },
    );

    const completed = await completeTicketDelivery({
      reservationId: claim.reservation.id,
      claimToken: claim.claimToken,
    });
    if (!completed) {
      throw new Error("TICKET_DELIVERY_COMPLETION_FAILED");
    }

    return {
      ticket: deliveredTickets[0],
      tickets: deliveredTickets,
      delivered: true,
      inProgress: false,
    };
  } catch (error) {
    await releaseTicketDelivery({
      reservationId: claim.reservation.id,
      claimToken: claim.claimToken,
    }).catch(() => undefined);
    throw error;
  }
}

export async function fulfillStripeCheckoutSession(
  sessionId: string,
  baseUrl: string,
): Promise<CheckoutDeliveryResult> {
  if (
    (!sessionId.startsWith("cs_test_") &&
      !sessionId.startsWith("cs_live_")) ||
    sessionId.length > 255
  ) {
    throw new Error("INVALID_CHECKOUT_SESSION_ID");
  }

  const session = await getStripeClient().checkout.sessions.retrieve(
    sessionId,
  );
  const recorded = await recordPaidCheckout(session);
  return deliverCheckoutTicket(recorded.reservation.id, baseUrl);
}

export async function expireStripeCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const reservationId = checkoutReservationId(session);
  const reservation = await getCheckoutReservationBySession(session.id);

  if (!reservation || reservation.id !== reservationId) {
    return;
  }

  const expired = await expireCheckoutReservation(reservation.id);
  if (expired?.status === "expired") {
    invalidatePublicTicketingCache();
  }
}
