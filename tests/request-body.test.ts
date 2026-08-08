import assert from "node:assert/strict";
import test from "node:test";
import {
  readJsonBodyWithinLimit,
  readTextBodyWithinLimit,
  readUrlEncodedBodyWithinLimit,
} from "../src/lib/request-body";

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

test("bounded JSON parser accepts a typed in-limit payload", async () => {
  const request = new Request("https://tiketko.top/api/example", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ eventId: "event-1" }),
  });

  const result = await readJsonBodyWithinLimit<{ eventId: string }>(
    request,
    1_024,
  );
  assert.deepEqual(result, {
    ok: true,
    value: { eventId: "event-1" },
  });
});

test("bounded parsers reject declared and streamed oversized bodies", async () => {
  const declared = new Request("https://tiketko.top/api/example", {
    method: "POST",
    headers: {
      "content-length": "9000",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.deepEqual(await readJsonBodyWithinLimit(declared, 8_192), {
    ok: false,
    error: "payload-too-large",
    status: 413,
  });

  const encoder = new TextEncoder();
  const streamed = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"value":"'));
      controller.enqueue(encoder.encode("x".repeat(128)));
      controller.enqueue(encoder.encode('"}'));
      controller.close();
    },
  });
  const streamedRequest = new Request("https://tiketko.top/api/example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: streamed,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.deepEqual(await readJsonBodyWithinLimit(streamedRequest, 64), {
    ok: false,
    error: "payload-too-large",
    status: 413,
  });
});

test("bounded JSON parser rejects malformed JSON and unsupported media", async () => {
  const malformed = new Request("https://tiketko.top/api/example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.deepEqual(await readJsonBodyWithinLimit(malformed, 1_024), {
    ok: false,
    error: "invalid-body",
    status: 400,
  });

  let bodyRead = false;
  const unsupported = {
    headers: new Headers({ "content-type": "text/plain" }),
    get body() {
      bodyRead = true;
      throw new Error("The unsupported body must not be read.");
    },
  } as unknown as Request;
  assert.deepEqual(await readJsonBodyWithinLimit(unsupported, 1_024), {
    ok: false,
    error: "unsupported-media-type",
    status: 415,
  });
  assert.equal(bodyRead, false);
});

test("bounded URL-encoded parser decodes an in-limit form", async () => {
  const request = new Request("https://tiketko.top/api/session", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: "email=buyer%40example.com&name=Test+Buyer",
  });

  const result = await readUrlEncodedBodyWithinLimit(request, 1_024);
  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Expected the URL-encoded body to parse.");
  }
  assert.equal(result.value.get("email"), "buyer@example.com");
  assert.equal(result.value.get("name"), "Test Buyer");
});
