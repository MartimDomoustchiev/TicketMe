import { getActiveAccount } from "@/lib/auth";
import {
  publishCatalogEvent,
  rejectCatalogEvent,
} from "@/lib/catalog-postgres";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (
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
  }
}
