import { XMLParser } from "fast-xml-parser";
import ical, { type CalendarComponent, type VEvent } from "node-ical";
import {
  isAllowedDiscoverySourceUrl,
  parseDiscoveryAllowedHosts,
  parseSafeDiscoveryUrl,
  type DiscoveryAllowedHost,
} from "@/lib/event-discovery-security";
import {
  MAX_DISCOVERY_CANDIDATES_PER_FEED,
  parseDiscoveryEventCandidate,
  type DiscoveryEventCandidate,
} from "@/lib/event-discovery-types";

export type DiscoveryFeedFormat = "ics" | "json" | "xml";

export type ParseDiscoveryFeedOptions = {
  allowedSourceHosts?: readonly DiscoveryAllowedHost[];
  contentType?: string;
  feedUrl: string;
};

const XML_PARSER = new XMLParser({
  allowBooleanAttributes: false,
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (tagName) =>
    tagName.toLowerCase() === "entry" ||
    tagName.toLowerCase() === "item",
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getCaseInsensitive(
  record: Record<string, unknown>,
  ...names: readonly string[]
): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));

  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(key.toLowerCase())) {
      return value;
    }
  }

  return undefined;
}

function parameterText(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = parameterText(entry);
      if (text) {
        return text;
      }
    }
    return undefined;
  }

  if (isRecord(value)) {
    for (const key of [
      "#text",
      "_",
      "value",
      "val",
      "href",
      "@_href",
    ]) {
      const text = parameterText(value[key]);
      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

const BASIC_HTML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
]);

const MAX_HTML_ENTITY_LENGTH = 16;

type MarkupToken = {
  closing: boolean;
  end: number;
  selfClosing: boolean;
  tagName: string | null;
};

function isAsciiDigit(character: string, radix: 10 | 16): boolean {
  const code = character.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    return true;
  }
  return (
    radix === 16 &&
    ((code >= 65 && code <= 70) || (code >= 97 && code <= 102))
  );
}

function decodeEntityBody(body: string): string | null {
  const named = BASIC_HTML_ENTITIES.get(body.toLowerCase());
  if (named !== undefined) {
    return named;
  }

  if (!body.startsWith("#")) {
    return null;
  }

  const hexadecimal = body[1]?.toLowerCase() === "x";
  const radix = hexadecimal ? 16 : 10;
  const digits = body.slice(hexadecimal ? 2 : 1);
  if (!digits || ![...digits].every((character) => isAsciiDigit(character, radix))) {
    return null;
  }

  const codePoint = Number.parseInt(digits, radix);
  if (
    !Number.isSafeInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return null;
  }

  return String.fromCodePoint(codePoint);
}

function decodeBasicEntities(value: string): string {
  const decoded: string[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "&") {
      decoded.push(value[index]);
      continue;
    }

    let semicolon = -1;
    for (
      let cursor = index + 1;
      cursor < value.length && cursor - index <= MAX_HTML_ENTITY_LENGTH;
      cursor += 1
    ) {
      if (value[cursor] === ";") {
        semicolon = cursor;
        break;
      }
      if (value[cursor] === "&") {
        break;
      }
    }

    if (semicolon < 0) {
      decoded.push("&");
      continue;
    }

    const entity = decodeEntityBody(value.slice(index + 1, semicolon));
    if (entity === null) {
      decoded.push("&");
      continue;
    }

    decoded.push(entity);
    index = semicolon;
  }

  return decoded.join("");
}

function isMarkupWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isTagNameCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    character === ":" ||
    character === "-" ||
    character === "_"
  );
}

function markupDeclarationToken(value: string, start: number): MarkupToken {
  const comment = value.startsWith("<!--", start);
  const marker = comment ? "-->" : ">";
  const markerStart = value.indexOf(marker, start + (comment ? 4 : 2));

  return {
    closing: false,
    end: markerStart < 0 ? value.length : markerStart + marker.length,
    selfClosing: false,
    tagName: null,
  };
}

function readMarkupToken(value: string, start: number): MarkupToken | null {
  if (value[start] !== "<") {
    return null;
  }
  if (value[start + 1] === "!" || value[start + 1] === "?") {
    return markupDeclarationToken(value, start);
  }

  let cursor = start + 1;
  while (isMarkupWhitespace(value[cursor] ?? "")) {
    cursor += 1;
  }

  const closing = value[cursor] === "/";
  if (closing) {
    cursor += 1;
    while (isMarkupWhitespace(value[cursor] ?? "")) {
      cursor += 1;
    }
  }

  const nameStart = cursor;
  while (isTagNameCharacter(value[cursor] ?? "")) {
    cursor += 1;
  }
  if (cursor === nameStart) {
    return null;
  }

  const tagName = value.slice(nameStart, cursor).toLowerCase();
  let quote: '"' | "'" | null = null;
  for (; cursor < value.length; cursor += 1) {
    const character = value[cursor];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== ">") {
      continue;
    }

    let beforeEnd = cursor - 1;
    while (isMarkupWhitespace(value[beforeEnd] ?? "")) {
      beforeEnd -= 1;
    }
    return {
      closing,
      end: cursor + 1,
      selfClosing: value[beforeEnd] === "/",
      tagName,
    };
  }

  // A syntactically tag-like token that reaches EOF is discarded as one
  // bounded unit. Returning null would make the outer scanner retry the same
  // unterminated suffix at every subsequent "<", producing quadratic work.
  return {
    closing,
    end: value.length,
    selfClosing: false,
    tagName,
  };
}

