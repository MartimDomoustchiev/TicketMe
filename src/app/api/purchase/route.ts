import { randomBytes } from "crypto";
import { getBuyerSession } from "@/lib/auth";
import { sendTicketEmail } from "@/lib/email";
import {
  getEventById,
  isEventOpenForInternalSale,
  isTicketTypeId,
} from "@/lib/event";
import { createTicketPdf } from "@/lib/pdf";
import { enqueuePurchase } from "@/lib/queue";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl } from "@/lib/site";
import {
  issueTicket,
  persistenceMode,
  rollbackIssuedTicket,
  updateTicketStorage,
} from "@/lib/store";
import { storeTicketPdf } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PurchaseBody = {
  eventId?: unknown;
  ticketType?: unknown;
  locale?: unknown;
  paymentMode?: unknown;
  demoConfirmed?: unknown;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Невалиден източник на заявката." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as PurchaseBody | null;
  const locale = body?.locale === "en" ? "en" : "bg";
  const english = locale === "en";

  if (body?.paymentMode !== "demo" || body.demoConfirmed !== true) {
    return Response.json(
      {
        error: english
          ? "Confirm the demo payment before issuing the ticket."
          : "Потвърди демо плащането, преди да издадем билета.",
      },
      { status: 400 },
    );
  }

  const rateLimit = consumeRateLimit({
    key: `purchase:${requestIdentity(request)}`,
    limit: 12,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: english
          ? "Too many requests. Please try again shortly."
          : "Твърде много заявки. Опитай отново след малко.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const session = await getBuyerSession();

  if (!session) {
    return Response.json(
      {
        error: english
          ? "Verify your email before purchasing."
          : "Първо потвърди имейла си.",
      },
      { status: 401 },
    );
  }

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const ticketType = body?.ticketType;
  const event = getEventById(eventId);

  if (
    !event ||
    !isEventOpenForInternalSale(event) ||
    !isTicketTypeId(ticketType)
  ) {
    return Response.json(
      {
        error: english
          ? "This event is no longer available."
          : "Събитието вече не е достъпно.",
      },
      { status: 404 },
    );
  }

  const selectedTicketType = event.ticketTypes.find(
    (type) => type.id === ticketType,
  );
  if (!selectedTicketType) {
    return Response.json(
      {
        error: english
          ? "Choose a valid ticket category."
          : "Избери валидна категория билет.",
      },
      { status: 400 },
    );
  }

  try {
    const allocateTicket = () =>
      issueTicket({
        eventId: event.id,
        buyerName: session.name,
        buyerEmail: session.email,
        ticketType,
        storageKey: "",
        storageUrl: "",
        qrSecret: randomBytes(18).toString("base64url"),
      });
    const queued =
      persistenceMode() === "postgres"
        ? { position: 1, result: await allocateTicket() }
        : await enqueuePurchase(
            `${event.id}:${ticketType}`,
            allocateTicket,
          );
    const { position, result: ticket } = queued;

    const baseUrl = getBaseUrl(request);
    let pdf: Uint8Array;
    let storedTicket;

    try {
      const verificationUrl = `${baseUrl}/api/tickets/${ticket.id}/verify?secret=${ticket.qrSecret}`;
      pdf = await createTicketPdf({
        ticket,
        verificationUrl,
        locale,
      });
      const storage = await storeTicketPdf({
        id: ticket.id,
        pdf,
        baseUrl,
      });
      storedTicket = await updateTicketStorage({
        id: ticket.id,
        storageKey: storage.storageKey,
        storageUrl: storage.storageUrl,
      });

      if (!storedTicket) {
        throw new Error("TICKET_PERSISTENCE_FAILED");
      }
    } catch (error) {
      await rollbackIssuedTicket(ticket.id);
      throw error;
    }

    let emailDelivered = true;
    try {
      await sendTicketEmail({
        to: session.email,
        name: session.name,
        ticketId: ticket.id,
        eventName: event.name,
        downloadUrl: storedTicket.storageUrl,
        pdf,
        locale,
      });
    } catch (error) {
      emailDelivered = false;
      console.error("Ticket email delivery failed", error);
    }

    return Response.json({
      ok: true,
      payment: {
        mode: "demo",
        reference: `DEMO-${randomBytes(8).toString("hex").toUpperCase()}`,
        charged: false,
        amount: selectedTicketType.price,
        currency: selectedTicketType.currency,
      },
      queuePosition: position,
      ticketId: storedTicket.id,
      ticketUrl: `/${locale}/tickets/${storedTicket.id}`,
      downloadUrl: storedTicket.storageUrl,
      printUrl: `${storedTicket.storageUrl}?print=1`,
      emailDelivered,
    });
  } catch (error) {
    const message = (error as Error).message;

    if (message === "SOLD_OUT") {
      return Response.json(
        {
          error: english
            ? "This ticket category has just sold out."
            : "Тази категория вече е изчерпана.",
        },
        { status: 409 },
      );
    }

    if (
      message === "QUEUE_TIMEOUT" ||
      message === "QUEUE_LEASE_EXPIRED" ||
      message === "QUEUE_UNAVAILABLE"
    ) {
      return Response.json(
        {
          error: english
            ? "Demand is high right now. Please try again in a few seconds."
            : "В момента има много заявки. Моля, опитай отново след няколко секунди.",
        },
        {
          status: 503,
          headers: { "Retry-After": "5" },
        },
      );
    }

    console.error(error);
    return Response.json(
      {
        error: english
          ? "We could not issue the ticket. Please try again shortly."
          : "Не успяхме да издадем билет. Опитай пак след малко.",
      },
      { status: 500 },
    );
  }
}
