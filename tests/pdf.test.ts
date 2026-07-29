import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { CATALOG_EVENTS, EVENT } from "../src/lib/event";
import {
  createTicketPdf,
  createTicketPdfWithDiagnostics,
  type TicketPdfBounds,
} from "../src/lib/pdf";
import { getTicketDesign } from "../src/lib/ticket-design";
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
    issuedAt: "2026-07-29T10:25:00.000Z",
    storageKey: "",
    storageUrl: "",
    qrSecret: "test-secret",
    status: "issued",
    ...overrides,
  };
}

function isInside(inner: TicketPdfBounds, outer: TicketPdfBounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function overlaps(first: TicketPdfBounds, second: TicketPdfBounds): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function normalizeExtractedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function extractPdfText(pdf: Uint8Array): string | null {
  try {
    return execFileSync("pdftotext", ["-layout", "-", "-"], {
      input: Buffer.from(pdf),
      encoding: "utf8",
      maxBuffer: 2_000_000,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

test("ticket themes are deterministic and vary by event and ticket", () => {
  const first = getTicketDesign(
    "deep-purple-live-sofia-2026",
    "TKT-DETERMINISTIC-1",
  );
  const repeated = getTicketDesign(
    "deep-purple-live-sofia-2026",
    "TKT-DETERMINISTIC-1",
  );
  const sameEventNextTicket = getTicketDesign(
    "deep-purple-live-sofia-2026",
    "TKT-DETERMINISTIC-2",
  );
  const otherEvents = [
    getTicketDesign("sofia-jazz-night", "TKT-DETERMINISTIC-1"),
    getTicketDesign("plovdiv-derby", "TKT-DETERMINISTIC-1"),
    getTicketDesign("family-weekend", "TKT-DETERMINISTIC-1"),
  ];

  assert.deepEqual(first, repeated);
  assert.equal(first.id, sameEventNextTicket.id);
  assert.deepEqual(first.background, sameEventNextTicket.background);
  assert.equal(first.pattern, sameEventNextTicket.pattern);
  assert.notEqual(first.ticketSeed, sameEventNextTicket.ticketSeed);
  assert.notEqual(first.motifOffset, sameEventNextTicket.motifOffset);
  assert.ok(new Set([first.id, ...otherEvents.map((theme) => theme.id)]).size >= 3);
  assert.ok(
    new Set([first.pattern, ...otherEvents.map((theme) => theme.pattern)])
      .size >= 2,
  );

  const eventThemeIds = CATALOG_EVENTS.map(
    (event) => getTicketDesign(event.id, "TKT-THEME-PROBE").id,
  );
  assert.equal(
    new Set(eventThemeIds).size,
    CATALOG_EVENTS.length,
    "Every catalogued event must have its own deterministic base theme.",
  );
});

test("generated ticket is a compact TicketMe PDF with mixed-script data", async () => {
  const ticket = testTicket();
  const pdf = await createTicketPdf({
    ticket,
    verificationUrl:
      "https://tickets.example.com/api/tickets/TKT-TEST000000000001/verify?secret=test-secret",
  });

  assert.ok(pdf.byteLength > 20_000);
  assert.ok(pdf.byteLength < 300_000);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("ascii"), "%PDF-");

  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), `${ticket.eventName} | ${ticket.id}`);
  assert.equal(document.getAuthor(), "TicketMe");
  assert.equal(document.getCreator(), "TicketMe");
  assert.equal(document.getProducer(), "TicketMe PDF service");
  assert.equal(
    document.getSubject(),
    "Official TicketMe digital admission ticket",
  );
  assert.ok(document.getKeywords()?.includes("TicketMe"));
  assert.deepEqual(document.getPage(0).getSize(), {
    width: 720,
    height: 360,
  });
});

test("premium layout preserves critical long values and QR safety invariants", async (context) => {
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

  const { pdf, diagnostics } = await createTicketPdfWithDiagnostics({
    ticket,
    verificationUrl:
      "https://tickets.example.com/api/tickets/TKT-LONG-MIXED-SCRIPT-00000000000001/verify?secret=test-secret",
    locale: "en",
  });

  assert.ok(pdf.byteLength > 20_000);
  assert.ok(pdf.byteLength < 300_000);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);

  assert.equal(diagnostics.qr.quietZoneModules, 4);
  assert.ok(diagnostics.qr.dataModules >= 21);
  assert.equal(
    diagnostics.qr.totalModules,
    diagnostics.qr.dataModules + diagnostics.qr.quietZoneModules * 2,
  );
  assert.ok(diagnostics.qr.moduleSize >= 2.2);
  assert.ok(isInside(diagnostics.qr.bounds, diagnostics.stubPanel));

  const criticalKeys = new Set([
    "eventName",
    "eventDate",
    "venue",
    "buyerName",
    "ticketType",
    "admissionCode",
    "ticketId",
  ]);
  assert.deepEqual(
    new Set(diagnostics.fields.map((field) => field.key)),
    criticalKeys,
  );

  for (const field of diagnostics.fields) {
    assert.equal(
      field.truncated,
      false,
      `${field.key} must not be silently truncated`,
    );
    assert.ok(field.renderedLines.length >= 1);
    assert.ok(field.fontSize >= 5.6 || field.key === "venue");
    assert.ok(
      isInside(field.bounds, diagnostics.mainPanel),
      `${field.key} must stay inside the main ticket panel`,
    );
    assert.equal(overlaps(field.bounds, diagnostics.qr.bounds), false);
  }

  for (let index = 0; index < diagnostics.fields.length; index += 1) {
    for (
      let nextIndex = index + 1;
      nextIndex < diagnostics.fields.length;
      nextIndex += 1
    ) {
      assert.equal(
        overlaps(
          diagnostics.fields[index].bounds,
          diagnostics.fields[nextIndex].bounds,
        ),
        false,
        `${diagnostics.fields[index].key} overlaps ${diagnostics.fields[nextIndex].key}`,
      );
    }
  }

  const extracted = extractPdfText(pdf);
  if (extracted === null) {
    context.diagnostic(
      "Poppler is unavailable; critical-text extraction was covered by layout diagnostics.",
    );
    return;
  }

  const normalized = normalizeExtractedText(extracted);
  for (const field of diagnostics.fields) {
    for (const renderedLine of field.renderedLines) {
      assert.ok(
        normalized.includes(normalizeExtractedText(renderedLine)),
        `PDF text must contain ${renderedLine}`,
      );
    }
  }
  for (const criticalValue of ["TicketMe", "ZONE / ACCESS"]) {
    assert.ok(
      normalized.includes(normalizeExtractedText(criticalValue)),
      `PDF text must contain ${criticalValue}`,
    );
  }
});

test("Bulgarian ticket copy remains extractable", async (context) => {
  const ticket = testTicket({
    eventId: "plovdiv-cultural-night",
    eventName: "Пловдивска нощ на културата",
    eventDate: "17 септември 2026 г., 19:30",
    venue: "Античен театър, Пловдив",
    buyerName: "Йоана Георгиева",
    seatLabel: "ЗОНА-А-ВХОД-2",
  });
  const pdf = await createTicketPdf({
    ticket,
    verificationUrl:
      "https://tickets.example.com/api/tickets/TKT-TEST000000000001/verify?secret=test-secret",
    locale: "bg",
  });
  const extracted = extractPdfText(pdf);

  if (extracted === null) {
    context.diagnostic("Poppler is unavailable; Bulgarian PDF was still generated.");
    return;
  }

  const normalized = normalizeExtractedText(extracted);
  for (const value of [
    "Пловдивска нощ на културата",
    "Античен театър, Пловдив",
    "Йоана Георгиева",
    "ЗОНА / ДОСТЪП",
    "ЗОНА-А-ВХОД-2",
    "TicketMe",
  ]) {
    assert.ok(normalized.includes(value), `PDF text must contain ${value}`);
  }
});
