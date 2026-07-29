import {
  CATEGORY_LABELS,
  EVENT,
  type CatalogEvent,
  type EventCategory,
} from "@/lib/event";
import {
  DEFAULT_LOCALE,
  localizeHref,
  type Locale,
} from "@/lib/i18n-config";

const SOFIA_TIME_ZONE = "Europe/Sofia";

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
  return Number.isNaN(date.getTime())
    ? ""
    : dateFormatter(locale, { month: "short" })
        .format(date)
        .replace(".", "")
        .toLocaleUpperCase(locale === "en" ? "en-GB" : "bg-BG");
}

export function formatPrice(
  event: CatalogEvent,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (event.saleMode === "external") {
    return locale === "en" ? "Event source" : "Източник";
  }

  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "bg-BG", {
    style: "currency",
    currency: event.currency,
    minimumFractionDigits: 0,
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
    return `${event.title} takes place at ${event.venue}, ${localizeCity(event.city, locale)}. Dates and admission details are verified against the linked organizer source.`;
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
