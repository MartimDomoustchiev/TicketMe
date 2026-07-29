import {
  isDiscoveryCategory,
  type DiscoveryEnrichment,
  type DiscoveryEventCandidate,
  type EnrichedDiscoveryEvent,
} from "@/lib/event-discovery-types";

export const GEMINI_DISCOVERY_MODEL = "gemini-3.5-flash-lite";

const ENRICHMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    appealScore: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description:
        "Editorial appeal score based only on the supplied public event metadata.",
    },
    category: {
      type: "string",
      enum: [
        "Concerts",
        "Festivals",
        "Theatre",
        "Sports",
        "Culture",
        "Nightlife",
        "Business",
        "Family",
      ],
    },
    descriptionBg: {
      type: "string",
      description:
        "Faithful Bulgarian translation. Empty when the input description is empty.",
    },
    descriptionEn: {
      type: "string",
      description:
        "Faithful English translation. Empty when the input description is empty.",
    },
    titleBg: {
      type: "string",
      description: "Faithful Bulgarian translation of the supplied title.",
    },
    titleEn: {
      type: "string",
      description: "Faithful English translation of the supplied title.",
    },
  },
  required: [
    "appealScore",
    "category",
    "descriptionBg",
    "descriptionEn",
    "titleBg",
    "titleEn",
  ],
} as const;

export type GeminiDiscoveryRequest = {
  input: string;
  model: typeof GEMINI_DISCOVERY_MODEL;
  response_format: {
    mime_type: "application/json";
    schema: typeof ENRICHMENT_SCHEMA;
    type: "text";
  };
  store: false;
  system_instruction: string;
};

export type GeminiDiscoveryInvoker = (
  request: GeminiDiscoveryRequest,
) => Promise<{ output_text?: string }>;

export type EnrichDiscoveryEventOptions = {
  apiKey?: string;
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
  invokeGemini?: GeminiDiscoveryInvoker;
  nowMs?: () => number;
};

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1/interactions";
const GEMINI_RESPONSE_LIMIT_BYTES = 128_000;
const GEMINI_TIMEOUT_MS = 10_000;
const GEMINI_MAX_RETRY_DELAY_MS = 2_000;

const CATEGORY_KEYWORDS = {
  Business: [
    "academy",
    "business",
    "conference",
    "dev",
    "masterclass",
    "startup",
    "workshop",
    "бизнес",
    "конференц",
    "обучение",
  ],
  Concerts: [
    "band",
    "concert",
    "live",
    "orchestra",
    "singer",
    "концерт",
    "музика",
    "оркестър",
  ],
  Culture: [
    "art",
    "exhibition",
    "gallery",
    "museum",
    "изложба",
    "култура",
    "музей",
  ],
  Family: [
    "children",
    "family",
    "kids",
    "деца",
    "детск",
    "семей",
  ],
  Festivals: [
    "festival",
    "фестивал",
    "фест",
  ],
  Nightlife: [
    "club",
    "dj",
    "party",
    "дискотека",
    "клуб",
    "парти",
  ],
  Sports: [
    "championship",
    "football",
    "game",
    "marathon",
    "match",
    "run",
    "sport",
    "мач",
    "маратон",
    "спорт",
  ],
  Theatre: [
    "ballet",
    "comedy",
    "opera",
    "stand-up",
    "theatre",
    "балет",
    "комедия",
    "опера",
    "театър",
  ],
} as const;

