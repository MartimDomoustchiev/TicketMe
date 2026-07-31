import assert from "node:assert/strict";
import test from "node:test";
import * as deliveryRoute from "../src/app/api/cron/tickets/deliver/route";

const VALID_CRON_SECRET = "test-ticket-delivery-secret-32-bytes";

async function withCronSecret<T>(
  value: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = process.env.CRON_SECRET;
  const previousLegacy = process.env.EVENT_DISCOVERY_CRON_SECRET;
  delete process.env.EVENT_DISCOVERY_CRON_SECRET;
  if (value === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = value;
  }

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
    if (previousLegacy === undefined) {
      delete process.env.EVENT_DISCOVERY_CRON_SECRET;
    } else {
      process.env.EVENT_DISCOVERY_CRON_SECRET = previousLegacy;
    }
  }
}

test("ticket delivery recovery supports Vercel GET and trusted POST", () => {
  assert.equal("GET" in deliveryRoute, true);
  assert.equal("POST" in deliveryRoute, true);
});

test("ticket delivery recovery fails closed without a strong cron secret", async () => {
  for (const secret of [undefined, "too-short"]) {
    const response = await withCronSecret(secret, () =>
      deliveryRoute.GET(
        new Request("https://tickets.example/api/cron/tickets/deliver", {
          headers: { authorization: `Bearer ${secret ?? ""}` },
        }),
      ),
    );

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("ticket delivery recovery rejects an invalid bearer secret", async () => {
  const response = await withCronSecret(VALID_CRON_SECRET, () =>
    deliveryRoute.POST(
      new Request("https://tickets.example/api/cron/tickets/deliver", {
        method: "POST",
        headers: { authorization: "Bearer definitely-not-the-secret" },
      }),
    ),
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("www-authenticate"),
    'Bearer realm="ticket-delivery"',
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});
