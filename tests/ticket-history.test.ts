import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminTicketMetrics,
  historicalTicketView,
} from "../src/lib/ticket-history";
import {
  EVENT,
  PRIMARY_SALE_EVENT,
  type CatalogEvent,
} from "../src/lib/event";
import type { StoredTicket } from "../src/lib/store-file";

function ticket(
  id: string,
  offerKind: "admission" | "test-simulation" | null,
  status: "issued" | "checked_in" = "issued",
  stripeLivemode: boolean | null =
    offerKind === null
      ? null
      : offerKind === "test-simulation"
        ? false
        : true,
): StoredTicket {
  return {
    id,
    buyerName: "Historical Buyer",
    buyerEmail: `${id.toLowerCase()}@example.com`,
    ticketType: "standard",
    seatLabel: `STANDARD-${id}`,
    eventId:
      offerKind === "admission" ? PRIMARY_SALE_EVENT.id : EVENT.id,
    eventName: "Mutable event name",
    eventDate: "Mutable date",
    venue: "Mutable venue",
    issuedAt: "2026-08-01T10:00:00.000Z",
    storageKey: `tickets/${id}.pdf`,
    storageUrl: `/api/tickets/${id}/download`,
    qrSecret: "secret",
    status,
    stripeLivemode,
    purchaseSnapshot:
      offerKind === null
        ? null
        : {
            offerKind,
            unitAmountMinor: offerKind === "admission" ? 3900 : 2812,
            currency: "EUR",
            eventName: "Immutable event name",
            eventDate: "17 August 2026, 20:00",
            venue: "Immutable venue",
            ticketLabel: "Immutable category",
            sourceName: "Immutable source",
            sourceUrl: "https://tickets.example.org/event",
          },
  };
}

test("ticket presentation uses immutable checkout facts", () => {
  const view = historicalTicketView(ticket("TKT-ONE", "admission"));

  assert.equal(view.trustedSnapshot, true);
  assert.equal(view.offerKind, "admission");
  assert.equal(view.paymentMode, "live");
  assert.equal(view.eventName, "Immutable event name");
  assert.equal(view.unitAmountMinor, 3900);
  assert.equal(view.ticketLabel, "Immutable category");
});

test("legacy tickets do not infer admission or price from the current catalogue", () => {
  const view = historicalTicketView(ticket("TKT-LEGACY", null));

  assert.equal(view.trustedSnapshot, false);
  assert.equal(view.offerKind, null);
  assert.equal(view.paymentMode, null);
  assert.equal(view.unitAmountMinor, null);
  assert.equal(view.ticketLabel, null);
  assert.equal(view.eventName, "Mutable event name");
});

test("admin metrics exclude simulations, legacy records, and expired event capacity", () => {
  const activeAdmission: CatalogEvent = {
    ...PRIMARY_SALE_EVENT,
    startsAt: "2099-01-01T20:00:00.000Z",
    ticketTypes: [
      {
        ...PRIMARY_SALE_EVENT.ticketTypes[0],
        capacity: 10,
      },
    ],
  };
  const activeSimulation: CatalogEvent = {
    ...EVENT,
    startsAt: "2099-01-02T20:00:00.000Z",
  };
  const expiredAdmission: CatalogEvent = {
    ...PRIMARY_SALE_EVENT,
    id: "expired-admission",
    slug: "expired-admission",
    startsAt: "2020-01-01T20:00:00.000Z",
  };
  const metrics = buildAdminTicketMetrics(
    [
      ticket("TKT-ADMISSION", "admission", "checked_in"),
      ticket("TKT-TEST-ADMISSION", "admission", "issued", false),
      ticket("TKT-TEST", "test-simulation"),
      ticket("TKT-LEGACY", null),
    ],
    [activeAdmission, activeSimulation, expiredAdmission],
    new Date("2026-08-16T00:00:00.000Z"),
  );

  assert.equal(metrics.admissionTicketCount, 2);
  assert.equal(metrics.checkedInAdmissionCount, 1);
  assert.equal(metrics.checkInPercent, 50);
  assert.equal(metrics.activeEventCount, 2);
  assert.equal(metrics.activeAdmissionCapacity, 10);
  assert.equal(metrics.remainingAdmissionCapacity, 8);
  assert.deepEqual(metrics.admissionGross, [
    { currency: "EUR", amountMinor: 3900 },
  ]);
});

test("historical payment mode remains immutable and unknown legacy mode is neutral", () => {
  const testAdmission = historicalTicketView(
    ticket("TKT-TEST-ADMISSION", "admission", "issued", false),
  );
  const unknownAdmission = historicalTicketView(
    ticket("TKT-UNKNOWN-MODE", "admission", "issued", null),
  );

  assert.equal(testAdmission.paymentMode, "test");
  assert.equal(unknownAdmission.paymentMode, null);
});
