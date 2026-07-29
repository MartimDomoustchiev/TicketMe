import {
  findCatalogEventById,
  isInternallySoldEvent,
} from "@/lib/catalog";
import { EVENT } from "@/lib/event";
import { getAvailability } from "@/lib/store";

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

  return Response.json({
    event,
    availability: isInternallySoldEvent(event)
      ? await getAvailability(event.id)
      : null,
  });
}
