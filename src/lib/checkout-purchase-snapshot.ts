import type { CatalogEvent, TicketType } from "@/lib/event";

export type CheckoutOfferKind = "admission" | "test-simulation";

export type CheckoutPurchaseSnapshot = {
  offerKind: CheckoutOfferKind;
  unitAmountMinor: number;
  currency: string;
  eventName: string;
  eventDate: string;
  venue: string;
  ticketLabel: string;
  sourceName: string;
  sourceUrl: string;
};

const MAX_AMOUNT_MINOR = 99_999_999;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanSourceUrl(value: unknown): string | null {
  const normalized = cleanText(value, 2_048);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeCheckoutPurchaseSnapshot(
  value: unknown,
): CheckoutPurchaseSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CheckoutPurchaseSnapshot>;
  const offerKind =
    candidate.offerKind === "admission" ||
    candidate.offerKind === "test-simulation"
      ? candidate.offerKind
      : null;
  const currency = cleanText(candidate.currency, 3)?.toUpperCase() ?? null;
  const eventName = cleanText(candidate.eventName, 300);
  const eventDate = cleanText(candidate.eventDate, 200);
  const venue = cleanText(candidate.venue, 300);
  const ticketLabel = cleanText(candidate.ticketLabel, 200);
  const sourceName = cleanText(candidate.sourceName, 200);
  const sourceUrl = cleanSourceUrl(candidate.sourceUrl);
  const unitAmountMinor = candidate.unitAmountMinor;

  if (
    !offerKind ||
    !Number.isSafeInteger(unitAmountMinor) ||
    (unitAmountMinor as number) < 0 ||
    (unitAmountMinor as number) > MAX_AMOUNT_MINOR ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency) ||
    !eventName ||
    !eventDate ||
    !venue ||
    !ticketLabel ||
    !sourceName ||
    !sourceUrl
  ) {
    return null;
  }

  return {
    offerKind,
    unitAmountMinor: unitAmountMinor as number,
    currency,
    eventName,
    eventDate,
    venue,
    ticketLabel,
    sourceName,
    sourceUrl,
  };
}

export function createCheckoutPurchaseSnapshot(
  event: CatalogEvent,
  ticketType: TicketType,
): CheckoutPurchaseSnapshot {
  const snapshot = normalizeCheckoutPurchaseSnapshot({
    offerKind: event.checkoutMode,
    unitAmountMinor: Math.round(ticketType.price * 100),
    currency: ticketType.currency,
    eventName: event.name,
    eventDate: `${event.date}, ${event.time}`,
    venue: event.venue,
    ticketLabel: ticketType.label,
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl,
  });

  if (!snapshot || event.currency !== ticketType.currency) {
    throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_INVALID");
  }

  return snapshot;
}

export function checkoutPurchaseSnapshotsEqual(
  left: CheckoutPurchaseSnapshot,
  right: CheckoutPurchaseSnapshot,
): boolean {
  return (
    left.offerKind === right.offerKind &&
    left.unitAmountMinor === right.unitAmountMinor &&
    left.currency === right.currency &&
    left.eventName === right.eventName &&
    left.eventDate === right.eventDate &&
    left.venue === right.venue &&
    left.ticketLabel === right.ticketLabel &&
    left.sourceName === right.sourceName &&
    left.sourceUrl === right.sourceUrl
  );
}

export function isAdmissionPurchaseSnapshot(
  snapshot: CheckoutPurchaseSnapshot | null | undefined,
): boolean {
  return snapshot?.offerKind === "admission";
}
