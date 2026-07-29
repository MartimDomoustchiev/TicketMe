import type {
  DiscoveredCatalogEventInput,
  EventDiscoveryTrigger,
  JsonValue,
} from "@/lib/catalog-types";
import {
  enrichDiscoveryEvent,
  GEMINI_DISCOVERY_MODEL,
  type EnrichDiscoveryEventOptions,
} from "@/lib/event-discovery-gemini";
import { parseDiscoveryFeed } from "@/lib/event-discovery-parsers";
import {
  fetchDiscoveryFeed,
  parseDiscoveryAllowedHosts,
  parseDiscoveryFeedUrls,
  type DiscoveryAllowedHost,
  type DiscoveryDnsLookup,
  type DiscoveryFetch,
} from "@/lib/event-discovery-security";
import {
  dedupeDiscoveryCandidates,
  type DiscoveryEventCandidate,
  type EnrichedDiscoveryEvent,
} from "@/lib/event-discovery-types";

export * from "@/lib/event-discovery-gemini";
export * from "@/lib/event-discovery-parsers";
export * from "@/lib/event-discovery-security";
export * from "@/lib/event-discovery-types";

const DISCOVERY_PROMPT_VERSION = "licensed-feeds-v1";
const DEFAULT_LOOKAHEAD_DAYS = 180;
const DEFAULT_MAX_EVENTS = 40;
const MAX_LOOKAHEAD_DAYS = 730;
const MAX_EVENTS_PER_RUN = 500;

export type DiscoveryFeedFailure = {
  code: string;
  feedUrl: string;
};

export type DiscoverEventCandidatesOptions = {
  allowedSourceHosts?: readonly DiscoveryAllowedHost[];
  dnsLookup?: DiscoveryDnsLookup;
  feedUrls?: readonly URL[];
  fetchImpl?: DiscoveryFetch;
  maxBytes?: number;
  maxEvents?: number;
  now?: Date;
  timeoutMs?: number;
  windowEnd?: Date;
};

export type DiscoverEventCandidatesResult = {
  candidates: readonly DiscoveryEventCandidate[];
  failures: readonly DiscoveryFeedFailure[];
  feedsConfigured: number;
  feedsSucceeded: number;
};

export type RunEventDiscoveryOptions = {
  allowedSourceHosts?: readonly DiscoveryAllowedHost[];
  enrich?: EnrichDiscoveryEventOptions;
  feedUrls?: readonly URL[];
  maxEvents?: number;
  now?: Date;
  requestedBy?: string | null;
  trigger: EventDiscoveryTrigger;
};

export type RunEventDiscoveryResult =
  | {
      reason: "already-running" | "no-feeds";
      status: "skipped";
    }
  | {
      candidatesFound: number;
      candidatesRejected: number;
      eventsCreated: number;
      eventsPublished: number;
      eventsUnchanged: number;
      eventsUpdated: number;
      feedFailures: number;
      runId: string;
      status: "completed";
    };

function positiveIntegerSetting(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function enabledSetting(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-US") === "true";
}

function failureCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }

  if (error instanceof Error && /^[A-Z0-9_]{3,80}$/u.test(error.message)) {
    return error.message;
  }

  return "FEED_PROCESSING_FAILED";
}

function redactedFeedReference(feedUrl: URL): string {
  const safe = new URL(feedUrl.href);
  safe.search = safe.search ? "?[redacted]" : "";
  return safe.href;
}

