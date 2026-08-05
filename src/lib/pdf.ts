import fontkit from "@pdf-lib/fontkit";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readFile } from "fs/promises";
import path from "path";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  degrees,
  rgb,
} from "pdf-lib";
import QRCode from "qrcode";
import {
  getTicketDesign,
  type TicketColor,
  type TicketDesign,
} from "@/lib/ticket-design";
import { getTicketType } from "@/lib/event";
import type { StoredTicket } from "@/lib/store";

const PAGE_WIDTH = 720;
const PAGE_HEIGHT = 360;
const CARD_X = 16;
const CARD_Y = 16;
const CARD_WIDTH = 688;
const CARD_HEIGHT = 328;
const STUB_X = 508;
const HEADER_Y = 222;
const HEADER_HEIGHT = 122;
const MAIN_LEFT = 40;
const MAIN_RIGHT = 486;
const QR_QUIET_ZONE_MODULES = 4;

const WHITE = rgb(1, 1, 1);
const PAGE_COLOR = rgb(0.96, 0.969, 0.984);
const QR_INK = rgb(0.018, 0.031, 0.067);

const regularFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NotoSans-Regular.ttf",
);

const semiboldFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NotoSans-SemiBold.ttf",
);

const FONT_ASSET_ORIGIN = "https://assets.local";

export type TicketPdfInput = {
  ticket: StoredTicket;
  verificationUrl: string;
  locale?: "bg" | "en";
  offerKind?: "admission" | "test-simulation";
  sourceName?: string;
  sourceUrl?: string;
  ticketLabel?: string;
  unitAmountMinor?: number;
  currency?: string;
};

export type TicketPdfBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TicketPdfTextField = {
  key:
    | "eventName"
    | "eventDate"
    | "venue"
    | "buyerName"
    | "ticketType"
    | "admissionCode"
    | "transactionCode"
    | "ticketId";
  sourceText: string;
  renderedLines: readonly string[];
  fontSize: number;
  bounds: TicketPdfBounds;
  truncated: boolean;
};

export type TicketPdfLayoutDiagnostics = {
  page: { width: number; height: number };
  mainPanel: TicketPdfBounds;
  stubPanel: TicketPdfBounds;
  theme: {
    id: string;
    pattern: TicketDesign["pattern"];
    eventSeed: number;
    ticketSeed: number;
    motifOffset: number;
  };
  fields: readonly TicketPdfTextField[];
  qr: {
    bounds: TicketPdfBounds;
    quietZoneModules: number;
    dataModules: number;
    totalModules: number;
    moduleSize: number;
  };
};

type TicketPdfRenderResult = {
  pdf: Uint8Array;
  diagnostics: TicketPdfLayoutDiagnostics;
};

const ADMISSION_COPY = {
  bg: {
    eTicket: "ОФИЦИАЛЕН Е-БИЛЕТ",
    brandTagline: "OFFICIAL DIGITAL ADMISSION",
    watermark: "",
    source: "",
    entry: "ЕДНОКРАТЕН ВХОД",
    date: "ДАТА И ЧАС",
    venue: "МЯСТО",
    holder: "ПРИТЕЖАТЕЛ",
    category: "КАТЕГОРИЯ",
    zoneAccess: "ЗОНА / ДОСТЪП",
    ticket: "НОМЕР НА БИЛЕТ",
    issued: "ИЗДАДЕН",
    scan: "СКАНИРАЙ НА ВХОДА",
    note: "Важи за едно влизане. Пази QR кода си личен.",
  },
  en: {
    eTicket: "OFFICIAL E-TICKET",
    brandTagline: "OFFICIAL DIGITAL ADMISSION",
    watermark: "",
    source: "",
    entry: "ONE-TIME ENTRY",
    date: "DATE & TIME",
    venue: "VENUE",
    holder: "TICKET HOLDER",
    category: "CATEGORY",
    zoneAccess: "ZONE / ACCESS",
    ticket: "TICKET ID",
    issued: "ISSUED",
    scan: "SCAN AT ENTRANCE",
    note: "Valid for one admission. Keep your QR code private.",
  },
} as const;

