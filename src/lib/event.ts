import { EVENT_SEEDS, type EventSeed } from "@/data/event-seeds";

export const EVENT_CATEGORIES = [
  "Concerts",
  "Festivals",
  "Theatre",
  "Sports",
  "Culture",
  "Nightlife",
  "Business",
  "Family",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type TicketTypeId = "fan" | "standard" | "premium";
export type CurrencyCode = "EUR";
export type EventSaleMode = "internal" | "external";

export type TicketType = {
  id: TicketTypeId;
  label: string;
  price: number;
  priceLabel: string;
  currency: CurrencyCode;
  capacity: number;
  accent: string;
  description: string;
};

export type CatalogEvent = {
  id: string;
  slug: string;
  title: string;
  name: string;
  tagline: string;
  description: string;
  category: EventCategory;
  city: string;
  venue: string;
  address: string;
  startsAt: string;
  date: string;
  time: string;
  priceFrom: number;
  priceLabel: string;
  currency: CurrencyCode;
  image: string;
  heroImage: string;
  ticketTypes: readonly TicketType[];
  sourceName: string;
  sourceUrl: string;
  /**
   * Internal events are sold by TicketForge. External events are discovery
   * listings and always send the visitor to the verified organizer source.
   */
  saleMode?: EventSaleMode;
  aiEnhanced?: boolean;
  featured?: boolean;
};

export const CATEGORY_LABELS: Readonly<Record<EventCategory, string>> = {
  Concerts: "Концерти",
  Festivals: "Фестивали",
  Theatre: "Театър",
  Sports: "Спорт",
  Culture: "Култура",
  Nightlife: "Парти",
  Business: "Бизнес",
  Family: "За семейството",
};

const SOFIA_TIME_ZONE = "Europe/Sofia";
const EUR_CURRENCY: CurrencyCode = "EUR";

// Bulgaria adopted the euro at the irrevocably fixed conversion rate below.
// The imported event snapshot used legacy BGN price points, so normalize them
// once at the catalogue boundary and keep all application/Stripe amounts EUR.
export const BGN_PER_EUR = 1.95583;

const DATE_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: SOFIA_TIME_ZONE,
});

const TIME_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: SOFIA_TIME_ZONE,
});

