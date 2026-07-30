import assert from "node:assert/strict";
import test from "node:test";
import { POST as purchasePost } from "../src/app/api/purchase/route";

function purchaseRequest(origin = "https://tickets.example") {
  return new Request("https://tickets.example/api/purchase", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "tickets.example",
      origin,
      "sec-fetch-site":
        origin === "https://tickets.example"
          ? "same-origin"
          : "cross-site",
    },
    body: "{}",
  });
}

test("direct demo ticket issuing is disabled", async () => {
  const response = await purchasePost(purchaseRequest());

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    error:
      "Direct demo ticket issuing has been removed. Continue with the embedded Stripe test checkout.",
  });
});

test("retired direct purchase route still rejects cross-site requests", async () => {
  const response = await purchasePost(
    purchaseRequest("https://evil.example"),
  );

  assert.equal(response.status, 403);
});
