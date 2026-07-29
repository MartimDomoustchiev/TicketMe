import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { EVENT } from "../src/lib/event";
import { createTicketPdf } from "../src/lib/pdf";
import type { StoredTicket } from "../src/lib/store";

function testTicket(overrides: Partial<StoredTicket> = {}): StoredTicket {
  return {
    id: "TKT-TEST000000000001",
    buyerName: "Мария Иванова",
    buyerEmail: "maria@example.com",
    ticketType: "standard",
    seatLabel: "STANDARD-TEST000001",
    eventId: EVENT.id,
    eventName: EVENT.name,
    eventDate: `${EVENT.date}, ${EVENT.time}`,
    venue: EVENT.venue,
    issuedAt: new Date().toISOString(),
    storageKey: "",
    storageUrl: "",
    qrSecret: "test-secret",
    status: "issued",
    ...overrides,
  };
}

test("generated ticket is a compact one-page PDF with mixed-script data", async () => {
  const ticket = testTicket();
  const pdf = await createTicketPdf({
    ticket,
    verificationUrl:
      "https://tickets.example.com/api/tickets/TKT-TEST000000000001/verify?secret=test-secret",
  });

  assert.ok(pdf.byteLength > 20_000);
  assert.ok(pdf.byteLength < 200_000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("ascii"), "%PDF-");

  const document = await PDFDocument.load(pdf);
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), `${ticket.eventName} | ${ticket.id}`);
  assert.deepEqual(document.getPage(0).getSize(), {
    width: 720,
    height: 360,
  });
});

test("ticket layout accepts long Bulgarian and English-facing values", async () => {
  const ticket = testTicket({
    id: "TKT-LONG-MIXED-SCRIPT-00000000000001",
    eventName:
      "Международен фестивал International Live Experience With An Intentionally Long Event Name",
    buyerName:
      "Александър-Константин Петров-Димитров With A Long Buyer Name",
    venue:
      "Национален дворец на културата - зала с много дълго наименование",
    seatLabel: "PREMIUM-LONG-ADMISSION-CODE-0000000001",
  });

  const pdf = await createTicketPdf({
    ticket,
    verificationUrl:
      "https://tickets.example.com/api/tickets/TKT-LONG-MIXED-SCRIPT-00000000000001/verify?secret=test-secret",
    locale: "en",
  });

  assert.ok(pdf.byteLength > 20_000);
  assert.ok(pdf.byteLength < 200_000);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
});
