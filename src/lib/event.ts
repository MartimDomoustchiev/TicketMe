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
  /** Whether priceFrom came from a real organizer/source price. */
  priceAvailable?: boolean;
  currency: CurrencyCode;
  image: string;
  heroImage: string;
  ticketTypes: readonly TicketType[];
  sourceName: string;
  sourceUrl: string;
  /**
   * Internal events are sold by the platform. External events are discovery
   * listings and always send the visitor to their attributed source.
   */
  saleMode?: EventSaleMode;
  /**
   * True only when the attributed URL is known to be an official event or
   * organizer source. Ticket marketplaces and unverified feeds stay false.
   */
  sourceOfficial?: boolean;
  aiEnhanced?: boolean;
  featured?: boolean;
  /** Editorial/AI ranking signal from 0 to 100; never a commerce fact. */
  bangerScore?: number;
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
export const BGN_PER_EUR = 1.95583;

const DUAL_PRICE_DISPLAY_START = Date.parse(
  "2025-08-08T00:00:00+03:00",
);
const DUAL_PRICE_DISPLAY_END = Date.parse(
  "2026-08-09T00:00:00+03:00",
);

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

const CATEGORY_IMAGES: Readonly<Record<EventCategory, string>> = {
  Concerts: "/events/concerts.webp",
  Festivals: "/events/festivals.webp",
  Theatre: "/events/theatre.webp",
  Sports: "/events/sports.webp",
  Culture: "/events/culture.webp",
  Nightlife: "/events/nightlife.webp",
  Business: "/events/business.webp",
  Family: "/events/family.webp",
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
const FEATURED_SOURCE_IDS = new Set([
  8525, 7576, 7882, 8202, 8493, 8401, 7934, 8171, 8187, 8213, 8347, 8172,
]);

const CURATED_CATEGORY_OVERRIDES: Readonly<
  Partial<Record<number, EventCategory>>
> = {
  7867: "Festivals",
  7987: "Nightlife",
  8265: "Concerts",
  8300: "Culture",
  8326: "Concerts",
  8353: "Festivals",
  8357: "Concerts",
  8364: "Concerts",
  8376: "Festivals",
  8397: "Nightlife",
  8396: "Concerts",
  8401: "Concerts",
  8404: "Concerts",
  8480: "Nightlife",
  8499: "Nightlife",
  8502: "Concerts",
  8510: "Nightlife",
  8526: "Concerts",
};

// Historic tickets only stored the tier ID. These neutral labels keep old
// account/ticket pages readable without advertising made-up live inventory.
const ARCHIVED_TICKET_TYPES: Readonly<Record<TicketTypeId, TicketType>> = {
  fan: {
    id: "fan",
    label: "Fan",
    price: 0,
    priceLabel: "",
    currency: EUR_CURRENCY,
    capacity: 0,
    accent: "#14b8a6",
    description: "Архивирана билетна категория.",
  },
  standard: {
    id: "standard",
    label: "Standard",
    price: 0,
    priceLabel: "",
    currency: EUR_CURRENCY,
    capacity: 0,
    accent: "#f97316",
    description: "Архивирана билетна категория.",
  },
  premium: {
    id: "premium",
    label: "Premium",
    price: 0,
    priceLabel: "",
    currency: EUR_CURRENCY,
    capacity: 0,
    accent: "#7c3aed",
    description: "Архивирана билетна категория.",
  },
};

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

export function isDualPriceDisplayPeriod(now = new Date()): boolean {
  const timestamp = now.getTime();
  return (
    Number.isFinite(timestamp) &&
    timestamp >= DUAL_PRICE_DISPLAY_START &&
    timestamp < DUAL_PRICE_DISPLAY_END
  );
}

export function formatDualCurrencyPrice(
  amountInEur: number,
  locale: "bg" | "en" = "bg",
  now = new Date(),
): string {
  const numberLocale = locale === "en" ? "en-GB" : "bg-BG";
  const euro = new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInEur);

  if (!isDualPriceDisplayPeriod(now)) {
    return euro;
  }

  const lev = new Intl.NumberFormat(numberLocale, {
    style: "currency",
    currency: "BGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(amountInEur * BGN_PER_EUR * 100) / 100);
  return `${euro} / ${lev}`;
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function inferCategory(seed: EventSeed): EventCategory {
  const title = seed.name.toLocaleLowerCase("bg-BG");
  const curated = CURATED_CATEGORY_OVERRIDES[seed.sourceId];
  if (curated) {
    return curated;
  }

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
      "nightmares on wax",
      "urgehal",
      "slomosa",
      "soyuz",
      "jamie woon",
      "kard",
      "autechre",
      "pigs pigs pigs",
      "metallica",
      "inner circle",
      "moodymann",
      "rap dynasty",
    ])
  ) {
    return "Concerts";
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
      "party",
      "парти",
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

  return "Culture";
}

function normalizeStartsAt(localDateTime: string): string {
  return `${localDateTime.replace(" ", "T")}:00+03:00`;
}

function normalizeCity(city: string): string {
  const trimmed = city.trim();
  return CITY_ALIASES[trimmed] ?? (trimmed || "България");
}

export function getCategoryImage(category: EventCategory): string {
  return CATEGORY_IMAGES[category];
}

function normalizeSeed(seed: EventSeed): CatalogEvent {
  const category = inferCategory(seed);
  const city = normalizeCity(seed.city);
  const venue =
    seed.venue === "To Be Announced"
      ? "Локацията предстои"
      : seed.venue.trim();
  const startsAt = normalizeStartsAt(seed.startsAt);
  const image = `/events/listings/bilet-${seed.sourceId}.webp`;

  return {
    id: `bilet-${seed.sourceId}`,
    slug: seed.slug,
    title: seed.name,
    name: seed.name,
    tagline: `${CATEGORY_LABELS[category]} в ${city} • ${venue}`,
    description: `${seed.name} гостува в ${venue}, ${city}. Вижте актуалната програма, цени и условия в посочения източник на събитието.`,
    category,
    city,
    venue,
    address: venue === city ? city : `${venue}, ${city}`,
    startsAt,
    date: formatEventDate(startsAt),
    time: formatEventTime(startsAt),
    priceFrom: 0,
    priceLabel: "Източник",
    priceAvailable: false,
    currency: EUR_CURRENCY,
    image,
    heroImage: image,
    ticketTypes: [],
    sourceName: "Bilet.bg",
    sourceUrl: `https://www.bilet.bg/bg/events/${seed.slug}`,
    saleMode: "external",
    sourceOfficial: false,
    featured: FEATURED_SOURCE_IDS.has(seed.sourceId),
    bangerScore: FEATURED_SOURCE_IDS.has(seed.sourceId)
      ? 82 + (seed.sourceId % 17)
      : 35 + (seed.sourceId % 41),
  };
}

const FEATURED_STARTS_AT = "2026-09-29T20:00:00+03:00";
const FEATURED_IMAGE = "/events/deep-purple.webp";

const TICKETME_LIVE_STARTS_AT = "2027-02-27T19:30:00+02:00";
const TICKETME_LIVE_IMAGE = "/events/ticketme-live-2027.svg";

/**
 * First-party inventory used by the complete TicketMe checkout flow.
 *
 * Third-party discoveries below remain source-only: having an event in the
 * catalogue never grants TicketMe permission to sell it. Keeping first-party
 * commerce explicit also gives the inventory service a trustworthy capacity
 * source instead of inventing availability for scraped listings.
 */
export const PRIMARY_SALE_EVENT: CatalogEvent = {
  id: "ticketme-live-next-wave-2027",
  slug: "ticketme-live-next-wave-2027",
  title: "TicketMe Live: The Next Wave",
  name: "TicketMe Live: The Next Wave",
  tagline: "Нова българска музика, визуални изкуства и една незабравима вечер.",
  description:
    "TicketMe Live: The Next Wave е оригинално събитие на TicketMe, което събира изгряващи български артисти, аудио-визуални пърформанси и специални гости на една сцена. Всеки билет е персонален, издава се след потвърдено плащане и включва защитен QR код за еднократен вход.",
  category: "Concerts",
  city: "София",
  venue: "John Atanasoff Forum",
  address: "Sofia Tech Park, бул. „Цариградско шосе“ 111Г, София",
  startsAt: TICKETME_LIVE_STARTS_AT,
  date: formatEventDate(TICKETME_LIVE_STARTS_AT),
  time: formatEventTime(TICKETME_LIVE_STARTS_AT),
  priceFrom: 39,
  priceLabel: "от €39",
  priceAvailable: true,
  currency: EUR_CURRENCY,
  image: TICKETME_LIVE_IMAGE,
  heroImage: TICKETME_LIVE_IMAGE,
  ticketTypes: [
    {
      id: "fan",
      label: "Fan zone",
      price: 69,
      priceLabel: "€69",
      currency: EUR_CURRENCY,
      capacity: 150,
      accent: "#0ea5e9",
      description: "Зона пред сцената с ранен достъп до залата.",
    },
    {
      id: "standard",
      label: "Standard",
      price: 39,
      priceLabel: "€39",
      currency: EUR_CURRENCY,
      capacity: 900,
      accent: "#2457ff",
      description: "Пълен достъп до основната концертна зона.",
    },
    {
      id: "premium",
      label: "Premium",
      price: 109,
      priceLabel: "€109",
      currency: EUR_CURRENCY,
      capacity: 100,
      accent: "#8b5cf6",
      description: "Приоритетен вход, премиум зона и гардероб.",
    },
  ],
  sourceName: "TicketMe",
  sourceUrl:
    "https://www.ticketme.store/events/ticketme-live-next-wave-2027",
  saleMode: "internal",
  sourceOfficial: true,
  featured: true,
  bangerScore: 100,
};

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
  priceFrom: 0,
  priceLabel: "Източник",
  priceAvailable: false,
  currency: EUR_CURRENCY,
  image: FEATURED_IMAGE,
  heroImage: FEATURED_IMAGE,
  ticketTypes: [],
  sourceName: "Eventim",
  sourceUrl: "https://www.eventim.bg/en/artist/deep-purple/",
  saleMode: "external",
  sourceOfficial: true,
  featured: true,
  bangerScore: 100,
};

export const CATALOG_EVENTS: readonly CatalogEvent[] = [
  PRIMARY_SALE_EVENT,
  EVENT,
  ...EVENT_SEEDS.map(normalizeSeed),
];

const EVENTS_BY_ID = new Map(CATALOG_EVENTS.map((event) => [event.id, event]));
const EVENTS_BY_SLUG = new Map(
  CATALOG_EVENTS.map((event) => [event.slug, event]),
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

export function isEventUpcoming(
  event: Pick<CatalogEvent, "startsAt">,
  now = new Date(),
): boolean {
  const startsAt = Date.parse(event.startsAt);
  return Number.isFinite(startsAt) && startsAt > now.getTime();
}

export function isEventOpenForInternalSale(
  event: CatalogEvent,
  now = new Date(),
): boolean {
  return (
    event.saleMode === "internal" &&
    isEventUpcoming(event, now) &&
    event.ticketTypes.length > 0
  );
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
    ARCHIVED_TICKET_TYPES[typeId] ??
    ARCHIVED_TICKET_TYPES.standard
  );
}
