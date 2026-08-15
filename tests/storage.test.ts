import assert from "node:assert/strict";
import test from "node:test";

import {
  readTicketPdf,
  ticketStorageKey,
} from "../src/lib/storage";

test("ticket storage keys remain namespaced to the authenticated ticket ID", () => {
  assert.equal(ticketStorageKey("ticket_123"), "tickets/ticket_123.pdf");
  assert.notEqual(ticketStorageKey("ticket_123"), "tickets/ticket_456.pdf");
  assert.throws(
    () => ticketStorageKey("../ticket_123"),
    /INVALID_TICKET_STORAGE_ID/,
  );
});

test("ticket reads reject mismatched and unsafe database object keys", async () => {
  assert.equal(
    await readTicketPdf({
      id: "TKT-123",
      storageKey: "tickets/TKT-OTHER.pdf",
    }),
    null,
  );
  assert.equal(
    await readTicketPdf({
      id: "../outside",
      storageKey: "tickets/../outside.pdf",
    }),
    null,
  );
});