export async function discoverEventCandidates(
  options: DiscoverEventCandidatesOptions = {},
): Promise<DiscoverEventCandidatesResult> {
  const feedUrls = options.feedUrls ?? parseDiscoveryFeedUrls();
  const allowedSourceHosts =
    options.allowedSourceHosts ?? parseDiscoveryAllowedHosts();
  const now = options.now ? new Date(options.now) : new Date();
  const windowEnd = options.windowEnd
    ? new Date(options.windowEnd)
    : new Date(
        now.getTime() +
          DEFAULT_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1_000,
      );
  const maxEvents = Math.min(
    options.maxEvents ?? DEFAULT_MAX_EVENTS,
    MAX_EVENTS_PER_RUN,
  );

  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(windowEnd.getTime()) ||
    windowEnd <= now ||
    !Number.isInteger(maxEvents) ||
    maxEvents < 1
  ) {
    throw new Error("INVALID_DISCOVERY_WINDOW");
  }

  const outcomes = await Promise.all(
    feedUrls.map(async (feedUrl) => {
      try {
        const fetched = await fetchDiscoveryFeed(feedUrl, {
          allowedFeedUrls: feedUrls,
          dnsLookup: options.dnsLookup,
          fetchImpl: options.fetchImpl,
          maxBytes: options.maxBytes,
          timeoutMs: options.timeoutMs,
        });
        return {
          candidates: parseDiscoveryFeed(fetched.body, {
            allowedSourceHosts,
            contentType: fetched.contentType,
            feedUrl: fetched.feedUrl,
          }),
          feedUrl,
          ok: true as const,
        };
      } catch (error) {
        return {
          code: failureCode(error),
          feedUrl,
          ok: false as const,
        };
      }
    }),
  );

  const candidates = dedupeDiscoveryCandidates(
    outcomes
      .filter(
        (
          outcome,
        ): outcome is Extract<(typeof outcomes)[number], { ok: true }> =>
          outcome.ok,
      )
      .flatMap((outcome) => outcome.candidates)
      .filter((candidate) => {
        const startsAt = Date.parse(candidate.startsAt);
        return startsAt >= now.getTime() && startsAt <= windowEnd.getTime();
      }),
  ).slice(0, maxEvents);
  const failures = outcomes
    .filter(
      (
        outcome,
      ): outcome is Extract<(typeof outcomes)[number], { ok: false }> =>
        !outcome.ok,
    )
    .map((outcome) => ({
      code: outcome.code,
      feedUrl: redactedFeedReference(outcome.feedUrl),
    }));

  return {
    candidates,
    failures,
    feedsConfigured: feedUrls.length,
    feedsSucceeded: feedUrls.length - failures.length,
  };
}

function providerFor(candidate: DiscoveryEventCandidate): string {
  return (
    candidate.sourceName ??
    new URL(candidate.feedUrl).hostname.replace(/^www\./u, "")
  );
}

function sourceConfidence(candidate: DiscoveryEventCandidate): number {
  const facts = [
    candidate.city,
    candidate.venue,
    candidate.address,
    candidate.description,
    candidate.imageUrl,
    candidate.sourceId,
  ].filter(Boolean).length;

  return Math.min(0.95, 0.55 + facts * 0.06);
}

function catalogCandidate(
  event: EnrichedDiscoveryEvent,
): DiscoveredCatalogEventInput | null {
  if (!event.city || !event.venue) {
    return null;
  }

  const extractedFacts: Record<string, JsonValue> = {
    enrichedBy: event.enrichedBy,
    feedUrl: event.feedUrl,
    ...(event.endsAt ? { endsAt: event.endsAt } : {}),
    titleEn: event.enrichment.titleEn,
    ...(event.enrichment.descriptionEn
      ? { descriptionEn: event.enrichment.descriptionEn }
      : {}),
  };

  return {
    title: event.enrichment.titleBg,
    description:
      event.enrichment.descriptionBg ?? event.description ?? "",
    category: event.enrichment.category,
    city: event.city,
    venue: event.venue,
    address: event.address ?? "",
    startsAt: event.startsAt,
    timezone: "Europe/Sofia",
    priceFromMinor: null,
    currency: "EUR",
    // Feed images are retained as source facts but are not hotlinked into the
    // marketplace. The catalogue maps the category to an owned fallback.
    imageUrl: null,
    heroImageUrl: null,
    saleMode: "external",
    featured: false,
    bangerScore: event.enrichment.appealScore,
    sourceConfidence: sourceConfidence(event),
    source: {
      provider: providerFor(event),
      providerEventId: event.sourceId ?? null,
      sourceUrl: event.sourceUrl,
      isOfficial: false,
      extractedFacts,
      grounding: {},
      verifiedAt: null,
    },
  };
}

async function enrichCandidates(
  candidates: readonly DiscoveryEventCandidate[],
  options: EnrichDiscoveryEventOptions,
): Promise<readonly EnrichedDiscoveryEvent[]> {
  const enriched: EnrichedDiscoveryEvent[] = [];

  // Keep external-model concurrency deliberately low for predictable cost and
  // rate-limit behavior during a scheduled run.
  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    enriched.push(
      ...(await Promise.all(
        batch.map((candidate) => enrichDiscoveryEvent(candidate, options)),
      )),
    );
  }

  return enriched;
}

