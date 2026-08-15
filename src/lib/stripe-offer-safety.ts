import type Stripe from "stripe";
import type { CheckoutPurchaseSnapshot } from "@/lib/checkout-purchase-snapshot";

type CheckoutOfferSession = Pick<
  Stripe.Checkout.Session,
  "livemode" | "metadata"
>;

type CheckoutOfferSnapshot = Pick<CheckoutPurchaseSnapshot, "offerKind">;

type CheckoutPurchaseSession = Pick<
  Stripe.Checkout.Session,
  "amount_total" | "currency" | "livemode" | "metadata"
>;

type CheckoutPurchaseReservation = {
  eventId: string;
  ticketType: string;
  stripeLivemode?: boolean | null;
  purchaseSnapshot: CheckoutPurchaseSnapshot | null;
};

export function assertStripeCheckoutOfferSafety(
  session: CheckoutOfferSession,
  snapshot: CheckoutOfferSnapshot,
): void {
  const sessionOfferKind = session.metadata?.offerKind;

  if (sessionOfferKind !== snapshot.offerKind) {
    throw new Error("CHECKOUT_OFFER_KIND_MISMATCH");
  }

  if (snapshot.offerKind === "test-simulation" && session.livemode) {
    throw new Error("TEST_SIMULATION_LIVE_PAYMENT");
  }
}

export function assertStripeCheckoutPurchaseSnapshot(
  session: CheckoutPurchaseSession,
  reservation: CheckoutPurchaseReservation,
): CheckoutPurchaseSnapshot {
  const snapshot = reservation.purchaseSnapshot;
  if (!snapshot) {
    throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_MISSING");
  }

  assertStripeCheckoutOfferSafety(session, snapshot);

  if (
    typeof reservation.stripeLivemode === "boolean" &&
    reservation.stripeLivemode !== session.livemode
  ) {
    throw new Error("CHECKOUT_PAYMENT_MODE_MISMATCH");
  }

  if (
    session.metadata?.eventId !== reservation.eventId ||
    session.metadata?.ticketType !== reservation.ticketType
  ) {
    throw new Error("CHECKOUT_METADATA_MISMATCH");
  }

  if (
    session.amount_total !== snapshot.unitAmountMinor ||
    session.currency?.toUpperCase() !== snapshot.currency
  ) {
    throw new Error("CHECKOUT_AMOUNT_MISMATCH");
  }

  return snapshot;
}
