import { createHash, timingSafeEqual } from "node:crypto";
import { getBaseUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MINIMUM_CRON_SECRET_LENGTH = 32;
const MAXIMUM_BEARER_TOKEN_LENGTH = 1_024;
const DELIVERY_BATCH_SIZE = 5;

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

function configuredCronSecret(): string {
  const vercelSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (vercelSecret.length >= MINIMUM_CRON_SECRET_LENGTH) {
    return vercelSecret;
  }

  // Keep existing deployments working while they migrate from the event
  // discovery scheduler's legacy secret to Vercel's standard CRON_SECRET.
  return process.env.EVENT_DISCOVERY_CRON_SECRET?.trim() ?? "";
}

async function handleDelivery(request: Request): Promise<Response> {
  const cronSecret = configuredCronSecret();
  if (cronSecret.length < MINIMUM_CRON_SECRET_LENGTH) {
    console.error(
      "Ticket delivery recovery is disabled because CRON_SECRET is missing or too short.",
    );
    return jsonResponse(
      { error: "Ticket delivery scheduler is not configured." },
      503,
    );
  }

  if (!hasValidCronAuthorization(request, cronSecret)) {
    return jsonResponse(
      { error: "Unauthorized." },
      401,
      { "WWW-Authenticate": 'Bearer realm="ticket-delivery"' },
    );
  }

  try {
    const { recoverTicketDeliveries } = await import(
      "@/lib/ticket-delivery-recovery"
    );
    const result = await recoverTicketDeliveries({
      baseUrl: getBaseUrl(request),
      limit: DELIVERY_BATCH_SIZE,
      reconcileStripe: true,
    });
    return jsonResponse(
      { ok: result.failed === 0, result },
      result.failed === 0 ? 200 : 500,
    );
  } catch (error) {
    console.error("Scheduled ticket delivery recovery failed.", error);
    return jsonResponse({ error: "Ticket delivery recovery failed." }, 500);
  }
}

/**
 * Vercel Cron invokes the production GET route with CRON_SECRET as a bearer
 * token. POST keeps the same operation available to trusted schedulers.
 */
export async function GET(request: Request): Promise<Response> {
  return handleDelivery(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleDelivery(request);
}
