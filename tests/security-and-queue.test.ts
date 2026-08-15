import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";
import { enqueuePurchase } from "../src/lib/queue";
import {
  isPublicHttpsBaseUrl,
  resolvePublicBaseUrl,
  safeReturnPath,
} from "../src/lib/site";

test("sensitive form pages preserve origin-only CSRF provenance", async () => {
  assert.ok(nextConfig.headers);
  const rules = await nextConfig.headers();
  const referrerPolicyFor = (source: string) =>
    rules
      .find((rule) => rule.source === source)
      ?.headers.find((header) => header.key === "Referrer-Policy")?.value;

  assert.equal(
    referrerPolicyFor("/:locale(bg|en)/verify"),
    "strict-origin",
  );
  assert.equal(
    referrerPolicyFor("/:locale(bg|en)/admin/check-in"),
    "strict-origin",
  );
  assert.equal(
    referrerPolicyFor("/api/tickets/:id/verify"),
    "no-referrer",
  );
});

test("safeReturnPath permits local destinations and rejects open redirects", () => {
  assert.equal(
    safeReturnPath("/events?category=Concerts#tickets"),
    "/events?category=Concerts#tickets",
  );
  assert.equal(safeReturnPath("//evil.example/admin", "/events"), "/events");
  assert.equal(
    safeReturnPath("https://evil.example/admin", "/events"),
    "/events",
  );
  assert.equal(safeReturnPath("", "/events"), "/events");
});

test("production base URLs require a public HTTPS origin", () => {
  assert.equal(isPublicHttpsBaseUrl("https://tiketko.top"), true);
  assert.equal(isPublicHttpsBaseUrl("https://app.tiketko.top/"), true);
  assert.equal(isPublicHttpsBaseUrl("http://tiketko.top"), false);
  assert.equal(isPublicHttpsBaseUrl("http://localhost:3000"), false);
  assert.equal(isPublicHttpsBaseUrl("https://127.0.0.1"), false);
  assert.equal(isPublicHttpsBaseUrl("https://192.168.1.25"), false);
  assert.equal(
    isPublicHttpsBaseUrl("https://user:password@tiketko.top"),
    false,
  );
  assert.equal(isPublicHttpsBaseUrl("not a URL"), false);
});

test("public base URL falls back to Vercel production domains", () => {
  assert.equal(
    resolvePublicBaseUrl({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      VERCEL_PROJECT_PRODUCTION_URL: "www.tiketko.top",
    }),
    "https://www.tiketko.top",
  );
  assert.equal(
    resolvePublicBaseUrl({
      VERCEL_URL: "ticket-me-preview.vercel.app",
    }),
    "https://ticket-me-preview.vercel.app",
  );
  assert.equal(
    resolvePublicBaseUrl({
      NEXT_PUBLIC_APP_URL: "https://tiketko.top/",
      VERCEL_PROJECT_PRODUCTION_URL: "www.tiketko.top",
    }),
    "https://tiketko.top",
  );
});

test("the development queue executes a lane in FIFO order", async () => {
  const executionOrder: number[] = [];
  const queueKey = `test-${Date.now()}-${Math.random()}`;
  const requests = Array.from({ length: 12 }, (_, index) =>
    enqueuePurchase(queueKey, async () => {
      executionOrder.push(index);
      await new Promise((resolve) => setTimeout(resolve, 2));
      return index;
    }),
  );

  const results = await Promise.all(requests);

  assert.deepEqual(
    executionOrder,
    Array.from({ length: 12 }, (_, index) => index),
  );
  assert.deepEqual(
    results.map((result) => result.position),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    results.map((result) => result.result),
    Array.from({ length: 12 }, (_, index) => index),
  );
});