function includesKeyword(
  text: string,
  keywords: readonly string[],
): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function deterministicDiscoveryEnrichment(
  candidate: DiscoveryEventCandidate,
): DiscoveryEnrichment {
  const searchable = [
    candidate.title,
    candidate.description,
    candidate.venue,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("bg-BG");

  const category =
    (
      Object.entries(CATEGORY_KEYWORDS) as readonly [
        DiscoveryEnrichment["category"],
        readonly string[],
      ][]
    ).find(([, keywords]) => includesKeyword(searchable, keywords))?.[0] ??
    "Culture";

  const completeness = [
    candidate.description,
    candidate.venue,
    candidate.city,
    candidate.imageUrl,
  ].filter(Boolean).length;
  const categoryBonus =
    category === "Concerts" || category === "Festivals" ? 8 : 0;
  const appealScore = Math.min(100, 45 + completeness * 7 + categoryBonus);

  return {
    appealScore,
    category,
    titleBg: candidate.title,
    titleEn: candidate.title,
    ...(candidate.description
      ? {
          descriptionBg: candidate.description,
          descriptionEn: candidate.description,
        }
      : {}),
  };
}

function redactContacts(value: string): string {
  return value
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      "[redacted]",
    )
    .replace(
      /(?:https?:\/\/|www\.)\S+/giu,
      "[redacted]",
    )
    .replace(
      /(?<!\p{L})(?:\+?\d[\s().-]?){7,15}\d(?!\p{L})/gu,
      "[redacted]",
    )
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * This is the complete model data boundary. It intentionally excludes source
 * URLs/IDs, organizer and attendee data, addresses, prices, capacity, and all
 * application user data.
 */
export function buildGeminiDiscoveryInput(
  candidate: DiscoveryEventCandidate,
): string {
  return JSON.stringify({
    city: redactContacts(candidate.city ?? "").slice(0, 120),
    description: redactContacts(candidate.description ?? "").slice(
      0,
      2_000,
    ),
    startsAt: candidate.startsAt,
    title: redactContacts(candidate.title).slice(0, 200),
    venue: redactContacts(candidate.venue ?? "").slice(0, 200),
  });
}

function parseBoundedText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .normalize("NFC")
    .replace(/\p{C}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (
    (!allowEmpty && !normalized) ||
    normalized.length > maxLength
  ) {
    return null;
  }

  return normalized;
}

function parseGeminiEnrichment(
  output: string,
  hasDescription: boolean,
): DiscoveryEnrichment | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const expectedKeys = new Set([
    "appealScore",
    "category",
    "descriptionBg",
    "descriptionEn",
    "titleBg",
    "titleEn",
  ]);

  if (
    Object.keys(record).some((key) => !expectedKeys.has(key)) ||
    !Number.isInteger(record.appealScore) ||
    (record.appealScore as number) < 0 ||
    (record.appealScore as number) > 100 ||
    !isDiscoveryCategory(record.category)
  ) {
    return null;
  }

  const titleBg = parseBoundedText(record.titleBg, 240);
  const titleEn = parseBoundedText(record.titleEn, 240);
  const descriptionBg = parseBoundedText(
    record.descriptionBg,
    4_000,
    !hasDescription,
  );
  const descriptionEn = parseBoundedText(
    record.descriptionEn,
    4_000,
    !hasDescription,
  );

  if (
    !titleBg ||
    !titleEn ||
    descriptionBg === null ||
    descriptionEn === null ||
    (!hasDescription && (descriptionBg || descriptionEn))
  ) {
    return null;
  }

  return {
    appealScore: record.appealScore as number,
    category: record.category,
    titleBg,
    titleEn,
    ...(hasDescription ? { descriptionBg, descriptionEn } : {}),
  };
}

class GeminiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`GEMINI_HTTP_${status}`);
  }
}

class GeminiDeadlineError extends Error {
  constructor() {
    super("GEMINI_DEADLINE_EXCEEDED");
  }
}

class GeminiResponseError extends Error {}

class GeminiTransportError extends Error {
  constructor() {
    super("GEMINI_TRANSPORT_ERROR");
  }
}

function extractInteractionOutput(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const interaction = value as {
    status?: unknown;
    steps?: unknown;
  };
  if (interaction.status !== "completed") {
    return undefined;
  }

  const steps = interaction.steps;
  if (!Array.isArray(steps)) {
    return undefined;
  }

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (
      !step ||
      typeof step !== "object" ||
      Array.isArray(step) ||
      (step as { type?: unknown }).type !== "model_output"
    ) {
      continue;
    }

    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    const text = content
      .filter(
        (part): part is { text: string; type: "text" } =>
          Boolean(
            part &&
              typeof part === "object" &&
              !Array.isArray(part) &&
              (part as { type?: unknown }).type === "text" &&
              typeof (part as { text?: unknown }).text === "string",
          ),
      )
      .map((part) => part.text)
      .join("");

    if (text) {
      return text;
    }
  }

  return undefined;
}

function shouldRetryGemini(error: unknown): boolean {
  if (error instanceof GeminiHttpError) {
    return (
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    );
  }

  return error instanceof GeminiTransportError;
}

function retryAfterMilliseconds(value: string | null): number | null {
  if (!value?.trim()) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      GEMINI_MAX_RETRY_DELAY_MS,
      Math.round(seconds * 1_000),
    );
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.min(
    GEMINI_MAX_RETRY_DELAY_MS,
    Math.max(0, date - Date.now()),
  );
}

