import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createElement,
  type ComponentProps,
  type ComponentType,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "@/components/marketplace/EventCard";
import { TicketDesk } from "@/components/TicketDesk";
import { EventPurchasePanel } from "@/components/ticketing/EventPurchasePanel";
import { LiveTicketingProvider } from "@/components/ticketing/LiveTicketingProvider";
import {
  EVENT,
  isEventOpenForTicketMeCheckout,
  PRIMARY_SALE_EVENT,
  type CatalogEvent,
} from "@/lib/event";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function availabilityFor(event: CatalogEvent) {
  const totalCapacity = event.ticketTypes.reduce(
    (total, ticketType) => total + ticketType.capacity,
    0,
  );

  return {
    totalCapacity,
    totalRemaining: totalCapacity,
    byType: {
      fan: event.ticketTypes.find((ticketType) => ticketType.id === "fan")
        ?.capacity ?? 0,
      standard:
        event.ticketTypes.find((ticketType) => ticketType.id === "standard")
          ?.capacity ?? 0,
      premium:
        event.ticketTypes.find((ticketType) => ticketType.id === "premium")
          ?.capacity ?? 0,
    },
    sold: 0,
  };
}

const EVENT_AVAILABILITY = availabilityFor(EVENT);
const ADMISSION_EVENT = {
  ...PRIMARY_SALE_EVENT,
  startsAt: "2099-09-29T20:00:00.000Z",
};
const ADMISSION_AVAILABILITY = availabilityFor(ADMISSION_EVENT);

const TestLiveTicketingProvider = LiveTicketingProvider as ComponentType<
  Omit<ComponentProps<typeof LiveTicketingProvider>, "children">
>;

function renderTestCheckoutPanel(locale: "bg" | "en"): string {
  return renderToStaticMarkup(
    createElement(
      TestLiveTicketingProvider,
      {
        eventId: EVENT.id,
        initialAvailability: EVENT_AVAILABILITY,
        initialActivity: { queueDepth: 0, activeCheckouts: 0 },
      },
      createElement(EventPurchasePanel, {
        event: EVENT,
        checkoutEnabled: isEventOpenForTicketMeCheckout(
          EVENT,
          new Date("2026-07-20T12:00:00+03:00"),
        ),
        availabilityAvailable: true,
        paymentMode: "test",
        locale,
      }),
    ),
  );
}

function renderSourcePanel(event: CatalogEvent, locale: "bg" | "en"): string {
  return renderToStaticMarkup(
    createElement(EventPurchasePanel, {
      event,
      checkoutEnabled: false,
      availabilityAvailable: false,
      paymentMode: null,
      locale,
    }),
  );
}

function renderAdmissionCheckoutPanel(
  paymentMode: "test" | "live",
  locale: "bg" | "en" = "en",
): string {
  return renderToStaticMarkup(
    createElement(
      TestLiveTicketingProvider,
      {
        eventId: ADMISSION_EVENT.id,
        initialAvailability: ADMISSION_AVAILABILITY,
        initialActivity: { queueDepth: 0, activeCheckouts: 0 },
      },
      createElement(EventPurchasePanel, {
        event: ADMISSION_EVENT,
        checkoutEnabled: true,
        availabilityAvailable: true,
        paymentMode,
        locale,
      }),
    ),
  );
}

function renderTicketDesk({
  event,
  paymentMode,
  initialSession = null,
  locale = "en",
}: {
  event: CatalogEvent;
  paymentMode: "test" | "live";
  initialSession?: ComponentProps<typeof TicketDesk>["initialSession"];
  locale?: "bg" | "en";
}): string {
  return renderToStaticMarkup(
    createElement(TicketDesk, {
      event,
      initialAvailability: availabilityFor(event),
      initialSession,
      paymentMode,
      stripePublishableKey:
        paymentMode === "test" ? "pk_test_fixture" : "pk_live_fixture",
      locale,
    }),
  );
}

test("English test checkout keeps buyers inside Tiketko with purchase copy", () => {
  const html = renderTestCheckoutPanel("en");

  assert.match(
    html,
    /href="#tickets"[^>]*>[\s\S]*?Buy your ticket now<\/a>/,
  );
  assert.match(html, /Tiketko Stripe test offer/);
  assert.match(html, /This is a test payment with no real charge/);
  assert.match(html, /PDF ticket is not valid for venue entry/);
  assert.match(html, /Event source: Eventim/);
});

