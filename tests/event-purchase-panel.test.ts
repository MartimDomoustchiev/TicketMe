import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "@/components/marketplace/EventCard";
import { EventPurchasePanel } from "@/components/ticketing/EventPurchasePanel";
import { EVENT, isEventOpenForInternalSale } from "@/lib/event";

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function renderExternalPurchasePanel(
  locale: "bg" | "en",
  sourceSellsTickets = true,
): string {
  return renderToStaticMarkup(
    createElement(EventPurchasePanel, {
      event: { ...EVENT, sourceSellsTickets },
      checkoutEnabled: isEventOpenForInternalSale(EVENT),
      availabilityAvailable: false,
      locale,
    }),
  );
}

test("external listings send English buyers to the attributed ticket seller", () => {
  const html = renderExternalPurchasePanel("en");

  assert.match(html, />Buy your ticket now<\/a>/);
  assert.match(html, /You’ll complete your purchase at Eventim/);
  assert.match(html, /href="https:\/\/www\.eventim\.bg\/en\/artist\/deep-purple\/"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer"/);
  assert.doesNotMatch(html, /Test Stripe payment|Tiketko Stripe test offer/);
});

test("external listings use the matching Bulgarian purchase copy", () => {
  const html = renderExternalPurchasePanel("bg");

  assert.match(html, />Купи билет сега<\/a>/);
  assert.match(html, /Покупката се завършва в Eventim/);
  assert.doesNotMatch(html, /Тестово Stripe плащане|Stripe test оферта/);
});

test("an attributed information source never receives purchase claims", () => {
  const html = renderExternalPurchasePanel("en", false);

  assert.match(html, />Check tickets at Eventim<\/a>/);
  assert.match(html, /Check current ticket availability at Eventim/);
  assert.doesNotMatch(html, /Buy your ticket now|complete your purchase/);
});

test("external event cards show their source instead of simulated offers", () => {
  const html = renderToStaticMarkup(
    createElement(EventCard, { event: EVENT, locale: "en" }),
  );

  assert.match(html, /Official event source/);
  assert.match(html, />Eventim<\/p>/);
  assert.match(html, /href="https:\/\/www\.eventim\.bg\/en\/artist\/deep-purple\/"/);
  assert.match(html, /rel="noreferrer"/);
  assert.doesNotMatch(html, /Tiketko test offer|€\d/);
});

test("public routes reserve Tiketko checkout UI for internal inventory", async () => {
  const [detailPage, homePage, eventCard] = await Promise.all([
    source("src/app/events/[slug]/page.tsx"),
    source("src/app/page.tsx"),
    source("src/components/marketplace/EventCard.tsx"),
  ]);

  for (const publicSurface of [detailPage, homePage, eventCard]) {
    assert.match(publicSurface, /isEventOpenForInternalSale/);
    assert.doesNotMatch(publicSurface, /isEventOpenForTicketMeCheckout/);
  }
  assert.match(
    homePage,
    /heroEvent\.sourceSellsTickets\s*\? copy\.buyTicketNow/,
  );
  assert.match(
    detailPage,
    /checkoutEnabled\s*&&\s*!testSimulation[\s\S]*?offers:/,
  );
});
