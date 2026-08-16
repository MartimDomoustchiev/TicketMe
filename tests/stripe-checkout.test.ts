import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createCheckoutPurchaseSnapshot } from "../src/lib/checkout-purchase-snapshot";
import {
  EVENT,
  PRIMARY_SALE_EVENT,
  type CatalogEvent,
  type TicketType,
} from "../src/lib/event";
import { buildStripeCheckoutSessionParams } from "../src/lib/stripe-checkout";
import {
  assertStripeCheckoutOfferSafety,
  assertStripeCheckoutPurchaseSnapshot,
} from "../src/lib/stripe-offer-safety";

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
  checkoutMode: "admission",
  saleMode: "internal",
  ticketTypes: [TICKET_TYPE],
};

test("checkout rejects cross-origin requests before reading a bounded body", async () => {
  const route = await readFile(
    path.join(
      process.cwd(),
      "src/app/api/stripe/checkout/route.ts",
    ),
    "utf8",
  );
  const originCheck = route.indexOf("if (!isSameOriginRequest(request))");
  const bodyRead = route.indexOf(
    "await readJsonBodyWithinLimit<CheckoutBody>",
  );

  assert.ok(originCheck >= 0);
  assert.ok(bodyRead > originCheck);
  assert.match(route, /MAX_CHECKOUT_BODY_BYTES\s*=\s*8 \* 1024/);
  assert.match(route, /key: `stripe-checkout:ip:\$\{requestIdentity\(request\)\}`/);
  assert.match(route, /limit: 120/);
  assert.match(route, /key: `stripe-checkout:account:\$\{session\.email/);
  assert.match(route, /limit: 8/);
  assert.match(route, /if \(!isValidTicketQuantity\(quantity\)\)/);
  assert.match(
    route,
    /quantity\s*=\s*ticketQuantityOrDefault\(body\?\.quantity\)/,
  );
  assert.match(route, /invalidQuantity, 400/);
  assert.match(route, /reserveCheckoutTicket\(\{[\s\S]*?quantity,/);
  assert.match(route, /buildStripeCheckoutSessionParams\(\{[\s\S]*?quantity,/);
  assert.match(route, /availability\s*=\s*await getAvailability\(event\.id\)/);
});

test("embedded Checkout stays on-site and enables eligible card wallets", () => {
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
    display_name: "Tiketko",
    background_color: "#ffffff",
    button_color: "#1d4ed8",
    border_style: "rounded",
    font_family: "inter",
  });
  assert.equal(params.customer_email, "wallet@example.com");
  assert.equal(params.client_reference_id, "RSV-WALLETTEST0001");

  const lineItems = params.line_items;
  assert.ok(Array.isArray(lineItems));
  assert.equal(lineItems[0]?.quantity, 1);
  assert.equal(lineItems[0]?.price_data?.currency, "eur");
  assert.equal(
    lineItems[0]?.price_data?.unit_amount,
    Math.round(ticketType.price * 100),
  );
  assert.deepEqual(lineItems[0]?.price_data?.product_data?.images, [
    new URL(INTERNAL_EVENT.image, "https://tickets.example/").href,
  ]);
  assert.equal(
    lineItems[0]?.price_data?.product_data?.metadata?.offerKind,
    "admission",
  );
  assert.equal(params.metadata?.offerKind, "admission");
  assert.equal(params.metadata?.quantity, "1");
});

test("first-party sale event produces the configured Checkout amount and metadata", () => {
  const standard = PRIMARY_SALE_EVENT.ticketTypes.find(
    (ticketType) => ticketType.id === "standard",
  );
  assert.ok(standard);

  const params = buildStripeCheckoutSessionParams({
    baseUrl: "https://www.tiketko.top",
    event: PRIMARY_SALE_EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "bg",
    reservationId: "RSV-PRIMARYSALE0001",
    ticketType: standard,
    quantity: 3,
    buyerEmail: "verified@example.com",
  });
  const lineItems = params.line_items;

  assert.ok(Array.isArray(lineItems));
  assert.equal(lineItems[0]?.quantity, 3);
  assert.equal(lineItems[0]?.price_data?.unit_amount, 3_900);
  assert.equal(lineItems[0]?.price_data?.currency, "eur");
  assert.equal(params.metadata?.eventId, PRIMARY_SALE_EVENT.id);
  assert.equal(params.metadata?.ticketType, "standard");
  assert.equal(params.metadata?.quantity, "3");
  assert.equal(
    lineItems[0]?.price_data?.product_data?.metadata?.quantity,
    "3",
  );
  assert.equal(params.payment_intent_data?.metadata?.quantity, "3");
  assert.equal(params.customer_email, "verified@example.com");
});

test("Checkout rejects invalid ticket quantities", () => {
  const input = {
    baseUrl: "https://tickets.example",
    event: INTERNAL_EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "en" as const,
    reservationId: "RSV-INVALIDQUANTITY",
    ticketType: TICKET_TYPE,
    buyerEmail: "wallet@example.com",
  };

  for (const quantity of [0, 1.5, 11, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => buildStripeCheckoutSessionParams({ ...input, quantity }),
      /CHECKOUT_INVALID_QUANTITY/,
    );
  }
});

test("external test simulation is unmistakably non-admission in Stripe", () => {
  const standard = EVENT.ticketTypes.find(
    (ticketType) => ticketType.id === "standard",
  );
  assert.ok(standard);

  const params = buildStripeCheckoutSessionParams({
    baseUrl: "https://www.tiketko.top",
    event: EVENT,
    expiresAtUnix: 1_800_000_000,
    locale: "en",
    reservationId: "RSV-TESTSIMULATION01",
    ticketType: standard,
    buyerEmail: "simulation@example.com",
  });
  const lineItems = params.line_items;

  assert.ok(Array.isArray(lineItems));
  const product = lineItems[0]?.price_data?.product_data;
  assert.equal(product?.name, `TEST TICKET — ${EVENT.title}`);
  assert.match(product?.description ?? "", /not valid for venue entry/i);
  assert.equal(product?.metadata?.offerKind, "test-simulation");
  assert.equal(params.metadata?.offerKind, "test-simulation");
  assert.equal(
    lineItems[0]?.price_data?.unit_amount,
    Math.round(standard.price * 100),
  );

  assert.doesNotThrow(() =>
    assertStripeCheckoutOfferSafety(
      { livemode: false, metadata: { offerKind: "test-simulation" } },
      { offerKind: "test-simulation" },
    ),
  );
  assert.throws(
    () =>
      assertStripeCheckoutOfferSafety(
        { livemode: true, metadata: { offerKind: "test-simulation" } },
        { offerKind: "test-simulation" },
      ),
    /TEST_SIMULATION_LIVE_PAYMENT/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutOfferSafety(
        {
          livemode: false,
          metadata: { offerKind: "admission" },
        },
        { offerKind: "test-simulation" },
      ),
    /CHECKOUT_OFFER_KIND_MISMATCH/,
  );
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

test("Stripe fulfillment is pinned to the immutable reservation snapshot", () => {
  const snapshot = createCheckoutPurchaseSnapshot(INTERNAL_EVENT, TICKET_TYPE);
  const quantity = 3;
  const reservation = {
    eventId: INTERNAL_EVENT.id,
    ticketType: TICKET_TYPE.id,
    quantity,
    stripeLivemode: false,
    purchaseSnapshot: snapshot,
  };
  const session = {
    amount_total: snapshot.unitAmountMinor * quantity,
    currency: snapshot.currency.toLowerCase(),
    livemode: false,
    metadata: {
      eventId: reservation.eventId,
      ticketType: reservation.ticketType,
      offerKind: snapshot.offerKind,
      quantity: String(quantity),
    },
  };

  assert.equal(
    assertStripeCheckoutPurchaseSnapshot(session, reservation),
    snapshot,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(session, {
        ...reservation,
        stripeLivemode: true,
      }),
    /CHECKOUT_PAYMENT_MODE_MISMATCH/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(
        { ...session, amount_total: snapshot.unitAmountMinor + 1 },
        reservation,
      ),
    /CHECKOUT_AMOUNT_MISMATCH/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(
        { ...session, metadata: { offerKind: snapshot.offerKind } },
        reservation,
      ),
    /CHECKOUT_METADATA_MISMATCH/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(session, {
        ...reservation,
        purchaseSnapshot: null,
      }),
    /CHECKOUT_PURCHASE_SNAPSHOT_MISSING/,
  );

  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(
        {
          ...session,
          metadata: { ...session.metadata, quantity: "2" },
        },
        reservation,
      ),
    /CHECKOUT_METADATA_MISMATCH/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(
        session,
        { ...reservation, quantity: 0 },
      ),
    /CHECKOUT_QUANTITY_INVALID/,
  );
  assert.throws(
    () =>
      assertStripeCheckoutPurchaseSnapshot(
        {
          ...session,
          amount_total: Number.MAX_SAFE_INTEGER,
          metadata: { ...session.metadata, quantity: "2" },
        },
        {
          ...reservation,
          quantity: 2,
          purchaseSnapshot: {
            ...snapshot,
            unitAmountMinor: Number.MAX_SAFE_INTEGER,
          },
        },
      ),
    /CHECKOUT_AMOUNT_MISMATCH/,
  );

  assert.doesNotThrow(() =>
    assertStripeCheckoutPurchaseSnapshot(
      {
        ...session,
        amount_total: snapshot.unitAmountMinor,
        metadata: {
          eventId: reservation.eventId,
          ticketType: reservation.ticketType,
          offerKind: snapshot.offerKind,
        },
      },
      { ...reservation, quantity: 1 },
    ),
  );
});

test("paid fulfillment backfills missing mode from the trusted Stripe session", async () => {
  const fulfillment = await readFile(
    path.join(process.cwd(), "src/lib/stripe-fulfillment.ts"),
    "utf8",
  );

  assert.match(
    fulfillment,
    /typeof reservation\.stripeLivemode !== "boolean"[\s\S]*reservation\.status === "checkout_created"[\s\S]*attachCheckoutSession\(\{[\s\S]*stripeLivemode: session\.livemode/,
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
