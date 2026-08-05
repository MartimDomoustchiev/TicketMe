import assert from "node:assert/strict";
import test from "node:test";
import {
  BGN_PER_EUR,
  CATALOG_EVENTS,
  EVENT,
  EVENT_CATEGORIES,
  PRIMARY_SALE_EVENT,
  formatDualCurrencyPrice,
  getCategoryImage,
  isDualPriceDisplayPeriod,
  isEventOpenForInternalSale,
  isEventOpenForTicketMeCheckout,
  isEventUpcoming,
  isTicketTypeId,
  type CatalogEvent,
  type TicketType,
} from "../src/lib/event";
import {
  externalSourceLabel,
  formatEventMonth,
  formatPrice,
  formatVenueLocation,
} from "../src/components/marketplace/catalog-ui";

const INTERNAL_TICKET: TicketType = {
  id: "standard",
  label: "Standard",
  price: 50,
  priceLabel: "€50.00",
  currency: "EUR",
  capacity: 100,
  accent: "#2457ff",
  description: "Internal organizer inventory fixture.",
};

function internalEvent(startsAt: string): CatalogEvent {
  return {
    ...EVENT,
    id: "organizer-owned-event",
    slug: "organizer-owned-event",
    startsAt,
    checkoutMode: "admission",
    saleMode: "internal",
    sourceOfficial: true,
    ticketTypes: [INTERNAL_TICKET],
    priceFrom: INTERNAL_TICKET.price,
  };
}

