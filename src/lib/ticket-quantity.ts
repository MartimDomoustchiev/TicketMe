export const MAX_TICKETS_PER_ORDER = 10;

export function isValidTicketQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_TICKETS_PER_ORDER
  );
}

export function ticketQuantityOrDefault(value: unknown): number {
  return value === undefined ? 1 : isValidTicketQuantity(value) ? value : 0;
}
