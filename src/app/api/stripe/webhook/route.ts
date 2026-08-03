import { after } from "next/server";
import type Stripe from "stripe";
import { readTextBodyWithinLimit } from "@/lib/request-body";
import { getBaseUrl } from "@/lib/site";
import {
  deliverCheckoutTicket,
  expireStripeCheckout,
  recordPaidCheckout,
} from "@/lib/stripe-fulfillment";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_WEBHOOK_BYTES = 1_000_000;

function webhookResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return webhookResponse({ error: "Payload too large." }, 413);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return webhookResponse({ error: "Missing Stripe signature." }, 400);
  }

  let event: Stripe.Event;
  try {
    const payload = await readTextBodyWithinLimit(
      request,
      MAX_WEBHOOK_BYTES,
    );
    if (payload === null) {
      return webhookResponse({ error: "Payload too large." }, 413);
    }
    event = getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    console.warn(
      "Stripe webhook signature verification failed",
      (error as Error).message,
    );
    return webhookResponse({ error: "Invalid Stripe signature." }, 400);
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    // Delayed payment methods can emit completed before the payment is paid.
    // The async success event will return later in that case.
    if (checkoutSession.payment_status !== "paid") {
      return webhookResponse({ received: true, pending: true });
    }

    try {
      // Persist the paid order before acknowledging Stripe. This is the short,
      // transactionally idempotent step that Stripe may safely retry.
      const recorded = await recordPaidCheckout(checkoutSession);
      const baseUrl = getBaseUrl(request);

      // PDF generation, object storage, and email happen outside the response.
      // A durable claim lease prevents webhook/success-page duplication.
      after(async () => {
        try {
          await deliverCheckoutTicket(recorded.reservation.id, baseUrl);
        } catch (error) {
          console.error("Stripe ticket delivery failed", error);
        }
      });
    } catch (error) {
      console.error("Stripe checkout fulfillment failed", error);
      return webhookResponse({ error: "Fulfillment failed." }, 500);
    }
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    try {
      await expireStripeCheckout(checkoutSession);
    } catch (error) {
      console.error("Stripe reservation release failed", error);
      return webhookResponse({ error: "Reservation release failed." }, 500);
    }
  }

  return webhookResponse({ received: true });
}
