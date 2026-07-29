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
  invokeGemini?: GeminiDiscoveryInvoker;
};

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

async function createDefaultGeminiInvoker(
  apiKey: string,
): Promise<GeminiDiscoveryInvoker> {
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });

  return async (request) =>
    client.interactions.create(request, {
      maxRetries: 1,
      timeout: 10_000,
    });
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

  const apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY)?.trim();
  if (!apiKey) {
    return fallback;
  }

  try {
    const invokeGemini =
      options.invokeGemini ?? (await createDefaultGeminiInvoker(apiKey));
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
