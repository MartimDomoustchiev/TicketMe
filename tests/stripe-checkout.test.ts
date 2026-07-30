import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT,
  PRIMARY_SALE_EVENT,
  type CatalogEvent,
  type TicketType,
} from "../src/lib/event";
import { buildStripeCheckoutSessionParams } from "../src/lib/stripe-checkout";

const TICKET_TYPE: TicketType = {
  id: "standard",
  label: "Standard",
  price: 50,
  priceLabel: "€50.00",
  currency: "EUR",
  capacity: 100,
  accent: "#2457ff",
  description: "Organizer-owned inventory fixture.",
};

const INTERNAL_EVENT: CatalogEvent = {
  ...EVENT,
  id: "organizer-owned-event",
  slug: "organizer-owned-event",
  priceFrom: TICKET_TYPE.price,
  priceLabel: TICKET_TYPE.priceLabel,
  saleMode: "internal",
  ticketTypes: [TICKET_TYPE],
};

test("embedded Checkout stays on-site and enables immediate card wallets", () => {
  const ticketType = TICKET_TYPE;
  const params = buildStripeCheckoutSessionParams({
    baseUrl: "https://tickets.example",
    event: INTERNAL_EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "en",
    reservationId: "RSV-WALLETTEST0001",
    ticketType,
    buyerEmail: "wallet@example.com",
  });

  assert.equal(params.mode, "payment");
  assert.equal(params.ui_mode, "embedded_page");
  assert.equal(params.redirect_on_completion, "never");
  assert.equal(params.success_url, undefined);
  assert.equal(params.cancel_url, undefined);
  assert.equal(params.return_url, undefined);
  assert.deepEqual(params.payment_method_types, ["card"]);
  assert.deepEqual(params.branding_settings, {
    display_name: "TicketMe",
    background_color: "#ffffff",
    button_color: "#1d4ed8",
    border_style: "rounded",
    font_family: "inter",
  });
  assert.equal(params.customer_email, "wallet@example.com");
  assert.equal(params.client_reference_id, "RSV-WALLETTEST0001");

  const lineItems = params.line_items;
  assert.ok(Array.isArray(lineItems));
  assert.equal(lineItems[0]?.price_data?.currency, "eur");
  assert.equal(
    lineItems[0]?.price_data?.unit_amount,
    Math.round(ticketType.price * 100),
  );
  assert.deepEqual(lineItems[0]?.price_data?.product_data?.images, [
    new URL(INTERNAL_EVENT.image, "https://tickets.example/").href,
  ]);
});

test("first-party sale event produces the configured Checkout amount and metadata", () => {
  const standard = PRIMARY_SALE_EVENT.ticketTypes.find(
    (ticketType) => ticketType.id === "standard",
  );
  assert.ok(standard);

  const params = buildStripeCheckoutSessionParams({
    baseUrl: "https://www.ticketme.store",
    event: PRIMARY_SALE_EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "bg",
    reservationId: "RSV-PRIMARYSALE0001",
    ticketType: standard,
    buyerEmail: "verified@example.com",
  });
  const lineItems = params.line_items;

  assert.ok(Array.isArray(lineItems));
  assert.equal(lineItems[0]?.price_data?.unit_amount, 3_900);
  assert.equal(lineItems[0]?.price_data?.currency, "eur");
  assert.equal(params.metadata?.eventId, PRIMARY_SALE_EVENT.id);
  assert.equal(params.metadata?.ticketType, "standard");
  assert.equal(params.customer_email, "verified@example.com");
});

test("Checkout rejects an event and ticket currency mismatch", () => {
  const ticketType = {
    ...TICKET_TYPE,
    currency: "USD" as never,
  };

  assert.throws(
    () =>
      buildStripeCheckoutSessionParams({
        baseUrl: "https://tickets.example",
        event: INTERNAL_EVENT,
        expiresAtUnix: 1_800_000_000,
        locale: "bg",
        reservationId: "RSV-CURRENCYMISMATCH",
        ticketType,
        buyerEmail: "wallet@example.com",
      }),
    /CHECKOUT_CURRENCY_MISMATCH/,
  );
});

test("local Checkout omits an image Stripe cannot fetch over HTTPS", () => {
  const params = buildStripeCheckoutSessionParams({
    baseUrl: "http://localhost:3000",
    event: INTERNAL_EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "en",
    reservationId: "RSV-LOCALIMAGE0001",
    ticketType: TICKET_TYPE,
    buyerEmail: "local@example.com",
  });
  const lineItems = params.line_items;

  assert.ok(Array.isArray(lineItems));
  assert.equal(lineItems[0]?.price_data?.product_data?.images, undefined);
});