const SIMULATION_COPY = {
  bg: {
    eTicket: "ТЕСТОВ PDF БИЛЕТ",
    brandTagline: "ЗАПИС ЗА ТЕСТОВО ПЛАЩАНЕ",
    entry: "САМО ТЕСТОВО ПЛАЩАНЕ",
    date: "ДАТА И ЧАС",
    venue: "МЯСТО",
    holder: "КУПУВАЧ",
    category: "ТИП ТЕСТОВ БИЛЕТ",
    zoneAccess: "РЕФЕРЕНЦИЯ НА ТРАНЗАКЦИЯТА",
    ticket: "НОМЕР НА ТЕСТОВ ЗАПИС",
    issued: "СЪЗДАДЕН",
    scan: "ПРОВЕРИ ТЕСТОВАТА ТРАНЗАКЦИЯ",
    note: "Не важи за вход. QR кодът потвърждава само тестовата транзакция.",
    watermark: "ТЕСТОВ БИЛЕТ / НЕ ВАЖИ ЗА ВХОД",
    source: "Източник на събитието",
  },
  en: {
    eTicket: "TEST PDF TICKET",
    brandTagline: "TEST PAYMENT RECORD",
    entry: "TEST PAYMENT ONLY",
    date: "DATE & TIME",
    venue: "VENUE",
    holder: "BUYER",
    category: "TEST TICKET TYPE",
    zoneAccess: "TRANSACTION REFERENCE",
    ticket: "TEST RECORD ID",
    issued: "CREATED",
    scan: "VERIFY TEST TRANSACTION",
    note: "Not valid for entry. QR verifies this test transaction only.",
    watermark: "TEST TICKET / NOT VALID FOR ENTRY",
    source: "Event source",
  },
} as const;

const SIMULATION_STUB_NOTE = {
  bg: "Не важи за вход. QR: само тестова проверка.",
  en: "Not valid for entry. QR: test verification only.",
} as const;