function textWithoutMarkup(value: string): string {
  const text: string[] = [];
  let suppressedTag: "script" | "style" | null = null;

  for (let index = 0; index < value.length; ) {
    if (value[index] !== "<") {
      if (!suppressedTag) {
        text.push(value[index]);
      }
      index += 1;
      continue;
    }

    const token = readMarkupToken(value, index);
    if (!token) {
      if (!suppressedTag) {
        text.push("<");
      }
      index += 1;
      continue;
    }

    index = token.end;
    if (suppressedTag) {
      if (token.closing && token.tagName === suppressedTag) {
        suppressedTag = null;
        text.push(" ");
      }
      continue;
    }

    if (
      !token.closing &&
      !token.selfClosing &&
      (token.tagName === "script" || token.tagName === "style")
    ) {
      suppressedTag = token.tagName;
    }
    text.push(" ");
  }

  return text.join("");
}

function cleanText(
  value: unknown,
  maxLength: number,
): string | undefined {
  const raw = parameterText(value);
  if (!raw) {
    return undefined;
  }

  const text = textWithoutMarkup(decodeBasicEntities(raw))
    .replace(/\p{C}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!text) {
    return undefined;
  }

  return text.slice(0, maxLength);
}

function dateText(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  return cleanText(value, 80);
}

function safeResourceUrl(
  value: unknown,
  fallback: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
): string | undefined {
  const text = cleanText(value, 2_048);
  if (!text) {
    return undefined;
  }

  try {
    const feedUrl = parseSafeDiscoveryUrl(fallback);
    const sourceUrl = parseSafeDiscoveryUrl(new URL(text, feedUrl));
    return isAllowedDiscoverySourceUrl(sourceUrl, feedUrl, allowedHosts)
      ? sourceUrl.href
      : undefined;
  } catch {
    return undefined;
  }
}

function optionalSafeResourceUrl(
  value: unknown,
): string | undefined {
  const text = cleanText(value, 2_048);
  if (!text) {
    return undefined;
  }

  try {
    return parseSafeDiscoveryUrl(text).href;
  } catch {
    return undefined;
  }
}

