import assert from "node:assert/strict";
import test from "node:test";
import { enqueuePurchase } from "../src/lib/queue";
import {
  isPublicHttpsBaseUrl,
  safeReturnPath,
} from "../src/lib/site";

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
  assert.equal(isPublicHttpsBaseUrl("https://ticketme.store"), true);
  assert.equal(isPublicHttpsBaseUrl("https://app.ticketme.store/"), true);
  assert.equal(isPublicHttpsBaseUrl("http://ticketme.store"), false);
  assert.equal(isPublicHttpsBaseUrl("http://localhost:3000"), false);
  assert.equal(isPublicHttpsBaseUrl("https://127.0.0.1"), false);
  assert.equal(isPublicHttpsBaseUrl("https://192.168.1.25"), false);
  assert.equal(
    isPublicHttpsBaseUrl("https://user:password@ticketme.store"),
    false,
  );
  assert.equal(isPublicHttpsBaseUrl("not a URL"), false);
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
