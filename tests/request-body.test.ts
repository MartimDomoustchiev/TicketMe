import assert from "node:assert/strict";
import test from "node:test";
import { readTextBodyWithinLimit } from "../src/lib/request-body";

test("bounded body reader preserves an in-limit UTF-8 payload", async () => {
  const payload = JSON.stringify({ message: "Здравей" });
  const request = new Request("https://tiketko.top/webhook", {
    method: "POST",
    body: payload,
  });

  assert.equal(
    await readTextBodyWithinLimit(request, Buffer.byteLength(payload)),
    payload,
  );
});

test("bounded body reader rejects chunked payloads beyond the limit", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("12345"));
      controller.enqueue(encoder.encode("67890"));
      controller.close();
    },
  });
  const request = new Request("https://tiketko.top/webhook", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.equal(await readTextBodyWithinLimit(request, 9), null);
});
