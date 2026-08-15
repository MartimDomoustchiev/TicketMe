import { createHash } from "node:crypto";
import type { JsonValue } from "@/lib/catalog-types";

export const DISCOVERY_FEED_OUTCOMES_METADATA_KEY = "feedOutcomes";

const FEED_OUTCOME_STATUSES = [
  "pending",
  "succeeded",
  "failed",
] as const;
const MAX_STORED_FEED_OUTCOMES = 50;
export const MAX_STORED_DISCOVERY_FEED_REFERENCE_LENGTH = 1_024;

export type DiscoveryFeedOutcomeStatus =
  (typeof FEED_OUTCOME_STATUSES)[number];

export type DiscoveryFeedOutcome = {
  feedUrl: string;
  status: DiscoveryFeedOutcomeStatus;
  failureCode?: string;
};

type DiscoveryFeedFailureLike = {
  code: string;
  feedUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOutcomeStatus(
  value: unknown,
): value is DiscoveryFeedOutcomeStatus {
  return (
    typeof value === "string" &&
    FEED_OUTCOME_STATUSES.includes(value as DiscoveryFeedOutcomeStatus)
  );
}

/** Replaces path/query credentials with a stable, non-secret feed reference. */
export function redactDiscoveryFeedReference(feedUrl: URL): string {
  const safe = new URL(feedUrl.href);
  const existingFingerprint =
    !safe.search && !safe.hash
      ? /^\/\.tiketko-feed\/([a-f0-9]{24})$/u.exec(safe.pathname)?.[1] ??
        null
      : null;
  const fingerprint =
    existingFingerprint ??
    createHash("sha256")
      .update(feedUrl.href)
      .digest("hex")
      .slice(0, 24);
  safe.username = "";
  safe.password = "";
  safe.hash = "";
  safe.pathname = `/.tiketko-feed/${fingerprint}`;
  safe.search = "";
  const reference = safe.href;
  if (reference.length > MAX_STORED_DISCOVERY_FEED_REFERENCE_LENGTH) {
    throw new Error("DISCOVERY_FEED_REFERENCE_TOO_LONG");
  }
  return reference;
}

export function pendingDiscoveryFeedOutcomes(
  feedUrls: readonly URL[],
): DiscoveryFeedOutcome[] {
  return feedUrls.map((feedUrl) => ({
    feedUrl: redactDiscoveryFeedReference(feedUrl),
    status: "pending",
  }));
}

export function completedDiscoveryFeedOutcomes(
  feedUrls: readonly URL[],
  failures: readonly DiscoveryFeedFailureLike[],
): DiscoveryFeedOutcome[] {
  const failureByFeed = new Map(
    failures.map((failure) => [failure.feedUrl, failure.code]),
  );

  return feedUrls.map((feedUrl) => {
    const redactedUrl = redactDiscoveryFeedReference(feedUrl);
    const failureCode = failureByFeed.get(redactedUrl);
    return failureCode
      ? { feedUrl: redactedUrl, status: "failed", failureCode }
      : { feedUrl: redactedUrl, status: "succeeded" };
  });
}

export function discoveryFeedOutcomeMetadata(
  outcomes: readonly DiscoveryFeedOutcome[],
): Record<string, JsonValue> {
  if (outcomes.length > MAX_STORED_FEED_OUTCOMES) {
    throw new Error("TOO_MANY_DISCOVERY_FEED_OUTCOMES");
  }
  return {
    [DISCOVERY_FEED_OUTCOMES_METADATA_KEY]: outcomes.map((outcome) => ({
      feedUrl: outcome.feedUrl,
      status: outcome.status,
      ...(outcome.failureCode
        ? { failureCode: outcome.failureCode }
        : {}),
    })),
  };
}

/**
 * Strictly reads the optional metadata written by newer discovery runs. A
 * missing value means the historical run predates per-feed observability.
 */
export function readDiscoveryFeedOutcomes(
  metadata: Record<string, JsonValue>,
): DiscoveryFeedOutcome[] | null {
  const raw = metadata[DISCOVERY_FEED_OUTCOMES_METADATA_KEY];
  if (raw === undefined) {
    return null;
  }
  if (!Array.isArray(raw) || raw.length > MAX_STORED_FEED_OUTCOMES) {
    return null;
  }

  const outcomes: DiscoveryFeedOutcome[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || !isOutcomeStatus(item.status)) {
      return null;
    }
    if (
      typeof item.feedUrl !== "string" ||
      item.feedUrl.length > 2_048
    ) {
      return null;
    }

    let feedUrl: string;
    try {
      const parsed = new URL(item.feedUrl);
      if (parsed.protocol !== "https:") {
        return null;
      }
      feedUrl = redactDiscoveryFeedReference(parsed);
    } catch {
      return null;
    }
    if (seen.has(feedUrl)) {
      return null;
    }
    seen.add(feedUrl);

    const failureCode =
      typeof item.failureCode === "string" &&
      item.failureCode.trim() &&
      item.failureCode.length <= 80
        ? item.failureCode.trim()
        : undefined;
    if (item.status === "failed" && !failureCode) {
      return null;
    }

    outcomes.push({
      feedUrl,
      status: item.status,
      ...(failureCode ? { failureCode } : {}),
    });
  }

  return outcomes;
}

export function readConfiguredFeedCount(
  metadata: Record<string, JsonValue>,
): number | null {
  const count = metadata.feedsConfigured;
  return typeof count === "number" &&
    Number.isInteger(count) &&
    count >= 0 &&
    count <= MAX_STORED_FEED_OUTCOMES
    ? count
    : null;
}
