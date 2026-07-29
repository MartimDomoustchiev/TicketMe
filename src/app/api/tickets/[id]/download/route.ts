import { getBuyerSession, isAdminSession } from "@/lib/auth";
import { getTicket } from "@/lib/store";
import { readTicketPdf } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await getTicket(id);
  const [session, admin] = await Promise.all([
    getBuyerSession(),
    isAdminSession(),
  ]);

  if (!ticket) {
    return Response.json({ error: "Билетът не е намерен." }, { status: 404 });
  }

  if (
    session?.email.trim().toLowerCase() !==
      ticket.buyerEmail.trim().toLowerCase() &&
    !admin
  ) {
    return Response.json({ error: "Нямаш достъп до този билет." }, { status: 403 });
  }

  const pdf = await readTicketPdf({
    id: ticket.id,
    storageKey: ticket.storageKey,
  });

  if (!pdf) {
    return Response.json({ error: "PDF файлът липсва." }, { status: 404 });
  }

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ticket.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
