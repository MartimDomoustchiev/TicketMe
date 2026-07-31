import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth";
import { getEventById, isTestSimulationEvent } from "@/lib/event";
import { isSameOriginRequest } from "@/lib/request-security";
import { getTicket, markTicketCheckedIn } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkInPath(id: string, secret: string, status?: string): string {
  const params = new URLSearchParams({ id, secret });
  if (status) {
    params.set("status", status);
  }
  return `/admin/check-in?${params.toString()}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = new URL(request.url).searchParams.get("secret") ?? "";
  const destination = checkInPath(id, secret);

  if (!(await isAdminSession())) {
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  redirect(destination);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Cross-site check-in request rejected." },
      { status: 403 },
    );
  }

  if (!(await isAdminSession())) {
    return Response.json(
      { error: "Нужна е активна admin сесия за check-in." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const isForm = contentType.includes("application/x-www-form-urlencoded");
  const secret = isForm
    ? String((await request.formData()).get("secret") ?? "")
    : String(
        (
          (await request.json().catch(() => null)) as {
            secret?: unknown;
          } | null
        )?.secret ?? "",
      );
  const existing = await getTicket(id);

  if (!existing || existing.qrSecret !== secret) {
    if (isForm) {
      redirect(checkInPath(id, secret, "invalid"));
    }
    return Response.json(
      { error: "Невалиден или липсващ билет." },
      { status: 404 },
    );
  }

  const event = getEventById(existing.eventId);
  if (event && isTestSimulationEvent(event)) {
    if (isForm) {
      redirect(checkInPath(id, secret, "test-ticket"));
    }
    return Response.json(
      {
        error:
          "This QR verifies a Stripe test ticket only; it is not valid for venue check-in.",
      },
      { status: 422 },
    );
  }

  if (existing.status === "checked_in") {
    if (isForm) {
      redirect(checkInPath(id, secret, "already-used"));
    }
    return Response.json(
      { error: "Билетът вече е използван." },
      { status: 409 },
    );
  }

  const ticket = await markTicketCheckedIn(id, secret, "admin");

  if (!ticket) {
    if (isForm) {
      redirect(checkInPath(id, secret, "already-used"));
    }
    return Response.json(
      { error: "Билетът вече е използван." },
      { status: 409 },
    );
  }

  if (isForm) {
    redirect(checkInPath(id, secret, "success"));
  }

  return Response.json({
    ok: true,
    ticketId: ticket.id,
    status: ticket.status,
    buyerName: ticket.buyerName,
    seatLabel: ticket.seatLabel,
  });
}
