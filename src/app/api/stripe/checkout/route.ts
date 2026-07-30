import { getBuyerSession } from "@/lib/auth";
import {
  getEventById,
  isEventOpenForInternalSale,
  isTicketTypeId,
} from "@/lib/event";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl } from "@/lib/site";
import {
  attachCheckoutSession,
  cancelCheckoutReservation,
  reserveCheckoutTicket,
} from "@/lib/store";
import {
  getStripeClient,
  isStripeEmbeddedTestConfigured,
  stripeMode,
} from "@/lib/stripe";
import { buildStripeCheckoutSessionParams } from "@/lib/stripe-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = {
  eventId?: unknown;
  ticketType?: unknown;
  locale?: unknown;
};

const ERROR_COPY = {
  bg: {
    rateLimit: "Твърде много заявки. Опитай отново след малко.",
    signIn: "Първо потвърди имейла си.",
    unavailable: "Плащането временно не е достъпно. Опитай отново след малко.",
    invalidOrigin: "Невалиден източник на заявката.",
    eventUnavailable: "Събитието вече не е достъпно.",
    invalidTicket: "Избери валидна категория билет.",
    soldOut: "Тази категория вече е изчерпана.",
    activeCheckout:
      "Вече имаш активно плащане за това събитие. Завърши го или освободи билета.",
    busy: "В момента има много заявки. Опитай отново след няколко секунди.",
    failed: "Не успяхме да стартираме сигурното плащане. Опитай отново.",
  },
  en: {
    rateLimit: "Too many requests. Please try again shortly.",
    signIn: "Verify your email before purchasing.",
    unavailable: "Payments are temporarily unavailable. Please try again shortly.",
    invalidOrigin: "Invalid request origin.",
    eventUnavailable: "This event is no longer available.",
    invalidTicket: "Choose a valid ticket category.",
    soldOut: "This ticket category has just sold out.",
    activeCheckout:
      "You already have an active checkout for this event. Finish it or release the ticket first.",
    busy: "Demand is high right now. Please try again in a few seconds.",
    failed: "We could not start secure checkout. Please try again.",
  },
} as const;

function checkoutError(
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return Response.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  const locale = body?.locale === "en" ? "en" : "bg";
  const errorCopy = ERROR_COPY[locale];
  const rateLimit = consumeRateLimit({
    key: `stripe-checkout:${requestIdentity(request)}`,
    limit: 8,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return checkoutError(errorCopy.rateLimit, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  if (!isSameOriginRequest(request)) {
    return checkoutError(errorCopy.invalidOrigin, 403);
  }

  const session = await getBuyerSession();
  if (!session) {
    return checkoutError(errorCopy.signIn, 401);
  }

  if (!isStripeEmbeddedTestConfigured()) {
    return checkoutError(errorCopy.unavailable, 503, { "Retry-After": "30" });
  }

  const baseUrl = getBaseUrl(request);

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const ticketTypeId = body?.ticketType;
  const event = getEventById(eventId);

  if (
    !event ||
    !isEventOpenForInternalSale(event) ||
    !isTicketTypeId(ticketTypeId)
  ) {
    return checkoutError(errorCopy.eventUnavailable, 404);
  }

  const ticketType = event.ticketTypes.find((type) => type.id === ticketTypeId);
  if (!ticketType) {
    return checkoutError(errorCopy.invalidTicket, 400);
  }

  let reservation: Awaited<ReturnType<typeof reserveCheckoutTicket>> | null =
    null;
  let stripeSessionId: string | null = null;

  try {
    // Stripe allows a minimum 30-minute Checkout lifetime. Use 31 minutes so
    // clock and request latency cannot put expires_at below Stripe's minimum.
    // The local reservation keeps a short webhook-delivery grace period; the
    // checkout.session.expired event normally releases it immediately.
    reservation = await reserveCheckoutTicket({
      eventId: event.id,
      buyerName: session.name,
      buyerEmail: session.email,
      ticketType: ticketTypeId,
      locale,
      expiresInMs: 35 * 60_000,
    });

    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create(
      buildStripeCheckoutSessionParams({
        baseUrl,
        event,
        expiresAtUnix: Math.floor(Date.now() / 1000) + 31 * 60,
        locale,
        reservationId: reservation.id,
        ticketType,
        buyerEmail: session.email,
      }),
      { idempotencyKey: `ticketme-embedded-checkout-${reservation.id}` },
    );

    stripeSessionId = checkoutSession.id;

    if (!checkoutSession.client_secret) {
      throw new Error("STRIPE_CHECKOUT_CLIENT_SECRET_MISSING");
    }

    await attachCheckoutSession({
      reservationId: reservation.id,
      stripeCheckoutSessionId: checkoutSession.id,
    });

    return Response.json({
      clientSecret: checkoutSession.client_secret,
      checkoutSessionId: checkoutSession.id,
      reservationId: reservation.id,
      expiresAt: reservation.expiresAt,
      mode: stripeMode(),
    });
  } catch (error) {
    if (stripeSessionId) {
      await getStripeClient().checkout.sessions.expire(stripeSessionId).catch(
        () => undefined,
      );
    }

    if (reservation) {
      await cancelCheckoutReservation(reservation.id).catch(() => undefined);
    }

    const message = (error as Error).message;
    if (message === "SOLD_OUT") {
      return checkoutError(errorCopy.soldOut, 409);
    }

    if (message === "ACTIVE_CHECKOUT_EXISTS") {
      return Response.json(
        {
          code: "ACTIVE_CHECKOUT_EXISTS",
          error: errorCopy.activeCheckout,
        },
        { status: 409 },
      );
    }

    if (
      message === "QUEUE_TIMEOUT" ||
      message === "QUEUE_LEASE_EXPIRED" ||
      message === "QUEUE_UNAVAILABLE"
    ) {
      return checkoutError(
        errorCopy.busy,
        503,
        { "Retry-After": "5" },
      );
    }

    console.error("Stripe Checkout creation failed", error);
    return checkoutError(errorCopy.failed, 500);
  }
}
