import { randomBytes } from "crypto";
import type postgres from "postgres";
import {
  EVENT,
  getEventById,
  getTicketType,
  type TicketTypeId,
} from "@/lib/event";
import {
  createCheckoutPurchaseSnapshot,
  normalizeCheckoutPurchaseSnapshot,
  type CheckoutPurchaseSnapshot,
} from "@/lib/checkout-purchase-snapshot";
import { emitAvailability } from "@/lib/store-file";
import type {
  AttachCheckoutSessionInput,
  Availability,
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
import {
  assertDatabaseSchema,
  databaseAutoMigrateEnabled,
  databaseSql,
  isCloudflareWorkerRuntime,
} from "@/lib/database";

export const POSTGRES_QUEUE_POLICY = {
  leaseSeconds: 15,
  maxWaitMs: 8_000,
  minRetryMs: 100,
  maxRetryMs: 750,
  retryJitterMs: 100,
} as const;

const QUEUE_LEASE_SECONDS = POSTGRES_QUEUE_POLICY.leaseSeconds;
const QUEUE_MAX_WAIT_MS = POSTGRES_QUEUE_POLICY.maxWaitMs;
const DEFAULT_RESERVATION_LIFETIME_MS = 30 * 60_000;
const DEFAULT_DELIVERY_LEASE_MS = 5 * 60_000;

declare global {
  var __ticketForgeSchemaReady: Promise<void> | undefined;
  var __ticketForgeInventoryReady: Map<string, Promise<void>> | undefined;
  var __ticketForgeWorkerStoreSchemaReady: boolean | undefined;
  var __ticketForgeWorkerInventoryReady: Set<string> | undefined;
}

async function prepareSchema(): Promise<void> {
  const db = databaseSql();

  await db`
    CREATE TABLE IF NOT EXISTS event_inventory (
      event_id TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity >= 0),
      remaining INTEGER NOT NULL CHECK (remaining >= 0),
      PRIMARY KEY (event_id, ticket_type)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      seat_label TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      venue TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      storage_key TEXT NOT NULL DEFAULT '',
      storage_url TEXT NOT NULL DEFAULT '',
      qr_secret TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('issued', 'checked_in')),
      purchase_offer_kind TEXT
        CHECK (purchase_offer_kind IN ('admission', 'test-simulation')),
      purchase_unit_amount_minor INTEGER
        CHECK (purchase_unit_amount_minor >= 0),
      purchase_currency TEXT
        CHECK (purchase_currency ~ '^[A-Z]{3}$'),
      purchase_event_name TEXT,
      purchase_event_date TEXT,
      purchase_venue TEXT,
      purchase_ticket_label TEXT,
      purchase_source_name TEXT,
      purchase_source_url TEXT,
      CHECK (
        num_nonnulls(
          purchase_offer_kind, purchase_unit_amount_minor,
          purchase_currency, purchase_event_name, purchase_event_date,
          purchase_venue, purchase_ticket_label, purchase_source_name,
          purchase_source_url
        ) IN (0, 9)
      )
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS tickets_buyer_email_idx
    ON tickets (buyer_email)
  `;
  await db`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS checkout_reservation_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
      ADD COLUMN IF NOT EXISTS purchase_offer_kind TEXT,
      ADD COLUMN IF NOT EXISTS purchase_unit_amount_minor INTEGER,
      ADD COLUMN IF NOT EXISTS purchase_currency TEXT,
      ADD COLUMN IF NOT EXISTS purchase_event_name TEXT,
      ADD COLUMN IF NOT EXISTS purchase_event_date TEXT,
      ADD COLUMN IF NOT EXISTS purchase_venue TEXT,
      ADD COLUMN IF NOT EXISTS purchase_ticket_label TEXT,
      ADD COLUMN IF NOT EXISTS purchase_source_name TEXT,
      ADD COLUMN IF NOT EXISTS purchase_source_url TEXT
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_checkout_reservation_idx
    ON tickets (checkout_reservation_id)
    WHERE checkout_reservation_id IS NOT NULL
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_stripe_checkout_session_idx
    ON tickets (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS tickets_stripe_payment_intent_idx
    ON tickets (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL
  `;
  await db`
    CREATE TABLE IF NOT EXISTS purchase_queue (
      position BIGSERIAL PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      event_id TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS purchase_queue_lane_idx
    ON purchase_queue (event_id, ticket_type, position)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS purchase_queue_lease_idx
    ON purchase_queue (lease_expires_at)
  `;
  await db`
    CREATE TABLE IF NOT EXISTS checkout_reservations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'bg'
        CHECK (locale IN ('bg', 'en')),
      status TEXT NOT NULL
        CHECK (
          status IN (
            'reserved',
            'checkout_created',
            'fulfilled',
            'cancelled',
            'expired'
          )
        ),
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      released_at TIMESTAMPTZ,
      fulfilled_at TIMESTAMPTZ,
      stripe_checkout_session_id TEXT UNIQUE,
      stripe_payment_intent_id TEXT UNIQUE,
      ticket_id TEXT UNIQUE REFERENCES tickets(id) ON DELETE SET NULL,
      delivery_status TEXT
        CHECK (
          delivery_status IS NULL OR
          delivery_status IN ('pending', 'processing', 'completed')
        ),
      delivery_attempts INTEGER NOT NULL DEFAULT 0
        CHECK (delivery_attempts >= 0),
      delivery_lease_token TEXT,
      delivery_lease_expires_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      purchase_offer_kind TEXT
        CHECK (purchase_offer_kind IN ('admission', 'test-simulation')),
      purchase_unit_amount_minor INTEGER
        CHECK (purchase_unit_amount_minor >= 0),
      purchase_currency TEXT
        CHECK (purchase_currency ~ '^[A-Z]{3}$'),
      purchase_event_name TEXT,
      purchase_event_date TEXT,
      purchase_venue TEXT,
      purchase_ticket_label TEXT,
      purchase_source_name TEXT,
      purchase_source_url TEXT,
      CHECK (
        num_nonnulls(
          purchase_offer_kind, purchase_unit_amount_minor,
          purchase_currency, purchase_event_name, purchase_event_date,
          purchase_venue, purchase_ticket_label, purchase_source_name,
          purchase_source_url
        ) IN (0, 9)
      )
    )
  `;
  await db`
    ALTER TABLE checkout_reservations
      ADD COLUMN IF NOT EXISTS purchase_offer_kind TEXT,
      ADD COLUMN IF NOT EXISTS purchase_unit_amount_minor INTEGER,
      ADD COLUMN IF NOT EXISTS purchase_currency TEXT,
      ADD COLUMN IF NOT EXISTS purchase_event_name TEXT,
      ADD COLUMN IF NOT EXISTS purchase_event_date TEXT,
      ADD COLUMN IF NOT EXISTS purchase_venue TEXT,
      ADD COLUMN IF NOT EXISTS purchase_ticket_label TEXT,
      ADD COLUMN IF NOT EXISTS purchase_source_name TEXT,
      ADD COLUMN IF NOT EXISTS purchase_source_url TEXT
  `;
  await db`
    CREATE INDEX IF NOT EXISTS checkout_reservations_expiry_idx
    ON checkout_reservations (expires_at)
    WHERE status IN ('reserved', 'checkout_created')
  `;
  await db`
    CREATE INDEX IF NOT EXISTS checkout_reservations_inventory_idx
    ON checkout_reservations (event_id, ticket_type, status)
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS
      checkout_reservations_active_buyer_event_idx
    ON checkout_reservations (
      event_id,
      (LOWER(BTRIM(buyer_email)))
    )
    WHERE status IN ('reserved', 'checkout_created')
  `;
  await db`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      details TEXT NOT NULL
    )
  `;
}

async function ensureSchema(): Promise<void> {
  if (isCloudflareWorkerRuntime()) {
    if (globalThis.__ticketForgeWorkerStoreSchemaReady) {
      return;
    }

    // Do not share a pending database Promise between Worker requests. Two
    // concurrent cold requests deliberately verify through their own clients;
    // only the completed, I/O-free readiness state is safe to retain.
    await (databaseAutoMigrateEnabled()
      ? prepareSchema()
      : assertDatabaseSchema());
    globalThis.__ticketForgeWorkerStoreSchemaReady = true;
    return;
  }

  globalThis.__ticketForgeSchemaReady ??= (
    databaseAutoMigrateEnabled()
      ? prepareSchema()
      : assertDatabaseSchema()
  ).catch((error) => {
      globalThis.__ticketForgeSchemaReady = undefined;
      throw error;
    });
  return globalThis.__ticketForgeSchemaReady;
}

function requireEvent(eventId: string) {
  const event = getEventById(eventId);
  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
  return event;
}

async function initializeEventInventory(
  event: ReturnType<typeof requireEvent>,
): Promise<void> {
  await databaseSql().begin(async (transaction) => {
    for (const ticketType of event.ticketTypes) {
      await transaction`
        INSERT INTO event_inventory (
          event_id, ticket_type, capacity, remaining
        )
        VALUES (
          ${event.id},
          ${ticketType.id},
          ${ticketType.capacity},
          ${ticketType.capacity}
        )
        ON CONFLICT (event_id, ticket_type)
        DO UPDATE SET
          remaining = GREATEST(
            0,
            EXCLUDED.capacity -
              (event_inventory.capacity - event_inventory.remaining)
          ),
          capacity = EXCLUDED.capacity
      `;
    }
  });
}

async function ensureEventInventory(eventId: string) {
  await ensureSchema();
  const event = requireEvent(eventId);

  if (isCloudflareWorkerRuntime()) {
    globalThis.__ticketForgeWorkerInventoryReady ??= new Set();
    const inventoryReady = globalThis.__ticketForgeWorkerInventoryReady;
    if (!inventoryReady.has(event.id)) {
      // As with schema verification, concurrent cold requests must not await
      // another request's TCP-backed Promise.
      await initializeEventInventory(event);
      inventoryReady.add(event.id);
    }
    return event;
  }

  globalThis.__ticketForgeInventoryReady ??= new Map();
  const inventoryReady = globalThis.__ticketForgeInventoryReady;

  let ready = inventoryReady.get(event.id);
  if (!ready) {
    ready = initializeEventInventory(event).catch((error) => {
      inventoryReady.delete(event.id);
      throw error;
    });
    inventoryReady.set(event.id, ready);
  }

  await ready;

  return event;
}

function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function mapPurchaseSnapshot(
  row: Record<string, unknown>,
): CheckoutPurchaseSnapshot | null {
  return normalizeCheckoutPurchaseSnapshot({
    offerKind: row.purchase_offer_kind,
    unitAmountMinor:
      row.purchase_unit_amount_minor === null ||
      row.purchase_unit_amount_minor === undefined
        ? Number.NaN
        : Number(row.purchase_unit_amount_minor),
    currency: row.purchase_currency,
    eventName: row.purchase_event_name,
    eventDate: row.purchase_event_date,
    venue: row.purchase_venue,
    ticketLabel: row.purchase_ticket_label,
    sourceName: row.purchase_source_name,
    sourceUrl: row.purchase_source_url,
  });
}

function mapTicket(row: Record<string, unknown>): StoredTicket {
  const checkoutReservationId = row.checkout_reservation_id
    ? String(row.checkout_reservation_id)
    : undefined;
  const stripeCheckoutSessionId = row.stripe_checkout_session_id
    ? String(row.stripe_checkout_session_id)
    : undefined;
  const stripePaymentIntentId = row.stripe_payment_intent_id
    ? String(row.stripe_payment_intent_id)
    : undefined;
  return {
    id: String(row.id),
    buyerName: String(row.buyer_name),
    buyerEmail: String(row.buyer_email),
    ticketType: String(row.ticket_type) as TicketTypeId,
    seatLabel: String(row.seat_label),
    eventId: String(row.event_id),
    eventName: String(row.event_name),
    eventDate: String(row.event_date),
    venue: String(row.venue),
    issuedAt: iso(row.issued_at),
    storageKey: String(row.storage_key),
    storageUrl: String(row.storage_url),
    qrSecret: String(row.qr_secret),
    status: String(row.status) as TicketStatus,
    purchaseSnapshot: mapPurchaseSnapshot(row),
    ...(checkoutReservationId ? { checkoutReservationId } : {}),
    ...(stripeCheckoutSessionId ? { stripeCheckoutSessionId } : {}),
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
  };
}

function nullableIso(value: unknown): string | null {
  return value ? iso(value) : null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapReservation(row: Record<string, unknown>): CheckoutReservation {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    ticketType: String(row.ticket_type) as TicketTypeId,
    buyerName: String(row.buyer_name),
    buyerEmail: String(row.buyer_email),
    locale: String(row.locale) as CheckoutLocale,
    status: String(row.status) as CheckoutReservationStatus,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    releasedAt: nullableIso(row.released_at),
    fulfilledAt: nullableIso(row.fulfilled_at),
    stripeCheckoutSessionId: nullableString(
      row.stripe_checkout_session_id,
    ),
    stripePaymentIntentId: nullableString(row.stripe_payment_intent_id),
    ticketId: nullableString(row.ticket_id),
    deliveryStatus: row.delivery_status
      ? (String(row.delivery_status) as TicketDeliveryStatus)
      : null,
    deliveryAttempts: Number(row.delivery_attempts ?? 0),
    deliveryLeaseExpiresAt: nullableIso(row.delivery_lease_expires_at),
    deliveredAt: nullableIso(row.delivered_at),
    purchaseSnapshot: mapPurchaseSnapshot(row),
  };
}

async function releaseExpiredInTransaction(
  transaction: postgres.TransactionSql,
  eventId?: string,
  ticketType?: TicketTypeId,
): Promise<{ count: number; eventIds: Set<string> }> {
  const rows =
    eventId && ticketType
      ? await transaction`
          UPDATE checkout_reservations
          SET status = 'expired',
              released_at = NOW(),
              delivery_status = NULL,
              delivery_lease_token = NULL,
              delivery_lease_expires_at = NULL
          WHERE status = 'reserved'
            AND expires_at <= NOW()
            AND event_id = ${eventId}
            AND ticket_type = ${ticketType}
          RETURNING id, event_id, ticket_type, buyer_email
        `
      : eventId
        ? await transaction`
            UPDATE checkout_reservations
            SET status = 'expired',
                released_at = NOW(),
                delivery_status = NULL,
                delivery_lease_token = NULL,
                delivery_lease_expires_at = NULL
            WHERE status = 'reserved'
              AND expires_at <= NOW()
              AND event_id = ${eventId}
            RETURNING id, event_id, ticket_type, buyer_email
          `
        : await transaction`
            UPDATE checkout_reservations
            SET status = 'expired',
                released_at = NOW(),
                delivery_status = NULL,
                delivery_lease_token = NULL,
                delivery_lease_expires_at = NULL
            WHERE status = 'reserved'
              AND expires_at <= NOW()
            RETURNING id, event_id, ticket_type, buyer_email
          `;
  const eventIds = new Set<string>();

  for (const row of rows) {
    const releasedEventId = String(row.event_id);
    const releasedTicketType = String(row.ticket_type);
    eventIds.add(releasedEventId);
    await transaction`
      UPDATE event_inventory
      SET remaining = LEAST(capacity, remaining + 1)
      WHERE event_id = ${releasedEventId}
        AND ticket_type = ${releasedTicketType}
    `;
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'checkout_reservation_expired',
        ${String(row.buyer_email)},
        ${String(row.id)}
      )
    `;
  }

  return { count: rows.length, eventIds };
}

export function postgresQueueRetryDelayMs(
  attempt: number,
  randomValue = Math.random(),
): number {
  const boundedAttempt = Math.max(1, Math.min(16, Math.floor(attempt)));
  const exponent = boundedAttempt - 1;
  const maxBase =
    POSTGRES_QUEUE_POLICY.maxRetryMs -
    POSTGRES_QUEUE_POLICY.retryJitterMs;
  const base = Math.min(
    maxBase,
    POSTGRES_QUEUE_POLICY.minRetryMs * (2 ** exponent),
  );
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.999_999, randomValue))
    : 0;
  const jitter = Math.floor(
    normalizedRandom * (POSTGRES_QUEUE_POLICY.retryJitterMs + 1),
  );
  return base + jitter;
}

function waitBeforeQueueRetry(attempt: number): Promise<void> {
  const delay = postgresQueueRetryDelayMs(attempt);
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

function notifyAvailabilityBestEffort(eventId: string): void {
  void readAvailability(eventId)
    .then((availability) => {
      emitAvailability(eventId, availability);
    })
    .catch((error) => {
      console.error(
        `Post-commit availability notification failed for ${eventId}.`,
        error,
      );
    });
}

async function removeQueueRequest(requestId: string): Promise<void> {
  await databaseSql()`
    DELETE FROM purchase_queue
    WHERE request_id = ${requestId}
  `;
}

export async function getAvailability(
  eventId: string = EVENT.id,
): Promise<Availability> {
  const event = await ensureEventInventory(eventId);
  const released = await databaseSql().begin((transaction) =>
    releaseExpiredInTransaction(transaction, event.id),
  );
  const availability = await readAvailability(event.id);

  if (released.count > 0) {
    emitAvailability(event.id, availability);
  }
  return availability;
}

export async function getPurchaseActivity(
  eventId: string = EVENT.id,
): Promise<PurchaseActivity> {
  const event = await ensureEventInventory(eventId);
  const rows = await databaseSql()`
    SELECT
      (
        SELECT COUNT(*)::INTEGER
        FROM purchase_queue
        WHERE event_id = ${event.id}
          AND lease_expires_at > NOW()
      ) AS queue_depth,
      (
        SELECT COUNT(*)::INTEGER
        FROM checkout_reservations
        WHERE event_id = ${event.id}
          AND (
            status = 'checkout_created' OR
            (status = 'reserved' AND expires_at > NOW())
          )
      ) AS active_checkouts
  `;

  return {
    queueDepth: Number(rows[0]?.queue_depth ?? 0),
    activeCheckouts: Number(rows[0]?.active_checkouts ?? 0),
  };
}

async function readAvailability(eventId: string): Promise<Availability> {
  const event = requireEvent(eventId);
  const rows = await databaseSql()`
    SELECT ticket_type, remaining
    FROM event_inventory
    WHERE event_id = ${event.id}
  `;
  const byType = Object.fromEntries(
    event.ticketTypes.map((type) => [type.id, 0]),
  ) as Record<TicketTypeId, number>;
  const validTicketTypes = new Set(
    event.ticketTypes.map((type) => type.id as TicketTypeId),
  );
  const totalCapacity = event.ticketTypes.reduce(
    (sum, type) => sum + type.capacity,
    0,
  );
  let totalRemaining = 0;

  for (const row of rows) {
    const ticketType = String(row.ticket_type) as TicketTypeId;
    if (!validTicketTypes.has(ticketType)) {
      continue;
    }
    const remaining = Number(row.remaining);
    byType[ticketType] = remaining;
    totalRemaining += remaining;
  }

  return {
    totalCapacity,
    totalRemaining,
    byType,
    sold: totalCapacity - totalRemaining,
  };
}

export async function createVerificationToken(input: {
  email: string;
  name: string;
}): Promise<VerificationToken> {
  await ensureSchema();
  const verification: VerificationToken = {
    token: randomBytes(24).toString("base64url"),
    email: input.email.toLowerCase(),
    name: input.name.trim(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  const db = databaseSql();

  await db.begin(async (transaction) => {
    await transaction`
      DELETE FROM verification_tokens
      WHERE expires_at <= NOW()
    `;
    await transaction`
      INSERT INTO verification_tokens (token, email, name, expires_at)
      VALUES (
        ${verification.token},
        ${verification.email},
        ${verification.name},
        ${verification.expiresAt}
      )
    `;
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'verification_requested',
        ${verification.email},
        'Email verification token issued.'
      )
    `;
  });

  return verification;
}

