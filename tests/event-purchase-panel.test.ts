import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "@/components/marketplace/EventCard";
import { EventPurchasePanel } from "@/components/ticketing/EventPurchasePanel";
import { LiveTicketingProvider } from "@/components/ticketing/LiveTicketingProvider";
import {
  EVENT,
  isEventOpenForTicketMeCheckout,
  type CatalogEvent,
} from "@/lib/event";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

const EVENT_AVAILABILITY = {
  totalCapacity: EVENT.ticketTypes.reduce(
    (total, ticketType) => total + ticketType.capacity,
    0,
  ),
  totalRemaining: EVENT.ticketTypes.reduce(
    (total, ticketType) => total + ticketType.capacity,
    0,
  ),
  byType: {
    fan: EVENT.ticketTypes.find((ticketType) => ticketType.id === "fan")
      ?.capacity ?? 0,
    standard:
      EVENT.ticketTypes.find((ticketType) => ticketType.id === "standard")
        ?.capacity ?? 0,
    premium:
      EVENT.ticketTypes.find((ticketType) => ticketType.id === "premium")
        ?.capacity ?? 0,
  },
  sold: 0,
};

function renderTestCheckoutPanel(locale: "bg" | "en"): string {
  return renderToStaticMarkup(
    createElement(
      LiveTicketingProvider,
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
