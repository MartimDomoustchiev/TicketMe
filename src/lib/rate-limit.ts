import { createHash } from "node:crypto";
import { databaseSql, isDatabaseConfigured } from "@/lib/database";

type RateLimitEntry = {
  count: number;
  resetsAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  unavailable?: boolean;
};

const MAX_RATE_LIMIT_ENTRIES = 5_000;
const PRUNE_INTERVAL = 128;

declare global {
  var __ticketForgeRateLimits: Map<string, RateLimitEntry> | undefined;
  var __ticketForgeRateLimitOperations: number | undefined;
  var __ticketForgePersistentRateLimitOperations: number | undefined;
}

function entries(): Map<string, RateLimitEntry> {
  globalThis.__ticketForgeRateLimits ??= new Map();
  return globalThis.__ticketForgeRateLimits;
}

function pruneEntries(
  store: Map<string, RateLimitEntry>,
  now: number,
): void {
  for (const [key, entry] of store) {
    if (entry.resetsAt <= now) {
      store.delete(key);
    }
  }

  // Map iteration follows insertion order. Removing the oldest buckets first
  // bounds memory even under an attack that continuously rotates identities.
  while (store.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    store.delete(oldestKey);
  }
}

export function requestIdentity(request: Request): string {
  const identity =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return identity.slice(0, 128);
}

export type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

function validateInput(input: RateLimitInput): void {
  if (!input.key || input.key.length > 1_024) {
    throw new Error("Rate-limit keys must contain 1 to 1024 characters.");
  }
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new Error("Rate-limit limits must be positive integers.");
  }
  if (
    !Number.isSafeInteger(input.windowMs) ||
    input.windowMs < 1_000 ||
    input.windowMs > 24 * 60 * 60_000
  ) {
    throw new Error("Rate-limit windows must be between one second and one day.");
  }
}

function consumeInMemoryRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  const store = entries();
  globalThis.__ticketForgeRateLimitOperations =
    (globalThis.__ticketForgeRateLimitOperations ?? 0) + 1;

  if (
    globalThis.__ticketForgeRateLimitOperations % PRUNE_INTERVAL === 0 ||
    store.size >= MAX_RATE_LIMIT_ENTRIES
  ) {
    pruneEntries(store, now);
  }

  let current = store.get(input.key);
  if (current?.resetsAt && current.resetsAt <= now) {
    store.delete(input.key);
    current = undefined;
  }

  if (!current) {
    if (store.size >= MAX_RATE_LIMIT_ENTRIES) {
      pruneEntries(store, now);
    }
    store.set(input.key, {
      count: 1,
      resetsAt: now + input.windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(input.windowMs / 1000),
    };
  }

  current.count += 1;
  return {
    allowed: current.count <= input.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1000)),
  };
}

async function consumePersistentRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const sql = databaseSql();
  const keyHash = createHash("sha256").update(input.key).digest("hex");
  const resetsAt = new Date(Date.now() + input.windowMs);
  const rows = await sql`
    INSERT INTO request_rate_limits AS bucket (
      key_hash,
      request_count,
      resets_at
    )
    VALUES (${keyHash}, 1, ${resetsAt})
    ON CONFLICT (key_hash) DO UPDATE
    SET
      request_count = CASE
        WHEN bucket.resets_at <= NOW() THEN 1
        ELSE bucket.request_count + 1
      END,
      resets_at = CASE
        WHEN bucket.resets_at <= NOW() THEN EXCLUDED.resets_at
        ELSE bucket.resets_at
      END
    RETURNING request_count, resets_at
  `;
  const row = rows[0] as
    | { request_count?: number | string; resets_at?: Date | string }
    | undefined;
  const count = Number(row?.request_count ?? input.limit + 1);
  const resetTime = new Date(row?.resets_at ?? resetsAt).getTime();

  globalThis.__ticketForgePersistentRateLimitOperations =
    (globalThis.__ticketForgePersistentRateLimitOperations ?? 0) + 1;
  if (globalThis.__ticketForgePersistentRateLimitOperations % PRUNE_INTERVAL === 0) {
    await sql`
      DELETE FROM request_rate_limits
      WHERE key_hash IN (
        SELECT key_hash
        FROM request_rate_limits
        WHERE resets_at <= NOW()
        ORDER BY resets_at
        LIMIT 1000
      )
    `;
  }

  return {
    allowed: count <= input.limit,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((resetTime - Date.now()) / 1_000),
    ),
  };
}

export async function consumeRateLimit(
  input: RateLimitInput,
): Promise<RateLimitResult> {
  validateInput(input);

  if (
    process.env.NODE_ENV !== "production" ||
    !isDatabaseConfigured()
  ) {
    return consumeInMemoryRateLimit(input);
  }

  try {
    return await consumePersistentRateLimit(input);
  } catch (error) {
    console.error("Persistent rate limiter failed closed.", error);
    return {
      allowed: false,
      retryAfterSeconds: 30,
      unavailable: true,
    };
  }
}

/**
 * Consumes related buckets in the supplied order and stops as soon as one
 * blocks the request. Put the lowest-cardinality bucket first (normally the
 * client IP) so a denied client cannot keep creating account or identity rows
 * by rotating user-controlled values.
 */
export async function consumeRateLimitsInOrder(
  inputs: readonly RateLimitInput[],
): Promise<RateLimitResult> {
  if (inputs.length === 0) {
    throw new Error("At least one rate-limit bucket is required.");
  }

  let retryAfterSeconds = 1;
  for (const input of inputs) {
    const result = await consumeRateLimit(input);
    if (result.unavailable || !result.allowed) {
      return result;
    }
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      result.retryAfterSeconds,
    );
  }

  return {
    allowed: true,
    retryAfterSeconds,
  };
}
