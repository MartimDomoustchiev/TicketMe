import { getActiveAccount } from "@/lib/auth";
import { invalidatePublicCatalogCache } from "@/lib/catalog-cache";
import { runEventDiscovery } from "@/lib/event-discovery";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const account = await getActiveAccount();
  if (account?.role !== "admin") {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const rateLimit = await consumeRateLimit({
    key: `admin-discovery:${account.email.trim().toLowerCase()}`,
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: rateLimit.unavailable
          ? "Service unavailable."
          : "Too many discovery requests.",
      },
      rateLimit.unavailable ? 503 : 429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  try {
    const result = await runEventDiscovery({
      trigger: "admin",
      requestedBy: account.email,
    });
    return jsonResponse({ ok: true, result });
  } catch (error) {
    console.error("Admin event discovery failed.", error);
    return jsonResponse({ error: "Event discovery failed." }, 500);
  } finally {
    // Discovery writes are intentionally incremental rather than one large
    // transaction. Invalidate even after partial failure or an "unchanged"
    // result because source attribution and translated facts may have moved.
    invalidatePublicCatalogCache();
  }
}
