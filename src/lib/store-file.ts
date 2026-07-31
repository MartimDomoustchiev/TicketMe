import { randomBytes } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  EVENT,
  getEventById,
  getTicketType,
  type TicketTypeId,
} from "@/lib/event";

export type TicketStatus = "issued" | "checked_in";

export type CheckoutLocale = "bg" | "en";
export type CheckoutReservationStatus =
  | "reserved"
  | "checkout_created"
  | "fulfilled"
  | "cancelled"
  | "expired";
export type TicketDeliveryStatus = "pending" | "processing" | "completed";

export type StoredTicket = {
  id: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: TicketTypeId;
  seatLabel: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  venue: string;
  issuedAt: string;
  storageKey: string;
  storageUrl: string;
  qrSecret: string;
  status: TicketStatus;
  checkoutReservationId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
};

export type CheckoutReservation = {
  id: string;
  eventId: string;
  ticketType: TicketTypeId;
  buyerName: string;
  buyerEmail: string;
  locale: CheckoutLocale;
  status: CheckoutReservationStatus;
  createdAt: string;
  expiresAt: string;
  releasedAt: string | null;
  fulfilledAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  ticketId: string | null;
  deliveryStatus: TicketDeliveryStatus | null;
  deliveryAttempts: number;
  deliveryLeaseExpiresAt: string | null;
  deliveredAt: string | null;
};

type StoredCheckoutReservation = CheckoutReservation & {
  deliveryLeaseToken: string | null;
};

export type CheckoutFulfillmentResult = {
  reservation: CheckoutReservation;
  ticket: StoredTicket;
  created: boolean;
};

export type TicketDeliveryClaim = {
  reservation: CheckoutReservation;
  ticket: StoredTicket;
  claimToken: string;
  leaseExpiresAt: string;
};

export type ReserveCheckoutTicketInput = {
  eventId?: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: TicketTypeId;
  locale?: CheckoutLocale;
  expiresInMs?: number;
};

export type AttachCheckoutSessionInput = {
  reservationId: string;
  stripeCheckoutSessionId: string;
};

export type FulfillCheckoutReservationInput = {
  reservationId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  storageKey: string;
  storageUrl: string;
  qrSecret: string;
};

export type ClaimTicketDeliveryInput = {
  reservationId?: string;
  ticketId?: string;
  leaseMs?: number;
};

export type CompleteTicketDeliveryInput = {
  reservationId: string;
  claimToken: string;
  storageKey?: string;
  storageUrl?: string;
};

export type ReleaseTicketDeliveryInput = {
  reservationId: string;
  claimToken: string;
};

export type VerificationToken = {
  token: string;
  email: string;
  name: string;
  expiresAt: string;
};

export type Availability = {
  totalCapacity: number;
  totalRemaining: number;
  byType: Record<TicketTypeId, number>;
  sold: number;
};

export type PurchaseActivity = {
  queueDepth: number;
  activeCheckouts: number;
};

type EventInventory = Partial<Record<TicketTypeId, number>>;

type DbState = {
  version: 3;
  inventory: Record<string, EventInventory>;
  verificationTokens: Record<string, VerificationToken>;
  tickets: Record<string, StoredTicket>;
  checkoutReservations: Record<string, StoredCheckoutReservation>;
  auditLog: Array<{
    id: string;
    at: string;
    action: string;
    actor: string;
    details: string;
  }>;
};

type LegacyDbState = Partial<
  Omit<DbState, "version" | "inventory" | "checkoutReservations">
> & {
  version?: number;
  inventory?: Record<string, EventInventory>;
  remaining?: EventInventory;
  checkoutReservations?: Record<
    string,
    Partial<StoredCheckoutReservation> & Pick<CheckoutReservation, "id">
  >;
};

const dataDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dataDir, "db.json");
const DEFAULT_RESERVATION_LIFETIME_MS = 30 * 60_000;
const DEFAULT_DELIVERY_LEASE_MS = 5 * 60_000;

function requireEvent(eventId: string) {
  const event = getEventById(eventId);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
  return event;
}

function initialRemaining(eventId: string): Record<TicketTypeId, number> {
  const event = requireEvent(eventId);
  return Object.fromEntries(
    event.ticketTypes.map((type) => [type.id, type.capacity]),
  ) as Record<TicketTypeId, number>;
}