test("static external listings keep source facts and expose explicit test inventory", () => {
  const externalEvents = CATALOG_EVENTS.filter(
    (event) => event.saleMode === "external",
  );
  const beforeEveryStaticEvent = new Date("2026-07-20T12:00:00+03:00");

  assert.ok(CATALOG_EVENTS.length >= 100);
  assert.ok(externalEvents.length >= 100);
  assert.equal(
    new Set(CATALOG_EVENTS.map((event) => event.id)).size,
    CATALOG_EVENTS.length,
  );
  assert.equal(
    new Set(CATALOG_EVENTS.map((event) => event.slug)).size,
    CATALOG_EVENTS.length,
  );
  assert.equal(
    new Set(CATALOG_EVENTS.map((event) => event.image)).size,
    CATALOG_EVENTS.length,
  );
  assert.equal(
    new Set(EVENT_CATEGORIES.map((category) => getCategoryImage(category))).size,
    EVENT_CATEGORIES.length,
  );

  for (const event of externalEvents) {
    assert.ok(event.title.trim().length > 0);
    assert.ok(event.venue.trim().length > 0);
    assert.ok(event.city.trim().length > 0);
    assert.ok(Number.isFinite(Date.parse(event.startsAt)));
    assert.equal(event.priceFrom, 0);
    assert.equal(event.priceAvailable, false);
    assert.equal(event.currency, "EUR");
    assert.ok(EVENT_CATEGORIES.includes(event.category));
    assert.equal(event.heroImage, event.image);
    assert.equal(event.saleMode, "external");
    assert.equal(event.checkoutMode, "test-simulation");
    assert.equal(event.ticketTypes.length, 3);
    assert.deepEqual(
      event.ticketTypes.map((ticketType) => ticketType.id),
      ["fan", "standard", "premium"],
    );
    for (const ticketType of event.ticketTypes) {
      assert.ok(Number.isInteger(ticketType.capacity));
      assert.ok(ticketType.capacity > 0);
      assert.ok(ticketType.price > 0);
      assert.equal(ticketType.currency, "EUR");
      assert.match(ticketType.description, /not valid for venue admission/i);
    }
    assert.ok(
      event.ticketTypes.reduce(
        (total, ticketType) => total + ticketType.capacity,
        0,
      ) > 0,
    );
    assert.equal(
      isEventOpenForTicketMeCheckout(event, beforeEveryStaticEvent),
      true,
    );
    assert.match(event.sourceUrl, /^https:\/\//);

    if (event.id === EVENT.id) {
      assert.equal(event.image, "/events/deep-purple.webp");
      assert.equal(event.sourceOfficial, true);
    } else {
      assert.equal(
        event.image,
        `/events/listings/${event.id}.webp`,
      );
      assert.equal(event.sourceOfficial, false);
    }
  }
});

test("first-party event exposes explicit organizer inventory for Checkout", () => {
  const now = new Date("2026-07-30T12:00:00+03:00");

  assert.equal(PRIMARY_SALE_EVENT.saleMode, "internal");
  assert.equal(PRIMARY_SALE_EVENT.checkoutMode, "admission");
  assert.equal(PRIMARY_SALE_EVENT.sourceName, "Tiketko");
  assert.equal(PRIMARY_SALE_EVENT.sourceOfficial, true);
  assert.equal(PRIMARY_SALE_EVENT.priceAvailable, true);
  assert.equal(PRIMARY_SALE_EVENT.currency, "EUR");
  assert.equal(PRIMARY_SALE_EVENT.ticketTypes.length, 3);
  assert.deepEqual(
    PRIMARY_SALE_EVENT.ticketTypes.map((type) => type.id),
    ["fan", "standard", "premium"],
  );
  assert.equal(
    PRIMARY_SALE_EVENT.ticketTypes.reduce(
      (total, type) => total + type.capacity,
      0,
    ),
    1_150,
  );
  assert.equal(isEventOpenForInternalSale(PRIMARY_SALE_EVENT, now), true);
  assert.equal(
    isEventOpenForTicketMeCheckout(PRIMARY_SALE_EVENT, now),
    true,
  );
});

test("ticket type and sale eligibility checks fail closed", () => {
  const now = new Date("2026-07-29T12:00:00+03:00");
  const future = internalEvent("2026-07-30T12:00:00+03:00");

  assert.equal(isTicketTypeId("standard"), true);
  assert.equal(isTicketTypeId("unknown"), false);
  assert.equal(isEventOpenForInternalSale(future, now), true);
  assert.equal(isEventOpenForTicketMeCheckout(future, now), true);
  assert.equal(
    isEventOpenForInternalSale({ ...future, saleMode: "external" }, now),
    false,
  );
  assert.equal(
    isEventOpenForTicketMeCheckout(
      {
        ...future,
        checkoutMode: "test-simulation",
        saleMode: "external",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isEventOpenForTicketMeCheckout(
      { ...future, checkoutMode: undefined },
      now,
    ),
    false,
  );
  assert.equal(
    isEventOpenForInternalSale({ ...future, ticketTypes: [] }, now),
    false,
  );
  assert.equal(
    isEventOpenForTicketMeCheckout({ ...future, ticketTypes: [] }, now),
    false,
  );
  assert.equal(
    isEventOpenForInternalSale(
      { ...future, startsAt: "2026-07-29T11:59:59+03:00" },
      now,
    ),
    false,
  );
  assert.equal(
    isEventOpenForTicketMeCheckout(
      { ...future, startsAt: "2026-07-29T11:59:59+03:00" },
      now,
    ),
    false,
  );
  assert.equal(isEventUpcoming(future, now), true);
  assert.equal(
    isEventUpcoming({ startsAt: "2026-07-29T12:00:00+03:00" }, now),
    false,
  );
  assert.equal(isEventUpcoming({ startsAt: "not-a-date" }, now), false);
});

test("EUR prices include equally prominent fixed-rate BGN through 8 August 2026", () => {
  const during = new Date("2026-08-08T23:59:59+03:00");
  const after = new Date("2026-08-09T00:00:00+03:00");

  assert.equal(BGN_PER_EUR, 1.95583);
  assert.equal(isDualPriceDisplayPeriod(during), true);
  assert.equal(isDualPriceDisplayPeriod(after), false);

  const dual = formatDualCurrencyPrice(10, "en", during);
  assert.match(dual, /€10\.00/);
  assert.match(dual, /19\.56/);
  assert.match(dual, /\//);
  assert.equal(formatDualCurrencyPrice(10, "en", after), "€10.00");

  const event = internalEvent("2026-09-01T20:00:00+03:00");
  assert.match(formatPrice(event, "en", during), /€50\.00.*\/.*97\.79/);
  assert.equal(formatPrice(EVENT, "en", during), "Official event source");
  assert.match(
    formatPrice(
      { ...EVENT, priceFrom: 50, priceAvailable: true },
      "en",
      during,
    ),
    /€50\.00.*\/.*97\.79/,
  );
  assert.equal(
    formatPrice(
      CATALOG_EVENTS.find(
        (item) => item.saleMode === "external" && item.id !== EVENT.id,
      )!,
      "en",
      during,
    ),
    "Event source",
  );
});

test("catalogue labels, month chips and venue locations match visible facts", () => {
  const julyEvent = {
    ...EVENT,
    startsAt: "2026-07-29T20:00:00+03:00",
  };
  assert.equal(formatEventMonth(julyEvent, "bg"), "ЮЛИ");
  assert.equal(formatEventMonth(julyEvent, "en"), "JUL");
  assert.equal(
    formatVenueLocation({ venue: "София", city: "София" }, "bg"),
    "София",
  );
  assert.equal(
    formatVenueLocation({ venue: "Arena 8888 Sofia", city: "София" }, "en"),
    "Arena 8888 Sofia",
  );
  assert.equal(
    formatVenueLocation({ venue: "Arena 8888 Sofia", city: "София" }, "bg"),
    "Arena 8888 Sofia",
  );
  assert.equal(
    formatVenueLocation({ venue: "Античен театър", city: "Пловдив" }, "bg"),
    "Античен театър, Пловдив",
  );
  assert.equal(externalSourceLabel(EVENT, "bg"), "Официален източник");
  assert.equal(
    externalSourceLabel({ sourceOfficial: false }, "en"),
    "Event source",
  );
});

test("curated taxonomy keeps live music out of theatre and generic culture", () => {
  const categoryOf = (titleFragment: string) =>
    CATALOG_EVENTS.find((event) =>
      event.title.toLocaleLowerCase("bg-BG").includes(
        titleFragment.toLocaleLowerCase("bg-BG"),
      ),
    )?.category;

  assert.equal(categoryOf("GIPSY KINGS Live"), "Concerts");
  assert.equal(categoryOf("METALLICA"), "Concerts");
  assert.equal(categoryOf("Rap Dynasty"), "Concerts");
  assert.equal(categoryOf("Moodymann"), "Concerts");
  assert.equal(categoryOf("PACHO BIRTHDAY"), "Nightlife");
  assert.equal(categoryOf("Running Free Festival"), "Sports");
});