export async function consumeVerificationToken(
  token: string,
): Promise<VerificationToken | null> {
  await ensureSchema();
  const db = databaseSql();

  return db.begin(async (transaction) => {
    const rows = await transaction`
      DELETE FROM verification_tokens
      WHERE token = ${token}
      RETURNING token, email, name, expires_at
    `;
    const row = rows[0];

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return null;
    }

    const verification: VerificationToken = {
      token: String(row.token),
      email: String(row.email),
      name: String(row.name),
      expiresAt: iso(row.expires_at),
    };
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'email_verified',
        ${verification.email},
        'Buyer session created.'
      )
    `;
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
  const event = await ensureEventInventory(input.eventId ?? EVENT.id);
  const ticketType = getTicketType(event.id, input.ticketType);
  if (
    !ticketType ||
    !event.ticketTypes.some((type) => type.id === input.ticketType)
  ) {
    throw new Error("INVALID_TICKET_TYPE");
  }
  const purchaseSnapshot = createCheckoutPurchaseSnapshot(event, ticketType);

  const db = databaseSql();
  const requestId = randomBytes(18).toString("base64url");
  const queueRows = await db.begin(async (transaction) => {
    // Registration uses the same lane lock as allocation. This prevents a
    // later INSERT from committing and becoming visible while an earlier
    // sequence position is still uncommitted.
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtext(${event.id}),
        hashtext(${input.ticketType})
      )
    `;
    return transaction`
      INSERT INTO purchase_queue (
        request_id, event_id, ticket_type, lease_expires_at
      )
      VALUES (
        ${requestId},
        ${event.id},
        ${input.ticketType},
        NOW() + (${QUEUE_LEASE_SECONDS} * INTERVAL '1 second')
      )
      RETURNING position
    `;
  });
  if (!queueRows[0]) {
    throw new Error("QUEUE_UNAVAILABLE");
  }

  const deadline = Date.now() + QUEUE_MAX_WAIT_MS;
  let attempt = 0;
  let ticket: StoredTicket | null = null;

  try {
    while (!ticket && Date.now() < deadline) {
      const result = await db.begin(async (transaction) => {
        const lockRows = await transaction`
          SELECT pg_try_advisory_xact_lock(
            hashtext(${event.id}),
            hashtext(${input.ticketType})
          ) AS acquired
        `;
        if (!lockRows[0]?.acquired) {
          return { status: "waiting" as const };
        }

        await transaction`
          DELETE FROM purchase_queue
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
            AND lease_expires_at <= NOW()
        `;
        const headRows = await transaction`
          SELECT request_id
          FROM purchase_queue
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
          ORDER BY position ASC
          LIMIT 1
          FOR UPDATE
        `;
        const headRequestId = headRows[0]?.request_id;
        if (!headRequestId) {
          return { status: "expired" as const };
        }
        if (String(headRequestId) !== requestId) {
          return { status: "waiting" as const };
        }

        await releaseExpiredInTransaction(
          transaction,
          event.id,
          input.ticketType,
        );
        const updatedInventory = await transaction`
          UPDATE event_inventory
          SET remaining = remaining - 1
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
            AND remaining > 0
          RETURNING remaining
        `;
        if (!updatedInventory[0]) {
          await transaction`
            DELETE FROM purchase_queue
            WHERE request_id = ${requestId}
          `;
          return { status: "sold_out" as const };
        }

        const id = `TKT-${randomBytes(12).toString("hex").toUpperCase()}`;
        const issuedAt = new Date().toISOString();
        const seatLabel = `${input.ticketType.toUpperCase()}-${id.slice(-10)}`;
        const rows = await transaction`
          INSERT INTO tickets (
            id, buyer_name, buyer_email, ticket_type, seat_label,
            event_id, event_name, event_date, venue, issued_at,
            storage_key, storage_url, qr_secret, status,
            purchase_offer_kind, purchase_unit_amount_minor,
            purchase_currency, purchase_event_name, purchase_event_date,
            purchase_venue, purchase_ticket_label, purchase_source_name,
            purchase_source_url
          )
          VALUES (
            ${id},
            ${input.buyerName},
            ${input.buyerEmail.toLowerCase()},
            ${input.ticketType},
            ${seatLabel},
            ${event.id},
            ${purchaseSnapshot.eventName},
            ${purchaseSnapshot.eventDate},
            ${purchaseSnapshot.venue},
            ${issuedAt},
            ${input.storageKey},
            ${input.storageUrl},
            ${input.qrSecret},
            'issued',
            ${purchaseSnapshot.offerKind},
            ${purchaseSnapshot.unitAmountMinor},
            ${purchaseSnapshot.currency},
            ${purchaseSnapshot.eventName},
            ${purchaseSnapshot.eventDate},
            ${purchaseSnapshot.venue},
            ${purchaseSnapshot.ticketLabel},
            ${purchaseSnapshot.sourceName},
            ${purchaseSnapshot.sourceUrl}
          )
          RETURNING *
        `;
        await transaction`
          INSERT INTO audit_log (id, at, action, actor, details)
          VALUES (
            ${randomBytes(10).toString("hex")},
            ${issuedAt},
            'ticket_issued',
            ${input.buyerEmail.toLowerCase()},
            ${`${id} ${input.ticketType} ${seatLabel}`}
          )
        `;
        await transaction`
          DELETE FROM purchase_queue
          WHERE request_id = ${requestId}
        `;
        return {
          status: "issued" as const,
          ticket: mapTicket(rows[0] as Record<string, unknown>),
        };
      });

      if (result.status === "issued") {
        ticket = result.ticket;
        break;
      }
      if (result.status === "sold_out") {
        throw new Error("SOLD_OUT");
      }
      if (result.status === "expired") {
        throw new Error("QUEUE_LEASE_EXPIRED");
      }

      attempt += 1;
      await waitBeforeQueueRetry(attempt);
    }

    if (!ticket) {
      throw new Error("QUEUE_TIMEOUT");
    }
  } finally {
    await removeQueueRequest(requestId).catch(() => undefined);
  }

  notifyAvailabilityBestEffort(event.id);
  return ticket;
}