function initialState(): DbState {
  return {
    version: 3,
    inventory: {
      [EVENT.id]: initialRemaining(EVENT.id),
    },
    verificationTokens: {},
    tickets: {},
    checkoutReservations: {},
    auditLog: [],
  };
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

function normalizeReservation(
  reservation: Partial<StoredCheckoutReservation> &
    Pick<CheckoutReservation, "id">,
): StoredCheckoutReservation | null {
  if (
    !reservation.eventId ||
    !reservation.ticketType ||
    !reservation.buyerName ||
    !reservation.buyerEmail ||
    !reservation.createdAt ||
    !reservation.expiresAt
  ) {
    return null;
  }

  const status: CheckoutReservationStatus = [
    "reserved",
    "checkout_created",
    "fulfilled",
    "cancelled",
    "expired",
  ].includes(String(reservation.status))
    ? (reservation.status as CheckoutReservationStatus)
    : "reserved";
  const deliveryStatus: TicketDeliveryStatus | null = [
    "pending",
    "processing",
    "completed",
  ].includes(String(reservation.deliveryStatus))
    ? (reservation.deliveryStatus as TicketDeliveryStatus)
    : status === "fulfilled"
      ? "pending"
      : null;

  return {
    id: reservation.id,
    eventId: reservation.eventId,
    ticketType: reservation.ticketType,
    buyerName: reservation.buyerName,
    buyerEmail: reservation.buyerEmail.toLowerCase(),
    locale: reservation.locale === "en" ? "en" : "bg",
    status,
    createdAt: reservation.createdAt,
    expiresAt: reservation.expiresAt,
    releasedAt: reservation.releasedAt ?? null,
    fulfilledAt: reservation.fulfilledAt ?? null,
    stripeCheckoutSessionId: reservation.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: reservation.stripePaymentIntentId ?? null,
    ticketId: reservation.ticketId ?? null,
    deliveryStatus,
    deliveryAttempts: Math.max(
      0,
      Math.floor(reservation.deliveryAttempts ?? 0),
    ),
    deliveryLeaseToken: reservation.deliveryLeaseToken ?? null,
    deliveryLeaseExpiresAt: reservation.deliveryLeaseExpiresAt ?? null,
    deliveredAt: reservation.deliveredAt ?? null,
  };
}

function normalizeState(state: LegacyDbState): DbState {
  const inventory: Record<string, EventInventory> = {
    ...(state.inventory ?? {}),
  };

  // Version 1 stored a single global inventory. Existing tickets let us infer
  // which event owned it; otherwise it is the current featured event. Keeping
  // an old event bucket intact avoids accidentally applying historic sales to
  // a newly configured featured event.
  if (state.remaining) {
    const ticketEventIds = new Set(
      Object.values(state.tickets ?? {})
        .map((ticket) => ticket.eventId)
        .filter(Boolean),
    );
    const legacyEventId =
      ticketEventIds.size === 1 ? [...ticketEventIds][0] : EVENT.id;
    inventory[legacyEventId] ??= { ...state.remaining };
  }

  const featuredRemaining = initialRemaining(EVENT.id);
  const storedFeatured = inventory[EVENT.id] ?? {};
  for (const type of EVENT.ticketTypes) {
    const stored = storedFeatured[type.id];
    featuredRemaining[type.id] =
      typeof stored === "number" && Number.isFinite(stored)
        ? Math.max(0, Math.min(type.capacity, Math.floor(stored)))
        : type.capacity;
  }
  inventory[EVENT.id] = featuredRemaining;

  const checkoutReservations = Object.fromEntries(
    Object.values(state.checkoutReservations ?? {})
      .map(normalizeReservation)
      .filter(
        (reservation): reservation is StoredCheckoutReservation =>
          reservation !== null,
      )
      .map((reservation) => [reservation.id, reservation]),
  );

  return {
    version: 3,
    inventory,
    verificationTokens: state.verificationTokens ?? {},
    tickets: state.tickets ?? {},
    checkoutReservations,
    auditLog: state.auditLog ?? [],
  };
}

async function readState(): Promise<DbState> {
  await ensureDataDir();

  try {
    const raw = await readFile(dbPath, "utf8");
    return normalizeState(JSON.parse(raw) as LegacyDbState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const state = initialState();
      await writeState(state);
      return state;
    }
    throw error;
  }
}

async function writeState(state: DbState): Promise<void> {
  await ensureDataDir();
  const tempPath = `${dbPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2));
  await rename(tempPath, dbPath);
}

type StoreLock = {
  tail: Promise<void>;
};

declare global {
  var __ticketForgeStoreLock: StoreLock | undefined;
}

function storeLock(): StoreLock {
  globalThis.__ticketForgeStoreLock ??= {
    tail: Promise.resolve(),
  };
  return globalThis.__ticketForgeStoreLock;
}

async function withStoreMutation<T>(
  mutator: (state: DbState) => Promise<T> | T,
): Promise<T> {
  const lock = storeLock();
  const previous = lock.tail;

  let release!: () => void;
  lock.tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const state = await readState();
    const result = await mutator(state);
    await writeState(state);
    return result;
  } finally {
    release();
  }
}

function eventInventory(
  state: DbState,
  eventId: string,
): Record<TicketTypeId, number> {
  const event = requireEvent(eventId);
  const initial = initialRemaining(eventId);
  const stored = state.inventory[eventId];

  if (!stored) {
    state.inventory[eventId] = initial;
    return initial;
  }

  for (const type of event.ticketTypes) {
    const remaining = stored[type.id];
    initial[type.id] =
      typeof remaining === "number" && Number.isFinite(remaining)
        ? Math.max(0, Math.min(type.capacity, Math.floor(remaining)))
        : type.capacity;
  }

  state.inventory[eventId] = initial;
  return initial;
}

function publicReservation(
  reservation: StoredCheckoutReservation,
): CheckoutReservation {
  const { deliveryLeaseToken: _deliveryLeaseToken, ...publicFields } =
    reservation;
  void _deliveryLeaseToken;
  return { ...publicFields };
}

function isActiveReservation(
  reservation: StoredCheckoutReservation,
): boolean {
  return (
    reservation.status === "reserved" ||
    reservation.status === "checkout_created"
  );
}

function releaseReservationInventory(
  state: DbState,
  reservation: StoredCheckoutReservation,
  status: "cancelled" | "expired",
  at: string,
): boolean {
  if (!isActiveReservation(reservation)) {
    return false;
  }

  const event = getEventById(reservation.eventId);
  const ticketType = event?.ticketTypes.find(
    (type) => type.id === reservation.ticketType,
  );
  if (event && ticketType) {
    const remainingByType = eventInventory(state, event.id);
    remainingByType[reservation.ticketType] = Math.min(
      ticketType.capacity,
      (remainingByType[reservation.ticketType] ?? 0) + 1,
    );
  }

  reservation.status = status;
  reservation.releasedAt = at;
  reservation.deliveryStatus = null;
  reservation.deliveryLeaseToken = null;
  reservation.deliveryLeaseExpiresAt = null;
  state.auditLog.push({
    id: randomBytes(10).toString("hex"),
    at,
    action: `checkout_reservation_${status}`,
    actor: reservation.buyerEmail,
    details: reservation.id,
  });
  return true;
}

function releaseExpiredInState(
  state: DbState,
  eventId?: string,
): { count: number; eventIds: Set<string> } {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const eventIds = new Set<string>();
  let count = 0;

  for (const reservation of Object.values(state.checkoutReservations)) {
    if (
      (!eventId || reservation.eventId === eventId) &&
      reservation.status === "reserved" &&
      Date.parse(reservation.expiresAt) <= now &&
      releaseReservationInventory(state, reservation, "expired", at)
    ) {
      count += 1;
      eventIds.add(reservation.eventId);
    }
  }

  return { count, eventIds };
}

function availabilityFromState(state: DbState, eventId: string): Availability {
  const event = requireEvent(eventId);
  const remaining = eventInventory(state, event.id);
  const totalRemaining = Object.values(remaining).reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalCapacity = event.ticketTypes.reduce(
    (sum, type) => sum + type.capacity,
    0,
  );

  return {
    totalCapacity,
    totalRemaining,
    byType: remaining,
    sold: totalCapacity - totalRemaining,
  };
}

function createStoredTicket(input: {
  state: DbState;
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: TicketTypeId;
  storageKey: string;
  storageUrl: string;
  qrSecret: string;
  checkoutReservationId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
}): StoredTicket {
  const event = requireEvent(input.eventId);
  let id: string;
  do {
    id = `TKT-${randomBytes(12).toString("hex").toUpperCase()}`;
  } while (input.state.tickets[id]);

  return {
    id,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail.toLowerCase(),
    ticketType: input.ticketType,
    seatLabel: `${input.ticketType.toUpperCase()}-${id.slice(-10)}`,
    eventId: event.id,
    eventName: event.name,
    eventDate: `${event.date}, ${event.time}`,
    venue: event.venue,
    issuedAt: new Date().toISOString(),
    storageKey: input.storageKey,
    storageUrl: input.storageUrl,
    qrSecret: input.qrSecret,
    status: "issued",
    ...(input.checkoutReservationId
      ? { checkoutReservationId: input.checkoutReservationId }
      : {}),
    ...(input.stripeCheckoutSessionId
      ? { stripeCheckoutSessionId: input.stripeCheckoutSessionId }
      : {}),
    ...(input.stripePaymentIntentId
      ? { stripePaymentIntentId: input.stripePaymentIntentId }
      : {}),
  };
}

export async function getAvailability(
  eventId: string = EVENT.id,
): Promise<Availability> {
  const event = requireEvent(eventId);
  const result = await withStoreMutation((state) => {
    const released = releaseExpiredInState(state, event.id).count > 0;
    return {
      availability: availabilityFromState(state, event.id),
      released,
    };
  });

  if (result.released) {
    emitAvailability(event.id, result.availability);
  }
  return result.availability;
}

export async function getPurchaseActivity(
  eventId: string = EVENT.id,
): Promise<PurchaseActivity> {
  requireEvent(eventId);
  const state = await readState();
  const now = Date.now();
  const activeCheckouts = Object.values(
    state.checkoutReservations,
  ).filter(
    (reservation) =>
      reservation.eventId === eventId &&
      isActiveReservation(reservation) &&
      (reservation.status === "checkout_created" ||
        Date.parse(reservation.expiresAt) > now),
  ).length;

  return {
    // Local JSON mutations are serialized by one process and do not wait in
    // the distributed PostgreSQL purchase queue.
    queueDepth: 0,
    activeCheckouts,
  };
}

export async function createVerificationToken(input: {
  email: string;
  name: string;
}): Promise<VerificationToken> {
  return withStoreMutation((state) => {
    const now = Date.now();
    for (const [token, existing] of Object.entries(
      state.verificationTokens,
    )) {
      if (Date.parse(existing.expiresAt) <= now) {
        delete state.verificationTokens[token];
      }
    }

    const token = randomBytes(24).toString("base64url");
    const verification: VerificationToken = {
      token,
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
    };

    state.verificationTokens[token] = verification;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "verification_requested",
      actor: verification.email,
      details: "Email verification token issued.",
    });
    return verification;
  });
}

export async function consumeVerificationToken(
  token: string,
): Promise<VerificationToken | null> {
  return withStoreMutation((state) => {
    const verification = state.verificationTokens[token];

    if (!verification) {
      return null;
    }

    delete state.verificationTokens[token];

    if (new Date(verification.expiresAt).getTime() < Date.now()) {
      return null;
    }

    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "email_verified",
      actor: verification.email,
      details: "Buyer session created.",
    });
    return verification;
  });
}

export async function issueTicket(input: {
  eventId?: string;
  buyerName: string;
  buyerEmail: string;
  ticketType: TicketTypeId;
  storageKey: string;
  storageUrl: string;
  qrSecret: string;
}): Promise<StoredTicket> {
  const event = requireEvent(input.eventId ?? EVENT.id);
  const ticketType = getTicketType(event.id, input.ticketType);
  if (
    !ticketType ||
    !event.ticketTypes.some((type) => type.id === input.ticketType)
  ) {
    throw new Error("INVALID_TICKET_TYPE");
  }

  const ticket = await withStoreMutation((state) => {
    releaseExpiredInState(state, event.id);
    const remainingByType = eventInventory(state, event.id);
    const remaining = remainingByType[input.ticketType] ?? 0;

    if (remaining <= 0) {
      throw new Error("SOLD_OUT");
    }

    const ticket = createStoredTicket({
      state,
      eventId: event.id,
      buyerName: input.buyerName,
      buyerEmail: input.buyerEmail,
      ticketType: input.ticketType,
      storageKey: input.storageKey,
      storageUrl: input.storageUrl,
      qrSecret: input.qrSecret,
    });

    remainingByType[input.ticketType] = remaining - 1;
    state.tickets[ticket.id] = ticket;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: ticket.issuedAt,
      action: "ticket_issued",
      actor: ticket.buyerEmail,
      details: `${ticket.id} ${ticket.ticketType} ${ticket.seatLabel}`,
    });

    return ticket;
  });
  emitAvailability(event.id, await getAvailability(event.id));
  return ticket;
}

export async function reserveCheckoutTicket(
  input: ReserveCheckoutTicketInput,
): Promise<CheckoutReservation> {
  const event = requireEvent(input.eventId ?? EVENT.id);
  if (!event.ticketTypes.some((type) => type.id === input.ticketType)) {
    throw new Error("INVALID_TICKET_TYPE");
  }

  const lifetimeMs =
    typeof input.expiresInMs === "number" &&
    Number.isFinite(input.expiresInMs) &&
    input.expiresInMs > 0
      ? Math.floor(input.expiresInMs)
      : DEFAULT_RESERVATION_LIFETIME_MS;
  const normalizedBuyerEmail = input.buyerEmail.trim().toLowerCase();
  const result = await withStoreMutation((state) => {
    releaseExpiredInState(state, event.id);
    const activeReservation = Object.values(
      state.checkoutReservations,
    ).find(
      (candidate) =>
        candidate.eventId === event.id &&
        candidate.buyerEmail.trim().toLowerCase() ===
          normalizedBuyerEmail &&
        isActiveReservation(candidate),
    );
    if (activeReservation) {
      return {
        reservation: null,
        error: "ACTIVE_CHECKOUT_EXISTS" as const,
      };
    }

    const remainingByType = eventInventory(state, event.id);
    const remaining = remainingByType[input.ticketType] ?? 0;
    if (remaining <= 0) {
      throw new Error("SOLD_OUT");
    }

    let id: string;
    do {
      id = `RSV-${randomBytes(12).toString("hex").toUpperCase()}`;
    } while (state.checkoutReservations[id]);

    const createdAt = new Date().toISOString();
    const storedReservation: StoredCheckoutReservation = {
      id,
      eventId: event.id,
      ticketType: input.ticketType,
      buyerName: input.buyerName.trim(),
      buyerEmail: normalizedBuyerEmail,
      locale: input.locale === "en" ? "en" : "bg",
      status: "reserved",
      createdAt,
      expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
      releasedAt: null,
      fulfilledAt: null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      ticketId: null,
      deliveryStatus: null,
      deliveryAttempts: 0,
      deliveryLeaseToken: null,
      deliveryLeaseExpiresAt: null,
      deliveredAt: null,
    };

    remainingByType[input.ticketType] = remaining - 1;
    state.checkoutReservations[id] = storedReservation;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: createdAt,
      action: "checkout_reservation_created",
      actor: storedReservation.buyerEmail,
      details: `${id} ${event.id} ${input.ticketType}`,
    });
    return {
      reservation: publicReservation(storedReservation),
      error: null,
    };
  });

  if (result.error) {
    throw new Error(result.error);
  }

  emitAvailability(event.id, await getAvailability(event.id));
  return result.reservation as CheckoutReservation;
}

export async function attachCheckoutSession(
  input: AttachCheckoutSessionInput,
): Promise<CheckoutReservation> {
  if (!input.stripeCheckoutSessionId.trim()) {
    throw new Error("INVALID_CHECKOUT_SESSION");
  }

  const result = await withStoreMutation((state) => {
    const reservation = state.checkoutReservations[input.reservationId];
    if (!reservation) {
      return {
        reservation: null,
        error: "RESERVATION_NOT_FOUND",
        changedEventId: null,
      };
    }

    if (
      reservation.status === "reserved" &&
      Date.parse(reservation.expiresAt) <= Date.now()
    ) {
      releaseReservationInventory(
        state,
        reservation,
        "expired",
        new Date().toISOString(),
      );
      return {
        reservation: publicReservation(reservation),
        error: "RESERVATION_EXPIRED",
        changedEventId: reservation.eventId,
      };
    }
    if (!isActiveReservation(reservation)) {
      return {
        reservation: publicReservation(reservation),
        error: "RESERVATION_NOT_ACTIVE",
        changedEventId: null,
      };
    }
    if (
      reservation.stripeCheckoutSessionId &&
      reservation.stripeCheckoutSessionId !== input.stripeCheckoutSessionId
    ) {
      return {
        reservation: publicReservation(reservation),
        error: "CHECKOUT_SESSION_ALREADY_ATTACHED",
        changedEventId: null,
      };
    }

    const duplicate = Object.values(state.checkoutReservations).find(
      (candidate) =>
        candidate.id !== reservation.id &&
        candidate.stripeCheckoutSessionId === input.stripeCheckoutSessionId,
    );
    if (duplicate) {
      return {
        reservation: publicReservation(reservation),
        error: "CHECKOUT_SESSION_ALREADY_ATTACHED",
        changedEventId: null,
      };
    }

    if (!reservation.stripeCheckoutSessionId) {
      reservation.stripeCheckoutSessionId = input.stripeCheckoutSessionId;
      reservation.status = "checkout_created";
      state.auditLog.push({
        id: randomBytes(10).toString("hex"),
        at: new Date().toISOString(),
        action: "checkout_session_attached",
        actor: reservation.buyerEmail,
        details: `${reservation.id} ${input.stripeCheckoutSessionId}`,
      });
    }
    return {
      reservation: publicReservation(reservation),
      error: null,
      changedEventId: null,
    };
  });

  if (result.changedEventId) {
    emitAvailability(
      result.changedEventId,
      await getAvailability(result.changedEventId),
    );
  }
  if (result.error) {
    throw new Error(result.error);
  }
  return result.reservation as CheckoutReservation;
}

async function releaseCheckoutReservation(
  id: string,
  status: "cancelled" | "expired",
): Promise<CheckoutReservation | null> {
  let changedEventId: string | null = null;
  const reservation = await withStoreMutation((state) => {
    const storedReservation = state.checkoutReservations[id];
    if (!storedReservation) {
      return null;
    }

    if (
      releaseReservationInventory(
        state,
        storedReservation,
        status,
        new Date().toISOString(),
      )
    ) {
      changedEventId = storedReservation.eventId;
    }
    return publicReservation(storedReservation);
  });

  if (changedEventId) {
    emitAvailability(
      changedEventId,
      await getAvailability(changedEventId),
    );
  }
  return reservation;
}

export function cancelCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  return releaseCheckoutReservation(id, "cancelled");
}

export function expireCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  return releaseCheckoutReservation(id, "expired");
}

export async function releaseExpiredCheckoutReservations(
  eventId?: string,
): Promise<number> {
  if (eventId) {
    requireEvent(eventId);
  }
  const result = await withStoreMutation((state) => {
    const released = releaseExpiredInState(state, eventId);
    return { count: released.count, eventIds: [...released.eventIds] };
  });

  for (const changedEventId of result.eventIds) {
    if (getEventById(changedEventId)) {
      emitAvailability(
        changedEventId,
        await getAvailability(changedEventId),
      );
    }
  }
  return result.count;
}

export async function getCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  await releaseExpiredCheckoutReservations();
  const state = await readState();
  const reservation = state.checkoutReservations[id];
  return reservation ? publicReservation(reservation) : null;
}

export async function getCheckoutReservationBySession(
  stripeCheckoutSessionId: string,
): Promise<CheckoutReservation | null> {
  await releaseExpiredCheckoutReservations();
  const state = await readState();
  const reservation = Object.values(state.checkoutReservations).find(
    (candidate) =>
      candidate.stripeCheckoutSessionId === stripeCheckoutSessionId,
  );
  return reservation ? publicReservation(reservation) : null;
}

export async function listCheckoutReservationsForReconciliation(
  limit = 5,
): Promise<CheckoutReservation[]> {
  await releaseExpiredCheckoutReservations();
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const now = Date.now();
  const state = await readState();

  return Object.values(state.checkoutReservations)
    .filter(
      (reservation) =>
        reservation.status === "checkout_created" &&
        Boolean(reservation.stripeCheckoutSessionId) &&
        Date.parse(reservation.expiresAt) <= now,
    )
    .sort(
      (left, right) =>
        Date.parse(left.expiresAt) - Date.parse(right.expiresAt),
    )
    .slice(0, boundedLimit)
    .map(publicReservation);
}

export async function listTicketDeliveriesForRetry(
  limit = 5,
): Promise<CheckoutReservation[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(20, Math.floor(limit)))
    : 5;
  const now = Date.now();
  const state = await readState();

  return Object.values(state.checkoutReservations)
    .filter(
      (reservation) =>
        reservation.status === "fulfilled" &&
        Boolean(reservation.ticketId) &&
        (reservation.deliveryStatus === "pending" ||
          (reservation.deliveryStatus === "processing" &&
            (!reservation.deliveryLeaseExpiresAt ||
              Date.parse(reservation.deliveryLeaseExpiresAt) <= now))),
    )
    .sort((left, right) => {
      const leftOldest = Date.parse(left.fulfilledAt ?? left.createdAt);
      const rightOldest = Date.parse(right.fulfilledAt ?? right.createdAt);
      return leftOldest - rightOldest || left.id.localeCompare(right.id);
    })
    .slice(0, boundedLimit)
    .map(publicReservation);
}

export async function fulfillCheckoutReservation(
  input: FulfillCheckoutReservationInput,
): Promise<CheckoutFulfillmentResult | null> {
  if (!input.reservationId && !input.stripeCheckoutSessionId) {
    throw new Error("RESERVATION_IDENTIFIER_REQUIRED");
  }

  return withStoreMutation((state) => {
    const reservation = input.reservationId
      ? state.checkoutReservations[input.reservationId]
      : Object.values(state.checkoutReservations).find(
          (candidate) =>
            candidate.stripeCheckoutSessionId ===
            input.stripeCheckoutSessionId,
        );
    if (
      !reservation ||
      (input.stripeCheckoutSessionId &&
        reservation.stripeCheckoutSessionId !==
          input.stripeCheckoutSessionId)
    ) {
      return null;
    }

    if (reservation.status === "fulfilled") {
      if (
        input.stripePaymentIntentId &&
        reservation.stripePaymentIntentId &&
        input.stripePaymentIntentId !== reservation.stripePaymentIntentId
      ) {
        throw new Error("PAYMENT_INTENT_MISMATCH");
      }
      const existingTicket = reservation.ticketId
        ? state.tickets[reservation.ticketId]
        : undefined;
      if (!existingTicket) {
        throw new Error("RESERVATION_TICKET_MISSING");
      }
      if (
        input.stripePaymentIntentId &&
        !reservation.stripePaymentIntentId
      ) {
        const paymentIntentInUse = Object.values(
          state.checkoutReservations,
        ).some(
          (candidate) =>
            candidate.id !== reservation.id &&
            candidate.stripePaymentIntentId ===
              input.stripePaymentIntentId,
        );
        if (paymentIntentInUse) {
          throw new Error("PAYMENT_INTENT_ALREADY_USED");
        }
        reservation.stripePaymentIntentId =
          input.stripePaymentIntentId;
        existingTicket.stripePaymentIntentId =
          input.stripePaymentIntentId;
      }
      return {
        reservation: publicReservation(reservation),
        ticket: existingTicket,
        created: false,
      };
    }
    if (!isActiveReservation(reservation)) {
      return null;
    }

    if (
      input.stripePaymentIntentId &&
      Object.values(state.checkoutReservations).some(
        (candidate) =>
          candidate.id !== reservation.id &&
          candidate.stripePaymentIntentId === input.stripePaymentIntentId,
      )
    ) {
      throw new Error("PAYMENT_INTENT_ALREADY_USED");
    }

    const ticket = createStoredTicket({
      state,
      eventId: reservation.eventId,
      buyerName: reservation.buyerName,
      buyerEmail: reservation.buyerEmail,
      ticketType: reservation.ticketType,
      storageKey: input.storageKey,
      storageUrl: input.storageUrl,
      qrSecret: input.qrSecret,
      checkoutReservationId: reservation.id,
      stripeCheckoutSessionId:
        reservation.stripeCheckoutSessionId ?? undefined,
      stripePaymentIntentId: input.stripePaymentIntentId,
    });
    const fulfilledAt = new Date().toISOString();
    reservation.status = "fulfilled";
    reservation.fulfilledAt = fulfilledAt;
    reservation.ticketId = ticket.id;
    reservation.stripePaymentIntentId =
      input.stripePaymentIntentId ?? reservation.stripePaymentIntentId;
    reservation.deliveryStatus = "pending";
    reservation.deliveryAttempts = 0;
    reservation.deliveryLeaseToken = null;
    reservation.deliveryLeaseExpiresAt = null;
    state.tickets[ticket.id] = ticket;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: fulfilledAt,
      action: "checkout_reservation_fulfilled",
      actor: reservation.buyerEmail,
      details: `${reservation.id} ${ticket.id}`,
    });
    return {
      reservation: publicReservation(reservation),
      ticket,
      created: true,
    };
  });
}

export async function claimTicketDelivery(
  input: ClaimTicketDeliveryInput,
): Promise<TicketDeliveryClaim | null> {
  if (!input.reservationId && !input.ticketId) {
    throw new Error("DELIVERY_IDENTIFIER_REQUIRED");
  }
  const leaseMs =
    typeof input.leaseMs === "number" &&
    Number.isFinite(input.leaseMs) &&
    input.leaseMs > 0
      ? Math.floor(input.leaseMs)
      : DEFAULT_DELIVERY_LEASE_MS;

  return withStoreMutation((state) => {
    const reservation = input.reservationId
      ? state.checkoutReservations[input.reservationId]
      : Object.values(state.checkoutReservations).find(
          (candidate) => candidate.ticketId === input.ticketId,
        );
    if (
      !reservation ||
      reservation.status !== "fulfilled" ||
      !reservation.ticketId ||
      (input.ticketId && reservation.ticketId !== input.ticketId)
    ) {
      return null;
    }

    const ticket = state.tickets[reservation.ticketId];
    if (!ticket || reservation.deliveryStatus === "completed") {
      return null;
    }
    if (
      reservation.deliveryStatus === "processing" &&
      reservation.deliveryLeaseExpiresAt &&
      Date.parse(reservation.deliveryLeaseExpiresAt) > Date.now()
    ) {
      return null;
    }

    const claimToken = randomBytes(24).toString("base64url");
    const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    reservation.deliveryStatus = "processing";
    reservation.deliveryAttempts += 1;
    reservation.deliveryLeaseToken = claimToken;
    reservation.deliveryLeaseExpiresAt = leaseExpiresAt;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "ticket_delivery_claimed",
      actor: reservation.buyerEmail,
      details: `${reservation.id} attempt=${reservation.deliveryAttempts}`,
    });
    return {
      reservation: publicReservation(reservation),
      ticket,
      claimToken,
      leaseExpiresAt,
    };
  });
}

export async function completeTicketDelivery(
  input: CompleteTicketDeliveryInput,
): Promise<CheckoutReservation | null> {
  return withStoreMutation((state) => {
    const reservation = state.checkoutReservations[input.reservationId];
    if (
      !reservation ||
      reservation.status !== "fulfilled" ||
      !reservation.ticketId ||
      reservation.deliveryLeaseToken !== input.claimToken
    ) {
      return null;
    }
    if (reservation.deliveryStatus === "completed") {
      return publicReservation(reservation);
    }
    if (reservation.deliveryStatus !== "processing") {
      return null;
    }

    const ticket = state.tickets[reservation.ticketId];
    if (!ticket) {
      return null;
    }
    if (input.storageKey !== undefined) {
      ticket.storageKey = input.storageKey;
    }
    if (input.storageUrl !== undefined) {
      ticket.storageUrl = input.storageUrl;
    }

    const deliveredAt = new Date().toISOString();
    reservation.deliveryStatus = "completed";
    reservation.deliveryLeaseExpiresAt = null;
    reservation.deliveredAt = deliveredAt;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: deliveredAt,
      action: "ticket_delivery_completed",
      actor: reservation.buyerEmail,
      details: `${reservation.id} ${reservation.ticketId}`,
    });
    return publicReservation(reservation);
  });
}

export async function releaseTicketDelivery(
  input: ReleaseTicketDeliveryInput,
): Promise<boolean> {
  return withStoreMutation((state) => {
    const reservation = state.checkoutReservations[input.reservationId];
    if (
      !reservation ||
      reservation.deliveryStatus !== "processing" ||
      reservation.deliveryLeaseToken !== input.claimToken
    ) {
      return false;
    }

    reservation.deliveryStatus = "pending";
    reservation.deliveryLeaseToken = null;
    reservation.deliveryLeaseExpiresAt = null;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "ticket_delivery_released",
      actor: reservation.buyerEmail,
      details: reservation.id,
    });
    return true;
  });
}

export async function updateTicketStorage(input: {
  id: string;
  storageKey: string;
  storageUrl: string;
}): Promise<StoredTicket | null> {
  return withStoreMutation((state) => {
    const ticket = state.tickets[input.id];

    if (!ticket) {
      return null;
    }

    ticket.storageKey = input.storageKey;
    ticket.storageUrl = input.storageUrl;
    return ticket;
  });
}

export async function rollbackIssuedTicket(id: string): Promise<boolean> {
  let rolledBackEventId: string | null = null;
  const rolledBack = await withStoreMutation((state) => {
    const ticket = state.tickets[id];

    if (!ticket) {
      return false;
    }
    // Paid checkout tickets are retried through the delivery lease instead of
    // being deleted and reissuing inventory after payment has succeeded.
    if (ticket.checkoutReservationId) {
      return false;
    }

    const event = getEventById(ticket.eventId);
    const ticketType = event?.ticketTypes.some(
      (type) => type.id === ticket.ticketType,
    )
      ? getTicketType(event.id, ticket.ticketType)
      : undefined;
    if (!event || !ticketType) {
      return false;
    }

    const remainingByType = eventInventory(state, event.id);
    remainingByType[ticket.ticketType] = Math.min(
      ticketType.capacity,
      (remainingByType[ticket.ticketType] ?? 0) + 1,
    );
    delete state.tickets[id];
    rolledBackEventId = event.id;
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "ticket_rolled_back",
      actor: ticket.buyerEmail,
      details: ticket.id,
    });
    return true;
  });

  if (rolledBack && rolledBackEventId) {
    emitAvailability(
      rolledBackEventId,
      await getAvailability(rolledBackEventId),
    );
  }

  return rolledBack;
}

export async function getTicket(id: string): Promise<StoredTicket | null> {
  const state = await readState();
  return state.tickets[id] ?? null;
}

export async function listTickets(): Promise<StoredTicket[]> {
  const state = await readState();
  return Object.values(state.tickets).sort((a, b) =>
    b.issuedAt.localeCompare(a.issuedAt),
  );
}

export async function listTicketsByEmail(
  buyerEmail: string,
): Promise<StoredTicket[]> {
  const normalizedEmail = buyerEmail.trim().toLowerCase();
  return (await listTickets()).filter(
    (ticket) => ticket.buyerEmail.trim().toLowerCase() === normalizedEmail,
  );
}

export async function markTicketCheckedIn(
  id: string,
  secret: string,
  actor: string,
): Promise<StoredTicket | null> {
  return withStoreMutation((state) => {
    const ticket = state.tickets[id];

    if (!ticket || ticket.qrSecret !== secret || ticket.status !== "issued") {
      return null;
    }

    ticket.status = "checked_in";
    state.auditLog.push({
      id: randomBytes(10).toString("hex"),
      at: new Date().toISOString(),
      action: "ticket_checked_in",
      actor,
      details: ticket.id,
    });
    return ticket;
  });
}

type Subscriber = (availability: Availability) => void;

declare global {
  var __ticketForgeSubscribers:
    | Map<string, Set<Subscriber>>
    | Set<Subscriber>
    | undefined;
}

function subscribers(eventId: string): Set<Subscriber> {
  // Hot reload may leave the old global Set alive. Promote it to the featured
  // event bucket instead of dropping active development connections.
  if (globalThis.__ticketForgeSubscribers instanceof Set) {
    globalThis.__ticketForgeSubscribers = new Map([
      [EVENT.id, globalThis.__ticketForgeSubscribers],
    ]);
  }
  globalThis.__ticketForgeSubscribers ??= new Map();

  const subscribersByEvent = globalThis.__ticketForgeSubscribers;
  let eventSubscribers = subscribersByEvent.get(eventId);
  if (!eventSubscribers) {
    eventSubscribers = new Set();
    subscribersByEvent.set(eventId, eventSubscribers);
  }
  return eventSubscribers;
}

export function subscribeAvailability(
  eventId: string,
  subscriber: Subscriber,
): () => void;
export function subscribeAvailability(
  subscriber: Subscriber,
  eventId?: string,
): () => void;
export function subscribeAvailability(
  eventIdOrSubscriber: string | Subscriber,
  subscriberOrEventId?: Subscriber | string,
): () => void {
  const eventId =
    typeof eventIdOrSubscriber === "string"
      ? eventIdOrSubscriber
      : typeof subscriberOrEventId === "string"
        ? subscriberOrEventId
        : EVENT.id;
  const subscriber =
    typeof eventIdOrSubscriber === "function"
      ? eventIdOrSubscriber
      : (subscriberOrEventId as Subscriber);
  const eventSubscribers = subscribers(eventId);
  eventSubscribers.add(subscriber);
  return () => eventSubscribers.delete(subscriber);
}

export function emitAvailability(
  eventId: string,
  availability: Availability,
): void;
export function emitAvailability(
  availability: Availability,
  eventId?: string,
): void;
export function emitAvailability(
  eventIdOrAvailability: string | Availability,
  availabilityOrEventId?: Availability | string,
): void {
  const eventId =
    typeof eventIdOrAvailability === "string"
      ? eventIdOrAvailability
      : typeof availabilityOrEventId === "string"
        ? availabilityOrEventId
        : EVENT.id;
  const availability =
    typeof eventIdOrAvailability === "string"
      ? (availabilityOrEventId as Availability)
      : eventIdOrAvailability;
  const eventSubscribers = subscribers(eventId);
  for (const subscriber of eventSubscribers) {
    try {
      subscriber(availability);
    } catch {
      // A disconnected SSE client must never make a completed sale appear to
      // fail. Remove stale listeners and continue notifying active clients.
      eventSubscribers.delete(subscriber);
    }
  }
}
