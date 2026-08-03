import "server-only";

import { getBaseUrl } from "@/lib/site";
import {
  expireStripeCheckout,
  fulfillStripeCheckoutSession,
} from "@/lib/stripe-fulfillment";
import {
  listCheckoutReservationsForReconciliation,
} from "@/lib/store";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

export async function reconcileStaleStripeCheckouts(
  limit = 3,
): Promise<number> {
  if (!isStripeConfigured()) {
    return 0;
  }

  const reservations =
    await listCheckoutReservationsForReconciliation(limit);
  const stripe = getStripeClient();
  let reconciled = 0;

  for (const reservation of reservations) {
    const sessionId = reservation.stripeCheckoutSessionId;
    if (!sessionId) {
      continue;
    }

    try {
      let checkoutSession =
        await stripe.checkout.sessions.retrieve(sessionId);

      if (
        checkoutSession.status === "complete" &&
        checkoutSession.payment_status === "paid"
      ) {
        await fulfillStripeCheckoutSession(sessionId, getBaseUrl());
        reconciled += 1;
        continue;
      }

      if (
        checkoutSession.status === "open" &&
        checkoutSession.expires_at <= Math.floor(Date.now() / 1000)
      ) {
        checkoutSession =
          await stripe.checkout.sessions.expire(sessionId);
      }

      if (checkoutSession.status === "expired") {
        await expireStripeCheckout(checkoutSession);
        reconciled += 1;
      }
    } catch (error) {
      console.error(
        `Stripe Checkout reconciliation failed for ${reservation.id}.`,
        error,
      );
    }
  }

  return reconciled;
}