export async function reserveCheckoutTicket(
  input: ReserveCheckoutTicketInput,
): Promise<CheckoutReservation> {
  const event = await ensureEventInventory(input.eventId ?? EVENT.id);
  const ticketType = event.ticketTypes.find(
    (candidate) => candidate.id === input.ticketType,
  );
  if (!ticketType) {
    throw new Error("INVALID_TICKET_TYPE");
  }
  const purchaseSnapshot = createCheckoutPurchaseSnapshot(event, ticketType);

  const lifetimeMs =
    typeof input.expiresInMs === "number" &&
    Number.isFinite(input.expiresInMs) &&
    input.expiresInMs > 0
      ? Math.floor(input.expiresInMs)
      : DEFAULT_RESERVATION_LIFETIME_MS;
  const normalizedBuyerEmail = input.buyerEmail.trim().toLowerCase();
  const requestId = randomBytes(18).toString("base64url");
  const reservationId = `RSV-${randomBytes(12)
    .toString("hex")
    .toUpperCase()}`;
  const db = databaseSql();
  const queueRows = await db.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtext(${event.id}),
        hashtext(${input.ticketType})
      )
    `;
    return transaction`
      INSERT INTO purchase_queue (
        request_id, event_id, ticket_type, lease_expires_at
      )
      VALUES (
        ${requestId},
        ${event.id},
        ${input.ticketType},
        NOW() + (${QUEUE_LEASE_SECONDS} * INTERVAL '1 second')
      )
      RETURNING position
    `;
  });
  if (!queueRows[0]) {
    throw new Error("QUEUE_UNAVAILABLE");
  }

  const deadline = Date.now() + QUEUE_MAX_WAIT_MS;
  let attempt = 0;
  let reservation: CheckoutReservation | null = null;

  try {
    while (!reservation && Date.now() < deadline) {
      const result = await db.begin(async (transaction) => {
        const lockRows = await transaction`
          SELECT pg_try_advisory_xact_lock(
            hashtext(${event.id}),
            hashtext(${input.ticketType})
          ) AS acquired
        `;
        if (!lockRows[0]?.acquired) {
          return { status: "waiting" as const };
        }

        await transaction`
          DELETE FROM purchase_queue
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
            AND lease_expires_at <= NOW()
        `;
        const headRows = await transaction`
          SELECT request_id
          FROM purchase_queue
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
          ORDER BY position ASC
          LIMIT 1
          FOR UPDATE
        `;
        if (!headRows[0]) {
          return { status: "expired" as const };
        }
        if (String(headRows[0].request_id) !== requestId) {
          return { status: "waiting" as const };
        }

        await transaction`
          SELECT pg_advisory_xact_lock(
            hashtext(${`active-checkout:${event.id}`}),
            hashtext(${normalizedBuyerEmail})
          )
        `;
        await releaseExpiredInTransaction(
          transaction,
          event.id,
        );
        const activeRows = await transaction`
          SELECT id
          FROM checkout_reservations
          WHERE event_id = ${event.id}
            AND LOWER(BTRIM(buyer_email)) = ${normalizedBuyerEmail}
            AND status IN ('reserved', 'checkout_created')
          LIMIT 1
        `;
        if (activeRows[0]) {
          await transaction`
            DELETE FROM purchase_queue
            WHERE request_id = ${requestId}
          `;
          return { status: "active_checkout" as const };
        }

        const inventoryRows = await transaction`
          UPDATE event_inventory
          SET remaining = remaining - 1
          WHERE event_id = ${event.id}
            AND ticket_type = ${input.ticketType}
            AND remaining > 0
          RETURNING remaining
        `;
        if (!inventoryRows[0]) {
          await transaction`
            DELETE FROM purchase_queue
            WHERE request_id = ${requestId}
          `;
          return { status: "sold_out" as const };
        }

        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
        const rows = await transaction`
          INSERT INTO checkout_reservations (
            id, event_id, ticket_type, buyer_name, buyer_email, locale,
            status, created_at, expires_at,
            purchase_offer_kind, purchase_unit_amount_minor,
            purchase_currency, purchase_event_name, purchase_event_date,
            purchase_venue, purchase_ticket_label, purchase_source_name,
            purchase_source_url
          )
          VALUES (
            ${reservationId},
            ${event.id},
            ${input.ticketType},
            ${input.buyerName.trim()},
            ${normalizedBuyerEmail},
            ${input.locale === "en" ? "en" : "bg"},
            'reserved',
            ${createdAt},
            ${expiresAt},
            ${purchaseSnapshot.offerKind},
            ${purchaseSnapshot.unitAmountMinor},
            ${purchaseSnapshot.currency},
            ${purchaseSnapshot.eventName},
            ${purchaseSnapshot.eventDate},
            ${purchaseSnapshot.venue},
            ${purchaseSnapshot.ticketLabel},
            ${purchaseSnapshot.sourceName},
            ${purchaseSnapshot.sourceUrl}
          )
          RETURNING *
        `;
        await transaction`
          INSERT INTO audit_log (id, at, action, actor, details)
          VALUES (
            ${randomBytes(10).toString("hex")},
            ${createdAt},
            'checkout_reservation_created',
            ${normalizedBuyerEmail},
            ${`${reservationId} ${event.id} ${input.ticketType}`}
          )
        `;
        await transaction`
          DELETE FROM purchase_queue
          WHERE request_id = ${requestId}
        `;
        return {
          status: "reserved" as const,
          reservation: mapReservation(
            rows[0] as Record<string, unknown>,
          ),
        };
      });

      if (result.status === "reserved") {
        reservation = result.reservation;
        break;
      }
      if (result.status === "sold_out") {
        throw new Error("SOLD_OUT");
      }
      if (result.status === "active_checkout") {
        throw new Error("ACTIVE_CHECKOUT_EXISTS");
      }
      if (result.status === "expired") {
        throw new Error("QUEUE_LEASE_EXPIRED");
      }

      attempt += 1;
      await waitBeforeQueueRetry(attempt);
    }

    if (!reservation) {
      throw new Error("QUEUE_TIMEOUT");
    }
  } catch (error) {
    if (
      isUniqueConstraintViolation(
        error,
        "checkout_reservations_active_buyer_event_idx",
      )
    ) {
      throw new Error("ACTIVE_CHECKOUT_EXISTS");
    }
    throw error;
  } finally {
    await removeQueueRequest(requestId).catch(() => undefined);
  }

  notifyAvailabilityBestEffort(event.id);
  return reservation;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function isUniqueConstraintViolation(
  error: unknown,
  constraint: string,
): boolean {
  if (!isUniqueViolation(error)) {
    return false;
  }

  const details = error as {
    constraint?: string;
    constraint_name?: string;
  };
  return (
    details.constraint === constraint ||
    details.constraint_name === constraint
  );
}

export async function attachCheckoutSession(
  input: AttachCheckoutSessionInput,
): Promise<CheckoutReservation> {
  if (!input.stripeCheckoutSessionId.trim()) {
    throw new Error("INVALID_CHECKOUT_SESSION");
  }
  await ensureSchema();
  const db = databaseSql();

  try {
    const result = await db.begin(async (transaction) => {
      const rows = await transaction`
        SELECT *
        FROM checkout_reservations
        WHERE id = ${input.reservationId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        return { reservation: null, error: "RESERVATION_NOT_FOUND" };
      }
      const reservation = mapReservation(
        row as Record<string, unknown>,
      );
      if (
        reservation.status === "reserved" &&
        Date.parse(reservation.expiresAt) <= Date.now()
      ) {
        await transaction`
          UPDATE checkout_reservations
          SET status = 'expired', released_at = NOW()
          WHERE id = ${reservation.id}
            AND status IN ('reserved', 'checkout_created')
        `;
        await transaction`
          UPDATE event_inventory
          SET remaining = LEAST(capacity, remaining + 1)
          WHERE event_id = ${reservation.eventId}
            AND ticket_type = ${reservation.ticketType}
        `;
        await transaction`
          INSERT INTO audit_log (id, at, action, actor, details)
          VALUES (
            ${randomBytes(10).toString("hex")},
            ${new Date().toISOString()},
            'checkout_reservation_expired',
            ${reservation.buyerEmail},
            ${reservation.id}
          )
        `;
        return {
          reservation: {
            ...reservation,
            status: "expired" as const,
            releasedAt: new Date().toISOString(),
          },
          error: "RESERVATION_EXPIRED",
          changedEventId: reservation.eventId,
        };
      }
      if (
        reservation.status !== "reserved" &&
        reservation.status !== "checkout_created"
      ) {
        return {
          reservation,
          error: "RESERVATION_NOT_ACTIVE",
          changedEventId: null,
        };
      }
      if (
        reservation.stripeCheckoutSessionId &&
        reservation.stripeCheckoutSessionId !==
          input.stripeCheckoutSessionId
      ) {
        return {
          reservation,
          error: "CHECKOUT_SESSION_ALREADY_ATTACHED",
          changedEventId: null,
        };
      }
      if (reservation.stripeCheckoutSessionId) {
        return { reservation, error: null, changedEventId: null };
      }

      const updatedRows = await transaction`
        UPDATE checkout_reservations
        SET stripe_checkout_session_id = ${input.stripeCheckoutSessionId},
            status = 'checkout_created'
        WHERE id = ${reservation.id}
        RETURNING *
      `;
      await transaction`
        INSERT INTO audit_log (id, at, action, actor, details)
        VALUES (
          ${randomBytes(10).toString("hex")},
          ${new Date().toISOString()},
          'checkout_session_attached',
          ${reservation.buyerEmail},
          ${`${reservation.id} ${input.stripeCheckoutSessionId}`}
        )
      `;
      return {
        reservation: mapReservation(
          updatedRows[0] as Record<string, unknown>,
        ),
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
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("CHECKOUT_SESSION_ALREADY_ATTACHED");
    }
    throw error;
  }
}

