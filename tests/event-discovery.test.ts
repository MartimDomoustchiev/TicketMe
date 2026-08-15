import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicDiscoveryHost,
  buildGeminiDiscoveryInput,
  createDiscoveryFingerprint,
  dedupeDiscoveryCandidates,
  detectDiscoveryFeedFormat,
  discoverEventCandidates,
  enrichDiscoveryCandidates,
  enrichDiscoveryEvent,
  fetchDiscoveryFeed,
  isAllowedDiscoverySourceUrl,
  isPublicIpAddress,
  lookupDiscoveryDnsOverHttps,
  parseDiscoveryAllowedHosts,
  parseDiscoveryEventCandidate,
  parseDiscoveryFeed,
  parseDiscoveryFeedUrls,
  parseFetchedDiscoveryCandidates,
  parseSafeDiscoveryUrl,
  prepareDiscoveredCatalogCandidate,
  type DiscoveryEventCandidate,
  type GeminiDiscoveryRequest,
} from "../src/lib/event-discovery";

const PUBLIC_DNS = async () =>
  [{ address: "93.184.216.34", family: 4 }] as const;

function candidate(
  overrides: Partial<DiscoveryEventCandidate> = {},
): DiscoveryEventCandidate {
  return {
    title: "Future Sound Festival",
    startsAt: "2027-06-12T17:00:00.000Z",
    city: "Sofia",
    venue: "Arena Sofia",
    description: "A public music festival.",
    sourceId: "source-1",
    sourceUrl: "https://feeds.example.com/events/future-sound",
    feedUrl: "https://feeds.example.com/events.json",
    ...overrides,
  };
}

test("feed configuration accepts JSON arrays and safe newline fallback", () => {
  assert.deepEqual(
    parseDiscoveryFeedUrls(
      '["https://feeds.example.com/events.json","https://calendar.example.org/events.ics"]',
    ).map((url) => url.href),
    [
      "https://feeds.example.com/events.json",
      "https://calendar.example.org/events.ics",
    ],
  );

  assert.deepEqual(
    parseDiscoveryFeedUrls(
      "https://feeds.example.com/a.xml\nhttps://feeds.example.com/b.xml",
    ).map((url) => url.href),
    [
      "https://feeds.example.com/a.xml",
      "https://feeds.example.com/b.xml",
    ],
  );
  assert.deepEqual(parseDiscoveryFeedUrls("[]"), []);
  assert.throws(() => parseDiscoveryFeedUrls('["not-a-url"]'));
});

test("SSRF URL and DNS validation rejects local and reserved targets", async () => {
  for (const url of [
    "http://feeds.example.com/events",
    "https://localhost/events",
    "https://127.0.0.1/events",
    "https://[::1]/events",
    "https://user:secret@feeds.example.com/events",
    "https://feeds.example.com:8443/events",
  ]) {
    assert.throws(() => parseSafeDiscoveryUrl(url));
  }

  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("10.0.0.4"), false);
  assert.equal(isPublicIpAddress("169.254.169.254"), false);
  assert.equal(isPublicIpAddress("::1"), false);

  await assert.rejects(
    assertPublicDiscoveryHost(
      new URL("https://feeds.example.com/events"),
      async () => [{ address: "127.0.0.1", family: 4 }],
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DNS_BLOCKED",
  );
});

test("DNS-over-HTTPS lookup supports Workers without trusting non-address answers", async () => {
  const requestedTypes: string[] = [];
  const addresses = await lookupDiscoveryDnsOverHttps(
    "feeds.example.com",
    async (input) => {
      const url = new URL(input.toString());
      const type = url.searchParams.get("type") ?? "";
      requestedTypes.push(type);

      return Response.json({
        Status: 0,
        Answer:
          type === "A"
            ? [
                { type: 5, data: "alias.example.com." },
                { type: 1, data: "93.184.216.34" },
              ]
            : [{ type: 28, data: "2606:2800:220:1:248:1893:25c8:1946" }],
      });
    },
  );

  assert.deepEqual(requestedTypes.sort(), ["A", "AAAA"]);
  assert.deepEqual(addresses, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ]);
});

