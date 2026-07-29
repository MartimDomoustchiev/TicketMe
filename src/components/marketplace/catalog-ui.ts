import {
  CATEGORY_LABELS,
  EVENT,
  formatDualCurrencyPrice,
  type CatalogEvent,
  type EventCategory,
} from "@/lib/event";
import {
  DEFAULT_LOCALE,
  localizeHref,
  type Locale,
} from "@/lib/i18n-config";

const SOFIA_TIME_ZONE = "Europe/Sofia";
const MONTH_LABELS: Readonly<Record<Locale, readonly string[]>> = {
  bg: [
    "ЯНУ",
    "ФЕВ",
    "МАР",
    "АПР",
    "МАЙ",
    "ЮНИ",
    "ЮЛИ",
    "АВГ",
    "СЕП",
    "ОКТ",
    "НОЕ",
    "ДЕК",
  ],
  en: [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ],
};

const ENGLISH_CATEGORY_LABELS: Readonly<Record<EventCategory, string>> = {
  Concerts: "Concerts",
  Festivals: "Festivals",
  Theatre: "Theatre",
  Sports: "Sports",
  Culture: "Culture",
  Nightlife: "Nightlife",
  Business: "Business",
  Family: "Family",
};

const ENGLISH_CITIES: Readonly<Record<string, string>> = {
  България: "Bulgaria",
  Благоевград: "Blagoevgrad",
  Бургас: "Burgas",
  Варвара: "Varvara",
  Варна: "Varna",
  "Велико Търново": "Veliko Tarnovo",
  Враца: "Vratsa",
  Годеч: "Godech",
  Девин: "Devin",
  Дряново: "Dryanovo",
  Калояново: "Kaloyanovo",
  Лозенец: "Lozenets",
  "Местност Узана над Габрово": "Uzana area near Gabrovo",
  Несебър: "Nesebar",
  Плевен: "Pleven",
  Пловдив: "Plovdiv",
  Русе: "Ruse",
  "Свети Влас": "Sveti Vlas",
  Созопол: "Sozopol",
  София: "Sofia",
  "Стара Загора": "Stara Zagora",
  Царево: "Tsarevo",
  "село Круша": "Krusha village",
};

function dateFormatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    ...options,
    timeZone: SOFIA_TIME_ZONE,
  });
}

export function categoryLabel(
  category: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return locale === "en"
    ? (ENGLISH_CATEGORY_LABELS[category as EventCategory] ?? category)
    : (CATEGORY_LABELS[category as EventCategory] ?? category);
}

export function localizeCity(
  city: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return locale === "en" ? (ENGLISH_CITIES[city] ?? city) : city;
}

export function eventHref(
  event: CatalogEvent,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return localizeHref(
    locale,
    `/events/${encodeURIComponent(event.slug)}`,
  );
}

export function eventTimestamp(event: CatalogEvent): number {
  const timestamp = Date.parse(event.startsAt);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

export function formatEventDate(
  event: CatalogEvent,
  short = false,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) {
    return event.date;
  }

  return dateFormatter(locale, {
    day: short ? "2-digit" : "numeric",
    month: short ? "short" : "long",
    year: "numeric",
  }).format(date);
}

export function formatEventDay(
  event: CatalogEvent,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = new Date(event.startsAt);
  return Number.isNaN(date.getTime())
    ? event.date.slice(0, 2)
    : dateFormatter(locale, { day: "2-digit" }).format(date);
}

export function formatEventMonth(
  event: CatalogEvent,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const monthIndex = Number(
    new Intl.DateTimeFormat("en-CA", {
      month: "numeric",
      timeZone: SOFIA_TIME_ZONE,
    }).format(date),
  ) - 1;
  return MONTH_LABELS[locale][monthIndex] ?? "";
}

export function formatVenueLocation(
  event: Pick<CatalogEvent, "venue" | "city">,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const city = localizeCity(event.city, locale);
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase(locale === "en" ? "en-GB" : "bg-BG")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const venue = normalize(event.venue);
  const localizedCity = normalize(city);
  const originalCity = normalize(event.city);
  const englishCity = normalize(localizeCity(event.city, "en"));

  if (
    venue === localizedCity ||
    venue === originalCity ||
    venue === englishCity ||
    venue.endsWith(` ${localizedCity}`) ||
    venue.endsWith(` ${originalCity}`) ||
    venue.endsWith(` ${englishCity}`)
  ) {
    return event.venue;
  }

  return `${event.venue}, ${city}`;
}

export function externalSourceLabel(
  event: Pick<CatalogEvent, "sourceOfficial">,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (event.sourceOfficial) {
    return locale === "en"
      ? "Official event source"
      : "Официален източник";
  }
  return locale === "en" ? "Event source" : "Източник на събитието";
}

export function formatPrice(
  event: CatalogEvent,
  locale: Locale = DEFAULT_LOCALE,
  now = new Date(),
): string {
  if (event.saleMode === "external" && event.priceAvailable !== true) {
    return externalSourceLabel(event, locale);
  }

  return event.currency === "EUR"
    ? formatDualCurrencyPrice(event.priceFrom, locale, now)
    : new Intl.NumberFormat(locale === "en" ? "en-GB" : "bg-BG", {
        style: "currency",
        currency: event.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(event.priceFrom);
}

export function localizedEventTagline(
  event: CatalogEvent,
  locale: Locale,
): string {
  if (locale === "bg") return event.tagline;
  if (event.id === EVENT.id) {
    return "One of rock's most influential bands, live in Sofia.";
  }
  return `${categoryLabel(event.category, locale)} in ${localizeCity(event.city, locale)} · ${event.venue}`;
}

export function localizedEventDescription(
  event: CatalogEvent,
  locale: Locale,
): string {
  if (locale === "bg") return event.description;
  if (event.id === EVENT.id) {
    return "Deep Purple arrive at Arena 8888 Sofia for a full-scale live show featuring the songs that defined generations of rock music.";
  }
  if (event.saleMode === "external") {
    const source = event.sourceOfficial
      ? "official event source"
      : "linked event source";
    return `${event.title} takes place at ${formatVenueLocation(event, locale)}. Check the ${source} for current programme, admission and access details.`;
  }
  return `${event.title} comes to ${event.venue}, ${localizeCity(event.city, locale)}. Choose your ticket category and receive your e-ticket directly by email.`;
}

export function catalogSearchText(event: CatalogEvent): string {
  return [
    event.title,
    event.name,
    event.tagline,
    localizedEventTagline(event, "en"),
    event.category,
    categoryLabel(event.category, "bg"),
    categoryLabel(event.category, "en"),
    event.city,
    localizeCity(event.city, "en"),
    event.venue,
    event.address,
  ]
    .join(" ")
    .toLocaleLowerCase("bg-BG");
}
