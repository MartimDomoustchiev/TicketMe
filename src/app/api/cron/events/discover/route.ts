import { createHash, timingSafeEqual } from "node:crypto";
import { runEventDiscovery } from "@/lib/event-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINIMUM_CRON_SECRET_LENGTH = 32;
const MAXIMUM_BEARER_TOKEN_LENGTH = 1_024;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization);
  const token = match?.[1] ?? "";
  return token && token.length <= MAXIMUM_BEARER_TOKEN_LENGTH ? token : null;
}

function digestSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function hasValidCronAuthorization(request: Request, expected: string): boolean {
  const provided = bearerToken(request);
  const matches = timingSafeEqual(
    digestSecret(provided ?? ""),
    digestSecret(expected),
  );
  return provided !== null && matches;
}

export async function POST(request: Request) {
  const cronSecret = process.env.EVENT_DISCOVERY_CRON_SECRET ?? "";
  if (cronSecret.trim().length < MINIMUM_CRON_SECRET_LENGTH) {
    console.error(
      "Event discovery cron is disabled because EVENT_DISCOVERY_CRON_SECRET is missing or too short.",
    );
    return jsonResponse(
      { error: "Event discovery scheduler is not configured." },
      503,
    );
  }

  if (!hasValidCronAuthorization(request, cronSecret)) {
    return jsonResponse(
      { error: "Unauthorized." },
      401,
      { "WWW-Authenticate": 'Bearer realm="event-discovery"' },
    );
  }

  try {
    const result = await runEventDiscovery({ trigger: "cron" });
    return jsonResponse({ ok: true, result });
  } catch (error) {
    console.error("Scheduled event discovery failed.", error);
    return jsonResponse({ error: "Event discovery failed." }, 500);
  }
}
