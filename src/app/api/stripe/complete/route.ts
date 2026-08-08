import { getBuyerSession } from "@/lib/auth";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { readJsonBodyWithinLimit } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl } from "@/lib/site";
import {
  getCheckoutReservationBySession,
  getTicket,
} from "@/lib/store";
import { fulfillStripeCheckoutSession } from "@/lib/stripe-fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_COMPLETE_BODY_BYTES = 8 * 1024;

type CompleteBody = {
  sessionId?: unknown;
  locale?: unknown;
};

const COPY = {
  bg: {
    invalidOrigin: "Невалиден източник на заявката.",
    signIn: "Първо потвърди имейла си.",
    invalidSession: "Невалидна Stripe сесия.",
    notFound: "Плащането не е намерено.",
    pending: "Stripe все още потвърждава плащането.",
    failed: "Билетът още се подготвя. Опитай отново след малко.",
    rateLimit: "Твърде много заявки. Опитай отново след малко.",
  },
  en: {
    invalidOrigin: "Invalid request origin.",
    signIn: "Verify your email before purchasing.",
    invalidSession: "Invalid Stripe session.",
    notFound: "The payment could not be found.",
    pending: "Stripe is still confirming the payment.",
    failed: "The ticket is still being prepared. Please try again shortly.",
    rateLimit: "Too many requests. Please try again shortly.",
  },
} as const;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: COPY.bg.invalidOrigin },
      { status: 403 },
    );
  }

  const parsedBody = await readJsonBodyWithinLimit<CompleteBody>(
    request,
    MAX_COMPLETE_BODY_BYTES,
  );
  if (!parsedBody.ok) {
    return Response.json(
      { error: parsedBody.error },
      { status: parsedBody.status },
    );
  }
  const body = parsedBody.value;
  const locale = body?.locale === "en" ? "en" : "bg";
  const copy = COPY[locale];
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId : "";

  if (!/^cs_(?:test|live)_[A-Za-z0-9_]{8,240}$/.test(sessionId)) {
    return Response.json(
      { error: copy.invalidSession },
      { status: 400 },
    );
  }

  const rateLimit = await consumeRateLimit({
    key: `stripe-complete:${requestIdentity(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimit.unavailable) {
    return Response.json(
      { error: copy.failed },
      {
        status: 503,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (!rateLimit.allowed) {
    return Response.json(
      { error: copy.rateLimit },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const buyer = await getBuyerSession();
  if (!buyer) {
    return Response.json({ error: copy.signIn }, { status: 401 });
  }

  const reservation = await getCheckoutReservationBySession(sessionId).catch(
    () => null,
  );
  if (
    !reservation ||
    reservation.buyerEmail.trim().toLowerCase() !==
      buyer.email.trim().toLowerCase()
  ) {
    return Response.json({ error: copy.notFound }, { status: 404 });
  }

  try {
    const result = await fulfillStripeCheckoutSession(
      sessionId,
      getBaseUrl(request),
    );
    if (
      result.ticket.buyerEmail.trim().toLowerCase() !==
      buyer.email.trim().toLowerCase()
    ) {
      return Response.json({ error: copy.notFound }, { status: 404 });
    }

    return Response.json({
      ok: true,
      status: result.delivered ? "ready" : "processing",
      ticketId: result.ticket.id,
      ticketUrl: `/${locale}/tickets/${result.ticket.id}`,
      downloadUrl: `/api/tickets/${result.ticket.id}/download`,
      printUrl: `/api/tickets/${result.ticket.id}/download?print=1`,
      emailDelivered: result.delivered,
      paymentReference: sessionId,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === "CHECKOUT_NOT_PAID") {
      return Response.json(
        { error: copy.pending, status: "processing" },
        { status: 409, headers: { "Retry-After": "2" } },
      );
    }

    const latestReservation =
      await getCheckoutReservationBySession(sessionId).catch(() => null);
    const ticket = latestReservation?.ticketId
      ? await getTicket(latestReservation.ticketId).catch(() => null)
      : null;
    if (
      ticket &&
      ticket.buyerEmail.trim().toLowerCase() ===
        buyer.email.trim().toLowerCase()
    ) {
      const delivered = latestReservation?.deliveryStatus === "completed";

      return Response.json(
        {
          ok: true,
          status: delivered ? "ready" : "processing",
          ticketId: ticket.id,
          ticketUrl: `/${locale}/tickets/${ticket.id}`,
          downloadUrl: `/api/tickets/${ticket.id}/download`,
          printUrl: `/api/tickets/${ticket.id}/download?print=1`,
          emailDelivered: delivered,
          paymentReference: sessionId,
        },
        delivered
          ? { status: 200 }
          : { status: 202, headers: { "Retry-After": "2" } },
      );
    }

    console.error("Embedded Stripe completion failed", error);
    return Response.json(
      { error: copy.failed, status: "processing" },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
}
