import {
  ArrowRight,
  CalendarRange,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/marketplace/EventCard";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { Pagination } from "@/components/marketplace/Pagination";
import {
  catalogSearchText,
  categoryLabel,
  eventTimestamp,
  localizedEventTitle,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import { listCatalogEvents } from "@/lib/catalog";
import type { CatalogEvent } from "@/lib/event";
import { getLocale, localizeHref, type Locale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title =
    locale === "en"
      ? "Events in Bulgaria"
      : "Събития в България";
  const description =
    locale === "en"
      ? "Discover concerts, festivals, theatre, sports and cultural events across Bulgaria."
      : "Открий концерти, фестивали, театър, спорт и културни събития в цяла България.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: "/events/festivals.webp",
          width: 1600,
          height: 1001,
          alt: title,
        },
      ],
    },
  };
}

const PAGE_SIZE = 24;

type SearchParams = {
  q?: string | string[];
  category?: string | string[];
  city?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

type SortOption = "date" | "price-asc" | "price-desc" | "name";

const SORT_OPTIONS: readonly SortOption[] = [
  "date",
  "price-asc",
  "price-desc",
  "name",
];

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function categoryHref(input: {
  category: string;
  q: string;
  city: string;
  sort: SortOption;
  locale: Locale;
}): string {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.category) params.set("category", input.category);
  if (input.city) params.set("city", input.city);
  if (input.sort !== "date") params.set("sort", input.sort);
  const query = params.toString();
  return localizeHref(
    input.locale,
    query ? `/events?${query}` : "/events",
  );
}

