import assert from "node:assert/strict";
import test from "node:test";
import * as adminDiscoveryRoute from "../src/app/api/admin/event-discovery/route";
import * as cronDiscoveryRoute from "../src/app/api/cron/events/discover/route";

const VALID_CRON_SECRET = "test-event-discovery-secret-32-bytes";

async function withCronSecret<T>(
  value: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previousLegacy = process.env.EVENT_DISCOVERY_CRON_SECRET;
  const previousVercel = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  if (value === undefined) {
    delete process.env.EVENT_DISCOVERY_CRON_SECRET;
  } else {
    process.env.EVENT_DISCOVERY_CRON_SECRET = value;
  }

  try {
    return await callback();
  } finally {
    if (previousLegacy === undefined) {
      delete process.env.EVENT_DISCOVERY_CRON_SECRET;
    } else {
      process.env.EVENT_DISCOVERY_CRON_SECRET = previousLegacy;
    }
    if (previousVercel === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousVercel;
    }
  }
}

test("event discovery routes support Vercel GET and trusted POST schedulers", () => {
  assert.equal("POST" in cronDiscoveryRoute, true);
  assert.equal("GET" in cronDiscoveryRoute, true);
  assert.equal("POST" in adminDiscoveryRoute, true);
  assert.equal("GET" in adminDiscoveryRoute, false);
});

test("cron discovery fails closed when its secret is missing or short", async () => {
  for (const secret of [undefined, "too-short"]) {
    const response = await withCronSecret(secret, () =>
      cronDiscoveryRoute.POST(
        new Request("https://tickets.example/api/cron/events/discover", {
          method: "POST",
          headers: { authorization: `Bearer ${secret ?? ""}` },
        }),
      ),
    );

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("cron discovery rejects an invalid bearer secret", async () => {
  const response = await withCronSecret(VALID_CRON_SECRET, () =>
    cronDiscoveryRoute.POST(
      new Request("https://tickets.example/api/cron/events/discover", {
        method: "POST",
        headers: { authorization: "Bearer definitely-not-the-secret" },
      }),
    ),
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("www-authenticate"),
    'Bearer realm="event-discovery"',
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cron discovery GET accepts the standard Vercel CRON_SECRET", async () => {
  const previousVercel = process.env.CRON_SECRET;
  const previousLegacy = process.env.EVENT_DISCOVERY_CRON_SECRET;
  process.env.CRON_SECRET = VALID_CRON_SECRET;
  delete process.env.EVENT_DISCOVERY_CRON_SECRET;

  try {
    const response = await cronDiscoveryRoute.GET(
      new Request("https://tickets.example/api/cron/events/discover", {
        headers: { authorization: `Bearer ${VALID_CRON_SECRET}` },
      }),
    );

    // With no licensed feeds configured, a correctly authenticated scheduler
    // is a safe no-op rather than an authorization failure.
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      result: { status: "skipped", reason: "no-feeds" },
    });
  } finally {
    if (previousVercel === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousVercel;
    }
    if (previousLegacy === undefined) {
      delete process.env.EVENT_DISCOVERY_CRON_SECRET;
    } else {
      process.env.EVENT_DISCOVERY_CRON_SECRET = previousLegacy;
    }
  }
});

test("admin discovery rejects cross-site requests before session lookup", async () => {
  const response = await adminDiscoveryRoute.POST(
    new Request("https://tickets.example/api/admin/event-discovery", {
      method: "POST",
      headers: {
        host: "tickets.example",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