test("source host rules distinguish exact hosts and wildcard subdomains", () => {
  const rules = parseDiscoveryAllowedHosts(
    '["tickets.example.com","*.partners.example.org"]',
  );
  const feed = new URL("https://feeds.example.com/events.xml");

  assert.equal(
    isAllowedDiscoverySourceUrl(
      new URL("https://feeds.example.com/event/1"),
      feed,
      rules,
    ),
    true,
  );
  assert.equal(
    isAllowedDiscoverySourceUrl(
      new URL("https://tickets.example.com/event/1"),
      feed,
      rules,
    ),
    true,
  );
  assert.equal(
    isAllowedDiscoverySourceUrl(
      new URL("https://sofia.partners.example.org/event/1"),
      feed,
      rules,
    ),
    true,
  );
  assert.equal(
    isAllowedDiscoverySourceUrl(
      new URL("https://partners.example.org/event/1"),
      feed,
      rules,
    ),
    false,
  );
  assert.equal(
    isAllowedDiscoverySourceUrl(
      new URL("https://evil.example/event/1"),
      feed,
      rules,
    ),
    false,
  );
});

test("feed fetches are exact-allowlist, redirect, time, and size bounded", async () => {
  const feedUrl = new URL("https://feeds.example.com/events.json");
  const fetched = await fetchDiscoveryFeed(feedUrl, {
    allowedFeedUrls: [feedUrl],
    dnsLookup: PUBLIC_DNS,
    fetchImpl: async (_input, init) => {
      assert.equal(init?.redirect, "manual");
      return new Response('{"events":[]}', {
        headers: { "content-type": "application/json" },
      });
    },
    maxBytes: 100,
    timeoutMs: 100,
  });

  assert.equal(fetched.feedUrl, feedUrl.href);
  assert.equal(fetched.body, '{"events":[]}');

  await assert.rejects(
    fetchDiscoveryFeed(feedUrl, {
      allowedFeedUrls: [feedUrl],
      dnsLookup: PUBLIC_DNS,
      fetchImpl: async () =>
        new Response("x".repeat(101), {
          headers: { "content-length": "101" },
        }),
      maxBytes: 100,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "BODY_TOO_LARGE",
  );

  await assert.rejects(
    fetchDiscoveryFeed(feedUrl, {
      allowedFeedUrls: [feedUrl],
      dnsLookup: PUBLIC_DNS,
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/private" },
        }),
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "REDIRECT_BLOCKED",
  );
});

test("redirected feeds resolve relative event URLs against the final URL", () => {
  const candidates = parseFetchedDiscoveryCandidates(
    {
      body: JSON.stringify({
        events: [
          {
            id: "redirected-event",
            name: "Redirected Event",
            startDate: "2027-06-12T17:00:00Z",
            city: "Sofia",
            venue: "Arena Sofia",
            url: "../events/redirected-event",
          },
          {
            id: "configured-host-event",
            name: "Configured Host Event",
            startDate: "2027-06-13T17:00:00Z",
            city: "Sofia",
            venue: "Arena Sofia",
            url: "https://feeds.example.com/events/configured-host-event",
          },
          {
            id: "untrusted-host-event",
            name: "Untrusted Host Event",
            startDate: "2027-06-14T17:00:00Z",
            city: "Sofia",
            venue: "Arena Sofia",
            url: "https://evil.example/events/untrusted",
          },
        ],
      }),
      contentType: "application/json",
      feedUrl: "https://feeds.example.com/private/start.json?token=secret",
      finalUrl: "https://cdn.example.net/live/feed.json",
    },
    [],
  );

  assert.equal(candidates.length, 2);
  assert.equal(
    candidates[0].sourceUrl,
    "https://cdn.example.net/events/redirected-event",
  );
  assert.equal(
    candidates[0].feedUrl,
    "https://feeds.example.com/private/start.json?token=secret",
  );
  assert.equal(
    candidates[1].sourceUrl,
    "https://feeds.example.com/events/configured-host-event",
  );
});

test("RSS and Atom parsers keep only strict event facts", () => {
  const rss = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Official Events</title>
      <item>
        <guid>concert-1</guid>
        <title>Live &amp; Loud</title>
        <description><![CDATA[<b>One night only</b>]]></description>
        <startDate>2027-05-20T20:00:00+03:00</startDate>
        <endDate>2027-05-20T23:00:00+03:00</endDate>
        <location>Hall One</location><city>Sofia</city>
        <link>https://feeds.example.com/events/concert-1</link>
      </item>
    </channel></rss>`;
  const rssEvents = parseDiscoveryFeed(rss, {
    feedUrl: "https://feeds.example.com/events.rss",
    contentType: "application/rss+xml",
  });

  assert.equal(detectDiscoveryFeedFormat(rss, "", "https://feeds.example.com/x"), "xml");
  assert.equal(rssEvents.length, 1);
  assert.equal(rssEvents[0].title, "Live & Loud");
  assert.equal(rssEvents[0].description, "One night only");
  assert.equal(rssEvents[0].startsAt, "2027-05-20T17:00:00.000Z");
  assert.equal("price" in rssEvents[0], false);
  assert.equal("capacity" in rssEvents[0], false);

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Culture Feed</title>
    <entry><id>show-1</id><title>Modern Art</title>
      <startDate>2027-08-01T10:00:00Z</startDate>
      <venue>Gallery One</venue><city>Plovdiv</city>
      <link rel="alternate" href="https://feeds.example.com/show-1"/>
    </entry>
  </feed>`;
  const atomEvents = parseDiscoveryFeed(atom, {
    feedUrl: "https://feeds.example.com/events.atom",
  });
  assert.equal(atomEvents.length, 1);
  assert.equal(atomEvents[0].title, "Modern Art");
});

test("feed text decoding is single-pass and markup parsing is quote-aware", () => {
  const body = JSON.stringify({
    events: [
      {
        id: "markup-regression",
        name: "Markup Regression",
        startDate: "2027-08-01T10:00:00Z",
        venue: "Hall One",
        city: "Sofia",
        url: "https://feeds.example.com/events/markup-regression",
        description:
          "Before &amp; safe &constructor; &lt;b&gt;bold&lt;/b&gt; " +
          "&amp;lt;em&amp;gt;literal&amp;lt;/em&amp;gt; " +
          '<ScRiPt data-boundary=">">hidden</ScRiPt > ' +
          "<style media='screen > print'>also hidden</style > " +
          "<script/x>odd hidden</script > " +
          "<strong>After</strong> &#x41;&#65;",
      },
      {
        id: "unclosed-script",
        name: "Unclosed Script",
        startDate: "2027-08-02T10:00:00Z",
        venue: "Hall Two",
        city: "Sofia",
        url: "https://feeds.example.com/events/unclosed-script",
        description: "Visible<script data-boundary='>'>hidden forever",
      },
      {
        id: "bounded-malformed-markup",
        name: "Bounded Malformed Markup",
        startDate: "2027-08-03T10:00:00Z",
        venue: "Hall Three",
        city: "Sofia",
        url: "https://feeds.example.com/events/bounded-markup",
        description:
          "Visible " +
          "&unterminated".repeat(2_000) +
          "<tag".repeat(2_000),
      },
    ],
  });

  const events = parseDiscoveryFeed(body, {
    feedUrl: "https://feeds.example.com/events.json",
    contentType: "application/json",
  });

  assert.equal(events.length, 3);
  assert.equal(
    events[0].description,
    "Before & safe &constructor; bold &lt;em&gt;literal&lt;/em&gt; After AA",
  );
  assert.equal(events[1].description, "Visible");
  assert.ok(events[2].description?.startsWith("Visible &unterminated"));
});

test("JSON source links require the feed host or an explicit host rule", () => {
  const body = JSON.stringify({
    name: "Partner events",
    events: [
      {
        id: "safe",
        name: "Safe Festival",
        startDate: "2027-07-01T18:00:00Z",
        venue: "Park Stage",
        city: "Sofia",
        url: "https://tickets.example.com/safe",
      },
      {
        id: "injected",
        name: "Injected Link",
        startDate: "2027-07-02T18:00:00Z",
        venue: "Park Stage",
        city: "Sofia",
        url: "https://evil.example/phishing",
      },
    ],
  });

  const events = parseDiscoveryFeed(body, {
    feedUrl: "https://feeds.example.com/events.json",
    contentType: "application/json",
    allowedSourceHosts: parseDiscoveryAllowedHosts(
      '["tickets.example.com"]',
    ),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].sourceUrl, "https://tickets.example.com/safe");
});

test("discovery rejects entries without an explicit allowlisted event URL", () => {
  const privateFeedUrl =
    "https://feeds.example.com/private-calendar/token.ics?key=secret";
  const body = JSON.stringify({
    events: [
      {
        name: "Missing public source",
        startDate: "2027-07-03T18:00:00Z",
        venue: "Park Stage",
        city: "Sofia",
      },
      {
        name: "Disallowed public source",
        startDate: "2027-07-04T18:00:00Z",
        venue: "Park Stage",
        city: "Sofia",
        url: "https://evil.example/phishing",
      },
    ],
  });

  const events = parseDiscoveryFeed(body, {
    feedUrl: privateFeedUrl,
    contentType: "application/json",
  });

  assert.deepEqual(events, []);
  assert.doesNotMatch(JSON.stringify(events), /token|key=secret/);
});

test("prepared catalog facts never persist feed path or query secrets", () => {
  const event = candidate({
    feedUrl:
      "https://feeds.example.com/private-token/calendar.json?key=secret",
  });
  const prepared = prepareDiscoveredCatalogCandidate({
    ...event,
    enrichedBy: "deterministic",
    enrichment: {
      appealScore: 80,
      category: "Concerts",
      titleBg: event.title,
      titleEn: event.title,
    },
  });

  assert.ok(prepared);
  const storedFacts = JSON.stringify(prepared.source.extractedFacts);
  assert.match(storedFacts, /\.tiketko-feed/);
  assert.doesNotMatch(storedFacts, /private-token|calendar\.json|key=secret/);
});

test("ICS parsing excludes cancelled events and contact fields", () => {
  const body = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TicketForge Test//EN
BEGIN:VEVENT
UID:event-1
DTSTAMP:20260729T100000Z
DTSTART:20270910T170000Z
DTEND:20270910T190000Z
SUMMARY:Open Air Cinema
DESCRIPTION:Film screening
LOCATION:City Garden
URL:https://calendar.example.com/events/1
ORGANIZER:mailto:private@example.com
ATTENDEE:mailto:person@example.com
END:VEVENT
BEGIN:VEVENT
UID:event-2
DTSTAMP:20260729T100000Z
DTSTART:20270911T170000Z
SUMMARY:Cancelled Show
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

  const events = parseDiscoveryFeed(body, {
    feedUrl: "https://calendar.example.com/events.ics",
    contentType: "text/calendar",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Open Air Cinema");
  assert.equal(JSON.stringify(events).includes("private@example.com"), false);
  assert.equal(JSON.stringify(events).includes("person@example.com"), false);
});

test("candidate validation is strict and dedupe is deterministic", () => {
  const valid = candidate();
  assert.deepEqual(parseDiscoveryEventCandidate(valid), valid);
  assert.equal(
    parseDiscoveryEventCandidate({ ...valid, capacity: 100 }),
    null,
  );
  assert.equal(
    parseDiscoveryEventCandidate({ ...valid, startsAt: "not-a-date" }),
    null,
  );

  const richer = candidate({
    sourceUrl: "https://tickets.example.com/rich",
    feedUrl: "https://tickets.example.com/feed.json",
    address: "1 Arena Street",
  });
  const poorer = candidate({
    sourceUrl: "https://feeds.example.com/poor",
    description: undefined,
  });
  assert.equal(
    createDiscoveryFingerprint(richer),
    createDiscoveryFingerprint(poorer),
  );
  assert.deepEqual(dedupeDiscoveryCandidates([poorer, richer]), [richer]);
  assert.deepEqual(dedupeDiscoveryCandidates([richer, poorer]), [richer]);
});

test("end-to-end discovery filters dates and deduplicates feeds", async () => {
  const first = new URL("https://feeds.example.com/one.json");
  const second = new URL("https://feeds.example.com/two.json");
  const body = JSON.stringify({
    events: [
      {
        name: "Future Sound Festival",
        startDate: "2027-06-12T17:00:00Z",
        city: "Sofia",
        venue: "Arena Sofia",
        url: "https://feeds.example.com/event",
      },
      {
        name: "Past Event",
        startDate: "2025-01-01T10:00:00Z",
        city: "Sofia",
        venue: "Old Hall",
      },
    ],
  });

  const result = await discoverEventCandidates({
    feedUrls: [first, second],
    dnsLookup: PUBLIC_DNS,
    fetchImpl: async () =>
      new Response(body, {
        headers: { "content-type": "application/json" },
      }),
    now: new Date("2026-07-29T00:00:00Z"),
    windowEnd: new Date("2028-01-01T00:00:00Z"),
  });

  assert.equal(result.feedsSucceeded, 2);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, "Future Sound Festival");
});

test("Gemini enrichment sends no URLs/contact data or commerce facts", async () => {
  const event = candidate({
    description:
      "Contact alice@example.com or +359 888 123 456. https://secret.example/path",
    sourceId: "alice@example.com",
    sourceUrl: "https://feeds.example.com/events/private?token=secret",
  });
  const modelInput = buildGeminiDiscoveryInput(event);

  assert.equal(modelInput.includes("alice@example.com"), false);
  assert.equal(modelInput.includes("+359"), false);
  assert.equal(modelInput.includes("secret.example"), false);
  assert.equal(modelInput.includes("sourceId"), false);
  assert.equal(modelInput.includes("sourceUrl"), false);

  let captured: GeminiDiscoveryRequest | undefined;
  const enriched = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    invokeGemini: async (request) => {
      captured = request;
      return {
        output_text: JSON.stringify({
          appealScore: 91,
          category: "Festivals",
          descriptionBg: "Музикален фестивал.",
          descriptionEn: "A music festival.",
          titleBg: "Фестивал Future Sound",
          titleEn: "Future Sound Festival",
        }),
      };
    },
  });

  assert.ok(captured);
  assert.equal(captured.model, "gemini-3.5-flash-lite");
  assert.equal(captured.store, false);
  assert.equal("tools" in captured, false);
  assert.equal(
    "price" in captured.response_format.schema.properties,
    false,
  );
  assert.equal(
    "capacity" in captured.response_format.schema.properties,
    false,
  );
  assert.equal(enriched.enrichedBy, "gemini");
  assert.equal(enriched.sourceUrl, event.sourceUrl);
  assert.equal(enriched.feedUrl, event.feedUrl);
  assert.equal(enriched.enrichment.appealScore, 91);
});

test("Gemini failures and invalid output fall back deterministically", async () => {
  const event = candidate();
  const noKey = await enrichDiscoveryEvent(event, { apiKey: "" });
  const failed = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    invokeGemini: async () => {
      throw new Error("offline");
    },
  });
  const invalid = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    invokeGemini: async () => ({
      output_text: '{"category":"Festivals","price":99}',
    }),
  });

  assert.equal(noKey.enrichedBy, "deterministic");
  assert.deepEqual(failed, noKey);
  assert.deepEqual(invalid, noKey);
});

