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

const RECONCILIATION_INTERVAL_MS = 30_000;

declare global {
  var __ticketMeStripeReconciliation:
    | Promise<number>
    | undefined;
  var __ticketMeStripeReconciliationAfter: number | undefined;
}

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

export async function maybeReconcileStaleStripeCheckouts(): Promise<number> {
  const now = Date.now();
  if ((globalThis.__ticketMeStripeReconciliationAfter ?? 0) > now) {
    return 0;
  }

  if (globalThis.__ticketMeStripeReconciliation) {
    return globalThis.__ticketMeStripeReconciliation;
  }

  globalThis.__ticketMeStripeReconciliationAfter =
    now + RECONCILIATION_INTERVAL_MS;
  const reconciliation = reconcileStaleStripeCheckouts();
  globalThis.__ticketMeStripeReconciliation = reconciliation;

  try {
    return await reconciliation;
  } finally {
    globalThis.__ticketMeStripeReconciliation = undefined;
  }
}
