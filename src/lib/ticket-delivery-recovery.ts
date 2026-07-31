import "server-only";

import { deliverCheckoutTicket } from "@/lib/stripe-fulfillment";
import { reconcileStaleStripeCheckouts } from "@/lib/stripe-reconciliation";
import { listTicketDeliveriesForRetry } from "@/lib/store";

export type TicketDeliveryRecoveryResult = {
  stripeReconciled: number;
  candidates: number;
  delivered: number;
  inProgress: number;
  failed: number;
};

export async function recoverTicketDeliveries(input: {
  baseUrl: string;
  limit?: number;
  reconcileStripe?: boolean;
}): Promise<TicketDeliveryRecoveryResult> {
  const stripeReconciled = input.reconcileStripe === false
    ? 0
    : await reconcileStaleStripeCheckouts(input.limit ?? 5);
  const candidates = await listTicketDeliveriesForRetry(input.limit ?? 5);
  let delivered = 0;
  let inProgress = 0;
  let failed = 0;

  for (const reservation of candidates) {
    try {
      const result = await deliverCheckoutTicket(reservation.id, input.baseUrl);
      if (result.delivered) {
        delivered += 1;
      } else if (result.inProgress) {
        inProgress += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        `Ticket delivery recovery failed for ${reservation.id}.`,
        error,
      );
    }
  }

  return {
    stripeReconciled,
    candidates: candidates.length,
    delivered,
    inProgress,
    failed,
  };
}