test("Gemini enrichment uses the bounded stateless Interactions REST API", async () => {
  const event = candidate();
  let attempts = 0;

  const enriched = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async (input, init) => {
      attempts += 1;
      assert.equal(
        input.toString(),
        "https://generativelanguage.googleapis.com/v1/interactions",
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-key",
      );
      assert.equal(input.toString().includes("test-key"), false);

      const request = JSON.parse(String(init?.body)) as GeminiDiscoveryRequest;
      assert.equal(request.model, "gemini-3.5-flash-lite");
      assert.equal(request.store, false);
      assert.equal("tools" in request, false);

      if (attempts === 1) {
        return Response.json(
          { error: "temporary" },
          {
            status: 503,
            headers: { "Retry-After": "0" },
          },
        );
      }

      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  appealScore: 88,
                  category: "Festivals",
                  descriptionBg: "Публичен музикален фестивал.",
                  descriptionEn: "A public music festival.",
                  titleBg: "Фестивал Future Sound",
                  titleEn: "Future Sound Festival",
                }),
              },
            ],
          },
        ],
      });
    },
  });

  assert.equal(attempts, 2);
  assert.equal(enriched.enrichedBy, "gemini");
  assert.equal(enriched.enrichment.appealScore, 88);
});

test("Gemini ignores incomplete and oversized responses without retrying", async () => {
  const event = candidate();
  let incompleteAttempts = 0;
  const incomplete = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async () => {
      incompleteAttempts += 1;
      return Response.json({
        status: "incomplete",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  appealScore: 99,
                  category: "Festivals",
                  descriptionBg: "Не трябва да се използва.",
                  descriptionEn: "Must not be used.",
                  titleBg: "Невалиден отговор",
                  titleEn: "Invalid response",
                }),
              },
            ],
          },
        ],
      });
    },
  });

  let oversizedAttempts = 0;
  const oversized = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async () => {
      oversizedAttempts += 1;
      const chunk = new Uint8Array(70_000);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      });
      return new Response(body, {
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(incompleteAttempts, 1);
  assert.equal(oversizedAttempts, 1);
  assert.equal(incomplete.enrichedBy, "deterministic");
  assert.equal(oversized.enrichedBy, "deterministic");
});