async function readTicketFont(
  assetPath: string,
  localPath: string,
): Promise<Uint8Array> {
  let assets: CloudflareEnv["ASSETS"];

  try {
    assets = getCloudflareContext().env.ASSETS;
  } catch {
    // `next dev`, Node.js tests, and conventional Node deployments do not
    // provide an OpenNext Cloudflare request context.
    assets = undefined;
  }

  if (!assets) {
    return readFile(localPath);
  }

  const response = await assets.fetch(new URL(assetPath, FONT_ASSET_ORIGIN));
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Ticket font asset ${assetPath} returned HTTP ${response.status}.`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

function color(value: TicketColor) {
  return rgb(value[0], value[1], value[2]);
}

function normalizeDisplayText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function truncateToWidth(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const normalized = normalizeDisplayText(value);
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) {
    return normalized;
  }

  const suffix = "...";
  const characters = Array.from(normalized);
  while (
    characters.length > 0 &&
    font.widthOfTextAtSize(`${characters.join("")}${suffix}`, size) >
      maxWidth
  ) {
    characters.pop();
  }
  return `${characters.join("").trimEnd()}${suffix}`;
}

function splitWordToWidth(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const character of Array.from(word)) {
    const candidate = `${current}${character}`;
    if (
      current &&
      font.widthOfTextAtSize(candidate, size) > maxWidth
    ) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function wrappedLines(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = normalizeDisplayText(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const chunks =
      font.widthOfTextAtSize(word, size) <= maxWidth
        ? [word]
        : splitWordToWidth(word, font, size, maxWidth);

    for (const chunk of chunks) {
      const candidate = current ? `${current} ${chunk}` : chunk;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        current = chunk;
      }
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

type FittedText = {
  lines: string[];
  size: number;
  truncated: boolean;
};

function fitText(input: {
  value: string;
  font: PDFFont;
  maxWidth: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  maxHeight?: number;
  allowTruncate?: boolean;
}): FittedText {
  for (
    let size = input.maxSize;
    size >= input.minSize;
    size -= 0.5
  ) {
    const lines = wrappedLines(
      input.value,
      input.font,
      size,
      input.maxWidth,
    );
    const requiredHeight =
      size * 1.1 + Math.max(0, lines.length - 1) * size * 1.18;
    if (
      lines.length <= input.maxLines &&
      (input.maxHeight === undefined || requiredHeight <= input.maxHeight)
    ) {
      return { lines, size, truncated: false };
    }
  }

  const lines = wrappedLines(
    input.value,
    input.font,
    input.minSize,
    input.maxWidth,
  );
  if (input.allowTruncate === false) {
    return {
      lines,
      size: input.minSize,
      truncated: lines.length > input.maxLines,
    };
  }

  const visible = lines.slice(0, input.maxLines);
  visible[input.maxLines - 1] = truncateToWidth(
    lines.slice(input.maxLines - 1).join(" "),
    input.font,
    input.minSize,
    input.maxWidth,
  );
  return {
    lines: visible,
    size: input.minSize,
    truncated: true,
  };
}

function drawTextBlock(input: {
  page: PDFPage;
  value: string;
  font: PDFFont;
  x: number;
  top: number;
  width: number;
  maxLines: number;
  maxSize: number;
  minSize: number;
  maxHeight?: number;
  color: ReturnType<typeof rgb>;
  allowTruncate?: boolean;
  key?: TicketPdfTextField["key"];
  fields?: TicketPdfTextField[];
}): FittedText {
  const fitted = fitText({
    value: input.value,
    font: input.font,
    maxWidth: input.width,
    maxLines: input.maxLines,
    maxSize: input.maxSize,
    minSize: input.minSize,
    maxHeight: input.maxHeight,
    allowTruncate: input.allowTruncate,
  });
  const leading = fitted.size * 1.18;

  fitted.lines.slice(0, input.maxLines).forEach((line, index) => {
    input.page.drawText(line, {
      x: input.x,
      y: input.top - index * leading,
      size: fitted.size,
      font: input.font,
      color: input.color,
    });
  });

  if (input.key && input.fields) {
    const lineCount = Math.min(fitted.lines.length, input.maxLines);
    input.fields.push({
      key: input.key,
      sourceText: normalizeDisplayText(input.value),
      renderedLines: fitted.lines.slice(0, input.maxLines),
      fontSize: fitted.size,
      bounds: {
        x: input.x,
        y:
          input.top -
          Math.max(0, lineCount - 1) * leading -
          fitted.size * 0.25,
        width: input.width,
        height:
          fitted.size * 1.1 + Math.max(0, lineCount - 1) * leading,
      },
      truncated: fitted.truncated || fitted.lines.length > input.maxLines,
    });
  }

  return fitted;
}

function drawLabel(input: {
  page: PDFPage;
  value: string;
  x: number;
  y: number;
  font: PDFFont;
  design: TicketDesign;
}): void {
  input.page.drawText(input.value, {
    x: input.x,
    y: input.y,
    size: 7,
    font: input.font,
    color: color(input.design.accent),
  });
}

function drawBrandMark(
  page: PDFPage,
  font: PDFFont,
  semibold: PDFFont,
  design: TicketDesign,
  tagline: string,
): void {
  page.drawRectangle({
    x: MAIN_LEFT,
    y: 306,
    width: 28,
    height: 21,
    color: color(design.accent),
  });
  page.drawCircle({
    x: MAIN_LEFT,
    y: 316.5,
    size: 3.2,
    color: color(design.background),
  });
  page.drawCircle({
    x: MAIN_LEFT + 28,
    y: 316.5,
    size: 3.2,
    color: color(design.background),
  });
  page.drawText("TK", {
    x: MAIN_LEFT + 6.2,
    y: 312,
    size: 7.4,
    font: semibold,
    color: WHITE,
  });
  page.drawText("Tiketko", {
    x: MAIN_LEFT + 38,
    y: 311,
    size: 11.5,
    font: semibold,
    color: WHITE,
  });
  page.drawText(tagline, {
    x: MAIN_LEFT + 38,
    y: 299,
    size: 5.3,
    font,
    color: WHITE,
    opacity: 0.72,
  });
}

function drawSimulationWatermark(input: {
  page: PDFPage;
  semibold: PDFFont;
  warning: string;
}): void {
  const warningColor = rgb(0.73, 0.055, 0.12);
  const ribbon = {
    x: 180,
    y: 304,
    width: MAIN_RIGHT - 180,
    height: 23,
  };
  const fitted = fitText({
    value: input.warning,
    font: input.semibold,
    maxWidth: ribbon.width - 18,
    maxLines: 1,
    maxSize: 8.4,
    minSize: 6.2,
    allowTruncate: false,
  });
  const line = fitted.lines[0] ?? input.warning;
  const lineWidth = input.semibold.widthOfTextAtSize(line, fitted.size);

  input.page.drawRectangle({
    ...ribbon,
    color: warningColor,
    borderColor: WHITE,
    borderWidth: 0.65,
    borderOpacity: 0.55,
  });
  input.page.drawText(line, {
    x: ribbon.x + Math.max(9, (ribbon.width - lineWidth) / 2),
    y: ribbon.y + 7.2,
    size: fitted.size,
    font: input.semibold,
    color: WHITE,
  });

  const diagonal = fitText({
    value: input.warning,
    font: input.semibold,
    maxWidth: 540,
    maxLines: 1,
    maxSize: 24,
    minSize: 17,
    allowTruncate: false,
  });
  input.page.drawText(diagonal.lines[0] ?? input.warning, {
    x: 82,
    y: 88,
    size: diagonal.size,
    font: input.semibold,
    color: warningColor,
    opacity: 0.075,
    rotate: degrees(17),
  });
}

function drawThemePattern(
  page: PDFPage,
  design: TicketDesign,
  bounds: TicketPdfBounds,
): void {
  const accent = color(design.accentAlt);
  const offset = design.motifOffset;

  if (design.pattern === "orbit") {
    page.drawCircle({
      x: bounds.x + bounds.width * (0.73 + offset * 0.14),
      y: bounds.y + bounds.height * 0.79,
      size: 76,
      color: accent,
      opacity: 0.08,
    });
    page.drawCircle({
      x: bounds.x + bounds.width * (0.87 - offset * 0.12),
      y: bounds.y + bounds.height * 0.18,
      size: 39,
      color: accent,
      opacity: 0.07,
    });
    return;
  }

  if (design.pattern === "rays") {
    const anchorX = bounds.x + bounds.width * (0.78 + offset * 0.14);
    const anchorY = bounds.y + bounds.height * (0.25 + offset * 0.2);
    for (let index = -2; index <= 4; index += 1) {
      page.drawLine({
        start: { x: anchorX, y: anchorY },
        end: {
          x: bounds.x + bounds.width,
          y: bounds.y + 12 + index * 33,
        },
        thickness: 9,
        color: accent,
        opacity: 0.045,
      });
    }
    return;
  }

  if (design.pattern === "grid") {
    const step = 23;
    const shift = Math.round(offset * step);
    for (let x = bounds.x + shift; x < bounds.x + bounds.width; x += step) {
      for (let y = bounds.y + 8; y < bounds.y + bounds.height; y += step) {
        page.drawCircle({
          x,
          y,
          size: 1.4,
          color: accent,
          opacity: 0.16,
        });
      }
    }
    return;
  }

  const baseline = bounds.y + bounds.height * (0.34 + offset * 0.2);
  const points = [
    { x: bounds.x + bounds.width * 0.52, y: baseline },
    { x: bounds.x + bounds.width * 0.61, y: baseline },
    { x: bounds.x + bounds.width * 0.66, y: baseline + 26 },
    { x: bounds.x + bounds.width * 0.71, y: baseline - 20 },
    { x: bounds.x + bounds.width * 0.77, y: baseline + 10 },
    { x: bounds.x + bounds.width * 0.83, y: baseline },
    { x: bounds.x + bounds.width * 0.98, y: baseline },
  ];
  for (let index = 1; index < points.length; index += 1) {
    page.drawLine({
      start: points[index - 1],
      end: points[index],
      thickness: 6,
      color: accent,
      opacity: 0.08,
    });
  }
}

function drawPerforation(page: PDFPage, design: TicketDesign): void {
  page.drawLine({
    start: { x: STUB_X, y: CARD_Y + 9 },
    end: { x: STUB_X, y: CARD_Y + CARD_HEIGHT - 9 },
    thickness: 1,
    color: color(design.line),
    dashArray: [4, 4],
  });
  page.drawCircle({
    x: STUB_X,
    y: CARD_Y,
    size: 8,
    color: PAGE_COLOR,
  });
  page.drawCircle({
    x: STUB_X,
    y: CARD_Y + CARD_HEIGHT,
    size: 8,
    color: PAGE_COLOR,
  });
}

function formatIssuedAt(value: string, locale: "bg" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return normalizeDisplayText(value);
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(date);
}

function drawVectorQrCode(input: {
  page: PDFPage;
  value: string;
  x: number;
  y: number;
  size: number;
}): TicketPdfLayoutDiagnostics["qr"] {
  const qr = QRCode.create(input.value, {
    errorCorrectionLevel: "H",
  });
  const dataModules = qr.modules.size;
  const totalModules = dataModules + QR_QUIET_ZONE_MODULES * 2;
  const moduleSize = input.size / totalModules;

  input.page.drawRectangle({
    x: input.x,
    y: input.y,
    width: input.size,
    height: input.size,
    color: WHITE,
  });

  for (let row = 0; row < dataModules; row += 1) {
    let runStart = -1;
    for (let column = 0; column <= dataModules; column += 1) {
      const dark =
        column < dataModules && qr.modules.get(row, column) === 1;
      if (dark && runStart === -1) {
        runStart = column;
      }
      if (!dark && runStart !== -1) {
        input.page.drawRectangle({
          x:
            input.x +
            (runStart + QR_QUIET_ZONE_MODULES) * moduleSize,
          y:
            input.y +
            input.size -
            (row + QR_QUIET_ZONE_MODULES + 1) * moduleSize,
          width: (column - runStart) * moduleSize,
          height: moduleSize,
          color: QR_INK,
        });
        runStart = -1;
      }
    }
  }

  return {
    bounds: {
      x: input.x,
      y: input.y,
      width: input.size,
      height: input.size,
    },
    quietZoneModules: QR_QUIET_ZONE_MODULES,
    dataModules,
    totalModules,
    moduleSize,
  };
}

function ticketTypeLabel(
  ticket: StoredTicket,
  locale: "bg" | "en",
  providedLabel?: string,
): string {
  const normalizedLabel = normalizeDisplayText(providedLabel ?? "");
  if (normalizedLabel) {
    return normalizedLabel;
  }

  if (locale === "en") {
    return {
      fan: "Fan zone",
      standard: "Standard",
      premium: "Premium",
    }[ticket.ticketType];
  }
  return getTicketType(ticket.eventId, ticket.ticketType).label;
}

async function renderTicketPdf(
  input: TicketPdfInput,
): Promise<TicketPdfRenderResult> {
  const locale = input.locale === "en" ? "en" : "bg";
  const simulation = input.offerKind === "test-simulation";
  const copy = simulation
    ? SIMULATION_COPY[locale]
    : ADMISSION_COPY[locale];
  const design = getTicketDesign(input.ticket.eventId, input.ticket.id);
  const fields: TicketPdfTextField[] = [];
  const pdfDoc = await PDFDocument.create({ updateMetadata: false });
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`${input.ticket.eventName} | ${input.ticket.id}`, {
    showInWindowTitleBar: true,
  });
  pdfDoc.setAuthor("Tiketko");
  pdfDoc.setSubject(
    simulation
      ? "Tiketko test payment record - not valid for entry"
      : "Official Tiketko digital admission ticket",
  );
  pdfDoc.setCreator("Tiketko");
  pdfDoc.setProducer("Tiketko PDF service");
  pdfDoc.setLanguage(locale === "en" ? "en-GB" : "bg-BG");
  pdfDoc.setKeywords(
    simulation
      ? [
          "Tiketko",
          "test payment record",
          "not valid for entry",
          "transaction verification",
          design.id,
        ]
      : [
          "Tiketko",
          "official event ticket",
          "QR admission",
          design.id,
        ],
  );

  const issuedAt = new Date(input.ticket.issuedAt);
  if (!Number.isNaN(issuedAt.getTime())) {
    pdfDoc.setCreationDate(issuedAt);
    pdfDoc.setModificationDate(issuedAt);
  }

  const [regularFontBytes, semiboldFontBytes] = await Promise.all([
    readTicketFont("/fonts/NotoSans-Regular.ttf", regularFontPath),
    readTicketFont("/fonts/NotoSans-SemiBold.ttf", semiboldFontPath),
  ]);
  const font = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const semibold = await pdfDoc.embedFont(semiboldFontBytes, {
    subset: true,
  });
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const typeLabel = ticketTypeLabel(
    input.ticket,
    locale,
    input.ticketLabel,
  );
  const sourceName = normalizeDisplayText(input.sourceName ?? "");
  const note =
    simulation && sourceName
      ? `${copy.note} ${copy.source}: ${sourceName}.`
      : copy.note;
  const stubNote = simulation ? SIMULATION_STUB_NOTE[locale] : note;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: PAGE_COLOR,
  });
  page.drawRectangle({
    x: CARD_X,
    y: CARD_Y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    color: WHITE,
    borderColor: color(design.line),
    borderWidth: 1,
  });
  page.drawRectangle({
    x: CARD_X,
    y: HEADER_Y,
    width: STUB_X - CARD_X,
    height: HEADER_HEIGHT,
    color: color(design.background),
  });
  page.drawRectangle({
    x: CARD_X,
    y: HEADER_Y,
    width: 6,
    height: HEADER_HEIGHT,
    color: color(design.accent),
  });
  drawThemePattern(page, design, {
    x: CARD_X,
    y: HEADER_Y,
    width: STUB_X - CARD_X,
    height: HEADER_HEIGHT,
  });
  drawBrandMark(page, font, semibold, design, copy.brandTagline);

  if (simulation) {
    drawSimulationWatermark({
      page,
      semibold,
      warning: copy.watermark,
    });
  } else {
    page.drawRectangle({
      x: 370,
      y: 306,
      width: 116,
      height: 21,
      borderColor: WHITE,
      borderWidth: 0.7,
      borderOpacity: 0.36,
      opacity: 0,
    });
    page.drawText(copy.eTicket, {
      x: 382,
      y: 312,
      size: 6.5,
      font: semibold,
      color: WHITE,
      opacity: 0.86,
    });
  }
  drawTextBlock({
    page,
    value: input.ticket.eventName,
    font: semibold,
    x: MAIN_LEFT,
    top: 274,
    width: MAIN_RIGHT - MAIN_LEFT,
    maxLines: 3,
    maxSize: 24,
    minSize: 13.5,
    maxHeight: 66,
    color: WHITE,
    allowTruncate: false,
    key: "eventName",
    fields,
  });

  page.drawLine({
    start: { x: MAIN_LEFT, y: 159 },
    end: { x: MAIN_RIGHT, y: 159 },
    thickness: 0.8,
    color: color(design.line),
  });
  page.drawLine({
    start: { x: MAIN_LEFT, y: 108 },
    end: { x: MAIN_RIGHT, y: 108 },
    thickness: 0.8,
    color: color(design.line),
  });

  drawLabel({
    page,
    value: copy.date,
    x: MAIN_LEFT,
    y: 201,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: input.ticket.eventDate,
    font,
    x: MAIN_LEFT,
    top: 181,
    width: 190,
    maxLines: 2,
    maxSize: 11.5,
    minSize: 8,
    color: color(design.ink),
    allowTruncate: false,
    key: "eventDate",
    fields,
  });
  drawLabel({
    page,
    value: copy.venue,
    x: 250,
    y: 201,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: input.ticket.venue,
    font,
    x: 250,
    top: 181,
    width: 236,
    maxLines: 2,
    maxSize: 11.5,
    minSize: 7.5,
    color: color(design.ink),
    allowTruncate: false,
    key: "venue",
    fields,
  });

  drawLabel({
    page,
    value: copy.holder,
    x: MAIN_LEFT,
    y: 148,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: input.ticket.buyerName,
    font,
    x: MAIN_LEFT,
    top: 129,
    width: 278,
    maxLines: 2,
    maxSize: 11.2,
    minSize: 7.5,
    color: color(design.ink),
    allowTruncate: false,
    key: "buyerName",
    fields,
  });
  drawLabel({
    page,
    value: copy.category,
    x: 337,
    y: 148,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: typeLabel,
    font: semibold,
    x: 337,
    top: 129,
    width: 149,
    maxLines: 2,
    maxSize: 11.2,
    minSize: 7.5,
    color: color(design.ink),
    allowTruncate: false,
    key: "ticketType",
    fields,
  });

  drawLabel({
    page,
    value: copy.zoneAccess,
    x: MAIN_LEFT,
    y: 96,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: input.ticket.seatLabel,
    font: semibold,
    x: MAIN_LEFT,
    top: 77,
    width: MAIN_RIGHT - MAIN_LEFT,
    maxLines: 1,
    maxSize: 10.3,
    minSize: 6,
    color: color(design.ink),
    allowTruncate: false,
    key: simulation ? "transactionCode" : "admissionCode",
    fields,
  });

  drawLabel({
    page,
    value: copy.ticket,
    x: MAIN_LEFT,
    y: 57,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: input.ticket.id,
    font: semibold,
    x: MAIN_LEFT,
    top: 39,
    width: 275,
    maxLines: 1,
    maxSize: 8.6,
    minSize: 5.6,
    color: color(design.ink),
    allowTruncate: false,
    key: "ticketId",
    fields,
  });
  drawLabel({
    page,
    value: copy.issued,
    x: 337,
    y: 57,
    font: semibold,
    design,
  });
  drawTextBlock({
    page,
    value: formatIssuedAt(input.ticket.issuedAt, locale),
    font,
    x: 337,
    top: 39,
    width: 149,
    maxLines: 1,
    maxSize: 7,
    minSize: 5.5,
    color: color(design.muted),
  });
  drawTextBlock({
    page,
    value: note,
    font,
    x: MAIN_LEFT,
    top: 22,
    width: MAIN_RIGHT - MAIN_LEFT,
    maxLines: 1,
    maxSize: 5.8,
    minSize: 5,
    color: color(design.muted),
  });

  page.drawRectangle({
    x: STUB_X,
    y: CARD_Y,
    width: CARD_X + CARD_WIDTH - STUB_X,
    height: CARD_HEIGHT,
    color: color(design.tint),
  });
  page.drawRectangle({
    x: STUB_X,
    y: 244,
    width: CARD_X + CARD_WIDTH - STUB_X,
    height: 100,
    color: color(design.backgroundAlt),
  });
  drawThemePattern(page, design, {
    x: STUB_X,
    y: 244,
    width: CARD_X + CARD_WIDTH - STUB_X,
    height: 100,
  });
  page.drawText(copy.entry, {
    x: 530,
    y: 316,
    size: 7.5,
    font: semibold,
    color: WHITE,
    opacity: 0.82,
  });
  drawTextBlock({
    page,
    value: typeLabel,
    font: semibold,
    x: 530,
    top: 286,
    width: 152,
    maxLines: 1,
    maxSize: 15.5,
    minSize: 9,
    color: WHITE,
  });
  drawTextBlock({
    page,
    value: input.ticket.id,
    font,
    x: 530,
    top: 262,
    width: 152,
    maxLines: 1,
    maxSize: 6.3,
    minSize: 4.8,
    color: WHITE,
  });

  page.drawRectangle({
    x: 526,
    y: 84,
    width: 160,
    height: 160,
    color: WHITE,
    borderColor: color(design.line),
    borderWidth: 0.8,
  });
  const qr = drawVectorQrCode({
    page,
    value: input.verificationUrl,
    x: 530,
    y: 88,
    size: 152,
  });
  page.drawText(copy.scan, {
    x: 530,
    y: 69,
    size: 7,
    font: semibold,
    color: color(design.accent),
  });
  drawTextBlock({
    page,
    value: input.ticket.seatLabel,
    font: semibold,
    x: 530,
    top: 51,
    width: 152,
    maxLines: 1,
    maxSize: 7.2,
    minSize: 5,
    color: color(design.ink),
  });
  drawTextBlock({
    page,
    value: stubNote,
    font,
    x: 530,
    top: 30,
    width: 152,
    maxLines: 1,
    maxSize: 5.2,
    minSize: 4.5,
    color: color(design.muted),
  });

  drawPerforation(page, design);

  const diagnostics: TicketPdfLayoutDiagnostics = {
    page: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    mainPanel: {
      x: CARD_X,
      y: CARD_Y,
      width: STUB_X - CARD_X,
      height: CARD_HEIGHT,
    },
    stubPanel: {
      x: STUB_X,
      y: CARD_Y,
      width: CARD_X + CARD_WIDTH - STUB_X,
      height: CARD_HEIGHT,
    },
    theme: {
      id: design.id,
      pattern: design.pattern,
      eventSeed: design.eventSeed,
      ticketSeed: design.ticketSeed,
      motifOffset: design.motifOffset,
    },
    fields,
    qr,
  };

  return {
    pdf: await pdfDoc.save(),
    diagnostics,
  };
}

export async function createTicketPdf(
  input: TicketPdfInput,
): Promise<Uint8Array> {
  return (await renderTicketPdf(input)).pdf;
}

export async function createTicketPdfWithDiagnostics(
  input: TicketPdfInput,
): Promise<TicketPdfRenderResult> {
  return renderTicketPdf(input);
}
