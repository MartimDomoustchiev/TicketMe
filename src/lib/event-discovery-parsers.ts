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

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'");
}

function cleanText(
  value: unknown,
  maxLength: number,
): string | undefined {
  const raw = parameterText(value);
  if (!raw) {
    return undefined;
  }

  const text = decodeBasicEntities(raw)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
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
): string {
  const text = cleanText(value, 2_048);
  if (!text) {
    return fallback;
  }

  try {
    const feedUrl = parseSafeDiscoveryUrl(fallback);
    const sourceUrl = parseSafeDiscoveryUrl(new URL(text, feedUrl));
    return isAllowedDiscoverySourceUrl(sourceUrl, feedUrl, allowedHosts)
      ? sourceUrl.href
      : fallback;
  } catch {
    return fallback;
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