async function releaseCheckoutReservation(
  id: string,
  status: "cancelled" | "expired",
): Promise<CheckoutReservation | null> {
  await ensureSchema();
  const result = await databaseSql().begin(async (transaction) => {
    const rows = await transaction`
      SELECT *
      FROM checkout_reservations
      WHERE id = ${id}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      return { reservation: null, changedEventId: null };
    }
    const reservation = mapReservation(row as Record<string, unknown>);
    if (
      reservation.status !== "reserved" &&
      reservation.status !== "checkout_created"
    ) {
      return { reservation, changedEventId: null };
    }

    const releasedAt = new Date().toISOString();
    const updatedRows = await transaction`
      UPDATE checkout_reservations
      SET status = ${status},
          released_at = ${releasedAt},
          delivery_status = NULL,
          delivery_lease_token = NULL,
          delivery_lease_expires_at = NULL
      WHERE id = ${id}
      RETURNING *
    `;
    await transaction`
      UPDATE event_inventory
      SET remaining = LEAST(capacity, remaining + 1)
      WHERE event_id = ${reservation.eventId}
        AND ticket_type = ${reservation.ticketType}
    `;
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${releasedAt},
        ${`checkout_reservation_${status}`},
        ${reservation.buyerEmail},
        ${reservation.id}
      )
    `;
    return {
      reservation: mapReservation(
        updatedRows[0] as Record<string, unknown>,
      ),
      changedEventId: reservation.eventId,
    };
  });

  if (result.changedEventId) {
    emitAvailability(
      result.changedEventId,
      await getAvailability(result.changedEventId),
    );
  }
  return result.reservation;
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
    await ensureEventInventory(eventId);
  } else {
    await ensureSchema();
  }
  const released = await databaseSql().begin((transaction) =>
    releaseExpiredInTransaction(transaction, eventId),
  );

  for (const changedEventId of released.eventIds) {
    if (getEventById(changedEventId)) {
      emitAvailability(
        changedEventId,
        await readAvailability(changedEventId),
      );
    }
  }
  return released.count;
}

