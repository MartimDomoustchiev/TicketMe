import { findCatalogEventById } from "@/lib/catalog";
import { EVENT, isEventOpenForTicketMeCheckout } from "@/lib/event";
import {
  getAvailability,
  getPurchaseActivity,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("eventId");
  const event = requestedId
    ? await findCatalogEventById(requestedId)
    : EVENT;

  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  const checkoutEnabled = isEventOpenForTicketMeCheckout(event);
  const [availability, activity] = checkoutEnabled
    ? await Promise.all([
        getAvailability(event.id),
        getPurchaseActivity(event.id),
      ])
    : [null, null];

  return Response.json(
    {
      event,
      availability,
      activity,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