function compactCandidate(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function finalizeCandidate(
  value: Record<string, unknown>,
): DiscoveryEventCandidate | null {
  return parseDiscoveryEventCandidate(compactCandidate(value));
}

export function detectDiscoveryFeedFormat(
  body: string,
  contentType: string,
  feedUrl: string,
): DiscoveryFeedFormat {
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  const pathname = new URL(feedUrl).pathname.toLowerCase();
  const trimmed = body.trimStart();

  if (
    mimeType === "text/calendar" ||
    pathname.endsWith(".ics") ||
    trimmed.startsWith("BEGIN:VCALENDAR")
  ) {
    return "ics";
  }

  if (
    mimeType === "application/json" ||
    mimeType === "application/feed+json" ||
    pathname.endsWith(".json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[")
  ) {
    return "json";
  }

  if (
    mimeType.includes("xml") ||
    pathname.endsWith(".atom") ||
    pathname.endsWith(".rss") ||
    pathname.endsWith(".xml") ||
    trimmed.startsWith("<")
  ) {
    return "xml";
  }

  throw new Error("UNSUPPORTED_DISCOVERY_FEED_FORMAT");
}

function rssOrAtomLink(entry: Record<string, unknown>): unknown {
  const links = asArray(getCaseInsensitive(entry, "link"));

  for (const link of links) {
    if (typeof link === "string") {
      return link;
    }
    if (!isRecord(link)) {
      continue;
    }

    const relation = cleanText(
      getCaseInsensitive(link, "@_rel", "rel"),
      40,
    );
    if (!relation || relation === "alternate") {
      return getCaseInsensitive(link, "@_href", "href", "#text");
    }
  }

  return undefined;
}

function parseXmlEntry(
  entry: unknown,
  feedUrl: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
  sourceName?: string,
): DiscoveryEventCandidate | null {
  if (!isRecord(entry)) {
    return null;
  }

  const location = getCaseInsensitive(
    entry,
    "location",
    "venue",
    "eventlocation",
  );

  return finalizeCandidate({
    title: cleanText(
      getCaseInsensitive(entry, "title", "name", "summary"),
      200,
    ),
    description: cleanText(
      getCaseInsensitive(
        entry,
        "description",
        "content",
        "contentencoded",
      ),
      4_000,
    ),
    startsAt: dateText(
      getCaseInsensitive(
        entry,
        "start",
        "startdate",
        "startsAt",
        "eventstart",
        "date",
      ),
    ),
    endsAt: dateText(
      getCaseInsensitive(
        entry,
        "end",
        "enddate",
        "endsAt",
        "eventend",
      ),
    ),
    venue: cleanText(location, 200),
    city: cleanText(
      getCaseInsensitive(entry, "city", "locality"),
      120,
    ),
    address: cleanText(
      getCaseInsensitive(entry, "address", "streetaddress"),
      300,
    ),
    imageUrl: optionalSafeResourceUrl(
      getCaseInsensitive(entry, "image", "imageurl", "thumbnail"),
    ),
    sourceId: cleanText(
      getCaseInsensitive(entry, "guid", "id", "uid"),
      300,
    ),
    sourceName,
    sourceUrl: safeResourceUrl(
      rssOrAtomLink(entry),
      feedUrl,
      allowedHosts,
    ),
    feedUrl,
  });
}

function parseXmlFeed(
  body: string,
  feedUrl: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
): readonly DiscoveryEventCandidate[] {
  if (/<!DOCTYPE|<!ENTITY/iu.test(body)) {
    throw new Error("UNSAFE_XML_DECLARATION");
  }

  const parsed: unknown = XML_PARSER.parse(body);
  if (!isRecord(parsed)) {
    throw new Error("INVALID_XML_FEED");
  }

  const rss = getCaseInsensitive(parsed, "rss", "rdf");
  if (isRecord(rss)) {
    const channelCandidate = getCaseInsensitive(rss, "channel");
    const channel = isRecord(channelCandidate) ? channelCandidate : rss;
    const sourceName = cleanText(
      getCaseInsensitive(channel, "title"),
      160,
    );

    return asArray(getCaseInsensitive(channel, "item"))
      .slice(0, MAX_DISCOVERY_CANDIDATES_PER_FEED)
      .map((entry) =>
        parseXmlEntry(entry, feedUrl, allowedHosts, sourceName),
      )
      .filter((entry): entry is DiscoveryEventCandidate => entry !== null);
  }

  const feed = getCaseInsensitive(parsed, "feed");
  if (isRecord(feed)) {
    const sourceName = cleanText(getCaseInsensitive(feed, "title"), 160);
    return asArray(getCaseInsensitive(feed, "entry"))
      .slice(0, MAX_DISCOVERY_CANDIDATES_PER_FEED)
      .map((entry) =>
        parseXmlEntry(entry, feedUrl, allowedHosts, sourceName),
      )
      .filter((entry): entry is DiscoveryEventCandidate => entry !== null);
  }

  throw new Error("INVALID_XML_FEED");
}

function jsonEntries(value: unknown): {
  entries: readonly unknown[];
  sourceName?: string;
} {
  if (Array.isArray(value)) {
    return { entries: value };
  }

  if (!isRecord(value)) {
    throw new Error("INVALID_JSON_FEED");
  }

  const sourceName = cleanText(
    getCaseInsensitive(value, "title", "name"),
    160,
  );

  for (const key of [
    "events",
    "items",
    "data",
    "itemListElement",
    "@graph",
  ]) {
    const candidate = getCaseInsensitive(value, key);
    if (Array.isArray(candidate)) {
      return { entries: candidate, sourceName };
    }
  }

  if (
    getCaseInsensitive(value, "startDate", "startsAt", "start") !==
    undefined
  ) {
    return { entries: [value], sourceName };
  }

  throw new Error("INVALID_JSON_FEED");
}

function jsonLocation(
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const location = getCaseInsensitive(entry, "location");
  return isRecord(location) ? location : {};
}

function jsonAddress(
  location: Record<string, unknown>,
): Record<string, unknown> {
  const address = getCaseInsensitive(location, "address");
  return isRecord(address) ? address : {};
}

function jsonImage(value: unknown): unknown {
  if (Array.isArray(value)) {
    return jsonImage(value[0]);
  }

  if (isRecord(value)) {
    return getCaseInsensitive(value, "url", "contentUrl");
  }

  return value;
}

function unwrapJsonEntry(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return getCaseInsensitive(value, "item") ?? value;
}

function parseJsonEntry(
  rawEntry: unknown,
  feedUrl: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
  sourceName?: string,
): DiscoveryEventCandidate | null {
  const unwrapped = unwrapJsonEntry(rawEntry);
  if (!isRecord(unwrapped)) {
    return null;
  }

  const location = jsonLocation(unwrapped);
  const address = jsonAddress(location);
  const directAddress = getCaseInsensitive(unwrapped, "address");

  return finalizeCandidate({
    title: cleanText(
      getCaseInsensitive(unwrapped, "title", "name", "summary"),
      200,
    ),
    description: cleanText(
      getCaseInsensitive(
        unwrapped,
        "description",
        "content_text",
        "content",
      ),
      4_000,
    ),
    startsAt: dateText(
      getCaseInsensitive(
        unwrapped,
        "startsAt",
        "startDate",
        "start",
        "start_time",
        "date",
      ),
    ),
    endsAt: dateText(
      getCaseInsensitive(
        unwrapped,
        "endsAt",
        "endDate",
        "end",
        "end_time",
      ),
    ),
    venue: cleanText(
      getCaseInsensitive(
        unwrapped,
        "venue",
        "venueName",
      ) ?? getCaseInsensitive(location, "name"),
      200,
    ),
    city: cleanText(
      getCaseInsensitive(unwrapped, "city") ??
        getCaseInsensitive(
          address,
          "addressLocality",
          "city",
          "locality",
        ),
      120,
    ),
    address: cleanText(
      (typeof directAddress === "string" ? directAddress : undefined) ??
        getCaseInsensitive(
          address,
          "streetAddress",
          "formatted",
          "name",
        ),
      300,
    ),
    imageUrl: optionalSafeResourceUrl(
      jsonImage(
        getCaseInsensitive(
          unwrapped,
          "image",
          "imageUrl",
          "thumbnailUrl",
        ),
      ),
    ),
    sourceId: cleanText(
      getCaseInsensitive(
        unwrapped,
        "id",
        "uid",
        "externalId",
        "@id",
      ),
      300,
    ),
    sourceName,
    sourceUrl: safeResourceUrl(
      getCaseInsensitive(
        unwrapped,
        "url",
        "link",
        "ticketUrl",
      ),
      feedUrl,
      allowedHosts,
    ),
    feedUrl,
  });
}

function parseJsonFeed(
  body: string,
  feedUrl: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
): readonly DiscoveryEventCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_JSON_FEED");
  }

  const { entries, sourceName } = jsonEntries(parsed);
  return entries
    .slice(0, MAX_DISCOVERY_CANDIDATES_PER_FEED)
    .map((entry) =>
      parseJsonEntry(entry, feedUrl, allowedHosts, sourceName),
    )
    .filter((entry): entry is DiscoveryEventCandidate => entry !== null);
}