export async function getCheckoutReservation(
  id: string,
): Promise<CheckoutReservation | null> {
  await releaseExpiredCheckoutReservations();
  const rows = await databaseSql()`
    SELECT *
    FROM checkout_reservations
    WHERE id = ${id}
  `;
  return rows[0]
    ? mapReservation(rows[0] as Record<string, unknown>)
    : null;
}

export async function getCheckoutReservationBySession(
  stripeCheckoutSessionId: string,
): Promise<CheckoutReservation | null> {
  await releaseExpiredCheckoutReservations();
  const rows = await databaseSql()`
    SELECT *
    FROM checkout_reservations
    WHERE stripe_checkout_session_id = ${stripeCheckoutSessionId}
  `;
  return rows[0]
    ? mapReservation(rows[0] as Record<string, unknown>)
    : null;
}

export async function listCheckoutReservationsForReconciliation(
  limit = 5,
): Promise<CheckoutReservation[]> {
  await ensureSchema();
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const rows = await databaseSql()`
    SELECT *
    FROM checkout_reservations
    WHERE status = 'checkout_created'
      AND stripe_checkout_session_id IS NOT NULL
      AND expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT ${boundedLimit}
  `;

  return rows.map((row) =>
    mapReservation(row as Record<string, unknown>),
  );
}