test("Bulgarian test checkout uses the matching purchase copy", () => {
  const html = renderTestCheckoutPanel("bg");

  assert.match(
    html,
    /href="#tickets"[^>]*>[\s\S]*?Купи билет сега<\/a>/,
  );
  assert.match(html, /Tiketko Stripe test оферта/);
  assert.match(html, /тестово плащане без реално таксуване/);
  assert.match(html, /PDF билетът не е валиден за вход/);
  assert.match(html, /Източник на събитието: Eventim/);
});

test("first-party admission hero discloses Stripe test mode in both locales", () => {
  const english = renderAdmissionCheckoutPanel("test", "en");
  const bulgarian = renderAdmissionCheckoutPanel("test", "bg");

  assert.match(english, /href="#tickets"[^>]*>[\s\S]*?Buy ticket<\/a>/);
  assert.match(english, /Stripe test mode: no real money is charged/);
  assert.match(english, /issues this Tiketko admission ticket/);
  assert.doesNotMatch(english, /test offer|not valid for venue entry/i);

  assert.match(bulgarian, /href="#tickets"[^>]*>[\s\S]*?Купи билет<\/a>/);
  assert.match(bulgarian, /Stripe test mode: няма реално таксуване/);
  assert.match(bulgarian, /Tiketko билет за вход/);
  assert.doesNotMatch(bulgarian, /test оферта|не е валиден за вход/i);
});

test("first-party admission hero keeps live-mode checkout copy", () => {
  const html = renderAdmissionCheckoutPanel("live");

  assert.match(html, /href="#tickets"[^>]*>[\s\S]*?Buy ticket<\/a>/);
  assert.match(html, /Secure Stripe checkout and verified email/);
  assert.doesNotMatch(html, /no real money is charged|for this project/i);
});

test("source-only listings keep URL-bound purchase claims", () => {
  const sellerHtml = renderSourcePanel(EVENT, "en");
  const informationHtml = renderSourcePanel(
    { ...EVENT, sourceSellsTickets: false },
    "en",
  );

  assert.match(sellerHtml, />Buy your ticket now<\/a>/);
  assert.match(sellerHtml, /You’ll complete your purchase at Eventim/);
  assert.match(sellerHtml, /target="_blank"/);
  assert.match(sellerHtml, /rel="noreferrer"/);
  assert.match(informationHtml, />Check tickets at Eventim<\/a>/);
  assert.doesNotMatch(
    informationHtml,
    /Buy your ticket now|complete your purchase/,
  );
});

test("external test-event cards advertise the Tiketko simulation", () => {
  const futureEvent = {
    ...EVENT,
    startsAt: "2099-09-29T20:00:00+03:00",
  };
  const html = renderToStaticMarkup(
    createElement(EventCard, { event: futureEvent, locale: "en" }),
  );

  assert.match(html, /Tiketko test offer/);
  assert.match(html, /€\d/);
  assert.match(
    html,
    /href="https:\/\/www\.eventim\.bg\/en\/artist\/deep-purple\/"/,
  );
  assert.match(html, /rel="noreferrer"/);
});

test("public routes expose the internal test-checkout path", async () => {
  const [detailPage, homePage, eventCard] = await Promise.all([
    source("src/app/events/[slug]/page.tsx"),
    source("src/app/page.tsx"),
    source("src/components/marketplace/EventCard.tsx"),
  ]);

  for (const publicSurface of [detailPage, homePage, eventCard]) {
    assert.match(publicSurface, /isEventOpenForTicketMeCheckout/);
    assert.doesNotMatch(publicSurface, /isEventOpenForInternalSale/);
  }
  assert.match(
    homePage,
    /testSimulation\s*\? copy\.buyTicketNow\s*:\s*copy\.chooseTickets/,
  );
  assert.match(
    detailPage,
    /checkoutEnabled\s*&&\s*!testSimulation[\s\S]*?offers:/,
  );
});

