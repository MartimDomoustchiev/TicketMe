import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  POSTGRES_QUEUE_POLICY,
  postgresQueueRetryDelayMs,
} from "../src/lib/store-postgres";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

test("PostgreSQL checkout queue sheds load before the route timeout", () => {
  assert.equal(POSTGRES_QUEUE_POLICY.maxWaitMs, 8_000);
  assert.ok(
    POSTGRES_QUEUE_POLICY.leaseSeconds * 1_000 >
      POSTGRES_QUEUE_POLICY.maxWaitMs,
  );
  assert.ok(POSTGRES_QUEUE_POLICY.maxWaitMs <= 10_000);
});

test("PostgreSQL checkout queue uses bounded exponential retry backoff", () => {
  assert.equal(postgresQueueRetryDelayMs(1, 0), 100);
  assert.equal(postgresQueueRetryDelayMs(2, 0), 200);
  assert.equal(postgresQueueRetryDelayMs(3, 0), 400);
  assert.equal(postgresQueueRetryDelayMs(4, 0), 650);
  assert.equal(postgresQueueRetryDelayMs(16, 0), 650);
  assert.equal(postgresQueueRetryDelayMs(16, 0.999_999), 750);

  for (let attempt = 1; attempt <= 32; attempt += 1) {
    const delay = postgresQueueRetryDelayMs(attempt, 0.5);
    assert.ok(delay >= POSTGRES_QUEUE_POLICY.minRetryMs);
    assert.ok(delay <= POSTGRES_QUEUE_POLICY.maxRetryMs);
  }
});

test("checkout and realtime hot paths do not run Stripe reconciliation", async () => {
  const [checkoutRoute, realtime] = await Promise.all([
    source("src/app/api/stripe/checkout/route.ts"),
    source("src/lib/realtime.ts"),
  ]);

  assert.doesNotMatch(checkoutRoute, /reconcileStaleStripeCheckouts/i);
  assert.doesNotMatch(realtime, /reconcileStaleStripeCheckouts/i);
  assert.match(realtime, /getSharedAvailability/);
  assert.match(realtime, /getSharedPurchaseActivity/);
  assert.doesNotMatch(realtime, /\bgetAvailability\(/);
  assert.doesNotMatch(realtime, /\bgetPurchaseActivity\(/);
});

test("committed reservations do not await their local notification", async () => {
  const postgresStore = await source("src/lib/store-postgres.ts");

  assert.match(
    postgresStore,
    /notifyAvailabilityBestEffort\(event\.id\);\s+return reservation;/,
  );
  assert.doesNotMatch(
    postgresStore,
    /emitAvailability\(event\.id, await getAvailability\(event\.id\)\);\s+return reservation;/,
  );
});