export async function listTicketDeliveriesForRetry(
  limit = 5,
): Promise<CheckoutReservation[]> {
  await ensureSchema();
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(20, Math.floor(limit)))
    : 5;
  const rows = await databaseSql()`
    SELECT *
    FROM checkout_reservations
    WHERE status = 'fulfilled'
      AND ticket_id IS NOT NULL
      AND (
        delivery_status = 'pending'
        OR (
          delivery_status = 'processing'
          AND (
            delivery_lease_expires_at IS NULL
            OR delivery_lease_expires_at <= NOW()
          )
        )
      )
    ORDER BY delivery_attempts ASC,
      COALESCE(fulfilled_at, created_at) ASC,
      id ASC
    LIMIT ${boundedLimit}
  `;

  return rows.map((row) =>
    mapReservation(row as Record<string, unknown>),
  );
}

export async function fulfillCheckoutReservation(
  input: FulfillCheckoutReservationInput,
): Promise<CheckoutFulfillmentResult | null> {
  if (!input.reservationId && !input.stripeCheckoutSessionId) {
    throw new Error("RESERVATION_IDENTIFIER_REQUIRED");
  }
  await ensureSchema();

  try {
    return await databaseSql().begin(async (transaction) => {
      const rows =
        input.reservationId && input.stripeCheckoutSessionId
          ? await transaction`
              SELECT *
              FROM checkout_reservations
              WHERE id = ${input.reservationId}
                AND stripe_checkout_session_id =
                  ${input.stripeCheckoutSessionId}
              FOR UPDATE
            `
          : input.reservationId
            ? await transaction`
                SELECT *
                FROM checkout_reservations
                WHERE id = ${input.reservationId}
                FOR UPDATE
              `
            : await transaction`
                SELECT *
                FROM checkout_reservations
                WHERE stripe_checkout_session_id =
                  ${input.stripeCheckoutSessionId as string}
                FOR UPDATE
              `;
      const row = rows[0];
      if (!row) {
        return null;
      }
      const reservation = mapReservation(
        row as Record<string, unknown>,
      );
      if (reservation.status === "fulfilled") {
        if (
          input.stripePaymentIntentId &&
          reservation.stripePaymentIntentId &&
          input.stripePaymentIntentId !==
            reservation.stripePaymentIntentId
        ) {
          throw new Error("PAYMENT_INTENT_MISMATCH");
        }
        const ticketRows = await transaction`
          SELECT *
          FROM tickets
          WHERE id = ${reservation.ticketId as string}
        `;
        if (!ticketRows[0]) {
          throw new Error("RESERVATION_TICKET_MISSING");
        }
        let resolvedReservation = reservation;
        let resolvedTicketRow = ticketRows[0];
        if (
          input.stripePaymentIntentId &&
          !reservation.stripePaymentIntentId
        ) {
          const updatedReservationRows = await transaction`
            UPDATE checkout_reservations
            SET stripe_payment_intent_id =
              ${input.stripePaymentIntentId}
            WHERE id = ${reservation.id}
            RETURNING *
          `;
          const updatedTicketRows = await transaction`
            UPDATE tickets
            SET stripe_payment_intent_id =
              ${input.stripePaymentIntentId}
            WHERE id = ${reservation.ticketId as string}
            RETURNING *
          `;
          resolvedReservation = mapReservation(
            updatedReservationRows[0] as Record<string, unknown>,
          );
          resolvedTicketRow = updatedTicketRows[0];
        }
        return {
          reservation: resolvedReservation,
          ticket: mapTicket(
            resolvedTicketRow as Record<string, unknown>,
          ),
          created: false,
        };
      }
      if (
        reservation.status !== "reserved" &&
        reservation.status !== "checkout_created"
      ) {
        return null;
      }
      if (!reservation.purchaseSnapshot) {
        throw new Error("CHECKOUT_PURCHASE_SNAPSHOT_MISSING");
      }

      const id = `TKT-${randomBytes(12).toString("hex").toUpperCase()}`;
      const issuedAt = new Date().toISOString();
      const seatLabel = `${reservation.ticketType.toUpperCase()}-${id.slice(
        -10,
      )}`;
      const purchaseSnapshot = reservation.purchaseSnapshot;
      const ticketRows = await transaction`
        INSERT INTO tickets (
          id, buyer_name, buyer_email, ticket_type, seat_label,
          event_id, event_name, event_date, venue, issued_at,
          storage_key, storage_url, qr_secret, status,
          checkout_reservation_id, stripe_checkout_session_id,
          stripe_payment_intent_id,
          purchase_offer_kind, purchase_unit_amount_minor,
          purchase_currency, purchase_event_name, purchase_event_date,
          purchase_venue, purchase_ticket_label, purchase_source_name,
          purchase_source_url
        )
        VALUES (
          ${id},
          ${reservation.buyerName},
          ${reservation.buyerEmail},
          ${reservation.ticketType},
          ${seatLabel},
          ${reservation.eventId},
          ${purchaseSnapshot.eventName},
          ${purchaseSnapshot.eventDate},
          ${purchaseSnapshot.venue},
          ${issuedAt},
          ${input.storageKey},
          ${input.storageUrl},
          ${input.qrSecret},
          'issued',
          ${reservation.id},
          ${reservation.stripeCheckoutSessionId},
          ${input.stripePaymentIntentId ?? null},
          ${purchaseSnapshot.offerKind},
          ${purchaseSnapshot.unitAmountMinor},
          ${purchaseSnapshot.currency},
          ${purchaseSnapshot.eventName},
          ${purchaseSnapshot.eventDate},
          ${purchaseSnapshot.venue},
          ${purchaseSnapshot.ticketLabel},
          ${purchaseSnapshot.sourceName},
          ${purchaseSnapshot.sourceUrl}
        )
        RETURNING *
      `;
      const updatedRows = await transaction`
        UPDATE checkout_reservations
        SET status = 'fulfilled',
            fulfilled_at = ${issuedAt},
            stripe_payment_intent_id =
              ${input.stripePaymentIntentId ?? null},
            ticket_id = ${id},
            delivery_status = 'pending',
            delivery_attempts = 0,
            delivery_lease_token = NULL,
            delivery_lease_expires_at = NULL
        WHERE id = ${reservation.id}
        RETURNING *
      `;
      await transaction`
        INSERT INTO audit_log (id, at, action, actor, details)
        VALUES (
          ${randomBytes(10).toString("hex")},
          ${issuedAt},
          'checkout_reservation_fulfilled',
          ${reservation.buyerEmail},
          ${`${reservation.id} ${id}`}
        )
      `;
      return {
        reservation: mapReservation(
          updatedRows[0] as Record<string, unknown>,
        ),
        ticket: mapTicket(
          ticketRows[0] as Record<string, unknown>,
        ),
        created: true,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("PAYMENT_INTENT_ALREADY_USED");
    }
    throw error;
  }
}

export async function claimTicketDelivery(
  input: ClaimTicketDeliveryInput,
): Promise<TicketDeliveryClaim | null> {
  if (!input.reservationId && !input.ticketId) {
    throw new Error("DELIVERY_IDENTIFIER_REQUIRED");
  }
  await ensureSchema();
  const leaseMs =
    typeof input.leaseMs === "number" &&
    Number.isFinite(input.leaseMs) &&
    input.leaseMs > 0
      ? Math.floor(input.leaseMs)
      : DEFAULT_DELIVERY_LEASE_MS;

  return databaseSql().begin(async (transaction) => {
    const rows = input.reservationId
      ? await transaction`
          SELECT *
          FROM checkout_reservations
          WHERE id = ${input.reservationId}
          FOR UPDATE
        `
      : await transaction`
          SELECT *
          FROM checkout_reservations
          WHERE ticket_id = ${input.ticketId as string}
          FOR UPDATE
        `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    const reservation = mapReservation(row as Record<string, unknown>);
    if (
      reservation.status !== "fulfilled" ||
      !reservation.ticketId ||
      (input.ticketId && reservation.ticketId !== input.ticketId) ||
      reservation.deliveryStatus === "completed" ||
      (reservation.deliveryStatus === "processing" &&
        reservation.deliveryLeaseExpiresAt &&
        Date.parse(reservation.deliveryLeaseExpiresAt) > Date.now())
    ) {
      return null;
    }

    const claimToken = randomBytes(24).toString("base64url");
    const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    const updatedRows = await transaction`
      UPDATE checkout_reservations
      SET delivery_status = 'processing',
          delivery_attempts = delivery_attempts + 1,
          delivery_lease_token = ${claimToken},
          delivery_lease_expires_at = ${leaseExpiresAt}
      WHERE id = ${reservation.id}
      RETURNING *
    `;
    const ticketRows = await transaction`
      SELECT *
      FROM tickets
      WHERE id = ${reservation.ticketId}
    `;
    if (!ticketRows[0]) {
      throw new Error("RESERVATION_TICKET_MISSING");
    }
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'ticket_delivery_claimed',
        ${reservation.buyerEmail},
        ${reservation.id}
      )
    `;
    return {
      reservation: mapReservation(
        updatedRows[0] as Record<string, unknown>,
      ),
      ticket: mapTicket(ticketRows[0] as Record<string, unknown>),
      claimToken,
      leaseExpiresAt,
    };
  });
}

export async function completeTicketDelivery(
  input: CompleteTicketDeliveryInput,
): Promise<CheckoutReservation | null> {
  await ensureSchema();

  return databaseSql().begin(async (transaction) => {
    const rows = await transaction`
      SELECT *
      FROM checkout_reservations
      WHERE id = ${input.reservationId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row || String(row.delivery_lease_token ?? "") !== input.claimToken) {
      return null;
    }
    const reservation = mapReservation(row as Record<string, unknown>);
    if (reservation.deliveryStatus === "completed") {
      return reservation;
    }
    if (
      reservation.status !== "fulfilled" ||
      reservation.deliveryStatus !== "processing" ||
      !reservation.ticketId
    ) {
      return null;
    }

    if (input.storageKey !== undefined || input.storageUrl !== undefined) {
      await transaction`
        UPDATE tickets
        SET storage_key = COALESCE(
              ${input.storageKey ?? null},
              storage_key
            ),
            storage_url = COALESCE(
              ${input.storageUrl ?? null},
              storage_url
            )
        WHERE id = ${reservation.ticketId}
      `;
    }
    const deliveredAt = new Date().toISOString();
    const updatedRows = await transaction`
      UPDATE checkout_reservations
      SET delivery_status = 'completed',
          delivery_lease_expires_at = NULL,
          delivered_at = ${deliveredAt}
      WHERE id = ${reservation.id}
      RETURNING *
    `;
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${deliveredAt},
        'ticket_delivery_completed',
        ${reservation.buyerEmail},
        ${reservation.id}
      )
    `;
    return mapReservation(
      updatedRows[0] as Record<string, unknown>,
    );
  });
}

export async function releaseTicketDelivery(
  input: ReleaseTicketDeliveryInput,
): Promise<boolean> {
  await ensureSchema();

  return databaseSql().begin(async (transaction) => {
    const rows = await transaction`
      UPDATE checkout_reservations
      SET delivery_status = 'pending',
          delivery_lease_token = NULL,
          delivery_lease_expires_at = NULL
      WHERE id = ${input.reservationId}
        AND delivery_status = 'processing'
        AND delivery_lease_token = ${input.claimToken}
      RETURNING buyer_email
    `;
    if (!rows[0]) {
      return false;
    }
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'ticket_delivery_released',
        ${String(rows[0].buyer_email)},
        ${input.reservationId}
      )
    `;
    return true;
  });
}

