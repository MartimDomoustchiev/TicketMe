import type Stripe from "stripe";
import type { CatalogEvent } from "@/lib/event";

type CheckoutOfferSession = Pick<
  Stripe.Checkout.Session,
  "livemode" | "metadata"
>;

type CheckoutOfferEvent = Pick<CatalogEvent, "checkoutMode">;

export function assertStripeCheckoutOfferSafety(
  session: CheckoutOfferSession,
  event: CheckoutOfferEvent,
): void {
  const expectedOfferKind = event.checkoutMode ?? "source-only";
  const sessionOfferKind = session.metadata?.offerKind;

  if (sessionOfferKind && sessionOfferKind !== expectedOfferKind) {
    throw new Error("CHECKOUT_OFFER_KIND_MISMATCH");
  }

  if (expectedOfferKind === "test-simulation" && session.livemode) {
    throw new Error("TEST_SIMULATION_LIVE_PAYMENT");
  }
}
