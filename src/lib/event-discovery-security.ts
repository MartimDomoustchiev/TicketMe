import { BlockList, isIP, type LookupFunction } from "node:net";

export const DEFAULT_DISCOVERY_FETCH_TIMEOUT_MS = 8_000;
export const DEFAULT_DISCOVERY_MAX_FEED_BYTES = 1_000_000;
export const MAX_DISCOVERY_FEEDS = 50;

const DEFAULT_MAX_REDIRECTS = 2;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HOST_SUFFIXES = [
  ".example",
  ".home",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
  ".onion",
  ".test",
] as const;

const BLOCKED_IPV4_ADDRESSES = new BlockList();
const BLOCKED_IPV6_ADDRESSES = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_IPV4_ADDRESSES.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_IPV6_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

export type DiscoveryErrorCode =
  | "ALLOWLIST_EMPTY"
  | "BODY_TOO_LARGE"
  | "DNS_BLOCKED"
  | "DNS_FAILED"
  | "FETCH_FAILED"
  | "HTTP_ERROR"
  | "INVALID_ALLOWLIST"
  | "INVALID_URL"
  | "REDIRECT_BLOCKED"
  | "TIMEOUT";

export class DiscoverySecurityError extends Error {
  readonly code: DiscoveryErrorCode;

  constructor(code: DiscoveryErrorCode, message: string) {
    super(message);
    this.name = "DiscoverySecurityError";
    this.code = code;
  }
}

export type DiscoveryDnsLookup = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

export type DiscoveryDnsAddress = {
  address: string;
  family: number;
};

export type DiscoveryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type DiscoveryPinnedFetch = (
  input: URL,
  addresses: readonly DiscoveryDnsAddress[],
  init: RequestInit,
) => Promise<Response>;

export type FetchedDiscoveryFeed = {
  body: string;
  contentType: string;
  feedUrl: string;
  finalUrl: string;
};

export type FetchDiscoveryFeedOptions = {
  allowedFeedUrls: readonly URL[];
  dnsLookup?: DiscoveryDnsLookup;
  /** Test adapter. Production requests use pinnedFetchImpl or pinned HTTPS. */
  fetchImpl?: DiscoveryFetch;
  maxBytes?: number;
  maxRedirects?: number;
  pinnedFetchImpl?: DiscoveryPinnedFetch;
  timeoutMs?: number;
};

export type DiscoveryAllowedHost = {
  hostname: string;
  includeSubdomains: boolean;
};

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return (
    normalized === "localhost" ||
    !normalized.includes(".") ||
    BLOCKED_HOST_SUFFIXES.some(
      (suffix) =>
        normalized === suffix.slice(1) || normalized.endsWith(suffix),
    )
  );
}

function isValidDomainName(hostname: string): boolean {
  if (hostname.length > 253) {
    return false;
  }

  return hostname.split(".").every((label) => {
    if (label.length < 1 || label.length > 63) {
      return false;
    }

    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
  });
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address);
  const family = isIP(normalized);

  if (family === 4) {
    return !BLOCKED_IPV4_ADDRESSES.check(normalized, "ipv4");
  }

  if (family === 6) {
    return !BLOCKED_IPV6_ADDRESSES.check(normalized, "ipv6");
  }

  return false;
}

/**
 * Performs the URL-only part of SSRF validation. DNS is checked immediately
 * before every network request by `fetchDiscoveryFeed`.
 */