const PRICE_FORMATTER = new Intl.NumberFormat("bg-BG", {
  style: "currency",
  currency: EUR_CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const IMAGE_POOL: Readonly<Record<EventCategory, readonly string[]>> = {
  Concerts: [
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1400&q=82",
  ],
  Festivals: [
    "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=82",
  ],
  Theatre: [
    "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1507924538820-ede94a04019d?auto=format&fit=crop&w=1400&q=82",
  ],
  Sports: [
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1400&q=82",
  ],
  Culture: [
    "https://images.unsplash.com/photo-1482160549825-59d1b23cb208?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1545987796-200677ee1011?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1400&q=82",
  ],
  Nightlife: [
    "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=82",
  ],
  Business: [
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=82",
  ],
  Family: [
    "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1607453998774-d533f65dac99?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1596464716127-f2a82984de30?auto=format&fit=crop&w=1400&q=82",
  ],
};

const PRICE_POINTS = [25, 29, 35, 39, 45, 49, 55, 59, 65, 69, 75, 79] as const;

const CATEGORY_PRICE_FACTOR: Readonly<Record<EventCategory, number>> = {
  Concerts: 1,
  Festivals: 1.2,
  Theatre: 0.9,
  Sports: 0.8,
  Culture: 0.75,
  Nightlife: 0.85,
  Business: 2.4,
  Family: 0.65,
};

const CITY_ALIASES: Readonly<Record<string, string>> = {
  Sofia: "София",
  Varvara: "Варвара",
  Lozenets: "Лозенец",
};

const TICKET_TYPE_IDS = new Set<TicketTypeId>([
  "fan",
  "standard",
  "premium",
]);

export function formatEventDate(startsAt: string | Date): string {
  return DATE_FORMATTER.format(
    typeof startsAt === "string" ? new Date(startsAt) : startsAt,
  );
}

export function formatEventTime(startsAt: string | Date): string {
  return TIME_FORMATTER.format(
    typeof startsAt === "string" ? new Date(startsAt) : startsAt,
  );
}

export function formatPrice(
  amount: number,
  currency: CurrencyCode = EUR_CURRENCY,
): string {
  return currency === EUR_CURRENCY
    ? PRICE_FORMATTER.format(amount)
    : new Intl.NumberFormat("bg-BG", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
}

export function convertLegacyBgnToEur(amountInBgn: number): number {
  return Math.round((amountInBgn / BGN_PER_EUR) * 100) / 100;
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function inferCategory(seed: EventSeed): EventCategory {
  const title = seed.name.toLocaleLowerCase("bg-BG");

  if (
    includesAny(title, [
      "academy",
      "академ",
      "training",
      "masterclass",
      "мастърклас",
      "conference",
      "blockchain",
      "aws community",
      "dev.bg",
      "кариера",
      "умения",
      "управление",
      "търгов",
      "мениджър",
    ])
  ) {
    return "Business";
  }

  if (
    includesAny(title, [
      "kids",
      "family",
      "детск",
      "динозав",
      "ярмарка чудес",
    ])
  ) {
    return "Family";
  }

  if (
    includesAny(title, [
      "run",
      "les mills",
      "маратон",
      "fitness",
      "спорт",
      "audi събор",
    ])
  ) {
    return "Sports";
  }

  if (
    includesAny(title, [
      "театър",
      "theatre",
      "стендъп",
      "stand-up",
      "комедия",
      "спектакъл",
      "секс и драма",
    ])
  ) {
    return "Theatre";
  }

  if (
    includesAny(title, [
      "festival",
      "fest ",
      "fest 20",
      "фест",
      "фестивал",
      "събор",
      "art realm con",
    ])
  ) {
    return "Festivals";
  }

  if (
    includesAny(title, [
      "party",
      "rooftop",
      "boat",
      "dirty",
      "secret crush",
      "cotton candy",
      "дискотека",
      "ocean of house",
      "open air frequencies",
      "temperamento",
      "white party",
    ])
  ) {
    return "Nightlife";
  }

  if (
    includesAny(title, [
      "live",
      "концерт",
      "tour",
      "trio",
      "orchestra",
      "symphonie",
      "музикални",
      "музика",
      "молец",
      "керана",
    ])
  ) {
    return "Concerts";
  }

  return "Culture";
}

function normalizeStartsAt(localDateTime: string): string {
  return `${localDateTime.replace(" ", "T")}:00+03:00`;
}

function normalizeCity(city: string): string {
  const trimmed = city.trim();
  return CITY_ALIASES[trimmed] ?? (trimmed || "България");
}

function getLegacyBgnPriceFrom(
  seed: EventSeed,
  category: EventCategory,
): number {
  const base = PRICE_POINTS[seed.sourceId % PRICE_POINTS.length];
  return Math.round(base * CATEGORY_PRICE_FACTOR[category]);
}

function buildTicketTypes(
  seedValue: number,
  legacyPriceFrom: number,
): readonly TicketType[] {
  const legacyStandardPrice = Math.max(
    legacyPriceFrom + 10,
    Math.round(legacyPriceFrom * 1.3),
  );
  const legacyPremiumPrice = Math.max(
    legacyStandardPrice + 20,
    Math.round(legacyPriceFrom * 1.9),
  );
  const priceFrom = convertLegacyBgnToEur(legacyPriceFrom);
  const standardPrice = convertLegacyBgnToEur(legacyStandardPrice);
  const premiumPrice = convertLegacyBgnToEur(legacyPremiumPrice);

  return [
    {
      id: "fan",
      label: "Ранен достъп",
      price: priceFrom,
      priceLabel: formatPrice(priceFrom),
      currency: EUR_CURRENCY,
      capacity: 80 + (seedValue % 160),
      accent: "#14b8a6",
      description: "Достъп до събитието и мобилен билет с QR код.",
    },
    {
      id: "standard",
      label: "Стандартен",
      price: standardPrice,
      priceLabel: formatPrice(standardPrice),
      currency: EUR_CURRENCY,
      capacity: 160 + ((seedValue * 7) % 340),
      accent: "#f97316",
      description: "Стандартен достъп с гарантирано място в избраната зона.",
    },
    {
      id: "premium",
      label: "Премиум",
      price: premiumPrice,
      priceLabel: formatPrice(premiumPrice),
      currency: EUR_CURRENCY,
      capacity: 30 + (seedValue % 70),
      accent: "#7c3aed",
      description: "Премиум зона, отделен вход и приоритетно обслужване.",
    },
  ];
}

export function getCategoryImage(
  category: EventCategory,
  seedValue = 0,
): string {
  const images = IMAGE_POOL[category];
  return images[seedValue % images.length];
}

function normalizeSeed(seed: EventSeed): CatalogEvent {
  const category = inferCategory(seed);
  const city = normalizeCity(seed.city);
  const venue =
    seed.venue === "To Be Announced"
      ? "Локацията предстои"
      : seed.venue.trim();
  const startsAt = normalizeStartsAt(seed.startsAt);
  const legacyPriceFrom = getLegacyBgnPriceFrom(seed, category);
  const priceFrom = convertLegacyBgnToEur(legacyPriceFrom);
  const image = getCategoryImage(category, seed.sourceId);

  return {
    id: `bilet-${seed.sourceId}`,
    slug: seed.slug,
    title: seed.name,
    name: seed.name,
    tagline: `${CATEGORY_LABELS[category]} в ${city} • ${venue}`,
    description: `${seed.name} гостува в ${venue}, ${city}. Изберете билетна категория и получете билета си директно по имейл.`,
    category,
    city,
    venue,
    address: venue === city ? city : `${venue}, ${city}`,
    startsAt,
    date: formatEventDate(startsAt),
    time: formatEventTime(startsAt),
    priceFrom,
    priceLabel: `от ${formatPrice(priceFrom)}`,
    currency: EUR_CURRENCY,
    image,
    heroImage: image,
    ticketTypes: buildTicketTypes(seed.sourceId, legacyPriceFrom),
    sourceName: "Bilet.bg",
    sourceUrl: `https://www.bilet.bg/bg/events/${seed.slug}`,
    saleMode: "internal",
  };
}

const FEATURED_TICKET_TYPES: readonly TicketType[] = [
  {
    id: "fan",
    label: "Fan Zone",
    price: convertLegacyBgnToEur(91),
    priceLabel: formatPrice(convertLegacyBgnToEur(91)),
    currency: EUR_CURRENCY,
    capacity: 160,
    accent: "#14b8a6",
    description: "Правостояща зона с бърз вход и PDF билет.",
  },
  {
    id: "standard",
    label: "Standard Seat",
    price: convertLegacyBgnToEur(128),
    priceLabel: formatPrice(convertLegacyBgnToEur(128)),
    currency: EUR_CURRENCY,
    capacity: 90,
    accent: "#f97316",
    description: "Седящо място в централните сектори.",
  },
  {
    id: "premium",
    label: "Premium",
    price: convertLegacyBgnToEur(189),
    priceLabel: formatPrice(convertLegacyBgnToEur(189)),
    currency: EUR_CURRENCY,
    capacity: 30,
    accent: "#7c3aed",
    description: "Най-добра видимост, отделен вход и приоритетно обслужване.",
  },
];

const FEATURED_STARTS_AT = "2026-09-29T20:00:00+03:00";
const FEATURED_IMAGE =
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1800&q=85";

export const EVENT: CatalogEvent = {
  id: "deep-purple-live-sofia-2026",
  slug: "deep-purple-live-sofia-2026",
  title: "Deep Purple Live",
  name: "Deep Purple Live",
  tagline: "Една от най-влиятелните рок групи на живо в София.",
  description:
    "Deep Purple пристигат в Arena 8888 Sofia за концерт с емблематични песни и пълномащабна сценична продукция.",
  category: "Concerts",
  city: "София",
  venue: "Arena 8888 Sofia",
  address: "Arena 8888 Sofia, София",
  startsAt: FEATURED_STARTS_AT,
  date: formatEventDate(FEATURED_STARTS_AT),
  time: formatEventTime(FEATURED_STARTS_AT),
  priceFrom: convertLegacyBgnToEur(91),
  priceLabel: `от ${formatPrice(convertLegacyBgnToEur(91))}`,
  currency: EUR_CURRENCY,
  image: FEATURED_IMAGE,
  heroImage: FEATURED_IMAGE,
  ticketTypes: FEATURED_TICKET_TYPES,
  sourceName: "Eventim",
  sourceUrl: "https://www.eventim.bg/en/artist/deep-purple/",
  saleMode: "internal",
  featured: true,
};

export const CATALOG_EVENTS: readonly CatalogEvent[] = [
  EVENT,
  ...EVENT_SEEDS.map(normalizeSeed),
];

const EVENTS_BY_ID = new Map(CATALOG_EVENTS.map((event) => [event.id, event]));
const EVENTS_BY_SLUG = new Map(
  CATALOG_EVENTS.map((event) => [event.slug, event]),
);

export const TOTAL_CAPACITY = EVENT.ticketTypes.reduce(
  (sum, type) => sum + type.capacity,
  0,
);

export function getEventById(id: string): CatalogEvent | undefined {
  return EVENTS_BY_ID.get(id);
}

export function getEventBySlug(slug: string): CatalogEvent | undefined {
  return EVENTS_BY_SLUG.get(slug);
}

export function isTicketTypeId(value: unknown): value is TicketTypeId {
  return typeof value === "string" && TICKET_TYPE_IDS.has(value as TicketTypeId);
}

export function getTicketType(id: TicketTypeId): TicketType;
export function getTicketType(
  eventId: string,
  typeId: TicketTypeId,
): TicketType;
export function getTicketType(
  eventIdOrTypeId: string,
  maybeTypeId?: TicketTypeId,
): TicketType {
  const event =
    maybeTypeId === undefined
      ? EVENT
      : getEventById(eventIdOrTypeId) ?? getEventBySlug(eventIdOrTypeId);
  const typeId = maybeTypeId ?? (eventIdOrTypeId as TicketTypeId);

  return (
    event?.ticketTypes.find((type) => type.id === typeId) ??
    EVENT.ticketTypes.find((type) => type.id === typeId) ??
    EVENT.ticketTypes[0]
  );
}
