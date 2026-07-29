import assert from "node:assert/strict";
import test from "node:test";
import {
  BGN_PER_EUR,
  CATALOG_EVENTS,
  EVENT_CATEGORIES,
  convertLegacyBgnToEur,
  isTicketTypeId,
} from "../src/lib/event";

test("legacy catalogue prices use the official fixed EUR conversion", () => {
  assert.equal(BGN_PER_EUR, 1.95583);
  assert.equal(convertLegacyBgnToEur(1.95583), 1);
  assert.equal(convertLegacyBgnToEur(112), 57.26);
  assert.equal(convertLegacyBgnToEur(189), 96.63);
});

test("catalog contains at least 100 complete, unique listings", () => {
  assert.ok(CATALOG_EVENTS.length >= 100);
  assert.equal(
    new Set(CATALOG_EVENTS.map((event) => event.id)).size,
    CATALOG_EVENTS.length,
  );
  assert.equal(
    new Set(CATALOG_EVENTS.map((event) => event.slug)).size,
    CATALOG_EVENTS.length,
  );

  for (const event of CATALOG_EVENTS) {
    assert.ok(event.title.trim().length > 0);
    assert.ok(event.venue.trim().length > 0);
    assert.ok(event.city.trim().length > 0);
    assert.ok(Number.isFinite(Date.parse(event.startsAt)));
    assert.ok(event.priceFrom > 0);
    assert.equal(event.currency, "EUR");
    assert.ok(EVENT_CATEGORIES.includes(event.category));
    assert.match(event.image, /^https:\/\/images\.unsplash\.com\//);
    assert.equal(event.ticketTypes.length, 3);

    const ticketTypeIds = new Set<string>();
    for (const ticketType of event.ticketTypes) {
      assert.ok(isTicketTypeId(ticketType.id));
      assert.ok(ticketType.capacity > 0);
      assert.ok(ticketType.price > 0);
      assert.equal(ticketType.currency, "EUR");
      ticketTypeIds.add(ticketType.id);
    }
    assert.equal(ticketTypeIds.size, event.ticketTypes.length);
  }
});