test("Stripe test mode does not revoke a first-party admission offer", () => {
  const html = renderTicketDesk({
    event: ADMISSION_EVENT,
    paymentMode: "test",
    initialSession: {
      email: "buyer@example.com",
      name: "Verified Buyer",
      verifiedAt: "2099-01-01T00:00:00.000Z",
      expiresAt: "2099-12-31T00:00:00.000Z",
    },
  });

  assert.match(html, /Stripe test mode: no real money is charged/);
  assert.match(html, /issues the admission ticket shown above/);
  assert.match(html, /Electronic PDF ticket/);
  assert.doesNotMatch(html, /not valid for admission|not valid for entry/i);
  assert.doesNotMatch(html, /simulation data|Test standard category/i);
});

test("anonymous admission checkout discloses test mode before sign-in", () => {
  const html = renderTicketDesk({
    event: ADMISSION_EVENT,
    paymentMode: "test",
  });
  const noticeIndex = html.indexOf(
    "Stripe test mode: no real money is charged",
  );
  const signInIndex = html.indexOf("Sign in to purchase");

  assert.ok(noticeIndex >= 0);
  assert.ok(signInIndex > noticeIndex);
  assert.match(html, /issues the admission ticket shown above/);
  assert.match(html, /Electronic PDF ticket/);
  assert.doesNotMatch(html, /not valid for admission|not valid for entry/i);
  assert.doesNotMatch(html, /simulation data|Test standard category/i);
});

test("anonymous admission checkout does not show test disclosure in live mode", () => {
  const html = renderTicketDesk({
    event: ADMISSION_EVENT,
    paymentMode: "live",
  });

  assert.match(html, /Sign in to purchase/);
  assert.match(html, /Electronic PDF ticket/);
  assert.doesNotMatch(html, /Stripe test mode|no real money is charged/i);
});

test("ticket desk exposes a localized, availability-bounded quantity stepper", async () => {
  const english = renderTicketDesk({
    event: ADMISSION_EVENT,
    paymentMode: "live",
  });
  const bulgarian = renderTicketDesk({
    event: ADMISSION_EVENT,
    paymentMode: "live",
    locale: "bg",
  });
  const ticketDesk = await source("src/components/TicketDesk.tsx");

  assert.match(english, /Ticket quantity/);
  assert.match(english, /aria-label="Decrease ticket quantity"/);
  assert.match(english, /aria-label="Increase ticket quantity"/);
  assert.match(english, /Up to 10 tickets from this category per order/);
  assert.match(english, /1 × Standard/);
  assert.match(bulgarian, /Количество билети/);
  assert.match(bulgarian, /aria-label="Намали броя билети"/);
  assert.match(bulgarian, /aria-label="Увеличи броя билети"/);
  assert.match(ticketDesk, /Math\.min\(\s*MAX_TICKETS_PER_ORDER,/);
  assert.match(
    ticketDesk,
    /selectedTicket\.price \* selectedQuantity/,
  );
  assert.match(
    ticketDesk,
    /const checkoutQuantity = selectedQuantity;[\s\S]*?setTicketQuantity\(checkoutQuantity\);[\s\S]*?quantity: checkoutQuantity/,
  );
  assert.match(ticketDesk, /quantityLocked[\s\S]*?copy\.quantityInOrder/);
  assert.match(ticketDesk, /liveStatus\?\.updateAvailability/);
});

test("anonymous simulation checkout keeps its non-admission disclosure", () => {
  const html = renderTicketDesk({
    event: { ...EVENT, startsAt: "2099-09-29T20:00:00.000Z" },
    paymentMode: "test",
  });

  assert.match(html, /Stripe test mode: no real money is charged/);
  assert.match(html, /not valid for admission to the event/);
  assert.match(html, /Test standard category/);
  assert.match(html, /Sign in to purchase/);
  assert.doesNotMatch(html, /issues the admission ticket shown above/);
});

test("checkout success derives simulation status from the ticket snapshot", async () => {
  const successPage = await source("src/app/checkout/success/page.tsx");

  assert.match(
    successPage,
    /purchaseSnapshot\?\.offerKind\s*===\s*"test-simulation"/,
  );
  assert.match(successPage, /state\.ticket\?\.stripeLivemode\s*===\s*false/);
  assert.match(successPage, /purchaseSnapshot\.sourceUrl/);
  assert.doesNotMatch(successPage, /stripeMode\(\)|getEventById/);
  assert.doesNotMatch(
    successPage,
    /isTestSimulationEvent\(event\)/,
  );
});
