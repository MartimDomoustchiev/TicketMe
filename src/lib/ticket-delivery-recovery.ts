import "server-only";

import { deliverCheckoutTicket } from "@/lib/stripe-fulfillment";
import { reconcileStaleStripeCheckouts } from "@/lib/stripe-reconciliation";
import { listTicketDeliveriesForRetry } from "@/lib/store";

const DEFAULT_DELIVERY_BATCH_SIZE = 5;
const MAX_DELIVERY_BATCH_SIZE = 5;
const MAX_DELIVERY_SCAN_SIZE = 20;
const DELIVERY_SCAN_MULTIPLIER = 4;

type DeliveryCandidate = Awaited<
  ReturnType<typeof listTicketDeliveriesForRetry>
>[number];

type TicketDeliveryRecoveryDependencies = {
  deliverCheckoutTicket: typeof deliverCheckoutTicket;
  listTicketDeliveriesForRetry: typeof listTicketDeliveriesForRetry;
  reconcileStaleStripeCheckouts: typeof reconcileStaleStripeCheckouts;
};

const DEFAULT_DEPENDENCIES: TicketDeliveryRecoveryDependencies = {
  deliverCheckoutTicket,
  listTicketDeliveriesForRetry,
  reconcileStaleStripeCheckouts,
};

export type TicketDeliveryRecoveryResult = {
  stripeReconciled: number;
  scanned: number;
  candidates: number;
  deferred: number;
  delivered: number;
  inProgress: number;
  failed: number;
};

export function normalizeTicketDeliveryBatchSize(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_DELIVERY_BATCH_SIZE;
  }

  return Math.max(1, Math.min(MAX_DELIVERY_BATCH_SIZE, Math.floor(limit)));
}

export function selectTicketDeliveryCandidates(
  candidates: readonly DeliveryCandidate[],
  limit: number,
): DeliveryCandidate[] {
  const batchSize = normalizeTicketDeliveryBatchSize(limit);

  // The store returns an oldest-first window. Within that bounded window,
  // prefer records with fewer failed attempts so a permanently failing oldest
  // delivery cannot monopolize every scheduled batch.
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        left.candidate.deliveryAttempts - right.candidate.deliveryAttempts ||
        left.index - right.index,
    )
    .slice(0, batchSize)
    .map(({ candidate }) => candidate);
}

export async function recoverTicketDeliveries(
  input: {
    baseUrl: string;
    limit?: number;
    reconcileStripe?: boolean;
  },
  dependencies: TicketDeliveryRecoveryDependencies = DEFAULT_DEPENDENCIES,
): Promise<TicketDeliveryRecoveryResult> {
  const batchSize = normalizeTicketDeliveryBatchSize(input.limit);
  const scanSize = Math.min(
    MAX_DELIVERY_SCAN_SIZE,
    batchSize * DELIVERY_SCAN_MULTIPLIER,
  );
  const stripeReconciled =
    input.reconcileStripe === false
      ? 0
      : await dependencies.reconcileStaleStripeCheckouts(batchSize);
  const scannedCandidates = await dependencies.listTicketDeliveriesForRetry(
    scanSize,
  );
  const candidates = selectTicketDeliveryCandidates(
    scannedCandidates,
    batchSize,
  );
  const outcomes = await Promise.all(
    candidates.map(async (reservation) => {
      try {
        const result = await dependencies.deliverCheckoutTicket(
          reservation.id,
          input.baseUrl,
        );
        if (result.delivered) {
          return "delivered" as const;
        }
        if (result.inProgress) {
          return "in-progress" as const;
        }
        return "deferred" as const;
      } catch (error) {
        console.error(
          `Ticket delivery recovery failed for ${reservation.id}.`,
          error,
        );
        return "failed" as const;
      }
    }),
  );
  const delivered = outcomes.filter((outcome) => outcome === "delivered").length;
  const inProgress = outcomes.filter(
    (outcome) => outcome === "in-progress",
  ).length;
  const failed = outcomes.filter((outcome) => outcome === "failed").length;
  const deferred =
    scannedCandidates.length - candidates.length +
    outcomes.filter((outcome) => outcome === "deferred").length;

  return {
    stripeReconciled,
    scanned: scannedCandidates.length,
    candidates: candidates.length,
    deferred,
    delivered,
    inProgress,
    failed,
  };
}