export async function updateTicketStorage(input: {
  id: string;
  storageKey: string;
  storageUrl: string;
}): Promise<StoredTicket | null> {
  await ensureSchema();
  const rows = await databaseSql()`
    UPDATE tickets
    SET storage_key = ${input.storageKey},
        storage_url = ${input.storageUrl}
    WHERE id = ${input.id}
    RETURNING *
  `;
  return rows[0] ? mapTicket(rows[0] as Record<string, unknown>) : null;
}

export async function rollbackIssuedTicket(id: string): Promise<boolean> {
  await ensureSchema();
  const db = databaseSql();
  const rolledBackEventId = await db.begin(async (transaction) => {
    const rows = await transaction`
      DELETE FROM tickets
      WHERE id = ${id}
        AND checkout_reservation_id IS NULL
      RETURNING event_id, ticket_type, buyer_email
    `;
    const ticket = rows[0];

    if (!ticket) {
      return null;
    }

    await transaction`
      UPDATE event_inventory
      SET remaining = LEAST(capacity, remaining + 1)
      WHERE event_id = ${String(ticket.event_id)}
        AND ticket_type = ${String(ticket.ticket_type)}
    `;
    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'ticket_rolled_back',
        ${String(ticket.buyer_email)},
        ${id}
      )
    `;
    return String(ticket.event_id);
  });

  if (rolledBackEventId && getEventById(rolledBackEventId)) {
    emitAvailability(
      rolledBackEventId,
      await getAvailability(rolledBackEventId),
    );
  }
  return rolledBackEventId !== null;
}

export async function getTicket(id: string): Promise<StoredTicket | null> {
  await ensureSchema();
  const rows = await databaseSql()`SELECT * FROM tickets WHERE id = ${id}`;
  return rows[0] ? mapTicket(rows[0] as Record<string, unknown>) : null;
}

export async function listTickets(): Promise<StoredTicket[]> {
  await ensureSchema();
  const rows = await databaseSql()`SELECT * FROM tickets ORDER BY issued_at DESC`;
  return rows.map((row) => mapTicket(row as Record<string, unknown>));
}

export async function listTicketsByEmail(
  buyerEmail: string,
): Promise<StoredTicket[]> {
  await ensureSchema();
  const rows = await databaseSql()`
    SELECT *
    FROM tickets
    WHERE buyer_email = ${buyerEmail.trim().toLowerCase()}
    ORDER BY issued_at DESC
  `;
  return rows.map((row) => mapTicket(row as Record<string, unknown>));
}

export async function markTicketCheckedIn(
  id: string,
  secret: string,
  actor: string,
): Promise<StoredTicket | null> {
  await ensureSchema();
  const db = databaseSql();

  return db.begin(async (transaction) => {
    const rows = await transaction`
      UPDATE tickets
      SET status = 'checked_in'
      WHERE id = ${id}
        AND qr_secret = ${secret}
        AND status = 'issued'
      RETURNING *
    `;
    const row = rows[0];

    if (!row) {
      return null;
    }

    await transaction`
      INSERT INTO audit_log (id, at, action, actor, details)
      VALUES (
        ${randomBytes(10).toString("hex")},
        ${new Date().toISOString()},
        'ticket_checked_in',
        ${actor},
        ${id}
      )
    `;
    return mapTicket(row as Record<string, unknown>);
  });
}