function sortEvents(
  events: CatalogEvent[],
  sort: SortOption,
  locale: Locale,
): CatalogEvent[] {
  return events.sort((left, right) => {
    if (sort === "price-asc" || sort === "price-desc") {
      if (left.priceAvailable !== right.priceAvailable) {
        return left.priceAvailable ? -1 : 1;
      }
      if (left.priceAvailable && right.priceAvailable) {
        return sort === "price-asc"
          ? left.priceFrom - right.priceFrom
          : right.priceFrom - left.priceFrom;
      }
      return eventTimestamp(left) - eventTimestamp(right);
    }
    if (sort === "name") {
      return localizedEventTitle(left, locale).localeCompare(
        localizedEventTitle(right, locale),
        locale === "en" ? "en-GB" : "bg-BG",
      );
    }
    return eventTimestamp(left) - eventTimestamp(right);
  });
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [raw, locale, catalogEvents] = await Promise.all([
    searchParams,
    getLocale(),
    listCatalogEvents(),
  ]);
  const copy = EVENTS_COPY[locale];
  const hasPricedEvents = catalogEvents.some(
    (event) => event.priceAvailable === true,
  );
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "date", label: copy.soonest },
    ...(hasPricedEvents
      ? [
          {
            value: "price-asc" as const,
            label: copy.priceAscending,
          },
          {
            value: "price-desc" as const,
            label: copy.priceDescending,
          },
        ]
      : []),
    { value: "name", label: copy.nameSort },
  ];
  const query = firstValue(raw.q).trim().slice(0, 100);
  const requestedCategory = firstValue(raw.category);
  const requestedCity = firstValue(raw.city);
  const requestedSort = firstValue(raw.sort);
  const requestedPage = Number.parseInt(firstValue(raw.page), 10);

  const categories = Array.from(
    new Set(catalogEvents.map((event) => event.category)),
  ).sort((left, right) =>
    categoryLabel(left, locale).localeCompare(
      categoryLabel(right, locale),
      locale === "en" ? "en-GB" : "bg-BG",
    ),
  );
  const cities = Array.from(
    new Set(catalogEvents.map((event) => event.city)),
  ).sort((left, right) =>
    localizeCity(left, locale).localeCompare(
      localizeCity(right, locale),
      locale === "en" ? "en-GB" : "bg-BG",
    ),
  );

  const category = categories.includes(
    requestedCategory as CatalogEvent["category"],
  )
    ? requestedCategory
    : "";
  const city = cities.includes(requestedCity) ? requestedCity : "";
  const sort =
    SORT_OPTIONS.includes(requestedSort as SortOption) &&
    (hasPricedEvents || !requestedSort.startsWith("price-"))
    ? (requestedSort as SortOption)
    : "date";
  const normalizedQuery = query.toLocaleLowerCase(
    locale === "en" ? "en-GB" : "bg-BG",
  );

  const filteredEvents = sortEvents(
    catalogEvents.filter((event) => {
      if (category && event.category !== category) return false;
      if (city && event.city !== city) return false;
      if (normalizedQuery && !catalogSearchText(event).includes(normalizedQuery)) {
        return false;
      }
      return true;
    }),
    sort,
    locale,
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const currentPage = Math.min(
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const firstResult = (currentPage - 1) * PAGE_SIZE;
  const visibleEvents = filteredEvents.slice(
    firstResult,
    firstResult + PAGE_SIZE,
  );

  const paginationQuery: Record<string, string> = {};
  if (query) paginationQuery.q = query;
  if (category) paginationQuery.category = category;
  if (city) paginationQuery.city = city;
  if (sort !== "date") paginationQuery.sort = sort;

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#f6f8fc] text-[#10172a]"
    >
      <MarketplaceHeader query={query} />

      <section className="relative overflow-hidden bg-[#10172a] px-4 py-12 text-white sm:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(36,87,255,0.4),transparent_28%),radial-gradient(circle_at_10%_90%,rgba(255,107,53,0.16),transparent_26%)]" />
        <div className="relative mx-auto max-w-7xl">
          <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-blue-300">
            <Sparkles size={16} aria-hidden="true" />
            {copy.calendar}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] sm:text-6xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            {copy.heroDescription}
          </p>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white px-4">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto py-4">
          <Link
            href={categoryHref({
              category: "",
              q: query,
              city,
              sort,
              locale,
            })}
            aria-current={!category ? "page" : undefined}
            className={`inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-sm font-black transition ${
              !category
                ? "bg-[#2457ff] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#2457ff]"
            }`}
          >
            {copy.all}
          </Link>
          {categories.map((item) => (
            <Link
              key={item}
              href={categoryHref({
                category: item,
                q: query,
                city,
                sort,
                locale,
              })}
              aria-current={category === item ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-sm font-black transition ${
                category === item
                  ? "bg-[#2457ff] text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#2457ff]"
              }`}
            >
              {categoryLabel(item, locale)}
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <form
            action={localizeHref(locale, "/events")}
            method="get"
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_35px_rgba(15,23,42,0.06)] md:grid-cols-[minmax(220px,1fr)_190px_180px_200px_auto]"
          >
            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
              {copy.search}
              <span className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                  aria-hidden="true"
                />
                <input
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder={copy.searchPlaceholder}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                />
              </span>
            </label>

            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
              {copy.category}
              <select
                name="category"
                defaultValue={category}
                className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
              >
                <option value="">{copy.allCategories}</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabel(item, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
              {copy.city}
              <select
                name="city"
                defaultValue={city}
                className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
              >
                <option value="">{copy.allBulgaria}</option>
                {cities.map((item) => (
                  <option key={item} value={item}>
                    {localizeCity(item, locale)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
              {copy.sort}
              <select
                name="sort"
                defaultValue={sort}
                className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-5 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              {copy.show}
            </button>
          </form>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold text-[#2457ff]">
                <CalendarRange size={17} aria-hidden="true" />
                {filteredEvents.length}{" "}
                {locale === "en"
                  ? filteredEvents.length === 1
                    ? "event"
                    : "events"
                  : filteredEvents.length === 1
                    ? "събитие"
                    : "събития"}
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                {query
                  ? `${copy.resultsFor} “${query}”`
                  : category
                    ? categoryLabel(category, locale)
                    : copy.upcomingEvents}
              </h2>
            </div>
            {(query || category || city || sort !== "date") && (
              <Link
                href={localizeHref(locale, "/events")}
                className="text-sm font-black text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-[#2457ff]"
              >
                {copy.clearFilters}
              </Link>
            )}
          </div>

          {visibleEvents.length > 0 ? (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleEvents.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    priority={currentPage === 1 && index < 4}
                    locale={locale}
                  />
                ))}
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                query={paginationQuery}
                locale={locale}
              />
            </>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2457ff]">
                <Search size={25} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-2xl font-black">
                {copy.noResults}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {copy.noResultsText}
              </p>
              <Link
                href={localizeHref(locale, "/events")}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#10172a] px-5 text-sm font-black text-white transition hover:bg-[#2457ff]"
              >
                {copy.viewAllEvents}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>

      <MarketplaceFooter />
    </main>
  );
}

const EVENTS_COPY = {
  bg: {
    soonest: "Най-скоро",
    priceAscending: "Цена: възходящо",
    priceDescending: "Цена: низходящо",
    nameSort: "Име: А–Я",
    calendar: "Календар на събитията",
    heroTitle: "Открий следващото си незабравимо преживяване",
    heroDescription:
      "Концерти, фестивали, театър, спорт и култура на едно място. Избери събитие и вземи билета си за минути.",
    all: "Всички",
    search: "Търсене",
    searchPlaceholder: "Артист, събитие, зала",
    category: "Категория",
    allCategories: "Всички категории",
    city: "Град",
    allBulgaria: "Цяла България",
    sort: "Подреди",
    show: "Покажи",
    resultsFor: "Резултати за",
    upcomingEvents: "Предстоящи събития",
    clearFilters: "Изчисти филтрите",
    noResults: "Няма събития по тези критерии",
    noResultsText:
      "Промени търсенето или изчисти филтрите, за да разгледаш целия календар.",
    viewAllEvents: "Виж всички събития",
  },
  en: {
    soonest: "Soonest",
    priceAscending: "Price: low to high",
    priceDescending: "Price: high to low",
    nameSort: "Name: A–Z",
    calendar: "Event calendar",
    heroTitle: "Discover your next unforgettable experience",
    heroDescription:
      "Concerts, festivals, theatre, sports and culture in one place. Choose an event and get your ticket in minutes.",
    all: "All",
    search: "Search",
    searchPlaceholder: "Artist, event or venue",
    category: "Category",
    allCategories: "All categories",
    city: "City",
    allBulgaria: "All of Bulgaria",
    sort: "Sort by",
    show: "Show",
    resultsFor: "Results for",
    upcomingEvents: "Upcoming events",
    clearFilters: "Clear filters",
    noResults: "No events match these filters",
    noResultsText:
      "Change your search or clear the filters to browse the complete calendar.",
    viewAllEvents: "View all events",
  },
} as const;
