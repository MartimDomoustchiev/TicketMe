import { getActiveAccount } from "@/lib/auth";
import { invalidatePublicCatalogCache } from "@/lib/catalog-cache";
import {
  publishCatalogEvent,
  rejectCatalogEvent,
} from "@/lib/catalog-postgres";
import { readJsonBodyWithinLimit } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REVIEW_BODY_BYTES = 8 * 1024;

type ReviewBody = {
  action?: unknown;
  eventId?: unknown;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return json({ error: "Forbidden." }, 403);
  }

  const account = await getActiveAccount();
  if (account?.role !== "admin") {
    return json({ error: "Forbidden." }, 403);
  }

  const parsedBody = await readJsonBodyWithinLimit<ReviewBody | null>(
    request,
    MAX_REVIEW_BODY_BYTES,
  );
  if (!parsedBody.ok) {
    return json({ error: parsedBody.error }, parsedBody.status);
  }
  const body = parsedBody.value;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.eventId !== "string" ||
    body.eventId.length < 1 ||
    body.eventId.length > 200 ||
    (body.action !== "publish" && body.action !== "reject")
  ) {
    return json({ error: "Invalid review request." }, 400);
  }

  try {
    const event =
      body.action === "publish"
        ? await publishCatalogEvent({
            eventId: body.eventId,
            reviewedBy: account.email,
          })
        : await rejectCatalogEvent({
            eventId: body.eventId,
            reviewedBy: account.email,
            reason: "Rejected from the organizer review queue.",
          });

    return event
      ? json({ ok: true, event })
      : json({ error: "Event is no longer pending." }, 409);
  } catch (error) {
    console.error("Event discovery review failed.", error);
    return json({ error: "Review could not be saved." }, 503);
  } finally {
    // A publish can commit before a follow-up read or response fails. Always
    // attempt invalidation so a retry/no-op still repairs public cache state.
    if (body.action === "publish") {
      invalidatePublicCatalogCache();
    }
  }
}
