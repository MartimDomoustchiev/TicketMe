import assert from "node:assert/strict";
import test from "node:test";
import {
  isTransientPostgresReadError,
  retryTransientPostgresRead,
} from "../src/lib/transient-postgres-read";

const ALLOWED_CODES = [
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "08000",
  "08001",
  "08003",
  "08006",
  "08007",
  "25P03",
  "57P01",
  "57P03",
  "57P05",
] as const;

test("public PostgreSQL reads retry only explicit transport failures", () => {
  for (const code of ALLOWED_CODES) {
    assert.equal(isTransientPostgresReadError({ code }), true, code);
  }

  for (const code of [
    "57014",
    "53300",
    "28P01",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "25000",
    "40001",
    "40P01",
  ]) {
    assert.equal(isTransientPostgresReadError({ code }), false, code);
  }
  assert.equal(isTransientPostgresReadError(new Error("unknown")), false);
});

test("a transient public read retries exactly once with bounded delay", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const warnings: string[] = [];

  const result = await retryTransientPostgresRead(
    "catalog-list",
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("socket closed"), {
          code: "CONNECTION_CLOSED",
        });
      }
      return "ok";
    },
    {
      delayMs: 500,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      warn: (message) => warnings.push(message),
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [50]);
  assert.deepEqual(warnings, [
    "Transient PostgreSQL public read failed (catalog-list, CONNECTION_CLOSED); retrying once.",
  ]);
});

test("a second transient failure propagates without a third attempt", async () => {
  let attempts = 0;

  await assert.rejects(
    retryTransientPostgresRead(
      "availability",
      async () => {
        attempts += 1;
        throw Object.assign(new Error(`attempt ${attempts}`), {
          code: "ECONNRESET",
        });
      },
      {
        delayMs: 0,
        warn: () => undefined,
      },
    ),
    /attempt 2/,
  );
  assert.equal(attempts, 2);
});

test("query, capacity and unknown failures never retry", async () => {
  for (const code of ["57014", "53300", "28P01", "unknown"]) {
    let attempts = 0;
    let warned = false;
    const error = Object.assign(new Error(code), { code });

    await assert.rejects(
      retryTransientPostgresRead(
        "catalog-slug",
        async () => {
          attempts += 1;
          throw error;
        },
        {
          sleep: async () => {
            throw new Error("sleep must not run");
          },
          warn: () => {
            warned = true;
          },
        },
      ),
      (caught) => caught === error,
    );
    assert.equal(attempts, 1, code);
    assert.equal(warned, false, code);
  }
});
