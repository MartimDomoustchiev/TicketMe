import "server-only";

import { randomBytes } from "crypto";
import type Stripe from "stripe";
import { sendTicketEmail } from "@/lib/email";
import { getEventById } from "@/lib/event";
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
  releaseTicketDelivery,
  updateTicketStorage,
  type CheckoutFulfillmentResult,
  type StoredTicket,
} from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import { readTicketPdf, storeTicketPdf } from "@/lib/storage";

export type CheckoutDeliveryResult = {
  ticket: StoredTicket;
  delivered: boolean;
  inProgress: boolean;
};

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
      });
    }
  }

  if (!reservation || reservation.id !== reservationId) {
    throw new Error("CHECKOUT_RESERVATION_NOT_FOUND");
  }

  const event = getEventById(reservation.eventId);
  const ticketType = event?.ticketTypes.find(
    (candidate) => candidate.id === reservation.ticketType,
  );

  if (!event || !ticketType) {
    throw new Error("CHECKOUT_EVENT_NOT_FOUND");
  }

  if (
    (session.metadata?.eventId &&
      session.metadata.eventId !== reservation.eventId) ||
    (session.metadata?.ticketType &&
      session.metadata.ticketType !== reservation.ticketType)
  ) {
    throw new Error("CHECKOUT_METADATA_MISMATCH");
  }

  const expectedAmount = Math.round(ticketType.price * 100);
  if (
    event.currency !== ticketType.currency ||
    session.amount_total !== expectedAmount ||
    session.currency?.toLowerCase() !== ticketType.currency.toLowerCase()
  ) {
    throw new Error("CHECKOUT_AMOUNT_MISMATCH");
  }

  const result = await fulfillCheckoutReservation({
    reservationId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    storageKey: "",
    storageUrl: "",
    qrSecret: randomBytes(18).toString("base64url"),
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
    const ticket = reservation?.ticketId
      ? await getTicket(reservation.ticketId)
      : null;

    if (!reservation || !ticket) {
      throw new Error("CHECKOUT_TICKET_NOT_FOUND");
    }

    return {
      ticket,
      delivered: reservation.deliveryStatus === "completed",
      inProgress: reservation.deliveryStatus === "processing",
    };
  }

  try {
    const verificationUrl = `${baseUrl}/api/tickets/${claim.ticket.id}/verify?secret=${claim.ticket.qrSecret}`;
    let pdf =
      claim.ticket.storageKey &&
      (await readTicketPdf({
        id: claim.ticket.id,
        storageKey: claim.ticket.storageKey,
      }));

    if (!pdf) {
      pdf = await createTicketPdf({
        ticket: claim.ticket,
        verificationUrl,
        locale: claim.reservation.locale,
      });
    }

    let storage = {
      storageKey: claim.ticket.storageKey,
      storageUrl: claim.ticket.storageUrl,
    };

    if (!storage.storageKey || !storage.storageUrl) {
      storage = await storeTicketPdf({
        id: claim.ticket.id,
        pdf,
        baseUrl,
      });
      const updated = await updateTicketStorage({
        id: claim.ticket.id,
        ...storage,
      });
      if (!updated) {
        throw new Error("TICKET_STORAGE_METADATA_FAILED");
      }
    }

    await sendTicketEmail({
      to: claim.ticket.buyerEmail,
      name: claim.ticket.buyerName,
      ticketId: claim.ticket.id,
      eventName: claim.ticket.eventName,
      downloadUrl: storage.storageUrl,
      pdf,
      locale: claim.reservation.locale,
    });

    const completed = await completeTicketDelivery({
      reservationId: claim.reservation.id,
      claimToken: claim.claimToken,
      ...storage,
    });
    if (!completed) {
      throw new Error("TICKET_DELIVERY_COMPLETION_FAILED");
    }

    const deliveredTicket = await getTicket(claim.ticket.id);
    if (!deliveredTicket) {
      throw new Error("CHECKOUT_TICKET_NOT_FOUND");
    }

    return {
      ticket: deliveredTicket,
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

  await expireCheckoutReservation(reservation.id);
}
