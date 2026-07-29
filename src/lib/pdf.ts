import fontkit from "@pdf-lib/fontkit";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readFile } from "fs/promises";
import path from "path";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import QRCode from "qrcode";
import { getTicketType } from "@/lib/event";
import type { StoredTicket } from "@/lib/store";

const PAGE_WIDTH = 720;
const PAGE_HEIGHT = 360;
const CARD_X = 18;
const CARD_Y = 18;
const CARD_WIDTH = 684;
const CARD_HEIGHT = 324;
const STUB_X = 504;
const HEADER_Y = 238;
const HEADER_HEIGHT = 104;

const COLORS = {
  page: rgb(0.965, 0.973, 0.988),
  white: rgb(1, 1, 1),
  navy: rgb(0.063, 0.09, 0.165),
  navySoft: rgb(0.11, 0.145, 0.235),
  blue: rgb(0.141, 0.341, 1),
  blueLight: rgb(0.914, 0.937, 1),
  slate: rgb(0.31, 0.365, 0.455),
  slateLight: rgb(0.862, 0.89, 0.933),
  stub: rgb(0.949, 0.965, 1),
} as const;

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

  const response = await assets.fetch(
    new URL(assetPath, FONT_ASSET_ORIGIN),
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Ticket font asset ${assetPath} returned HTTP ${response.status}.`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

const COPY = {
  bg: {
    eTicket: "ОФИЦИАЛЕН Е-БИЛЕТ",
    entry: "ЕДНОКРАТЕН ВХОД",
    date: "ДАТА И ЧАС",
    venue: "МЯСТО",
    holder: "ПРИТЕЖАТЕЛ",
    category: "КАТЕГОРИЯ",
    admission: "КОД ЗА ДОСТЪП",
    ticket: "НОМЕР НА БИЛЕТ",
    issued: "ИЗДАДЕН",
    scan: "СКАНИРАЙ НА ВХОДА",
    note: "Важи за едно влизане. Пази QR кода си личен.",
  },
  en: {
    eTicket: "OFFICIAL E-TICKET",
    entry: "ONE-TIME ENTRY",
    date: "DATE & TIME",
    venue: "VENUE",
    holder: "TICKET HOLDER",
    category: "CATEGORY",
    admission: "ADMISSION CODE",
    ticket: "TICKET ID",
    issued: "ISSUED",
    scan: "SCAN AT ENTRANCE",
    note: "Valid for one admission. Keep your QR code private.",
  },
} as const;

function truncateToWidth(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const normalized = value.trim().replace(/\s+/g, " ");
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

function wrappedLines(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current =
      font.widthOfTextAtSize(word, size) <= maxWidth
        ? word
        : truncateToWidth(word, font, size, maxWidth);
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function fitEventTitle(
  value: string,
  font: PDFFont,
  maxWidth: number,
): { lines: string[]; size: number } {
  for (let size = 25; size >= 19; size -= 1) {
    const lines = wrappedLines(value, font, size, maxWidth);
    if (lines.length <= 2) {
      return { lines, size };
    }
  }

  const size = 19;
  const lines = wrappedLines(value, font, size, maxWidth);
  return {
    size,
    lines: [
      lines[0] ?? "",
      truncateToWidth(lines.slice(1).join(" "), font, size, maxWidth),
    ],
  };
}

function drawFittedText(input: {
  page: PDFPage;
  value: string;
  font: PDFFont;
  x: number;
  y: number;
  maxWidth: number;
  maxSize: number;
  minSize?: number;
  color?: ReturnType<typeof rgb>;
}): void {
  const minSize = input.minSize ?? Math.max(input.maxSize - 3, 7);
  let size = input.maxSize;
  while (
    size > minSize &&
    input.font.widthOfTextAtSize(input.value, size) > input.maxWidth
  ) {
    size -= 0.5;
  }

  input.page.drawText(
    truncateToWidth(input.value, input.font, size, input.maxWidth),
    {
      x: input.x,
      y: input.y,
      size,
      font: input.font,
      color: input.color ?? COLORS.navy,
    },
  );
}

function drawDetail(input: {
  page: PDFPage;
  label: string;
  value: string;
  x: number;
  labelY: number;
  valueY: number;
  width: number;
  font: PDFFont;
  semibold: PDFFont;
  valueSize?: number;
}): void {
  input.page.drawText(input.label, {
    x: input.x,
    y: input.labelY,
    size: 7.5,
    font: input.semibold,
    color: COLORS.blue,
  });
  drawFittedText({
    page: input.page,
    value: input.value,
    font: input.font,
    x: input.x,
    y: input.valueY,
    maxWidth: input.width,
    maxSize: input.valueSize ?? 12.5,
    minSize: 8,
  });
}

function drawBrandMark(
  page: PDFPage,
  font: PDFFont,
  semibold: PDFFont,
): void {
  page.drawRectangle({
    x: 42,
    y: 306,
    width: 25,
    height: 19,
    color: COLORS.blue,
  });
  page.drawCircle({ x: 42, y: 315.5, size: 3, color: COLORS.navy });
  page.drawCircle({ x: 67, y: 315.5, size: 3, color: COLORS.navy });
  page.drawText("TF", {
    x: 48,
    y: 311,
    size: 7.5,
    font: semibold,
    color: COLORS.white,
  });
  page.drawText("TicketForge", {
    x: 76,
    y: 310,
    size: 11,
    font: semibold,
    color: COLORS.white,
  });
  page.drawText("SECURE DIGITAL ADMISSION", {
    x: 76,
    y: 298,
    size: 5.5,
    font,
    color: COLORS.slateLight,
  });
}

function drawPerforation(page: PDFPage): void {
  page.drawLine({
    start: { x: STUB_X, y: CARD_Y + 8 },
    end: { x: STUB_X, y: CARD_Y + CARD_HEIGHT - 8 },
    thickness: 1,
    color: COLORS.slateLight,
    dashArray: [4, 4],
  });
  page.drawCircle({
    x: STUB_X,
    y: CARD_Y,
    size: 8,
    color: COLORS.page,
  });
  page.drawCircle({
    x: STUB_X,
    y: CARD_Y + CARD_HEIGHT,
    size: 8,
    color: COLORS.page,
  });
}

function formatIssuedAt(value: string, locale: "bg" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(date);
}

export async function createTicketPdf(input: {
  ticket: StoredTicket;
  verificationUrl: string;
  locale?: "bg" | "en";
}): Promise<Uint8Array> {
  const locale = input.locale === "en" ? "en" : "bg";
  const copy = COPY[locale];
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`${input.ticket.eventName} | ${input.ticket.id}`, {
    showInWindowTitleBar: true,
  });
  pdfDoc.setAuthor("TicketForge");
  pdfDoc.setSubject("Secure digital admission ticket");
  pdfDoc.setCreator("TicketForge");
  pdfDoc.setProducer("TicketForge PDF service");
  pdfDoc.setLanguage(locale === "en" ? "en-GB" : "bg-BG");
  pdfDoc.setKeywords(["TicketForge", "event ticket", "QR admission"]);

  const [regularFontBytes, semiboldFontBytes] = await Promise.all([
    readTicketFont("/fonts/NotoSans-Regular.ttf", regularFontPath),
    readTicketFont("/fonts/NotoSans-SemiBold.ttf", semiboldFontPath),
  ]);
  const font = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const semibold = await pdfDoc.embedFont(semiboldFontBytes, {
    subset: true,
  });

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const ticketType = getTicketType(
    input.ticket.eventId,
    input.ticket.ticketType,
  );
  const ticketTypeLabel =
    locale === "en"
      ? {
          fan: "Fan zone",
          standard: "Standard",
          premium: "Premium",
        }[input.ticket.ticketType]
      : ticketType.label;
  const title = fitEventTitle(input.ticket.eventName, semibold, 420);
  const shortTicketId =
    input.ticket.id.length > 18
      ? `${input.ticket.id.slice(0, 8)}...${input.ticket.id.slice(-6)}`
      : input.ticket.id;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: COLORS.page,
  });
  page.drawRectangle({
    x: CARD_X,
    y: CARD_Y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    color: COLORS.white,
    borderColor: COLORS.slateLight,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: CARD_X,
    y: HEADER_Y,
    width: STUB_X - CARD_X,
    height: HEADER_HEIGHT,
    color: COLORS.navy,
  });
  page.drawRectangle({
    x: CARD_X,
    y: HEADER_Y,
    width: 6,
    height: HEADER_HEIGHT,
    color: COLORS.blue,
  });
  page.drawCircle({
    x: 470,
    y: 337,
    size: 74,
    color: COLORS.blue,
    opacity: 0.08,
  });
  page.drawCircle({
    x: 421,
    y: 245,
    size: 45,
    color: COLORS.blue,
    opacity: 0.05,
  });

  drawBrandMark(page, font, semibold);
  page.drawText(copy.eTicket, {
    x: 389,
    y: 310,
    size: 7,
    font: semibold,
    color: COLORS.slateLight,
  });
  title.lines.forEach((line, index) => {
    page.drawText(line, {
      x: 42,
      y: 270 - index * (title.size + 3),
      size: title.size,
      font: semibold,
      color: COLORS.white,
    });
  });

  page.drawLine({
    start: { x: 42, y: 168 },
    end: { x: 480, y: 168 },
    thickness: 0.8,
    color: COLORS.slateLight,
  });
  page.drawLine({
    start: { x: 42, y: 106 },
    end: { x: 480, y: 106 },
    thickness: 0.8,
    color: COLORS.slateLight,
  });

  drawDetail({
    page,
    label: copy.date,
    value: input.ticket.eventDate,
    x: 42,
    labelY: 212,
    valueY: 190,
    width: 205,
    font,
    semibold,
  });
  drawDetail({
    page,
    label: copy.venue,
    value: input.ticket.venue,
    x: 266,
    labelY: 212,
    valueY: 190,
    width: 214,
    font,
    semibold,
  });
  drawDetail({
    page,
    label: copy.holder,
    value: input.ticket.buyerName,
    x: 42,
    labelY: 150,
    valueY: 128,
    width: 205,
    font,
    semibold,
  });
  drawDetail({
    page,
    label: copy.category,
    value: ticketTypeLabel,
    x: 266,
    labelY: 150,
    valueY: 128,
    width: 214,
    font,
    semibold,
  });
  drawDetail({
    page,
    label: copy.admission,
    value: input.ticket.seatLabel,
    x: 42,
    labelY: 89,
    valueY: 68,
    width: 170,
    font: semibold,
    semibold,
    valueSize: 10.5,
  });
  drawDetail({
    page,
    label: copy.ticket,
    value: input.ticket.id,
    x: 230,
    labelY: 89,
    valueY: 68,
    width: 250,
    font,
    semibold,
    valueSize: 9.5,
  });

  page.drawText(`${copy.issued}:`, {
    x: 42,
    y: 37,
    size: 6.5,
    font: semibold,
    color: COLORS.slate,
  });
  drawFittedText({
    page,
    value: formatIssuedAt(input.ticket.issuedAt, locale),
    font,
    x: 78,
    y: 37,
    maxWidth: 140,
    maxSize: 6.5,
    minSize: 5.5,
    color: COLORS.slate,
  });
  drawFittedText({
    page,
    value: copy.note,
    font,
    x: 230,
    y: 37,
    maxWidth: 250,
    maxSize: 6.5,
    minSize: 5.5,
    color: COLORS.slate,
  });

  page.drawRectangle({
    x: STUB_X,
    y: CARD_Y,
    width: CARD_X + CARD_WIDTH - STUB_X,
    height: CARD_HEIGHT,
    color: COLORS.stub,
  });
  page.drawRectangle({
    x: STUB_X,
    y: HEADER_Y,
    width: CARD_X + CARD_WIDTH - STUB_X,
    height: HEADER_HEIGHT,
    color: COLORS.blue,
  });
  page.drawText(copy.entry, {
    x: 530,
    y: 314,
    size: 8,
    font: semibold,
    color: COLORS.white,
  });
  drawFittedText({
    page,
    value: ticketTypeLabel,
    font: semibold,
    x: 530,
    y: 286,
    maxWidth: 146,
    maxSize: 15,
    minSize: 10,
    color: COLORS.white,
  });
  drawFittedText({
    page,
    value: shortTicketId,
    font,
    x: 530,
    y: 263,
    maxWidth: 146,
    maxSize: 7,
    minSize: 6,
    color: COLORS.blueLight,
  });

  const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 640,
    color: {
      dark: "#10172A",
      light: "#FFFFFF",
    },
  });
  const qrImage = await pdfDoc.embedPng(qrDataUrl.split(",")[1]);
  page.drawRectangle({
    x: 526,
    y: 91,
    width: 154,
    height: 154,
    color: COLORS.white,
    borderColor: COLORS.slateLight,
    borderWidth: 1,
  });
  page.drawImage(qrImage, {
    x: 533,
    y: 98,
    width: 140,
    height: 140,
  });
  page.drawText(copy.scan, {
    x: 530,
    y: 74,
    size: 7,
    font: semibold,
    color: COLORS.blue,
  });
  drawFittedText({
    page,
    value: input.ticket.seatLabel,
    font: semibold,
    x: 530,
    y: 54,
    maxWidth: 146,
    maxSize: 8.5,
    minSize: 6.5,
  });
  drawFittedText({
    page,
    value: copy.note,
    font,
    x: 530,
    y: 34,
    maxWidth: 146,
    maxSize: 5.6,
    minSize: 4.8,
    color: COLORS.slate,
  });

  drawPerforation(page);

  return pdfDoc.save();
}