async function waitBeforeGeminiRetry(
  error: unknown,
  attempt: number,
  deadlineMs: number | undefined,
  nowMs: () => number,
): Promise<void> {
  const retryAfter =
    error instanceof GeminiHttpError ? error.retryAfterMs : null;
  let delay =
    retryAfter ??
    Math.min(
      GEMINI_MAX_RETRY_DELAY_MS,
      200 * 2 ** attempt + Math.floor(Math.random() * 100),
    );

  if (deadlineMs !== undefined) {
    const remaining = deadlineMs - nowMs();
    if (remaining <= 0) {
      throw new GeminiDeadlineError();
    }
    delay = Math.min(delay, remaining);
  }

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function assertBeforeGeminiDeadline(
  deadlineMs: number | undefined,
  nowMs: () => number,
): void {
  if (deadlineMs !== undefined && nowMs() >= deadlineMs) {
    throw new GeminiDeadlineError();
  }
}

async function readBoundedGeminiResponse(
  response: Response,
): Promise<string> {
  const declaredLength = Number(
    response.headers.get("content-length") ?? "0",
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > GEMINI_RESPONSE_LIMIT_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new GeminiResponseError("GEMINI_RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        throw new GeminiTransportError();
      }

      const { done, value } = result;
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > GEMINI_RESPONSE_LIMIT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GeminiResponseError("GEMINI_RESPONSE_TOO_LARGE");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(combined);
  } catch {
    throw new GeminiResponseError("GEMINI_RESPONSE_ENCODING");
  }
}

async function createDefaultGeminiInvoker(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  deadlineMs?: number,
  nowMs: () => number = Date.now,
): Promise<GeminiDiscoveryInvoker> {
  return async (request) => {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertBeforeGeminiDeadline(deadlineMs, nowMs);
      const remaining =
        deadlineMs === undefined
          ? GEMINI_TIMEOUT_MS
          : Math.max(1, deadlineMs - nowMs());
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(GEMINI_TIMEOUT_MS, remaining),
      );

      try {
        let response: Response;
        try {
          response = await fetchImpl(GEMINI_INTERACTIONS_ENDPOINT, {
            body: JSON.stringify(request),
            cache: "no-store",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": apiKey,
            },
            method: "POST",
            redirect: "error",
            signal: controller.signal,
          });
        } catch {
          throw new GeminiTransportError();
        }

        assertBeforeGeminiDeadline(deadlineMs, nowMs);

        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new GeminiHttpError(
            response.status,
            retryAfterMilliseconds(
              response.headers.get("retry-after"),
            ),
          );
        }

        const body = await readBoundedGeminiResponse(response);

        return {
          output_text: extractInteractionOutput(
            JSON.parse(body) as unknown,
          ),
        };
      } catch (error) {
        lastError = error;
        if (attempt === 1 || !shouldRetryGemini(error)) {
          throw error;
        }
        clearTimeout(timeout);
        await waitBeforeGeminiRetry(
          error,
          attempt,
          deadlineMs,
          nowMs,
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  };
}

export async function enrichDiscoveryEvent(
  candidate: DiscoveryEventCandidate,
  options: EnrichDiscoveryEventOptions = {},
): Promise<EnrichedDiscoveryEvent> {
  const fallback: EnrichedDiscoveryEvent = {
    ...candidate,
    enrichedBy: "deterministic",
    enrichment: deterministicDiscoveryEnrichment(candidate),
  };

  if (typeof window !== "undefined") {
    return fallback;
  }

  const nowMs = options.nowMs ?? Date.now;
  if (
    options.deadlineMs !== undefined &&
    nowMs() >= options.deadlineMs
  ) {
    return fallback;
  }

  const apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY)?.trim();
  if (!apiKey) {
    return fallback;
  }

  try {
    const invokeGemini =
      options.invokeGemini ??
      (await createDefaultGeminiInvoker(
        apiKey,
        options.fetchImpl,
        options.deadlineMs,
        nowMs,
      ));
    const response = await invokeGemini({
      model: GEMINI_DISCOVERY_MODEL,
      store: false,
      system_instruction:
        "Categorize, faithfully translate, and score only the supplied public event metadata. Do not add facts, dates, people, venues, prices, ticket availability, capacity, URLs, or claims. Empty input descriptions must remain empty. Return only the requested JSON.",
      input: buildGeminiDiscoveryInput(candidate),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: ENRICHMENT_SCHEMA,
      },
    });

    if (!response.output_text) {
      return fallback;
    }

    const enrichment = parseGeminiEnrichment(
      response.output_text,
      Boolean(candidate.description),
    );

    return enrichment
      ? {
          ...candidate,
          enrichedBy: "gemini",
          enrichment,
        }
      : fallback;
  } catch {
    return fallback;
  }
}
