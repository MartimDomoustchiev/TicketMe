import type { CheckoutOfferKind } from "@/lib/checkout-purchase-snapshot";
import type { CatalogEvent } from "@/lib/event";
import type { StoredTicket } from "@/lib/store-file";

export type HistoricalTicketView = {
  offerKind: CheckoutOfferKind | null;
  paymentMode: "test" | "live" | null;
  trustedSnapshot: boolean;
  unitAmountMinor: number | null;
  currency: string | null;
  eventName: string;
  eventDate: string;
  venue: string;
  ticketLabel: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
};

export type MoneyTotal = {
  currency: string;
  amountMinor: number;
};

export type AdmissionEventSummary = {
  event: CatalogEvent;
  capacity: number;
  sold: number;
  gross: MoneyTotal[];
};

export type AdminTicketMetrics = {
  admissionTicketCount: number;
  checkedInAdmissionCount: number;
  checkInPercent: number;
  activeEventCount: number;
  activeAdmissionCapacity: number;
  remainingAdmissionCapacity: number;
  admissionGross: MoneyTotal[];
};

/**
 * Returns the immutable offer facts captured at checkout. Snapshot-less rows
 * deliberately expose only the historical fields stored on the ticket and do
 * not infer admission rights, pricing, labels, or source data from today's
 * catalogue.
 */
export function historicalTicketView(
  ticket: StoredTicket,
): HistoricalTicketView {
  const snapshot = ticket.purchaseSnapshot;

  if (!snapshot) {
    return {
      offerKind: null,
      paymentMode: recordedPaymentMode(ticket),
      trustedSnapshot: false,
      unitAmountMinor: null,
      currency: null,
      eventName: ticket.eventName,
      eventDate: ticket.eventDate,
      venue: ticket.venue,
      ticketLabel: null,
      sourceName: null,
      sourceUrl: null,
    };
  }

  return {
    offerKind: snapshot.offerKind,
    paymentMode: recordedPaymentMode(ticket),
    trustedSnapshot: true,
    unitAmountMinor: snapshot.unitAmountMinor,
    currency: snapshot.currency,
    eventName: snapshot.eventName,
    eventDate: snapshot.eventDate,
    venue: snapshot.venue,
    ticketLabel: snapshot.ticketLabel,
    sourceName: snapshot.sourceName,
    sourceUrl: snapshot.sourceUrl,
  };
}

export function isTrustedAdmissionTicket(ticket: StoredTicket): boolean {
  return ticket.purchaseSnapshot?.offerKind === "admission";
}

export function isTestSimulationTicket(ticket: StoredTicket): boolean {
  return ticket.purchaseSnapshot?.offerKind === "test-simulation";
}

export function formatMoneyTotal(
  amountMinor: number,
  currency: string,
  locale: "bg" | "en",
): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "bg-BG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function formatMoneyTotals(
  totals: readonly MoneyTotal[],
  locale: "bg" | "en",
  emptyValue: string,
): string {
  return totals.length
    ? totals
        .map((total) =>
          formatMoneyTotal(total.amountMinor, total.currency, locale),
        )
        .join(" + ")
    : emptyValue;
}

export function buildAdmissionEventSummaries(
  tickets: readonly StoredTicket[],
  events: readonly CatalogEvent[],
  now = new Date(),
): AdmissionEventSummary[] {
  const activeAdmissionEvents = events.filter(
    (event) =>
      event.checkoutMode === "admission" &&
      isUpcoming(event.startsAt, now),
  );

  return activeAdmissionEvents
    .map((event) => {
      const eventTickets = tickets.filter(
        (ticket) =>
          ticket.eventId === event.id && isTrustedAdmissionTicket(ticket),
      );

      return {
        event,
        capacity: event.ticketTypes.reduce(
          (sum, ticketType) => sum + ticketType.capacity,
          0,
        ),
        sold: eventTickets.length,
        gross: sumTicketAmounts(eventTickets),
      };
    })
    .sort(
      (left, right) =>
        right.sold - left.sold ||
        left.event.startsAt.localeCompare(right.event.startsAt),
    );
}

export function buildAdminTicketMetrics(
  tickets: readonly StoredTicket[],
  events: readonly CatalogEvent[],
  now = new Date(),
): AdminTicketMetrics {
  const admissionTickets = tickets.filter(isTrustedAdmissionTicket);
  const checkedInAdmissionCount = admissionTickets.filter(
    (ticket) => ticket.status === "checked_in",
  ).length;
  const activeEvents = events.filter((event) => isUpcoming(event.startsAt, now));
  const admissionSummaries = buildAdmissionEventSummaries(
    admissionTickets,
    events,
    now,
  );
  const activeAdmissionCapacity = admissionSummaries.reduce(
    (sum, summary) => sum + summary.capacity,
    0,
  );
  const activeAdmissionSold = admissionSummaries.reduce(
    (sum, summary) => sum + summary.sold,
    0,
  );

  return {
    admissionTicketCount: admissionTickets.length,
    checkedInAdmissionCount,
    checkInPercent: admissionTickets.length
      ? Math.round((checkedInAdmissionCount / admissionTickets.length) * 100)
      : 0,
    activeEventCount: activeEvents.length,
    activeAdmissionCapacity,
    remainingAdmissionCapacity: Math.max(
      0,
      activeAdmissionCapacity - activeAdmissionSold,
    ),
    admissionGross: sumTicketAmounts(admissionTickets),
  };
}

function isUpcoming(startsAt: string, now: Date): boolean {
  const timestamp = Date.parse(startsAt);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function sumTicketAmounts(
  tickets: readonly StoredTicket[],
): MoneyTotal[] {
  const totals = new Map<string, number>();

  for (const ticket of tickets) {
    const snapshot = ticket.purchaseSnapshot;
    if (
      snapshot?.offerKind !== "admission" ||
      ticket.stripeLivemode !== true
    ) {
      continue;
    }
    totals.set(
      snapshot.currency,
      (totals.get(snapshot.currency) ?? 0) + snapshot.unitAmountMinor,
    );
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

function recordedPaymentMode(
  ticket: StoredTicket,
): "test" | "live" | null {
  return ticket.stripeLivemode === true
    ? "live"
    : ticket.stripeLivemode === false
      ? "test"
      : null;
}