function parseIcsFeed(
  body: string,
  feedUrl: string,
  allowedHosts: readonly DiscoveryAllowedHost[],
): readonly DiscoveryEventCandidate[] {
  const calendar = ical.sync.parseICS(body);
  const candidates: DiscoveryEventCandidate[] = [];

  for (const component of Object.values(calendar)) {
    if (!isIcsEvent(component) || component.status === "CANCELLED") {
      continue;
    }

    const candidate = finalizeCandidate({
      title: cleanText(component.summary, 200),
      description: cleanText(component.description, 4_000),
      startsAt: dateText(component.start),
      endsAt: dateText(component.end),
      venue: cleanText(component.location, 200),
      sourceId: cleanText(component.uid, 300),
      sourceUrl: safeResourceUrl(component.url, feedUrl, allowedHosts),
      feedUrl,
    });

    if (candidate) {
      candidates.push(candidate);
    }

    if (candidates.length >= MAX_DISCOVERY_CANDIDATES_PER_FEED) {
      break;
    }
  }

  return candidates;
}

function isIcsEvent(
  component: CalendarComponent | undefined,
): component is VEvent {
  return Boolean(
    component &&
      "type" in component &&
      component.type === "VEVENT",
  );
}

export function parseDiscoveryFeed(
  body: string,
  options: ParseDiscoveryFeedOptions,
): readonly DiscoveryEventCandidate[] {
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new Error("EMPTY_DISCOVERY_FEED");
  }

  const feedUrl = parseSafeDiscoveryUrl(options.feedUrl).href;
  const allowedHosts =
    options.allowedSourceHosts ?? parseDiscoveryAllowedHosts();
  const format = detectDiscoveryFeedFormat(
    body,
    options.contentType ?? "",
    feedUrl,
  );

  if (format === "ics") {
    return parseIcsFeed(body, feedUrl, allowedHosts);
  }
  if (format === "json") {
    return parseJsonFeed(body, feedUrl, allowedHosts);
  }
  return parseXmlFeed(body, feedUrl, allowedHosts);
}
