import type Stripe from "stripe";
import type { CatalogEvent, TicketType } from "@/lib/event";
import { createCheckoutPurchaseSnapshot } from "@/lib/checkout-purchase-snapshot";

type BuildStripeCheckoutParamsInput = {
  baseUrl: string;
  event: CatalogEvent;
  expiresAtUnix: number;
  locale: "bg" | "en";
  reservationId: string;
  ticketType: TicketType;
  buyerEmail: string;
};

export function buildStripeCheckoutSessionParams(
  input: BuildStripeCheckoutParamsInput,
): Stripe.Checkout.SessionCreateParams {
  if (input.event.currency !== input.ticketType.currency) {
    throw new Error("CHECKOUT_CURRENCY_MISMATCH");
  }
  const purchaseSnapshot = createCheckoutPurchaseSnapshot(
    input.event,
    input.ticketType,
  );

  const productImageUrl = new URL(
    input.event.image,
    `${input.baseUrl.replace(/\/+$/u, "")}/`,
  );
  const productImages =
    productImageUrl.protocol === "https:" ? [productImageUrl.href] : undefined;
  const testSimulation = purchaseSnapshot.offerKind === "test-simulation";

  return {
    mode: "payment",
    ui_mode: "embedded_page",
    redirect_on_completion: "never",
    branding_settings: {
      display_name: "Tiketko",
      background_color: "#ffffff",
      button_color: "#1d4ed8",
      border_style: "rounded",
      font_family: "inter",
    },
    // Apple Pay and Google Pay are card wallets in Stripe Checkout. Restricting
    // the session to card rails keeps both wallets eligible while excluding
    // delayed methods that could settle after the ticket reservation expires.
    payment_method_types: ["card"],
    client_reference_id: input.reservationId,
    customer_email: input.buyerEmail,
    locale: input.locale,
    expires_at: input.expiresAtUnix,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: purchaseSnapshot.currency.toLowerCase(),
          unit_amount: purchaseSnapshot.unitAmountMinor,
          product_data: {
            name: testSimulation
              ? `TEST TICKET — ${purchaseSnapshot.eventName}`
              : purchaseSnapshot.eventName,
            description: testSimulation
              ? `${purchaseSnapshot.ticketLabel} · Stripe test payment · Not valid for venue entry`
              : `${purchaseSnapshot.ticketLabel} · ${purchaseSnapshot.venue}`,
            ...(productImages ? { images: productImages } : {}),
            metadata: {
              eventId: input.event.id,
              ticketType: input.ticketType.id,
              offerKind: purchaseSnapshot.offerKind,
            },
          },
        },
      },
    ],
    metadata: {
      reservationId: input.reservationId,
      eventId: input.event.id,
      ticketType: input.ticketType.id,
      offerKind: purchaseSnapshot.offerKind,
      locale: input.locale,
    },
    payment_intent_data: {
      metadata: {
        reservationId: input.reservationId,
        eventId: input.event.id,
      },
    },
  };
}
