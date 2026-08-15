import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("public health response exposes status only and caches its probe", async () => {
  const route = await readFile(
    path.join(process.cwd(), "src/app/api/health/route.ts"),
    "utf8",
  );

  assert.match(route, /READINESS_CACHE_TTL_MS\s*=\s*30_000/);
  assert.match(route, /status: ready \? "ready" : "degraded"/);
  assert.match(route, /"Cache-Control": "no-store"/);
  const publicResponse = route.slice(route.lastIndexOf("return Response.json("));
  for (const privateField of [
    "checks:",
    "databaseReachable:",
    "databaseSchemaReady:",
    "runtimePrivilegesReady:",
    "databaseTls:",
    "paymentMode:",
    "fulfillmentMode:",
    "timestamp:",
  ]) {
    assert.doesNotMatch(publicResponse, new RegExp(privateField));
  }
});
