import { getBuyerSession } from "@/lib/auth";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/site";
import {
  cancelCheckoutReservation,
  getCheckoutReservation,
} from "@/lib/store";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CancelBody = {
  reservationId?: unknown;
};

export async function POST(request: Request) {
  const rateLimit = consumeRateLimit({
    key: `stripe-cancel:${requestIdentity(request)}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const requestOrigin = request.headers.get("origin");
  if (
    requestOrigin &&
    requestOrigin !== new URL(getBaseUrl(request)).origin
  ) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const buyer = await getBuyerSession();
  if (!buyer) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CancelBody | null;
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
