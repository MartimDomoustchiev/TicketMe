import { getBuyerSession } from "@/lib/auth";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { readJsonBodyWithinLimit } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  cancelCheckoutReservation,
  getCheckoutReservation,
} from "@/lib/store";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_CANCEL_BODY_BYTES = 8 * 1024;

type CancelBody = {
  reservationId?: unknown;
};

export async function POST(request: Request) {
  const rateLimit = await consumeRateLimit({
    key: `stripe-cancel:${requestIdentity(request)}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (rateLimit.unavailable) {
    return Response.json(
      { error: "Service temporarily unavailable." },
      {
        status: 503,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const buyer = await getBuyerSession();
  if (!buyer) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsedBody = await readJsonBodyWithinLimit<CancelBody>(
    request,
    MAX_CANCEL_BODY_BYTES,
  );
  if (!parsedBody.ok) {
    return Response.json(
      { error: parsedBody.error },
      { status: parsedBody.status },
    );
  }
  const body = parsedBody.value;
  const reservationId =
    typeof body?.reservationId === "string" ? body.reservationId : "";
  if (!/^RSV-[A-F0-9]{24}$/.test(reservationId)) {
    return Response.json({ error: "Invalid reservation." }, { status: 400 });
  }

  const reservation = await getCheckoutReservation(reservationId);
  if (!reservation) {
    return Response.json({ ok: true });
  }

  if (
    reservation.buyerEmail.trim().toLowerCase() !==
    buyer.email.trim().toLowerCase()
  ) {
    return Response.json({ error: "Reservation not found." }, { status: 404 });
  }

  if (
    reservation.stripeCheckoutSessionId &&
    isStripeConfigured() &&
    (reservation.status === "reserved" ||
      reservation.status === "checkout_created")
  ) {
    const stripe = getStripeClient();
    let safeToRelease = false;

    try {
      const checkoutSession = await stripe.checkout.sessions.expire(
        reservation.stripeCheckoutSessionId,
      );
      safeToRelease = checkoutSession.status === "expired";
    } catch {
      try {
        const checkoutSession = await stripe.checkout.sessions.retrieve(
          reservation.stripeCheckoutSessionId,
        );
        safeToRelease = checkoutSession.status === "expired";

        if (checkoutSession.status === "complete") {
          return Response.json({ ok: true, completed: true });
        }
      } catch {
        return Response.json(
          { error: "Could not safely release the reservation yet." },
          { status: 503, headers: { "Retry-After": "5" } },
        );
      }
    }

    if (!safeToRelease) {
      return Response.json(
        { error: "Could not safely release the reservation yet." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
  } else if (
    reservation.stripeCheckoutSessionId &&
    !isStripeConfigured() &&
    (reservation.status === "reserved" ||
      reservation.status === "checkout_created")
  ) {
    return Response.json(
      { error: "Payment provider is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }

  await cancelCheckoutReservation(reservation.id);
  return Response.json({ ok: true });
}