export function parseSafeDiscoveryUrl(value: string | URL): URL {
  let parsed: URL;

  try {
    parsed = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new DiscoverySecurityError("INVALID_URL", "Invalid feed URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    parsed.hash
  ) {
    throw new DiscoverySecurityError(
      "INVALID_URL",
      "Feed URLs must use plain HTTPS without credentials, custom ports, or fragments.",
    );
  }

  const hostname = stripIpv6Brackets(parsed.hostname).toLowerCase();
  const family = isIP(hostname);

  if (
    (family > 0 && !isPublicIpAddress(hostname)) ||
    (family === 0 &&
      (isBlockedHostname(hostname) || !isValidDomainName(hostname)))
  ) {
    throw new DiscoverySecurityError(
      "INVALID_URL",
      "Feed URL hostname is not publicly routable.",
    );
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed;
}

export function parseDiscoveryFeedUrls(
  rawValue = process.env.EVENT_DISCOVERY_FEED_URLS ?? "",
): readonly URL[] {
  const entries = parseConfiguredStringList(
    rawValue,
    "EVENT_DISCOVERY_FEED_URLS",
  );

  if (entries.length > MAX_DISCOVERY_FEEDS) {
    throw new DiscoverySecurityError(
      "INVALID_ALLOWLIST",
      `At most ${MAX_DISCOVERY_FEEDS} discovery feeds can be configured.`,
    );
  }

  const unique = new Map<string, URL>();

  for (const entry of entries) {
    const parsed = parseSafeDiscoveryUrl(entry);
    unique.set(parsed.href, parsed);
  }

  return [...unique.values()];
}

function parseConfiguredStringList(
  rawValue: string,
  settingName: string,
): readonly string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new DiscoverySecurityError(
        "INVALID_ALLOWLIST",
        `${settingName} must be a JSON string array.`,
      );
    }

    if (
      !Array.isArray(parsed) ||
      parsed.some((entry) => typeof entry !== "string")
    ) {
      throw new DiscoverySecurityError(
        "INVALID_ALLOWLIST",
        `${settingName} must be a JSON string array.`,
      );
    }

    return parsed.map((entry) => entry.trim()).filter(Boolean);
  }

  return trimmed
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Host policy:
 * - `events.example.com` permits that exact hostname only.
 * - `*.example.com` permits subdomains such as `tickets.example.com`, but not
 *   the apex `example.com`.
 */
export function parseDiscoveryAllowedHosts(
  rawValue = process.env.EVENT_DISCOVERY_ALLOWED_HOSTS ?? "",
): readonly DiscoveryAllowedHost[] {
  const entries = parseConfiguredStringList(
    rawValue,
    "EVENT_DISCOVERY_ALLOWED_HOSTS",
  );
  const unique = new Map<string, DiscoveryAllowedHost>();

  for (const entry of entries) {
    const includeSubdomains = entry.startsWith("*.");
    const hostname = (
      includeSubdomains ? entry.slice(2) : entry
    ).toLowerCase();

    if (
      !hostname ||
      entry.includes("://") ||
      entry.includes("/") ||
      entry.includes(":") ||
      isIP(hostname) ||
      isBlockedHostname(hostname) ||
      !isValidDomainName(hostname)
    ) {
      throw new DiscoverySecurityError(
        "INVALID_ALLOWLIST",
        "Discovery source hosts must be public DNS names or wildcard DNS suffixes.",
      );
    }

    const key = `${includeSubdomains ? "*." : ""}${hostname}`;
    unique.set(key, { hostname, includeSubdomains });
  }

  return [...unique.values()];
}

export function isAllowedDiscoverySourceUrl(
  sourceUrl: URL,
  feedUrl: URL,
  allowedHosts: readonly DiscoveryAllowedHost[],
): boolean {
  const sourceHostname = stripIpv6Brackets(sourceUrl.hostname).toLowerCase();
  const feedHostname = stripIpv6Brackets(feedUrl.hostname).toLowerCase();

  if (sourceHostname === feedHostname) {
    return true;
  }

  return allowedHosts.some(({ hostname, includeSubdomains }) =>
    includeSubdomains
      ? sourceHostname !== hostname &&
        sourceHostname.endsWith(`.${hostname}`)
      : sourceHostname === hostname,
  );
}

export function requireAllowlistedDiscoveryUrl(
  value: string | URL,
  allowedFeedUrls: readonly URL[],
): URL {
  if (allowedFeedUrls.length === 0) {
    throw new DiscoverySecurityError(
      "ALLOWLIST_EMPTY",
      "No event discovery feeds are configured.",
    );
  }

  const parsed = parseSafeDiscoveryUrl(value);
  const allowed = new Set(
    allowedFeedUrls.map((candidate) => parseSafeDiscoveryUrl(candidate).href),
  );

  if (!allowed.has(parsed.href)) {
    throw new DiscoverySecurityError(
      "INVALID_ALLOWLIST",
      "The requested feed is not allowlisted.",
    );
  }

  return parsed;
}

type DnsJsonAnswer = {
  data?: unknown;
  type?: unknown;
};

type DnsJsonResponse = {
  Answer?: unknown;
  Status?: unknown;
};

function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

function isUnavailableNodeDns(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    code === "ERR_NOT_IMPLEMENTED" ||
    code === "ERR_UNKNOWN_BUILTIN_MODULE" ||
    error.message.includes("[unenv]") ||
    error.message.toLowerCase().includes("not implemented")
  );
}