test("Gemini retries transport failures but not bad responses", async () => {
  const event = candidate();
  let transportAttempts = 0;
  const recovered = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async () => {
      transportAttempts += 1;
      if (transportAttempts === 1) {
        throw new TypeError("offline");
      }

      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  appealScore: 87,
                  category: "Festivals",
                  descriptionBg: "Музикален фестивал.",
                  descriptionEn: "A music festival.",
                  titleBg: "Фестивал Future Sound",
                  titleEn: "Future Sound Festival",
                }),
              },
            ],
          },
        ],
      });
    },
  });

  let rejectedAttempts = 0;
  let rejectedBodyCancelled = 0;
  const rejected = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async () => {
      rejectedAttempts += 1;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"error":"bad"}'));
        },
        cancel() {
          rejectedBodyCancelled += 1;
        },
      });
      return new Response(body, { status: 400 });
    },
  });

  let encodingAttempts = 0;
  const malformed = await enrichDiscoveryEvent(event, {
    apiKey: "test-key",
    fetchImpl: async () => {
      encodingAttempts += 1;
      return new Response(new Uint8Array([0xff]));
    },
  });

  assert.equal(transportAttempts, 2);
  assert.equal(recovered.enrichedBy, "gemini");
  assert.equal(rejectedAttempts, 1);
  assert.equal(rejectedBodyCancelled, 1);
  assert.equal(rejected.enrichedBy, "deterministic");
  assert.equal(encodingAttempts, 1);
  assert.equal(malformed.enrichedBy, "deterministic");
});

