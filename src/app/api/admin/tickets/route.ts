import { isAdminSession } from "@/lib/auth";
import { listTickets } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminSession())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const tickets = (await listTickets()).map((ticket) => ({
    id: ticket.id,
    buyerName: ticket.buyerName,
    buyerEmail: ticket.buyerEmail,
    ticketType: ticket.ticketType,
    seatLabel: ticket.seatLabel,
    eventId: ticket.eventId,
    eventName: ticket.eventName,
    eventDate: ticket.eventDate,
    venue: ticket.venue,
    issuedAt: ticket.issuedAt,
    status: ticket.status,
  }));

  return Response.json({ tickets });
}