export async function runEventDiscovery(
  options: RunEventDiscoveryOptions,
): Promise<RunEventDiscoveryResult> {
  const feedUrls = options.feedUrls ?? parseDiscoveryFeedUrls();
  if (feedUrls.length === 0) {
    return { status: "skipped", reason: "no-feeds" };
  }

  const now = options.now ? new Date(options.now) : new Date();
  const lookaheadDays = positiveIntegerSetting(
    process.env.EVENT_DISCOVERY_LOOKAHEAD_DAYS,
    DEFAULT_LOOKAHEAD_DAYS,
    MAX_LOOKAHEAD_DAYS,
  );
  const maxEvents =
    options.maxEvents ??
    positiveIntegerSetting(
      process.env.EVENT_DISCOVERY_MAX_EVENTS,
      DEFAULT_MAX_EVENTS,
      MAX_EVENTS_PER_RUN,
    );
  const windowEnd = new Date(
    now.getTime() + lookaheadDays * 24 * 60 * 60 * 1_000,
  );
  const catalog = await import("@/lib/catalog-postgres");

  const locked = await catalog.withEventDiscoveryLock(async (client) => {
    const run = await catalog.startEventDiscoveryRun(
      {
        model: process.env.GEMINI_API_KEY?.trim()
          ? GEMINI_DISCOVERY_MODEL
          : "deterministic",
        promptVersion: DISCOVERY_PROMPT_VERSION,
        triggerSource: options.trigger,
        requestedBy: options.requestedBy ?? null,
        windowStart: now,
        windowEnd,
        metadata: {
          autoPublish: enabledSetting(
            process.env.EVENT_DISCOVERY_AUTO_PUBLISH,
          ),
          feedsConfigured: feedUrls.length,
          googleSearchGrounding: false,
        },
      },
      client,
    );
    let candidatesFound = 0;
    let candidatesRejected = 0;
    let eventsCreated = 0;
    let eventsPublished = 0;
    let eventsUpdated = 0;
    let eventsUnchanged = 0;

    try {
      const discovery = await discoverEventCandidates({
        allowedSourceHosts: options.allowedSourceHosts,
        feedUrls,
        maxEvents,
        now,
        windowEnd,
      });
      candidatesFound = discovery.candidates.length;

      if (discovery.feedsSucceeded === 0) {
        throw new Error("ALL_DISCOVERY_FEEDS_FAILED");
      }

      const enriched = await enrichCandidates(
        discovery.candidates,
        options.enrich ?? {},
      );

      for (const event of enriched) {
        const candidate = catalogCandidate(event);
        if (!candidate) {
          candidatesRejected += 1;
          continue;
        }

        try {
          const result = await catalog.upsertDiscoveredEvent(candidate, {
            client,
            observedAt: now,
            runId: run.id,
          });

          if (result.action === "created") {
            eventsCreated += 1;
          } else if (result.action === "updated") {
            eventsUpdated += 1;
          } else {
            eventsUnchanged += 1;
          }

          if (
            enabledSetting(process.env.EVENT_DISCOVERY_AUTO_PUBLISH) &&
            result.event.status === "pending"
          ) {
            const published = await catalog.publishCatalogEvent(
              {
                eventId: result.event.id,
                reviewedBy: "system:event-discovery",
                note:
                  "Automatically published from an explicitly configured event feed.",
                reviewedAt: now,
              },
              client,
            );
            if (published) {
              eventsPublished += 1;
            }
          }
        } catch {
          candidatesRejected += 1;
        }
      }

      await catalog.completeEventDiscoveryRun(
        run.id,
        {
          candidatesFound,
          eventsCreated,
          eventsUpdated,
          eventsUnchanged,
          candidatesRejected,
        },
        client,
      );

      return {
        status: "completed" as const,
        runId: run.id,
        candidatesFound,
        eventsCreated,
        eventsPublished,
        eventsUpdated,
        eventsUnchanged,
        candidatesRejected,
        feedFailures: discovery.failures.length,
      };
    } catch (error) {
      await catalog.failEventDiscoveryRun(
        run.id,
        error,
        {
          candidatesFound,
          eventsCreated,
          eventsUpdated,
          eventsUnchanged,
          candidatesRejected,
        },
        client,
      );
      throw error;
    }
  });

  return locked.acquired
    ? locked.value
    : { status: "skipped", reason: "already-running" };
}