test("discovery opens its Gemini circuit after a failed batch", async () => {
  const events = Array.from({ length: 7 }, (_, index) =>
    candidate({
      sourceId: `source-${index}`,
      sourceUrl: `https://feeds.example.com/events/${index}`,
      title: `Future event ${index}`,
    }),
  );
  let calls = 0;

  const enriched = await enrichDiscoveryCandidates(events, {
    apiKey: "test-key",
    invokeGemini: async () => {
      calls += 1;
      return {};
    },
  });

  assert.equal(calls, 3);
  assert.equal(enriched.length, events.length);
  assert.equal(
    enriched.every((event) => event.enrichedBy === "deterministic"),
    true,
  );
});

test("discovery does not start another Gemini batch after its deadline", async () => {
  const events = Array.from({ length: 7 }, (_, index) =>
    candidate({
      sourceId: `deadline-${index}`,
      sourceUrl: `https://feeds.example.com/events/deadline-${index}`,
      title: `Deadline event ${index}`,
    }),
  );
  let calls = 0;
  let clock = 0;

  const enriched = await enrichDiscoveryCandidates(events, {
    apiKey: "test-key",
    nowMs: () => clock,
    runBudgetMs: 25_000,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 3) {
        clock = 25_000;
      }
      return Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  appealScore: 84,
                  category: "Festivals",
                  descriptionBg: "Фестивал.",
                  descriptionEn: "Festival.",
                  titleBg: "Събитие",
                  titleEn: "Event",
                }),
              },
            ],
          },
        ],
      });
    },
  });

  assert.equal(calls, 3);
  assert.equal(enriched.length, events.length);
  assert.equal(
    enriched.every((event) => event.enrichedBy === "deterministic"),
    true,
  );
});