async function queryDnsOverHttps(
  hostname: string,
  recordType: "A" | "AAAA",
  fetchImpl: DiscoveryFetch,
): Promise<readonly { address: string; family: number }[]> {
  const endpoint = new URL("https://cloudflare-dns.com/dns-query");
  endpoint.searchParams.set("name", hostname);
  endpoint.searchParams.set("type", recordType);

  const response = await fetchImpl(endpoint, {
    cache: "no-store",
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) {
    throw new Error("DNS-over-HTTPS request failed.");
  }

  const payload = (await response.json()) as DnsJsonResponse;
  if (payload.Status !== 0 || !Array.isArray(payload.Answer)) {
    if (payload.Status === 0 && payload.Answer === undefined) {
      return [];
    }
    throw new Error("DNS-over-HTTPS response was invalid.");
  }

  const answerType = recordType === "A" ? 1 : 28;
  const family = recordType === "A" ? 4 : 6;

  return (payload.Answer as DnsJsonAnswer[])
    .filter(
      (answer) =>
        answer?.type === answerType && typeof answer.data === "string",
    )
    .map((answer) => ({
      address: answer.data as string,
      family,
    }));
}

export async function lookupDiscoveryDnsOverHttps(
  hostname: string,
  fetchImpl: DiscoveryFetch = fetch,
): Promise<readonly { address: string; family: number }[]> {
  const [ipv4, ipv6] = await Promise.all([
    queryDnsOverHttps(hostname, "A", fetchImpl),
    queryDnsOverHttps(hostname, "AAAA", fetchImpl),
  ]);
  return [...ipv4, ...ipv6];
}

const defaultDnsLookup: DiscoveryDnsLookup = async (hostname) => {
  if (isCloudflareWorkerRuntime()) {
    return lookupDiscoveryDnsOverHttps(hostname);
  }

  try {
    const { lookup } = await import("node:dns/promises");
    return await lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch (error) {
    if (isUnavailableNodeDns(error)) {
      return lookupDiscoveryDnsOverHttps(hostname);
    }
    throw error;
  }
};

export async function assertPublicDiscoveryHost(
  url: URL,
  dnsLookup: DiscoveryDnsLookup = defaultDnsLookup,
): Promise<readonly DiscoveryDnsAddress[]> {
  const hostname = stripIpv6Brackets(url.hostname);

  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new DiscoverySecurityError(
        "DNS_BLOCKED",
        "Feed hostname resolves to a blocked address.",
      );
    }
    return [{ address: hostname, family: isIP(hostname) }];
  }

  let addresses: readonly { address: string; family: number }[];

  try {
    addresses = await dnsLookup(hostname);
  } catch {
    throw new DiscoverySecurityError(
      "DNS_FAILED",
      "Feed hostname could not be resolved.",
    );
  }

  if (
    addresses.length === 0 ||
    addresses.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) || !isPublicIpAddress(address),
    )
  ) {
    throw new DiscoverySecurityError(
      "DNS_BLOCKED",
      "Feed hostname resolves to a blocked address.",
    );
  }

  return addresses;
}

/**
 * Builds a Node lookup function that can only return addresses from the DNS
 * result validated immediately before the request. TLS still uses the
 * original hostname for SNI and certificate verification, but a DNS change
 * between validation and connect cannot redirect the socket to another IP.
 */
export function createPinnedDiscoveryLookup(
  addresses: readonly DiscoveryDnsAddress[],
): LookupFunction {
  const pinned = addresses.map(({ address, family }) => ({ address, family }));

  return (_hostname, options, callback) => {
    const requestedFamily =
      typeof options.family === "number" && options.family !== 0
        ? options.family
        : null;
    const candidates = requestedFamily
      ? pinned.filter(({ family }) => family === requestedFamily)
      : pinned;

    if (candidates.length === 0) {
      const error = new Error(
        "No validated address matches the requested address family.",
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, [], undefined);
      return;
    }

    if (options.all) {
      callback(null, candidates, undefined);
      return;
    }

    const first = candidates[0];
    callback(null, first.address, first.family);
  };
}

async function fetchDiscoveryWithPinnedDns(
  input: URL,
  addresses: readonly DiscoveryDnsAddress[],
  init: RequestInit,
): Promise<Response> {
  if (isCloudflareWorkerRuntime()) {
    throw new DiscoverySecurityError(
      "FETCH_FAILED",
      "Discovery fetching requires a runtime that can pin validated DNS addresses.",
    );
  }

  const [{ request }, { Readable }] = await Promise.all([
    import("node:https"),
    import("node:stream"),
  ]);
  const requestHeaders = new Headers(init.headers);
  const headers: Record<string, string> = {};
  requestHeaders.forEach((value, name) => {
    headers[name] = value;
  });

  return new Promise<Response>((resolve, reject) => {
    const outgoing = request(
      input,
      {
        agent: false,
        headers,
        lookup: createPinnedDiscoveryLookup(addresses),
        method: init.method ?? "GET",
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }

        const status = incoming.statusCode ?? 500;
        const bodyless =
          status === 101 || status === 204 || status === 205 || status === 304;
        const body = bodyless
          ? null
          : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);

        resolve(
          new Response(body, {
            headers: responseHeaders,
            status,
            statusText: incoming.statusMessage,
          }),
        );
      },
    );

    outgoing.once("error", reject);
    outgoing.end();
  });
}

