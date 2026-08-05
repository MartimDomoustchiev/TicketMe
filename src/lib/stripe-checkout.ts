import type Stripe from "stripe";
import {
  isTestSimulationEvent,
  type CatalogEvent,
  type TicketType,
} from "@/lib/event";

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

  const productImageUrl = new URL(
    input.event.image,
    `${input.baseUrl.replace(/\/+$/u, "")}/`,
  );
  const productImages =
    productImageUrl.protocol === "https:" ? [productImageUrl.href] : undefined;
  const testSimulation = isTestSimulationEvent(input.event);

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
          currency: input.ticketType.currency.toLowerCase(),
          unit_amount: Math.round(input.ticketType.price * 100),
          product_data: {
            name: testSimulation
              ? `TEST TICKET — ${input.event.title}`
              : input.event.title,
            description: testSimulation
              ? `${input.ticketType.label} · Stripe test payment · Not valid for venue entry`
              : `${input.ticketType.label} · ${input.event.venue}`,
            ...(productImages ? { images: productImages } : {}),
            metadata: {
              eventId: input.event.id,
              ticketType: input.ticketType.id,
              offerKind: input.event.checkoutMode ?? "source-only",
            },
          },
        },
      },
    ],
    metadata: {
      reservationId: input.reservationId,
      eventId: input.event.id,
      ticketType: input.ticketType.id,
      offerKind: input.event.checkoutMode ?? "source-only",
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
