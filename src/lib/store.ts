import { EVENT, type TicketTypeId } from "@/lib/event";
import { isDatabaseConfigured } from "@/lib/database";
import * as fileStore from "@/lib/store-file";
import * as postgresStore from "@/lib/store-postgres";
import type {
  AttachCheckoutSessionInput,
  Availability,
  CheckoutFulfillmentResult,
  CheckoutReservation,
  ClaimTicketDeliveryInput,
  CompleteTicketDeliveryInput,
  FulfillCheckoutReservationInput,
  ReleaseTicketDeliveryInput,
  ReserveCheckoutTicketInput,
  PurchaseActivity,
  StoredTicket,
  TicketDeliveryClaim,
  VerificationToken,
} from "@/lib/store-file";

export type {
  AttachCheckoutSessionInput,
  Availability,
  CheckoutPurchaseSnapshot,
  CheckoutFulfillmentResult,
  CheckoutLocale,
  CheckoutReservation,
  CheckoutReservationStatus,
  ClaimTicketDeliveryInput,
  CompleteTicketDeliveryInput,
  FulfillCheckoutReservationInput,
  ReleaseTicketDeliveryInput,
  ReserveCheckoutTicketInput,
  PurchaseActivity,
  StoredTicket,
  TicketDeliveryClaim,
  TicketDeliveryStatus,
  TicketStatus,
  VerificationToken,
} from "@/lib/store-file";

function hasPostgres(): boolean {
  return isDatabaseConfigured();
}

function assertPersistenceConfigured(): void {
  if (process.env.NODE_ENV === "production" && !hasPostgres()) {
    throw new Error(
      "DATABASE_URL is required in production; local JSON persistence is development-only.",
    );
  }
}

export function persistenceMode(): "postgres" | "local-json" {
  return hasPostgres() ? "postgres" : "local-json";
}

export function getAvailability(
  eventId: string = EVENT.id,
): Promise<Availability> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.getAvailability(eventId)
    : fileStore.getAvailability(eventId);
}

export function getPurchaseActivity(
  eventId: string = EVENT.id,
): Promise<PurchaseActivity> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.getPurchaseActivity(eventId)
    : fileStore.getPurchaseActivity(eventId);
}

export function createVerificationToken(input: {
  email: string;
  name: string;
}): Promise<VerificationToken> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.createVerificationToken(input)
    : fileStore.createVerificationToken(input);
}

export function consumeVerificationToken(
  token: string,
): Promise<VerificationToken | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.consumeVerificationToken(token)
    : fileStore.consumeVerificationToken(token);
}

export function issueTicket(input: {
  eventId?: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: TicketTypeId;
  storageKey: string;
  storageUrl: string;
  qrSecret: string;
}): Promise<StoredTicket> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.issueTicket(input)
    : fileStore.issueTicket(input);
}

export function reserveCheckoutTicket(
  input: ReserveCheckoutTicketInput,
): Promise<CheckoutReservation> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.reserveCheckoutTicket(input)
    : fileStore.reserveCheckoutTicket(input);
}

export function attachCheckoutSession(
  input: AttachCheckoutSessionInput,
): Promise<CheckoutReservation> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.attachCheckoutSession(input)
    : fileStore.attachCheckoutSession(input);
}

export function cancelCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.cancelCheckoutReservation(id)
    : fileStore.cancelCheckoutReservation(id);
}

export function expireCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.expireCheckoutReservation(id)
    : fileStore.expireCheckoutReservation(id);
}

export function releaseExpiredCheckoutReservations(
  eventId?: string,
): Promise<number> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.releaseExpiredCheckoutReservations(eventId)
    : fileStore.releaseExpiredCheckoutReservations(eventId);
}

export function getCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.getCheckoutReservation(id)
    : fileStore.getCheckoutReservation(id);
}

export function getCheckoutReservationBySession(
  stripeCheckoutSessionId: string,
): Promise<CheckoutReservation | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.getCheckoutReservationBySession(
        stripeCheckoutSessionId,
      )
    : fileStore.getCheckoutReservationBySession(stripeCheckoutSessionId);
}

export function listCheckoutReservationsForReconciliation(
  limit = 5,
): Promise<CheckoutReservation[]> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.listCheckoutReservationsForReconciliation(limit)
    : fileStore.listCheckoutReservationsForReconciliation(limit);
}

export function listTicketDeliveriesForRetry(
  limit = 5,
): Promise<CheckoutReservation[]> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.listTicketDeliveriesForRetry(limit)
    : fileStore.listTicketDeliveriesForRetry(limit);
}

export function fulfillCheckoutReservation(
  input: FulfillCheckoutReservationInput,
): Promise<CheckoutFulfillmentResult | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.fulfillCheckoutReservation(input)
    : fileStore.fulfillCheckoutReservation(input);
}

export function claimTicketDelivery(
  input: ClaimTicketDeliveryInput,
): Promise<TicketDeliveryClaim | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.claimTicketDelivery(input)
    : fileStore.claimTicketDelivery(input);
}

export function completeTicketDelivery(
  input: CompleteTicketDeliveryInput,
): Promise<CheckoutReservation | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.completeTicketDelivery(input)
    : fileStore.completeTicketDelivery(input);
}

export function releaseTicketDelivery(
  input: ReleaseTicketDeliveryInput,
): Promise<boolean> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.releaseTicketDelivery(input)
    : fileStore.releaseTicketDelivery(input);
}

export function updateTicketStorage(input: {
  id: string;
  storageKey: string;
  storageUrl: string;
}): Promise<StoredTicket | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.updateTicketStorage(input)
    : fileStore.updateTicketStorage(input);
}

export function rollbackIssuedTicket(id: string): Promise<boolean> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.rollbackIssuedTicket(id)
    : fileStore.rollbackIssuedTicket(id);
}

export function getTicket(id: string): Promise<StoredTicket | null> {
  assertPersistenceConfigured();
  return hasPostgres() ? postgresStore.getTicket(id) : fileStore.getTicket(id);
}

export function listTickets(): Promise<StoredTicket[]> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.listTickets()
    : fileStore.listTickets();
}

export function listTicketsByEmail(
  buyerEmail: string,
): Promise<StoredTicket[]> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.listTicketsByEmail(buyerEmail)
    : fileStore.listTicketsByEmail(buyerEmail);
}

export function listTicketsByCheckoutReservation(
  reservationId: string,
): Promise<StoredTicket[]> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.listTicketsByCheckoutReservation(reservationId)
    : fileStore.listTicketsByCheckoutReservation(reservationId);
}

export function markTicketCheckedIn(
  id: string,
  secret: string,
  actor: string,
): Promise<StoredTicket | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.markTicketCheckedIn(id, secret, actor)
    : fileStore.markTicketCheckedIn(id, secret, actor);
}

export const subscribeAvailability = fileStore.subscribeAvailability;
export const emitAvailability = fileStore.emitAvailability;