async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const advertisedLength = Number(response.headers.get("content-length"));

  if (
    Number.isFinite(advertisedLength) &&
    advertisedLength > maxBytes
  ) {
    throw new DiscoverySecurityError(
      "BODY_TOO_LARGE",
      "Feed response exceeds the configured size limit.",
    );
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new DiscoverySecurityError(
          "BODY_TOO_LARGE",
          "Feed response exceeds the configured size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(body);
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The request is already being rejected or redirected. Stream teardown
    // errors must not replace the stable discovery error returned to callers.
  }
}

export async function fetchDiscoveryFeed(
  requestedUrl: string | URL,
  options: FetchDiscoveryFeedOptions,
): Promise<FetchedDiscoveryFeed> {
  const timeoutMs =
    options.timeoutMs ?? DEFAULT_DISCOVERY_FETCH_TIMEOUT_MS;
  const maxBytes =
    options.maxBytes ?? DEFAULT_DISCOVERY_MAX_FEED_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    !Number.isInteger(maxRedirects) ||
    maxRedirects < 0 ||
    maxRedirects > 5
  ) {
    throw new DiscoverySecurityError(
      "INVALID_URL",
      "Invalid discovery fetch limits.",
    );
  }

  const original = requireAllowlistedDiscoveryUrl(
    requestedUrl,
    options.allowedFeedUrls,
  );
  const controller = new AbortController();

  const operation = async (): Promise<FetchedDiscoveryFeed> => {
    let current = original;

    for (let redirectCount = 0; ; redirectCount += 1) {
      const addresses = await assertPublicDiscoveryHost(
        current,
        options.dnsLookup,
      );

      let response: Response;

      try {
        const requestInit: RequestInit = {
          headers: {
            accept:
              "application/atom+xml, application/feed+json, application/json, application/rss+xml, application/xml, text/calendar, text/xml;q=0.9",
            "user-agent": "Tiketko-EventDiscovery/1.0",
          },
          redirect: "manual",
          signal: controller.signal,
        };
        response = options.fetchImpl
          ? await options.fetchImpl(current, requestInit)
          : options.pinnedFetchImpl
            ? await options.pinnedFetchImpl(current, addresses, requestInit)
            : await fetchDiscoveryWithPinnedDns(
                current,
                addresses,
                requestInit,
              );
      } catch (error) {
        if (controller.signal.aborted) {
          throw error;
        }
        throw new DiscoverySecurityError(
          "FETCH_FAILED",
          "The discovery feed request failed.",
        );
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        await discardResponseBody(response);
        if (redirectCount >= maxRedirects) {
          throw new DiscoverySecurityError(
            "REDIRECT_BLOCKED",
            "The discovery feed exceeded its redirect limit.",
          );
        }

        const location = response.headers.get("location");
        if (!location) {
          throw new DiscoverySecurityError(
            "REDIRECT_BLOCKED",
            "The discovery feed returned an invalid redirect.",
          );
        }

        let target: URL;
        try {
          target = new URL(location, current);
        } catch {
          throw new DiscoverySecurityError(
            "REDIRECT_BLOCKED",
            "The discovery feed returned an invalid redirect.",
          );
        }

        try {
          current = requireAllowlistedDiscoveryUrl(
            target,
            options.allowedFeedUrls,
          );
        } catch {
          throw new DiscoverySecurityError(
            "REDIRECT_BLOCKED",
            "Discovery redirects must target another explicitly allowlisted feed.",
          );
        }
        continue;
      }

      if (!response.ok) {
        await discardResponseBody(response);
        throw new DiscoverySecurityError(
          "HTTP_ERROR",
          `Discovery feed returned HTTP ${response.status}.`,
        );
      }

      return {
        body: await readBoundedResponseBody(response, maxBytes),
        contentType: response.headers.get("content-type") ?? "",
        feedUrl: original.href,
        finalUrl: current.href,
      };
    }
  };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new DiscoverySecurityError(
          "TIMEOUT",
          "The discovery feed request timed out.",
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    controller.abort();
  }
}
