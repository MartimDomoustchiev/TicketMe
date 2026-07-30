import assert from "node:assert/strict";
import test from "node:test";
import { POST as purchasePost } from "../src/app/api/purchase/route";

function purchaseRequest(
  body: Record<string, unknown>,
  origin = "https://tickets.example",
) {
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
    body: JSON.stringify(body),
  });
}

test("on-site purchase requires an explicit demo-payment confirmation", async () => {
  const response = await purchasePost(
    purchaseRequest({
      eventId: "ticketme-live-next-wave-2027",
      ticketType: "standard",
      locale: "en",
      paymentMode: "demo",
      demoConfirmed: false,
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Confirm the demo payment before issuing the ticket.",
  });
});

test("on-site demo payment rejects cross-site requests before ticket allocation", async () => {
  const response = await purchasePost(
    purchaseRequest(
      {
        eventId: "ticketme-live-next-wave-2027",
        ticketType: "standard",
        locale: "bg",
        paymentMode: "demo",
        demoConfirmed: true,
      },
      "https://evil.example",
    ),
  );

  assert.equal(response.status, 403);
});
