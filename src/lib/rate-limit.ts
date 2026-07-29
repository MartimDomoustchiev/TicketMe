type RateLimitEntry = {
  count: number;
  resetsAt: number;
};

const MAX_RATE_LIMIT_ENTRIES = 5_000;
const PRUNE_INTERVAL = 128;

declare global {
  var __ticketForgeRateLimits: Map<string, RateLimitEntry> | undefined;
  var __ticketForgeRateLimitOperations: number | undefined;
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
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return identity.slice(0, 128);
}

export function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSeconds: number } {
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
