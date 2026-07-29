import assert from "node:assert/strict";
import test from "node:test";
import { EVENT } from "../src/lib/event";
import { buildStripeCheckoutSessionParams } from "../src/lib/stripe-checkout";

test("hosted Checkout restricts payment methods to immediate card wallets", () => {
  const ticketType = EVENT.ticketTypes[1];
  const params = buildStripeCheckoutSessionParams({
    baseUrl: "https://tickets.example",
    event: EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "en",
    reservationId: "RSV-WALLETTEST0001",
    ticketType,
    buyerEmail: "wallet@example.com",
  });

  assert.equal(params.mode, "payment");
  assert.deepEqual(params.payment_method_types, ["card"]);
  assert.deepEqual(params.branding_settings, {
    display_name: "TicketForge",
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
});

test("Checkout rejects an event and ticket currency mismatch", () => {
  const ticketType = {
    ...EVENT.ticketTypes[0],
    currency: "USD" as never,
  };

  assert.throws(
    () =>
      buildStripeCheckoutSessionParams({
        baseUrl: "https://tickets.example",
        event: EVENT,
        expiresAtUnix: 1_800_000_000,
        locale: "bg",
        reservationId: "RSV-CURRENCYMISMATCH",
        ticketType,
        buyerEmail: "wallet@example.com",
      }),
    /CHECKOUT_CURRENCY_MISMATCH/,
  );
});
