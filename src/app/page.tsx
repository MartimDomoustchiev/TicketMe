import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  MapPin,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EventCard } from "@/components/marketplace/EventCard";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import {
  categoryLabel,
  eventHref,
  eventTimestamp,
  formatEventDate,
  formatPrice,
  localizedEventTagline,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import {
  EVENT_CATEGORIES,
  formatDualCurrencyPrice,
  getCategoryImage,
  isEventOpenForInternalSale,
  type EventCategory,
} from "@/lib/event";
import { listCatalogEvents } from "@/lib/catalog";
import { getEventVisual } from "@/lib/event-visual";
import { getLocale, localizeHref } from "@/lib/i18n";
import { getPublicAvailability } from "@/lib/public-availability";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [locale, catalogEvents] = await Promise.all([
    getLocale(),
    listCatalogEvents(),
  ]);
  const copy = HOME_COPY[locale];
  const popularEvents = catalogEvents.toSorted(
    (left, right) =>
      Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
      (right.bangerScore ?? 0) - (left.bangerScore ?? 0) ||
      eventTimestamp(left) - eventTimestamp(right),
  );
  const featuredEvents = popularEvents.slice(0, 8);
  const heroEvent = featuredEvents[0];
  const internalSale = heroEvent
    ? isEventOpenForInternalSale(heroEvent)
    : false;
  const availability =
    internalSale && heroEvent
      ? await getPublicAvailability(heroEvent.id)
      : null;
  const heroVisual = heroEvent ? getEventVisual(heroEvent) : null;
  const categoryCards = EVENT_CATEGORIES.map((category) => {
    const events = catalogEvents.filter(
      (event) => event.category === category,
    );
    return {
      category,
      count: events.length,
      image: events[0]?.image ?? getCategoryImage(category),
    };
  })
    .filter((item) => item.count > 0)
    .slice(0, 6);
  const sofiaEvents = catalogEvents
    .filter(
      (event) => event.city.toLocaleLowerCase("bg-BG") === "софия",
    )
    .toSorted(
      (left, right) => eventTimestamp(left) - eventTimestamp(right),
    )
    .slice(0, 4);
  const cityCount = new Set(catalogEvents.map((event) => event.city)).size;

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#f6f8fc] text-[#10172a]"
    >
      <MarketplaceHeader />

      {heroEvent ? (
      <section className="relative isolate overflow-hidden bg-[#10172a] text-white">
        <Image
          src={heroEvent.heroImage}
          alt=""
          fill
          preload
          sizes="100vw"
          className="-z-30 object-cover"
          style={{
            filter: heroVisual?.imageFilter,
            objectPosition: heroVisual?.objectPosition,
          }}
        />
        {heroVisual && (
          <div
            className="absolute inset-0 -z-20 opacity-75"
            style={{ background: heroVisual.overlay }}
          />
        )}
        <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(16,23,42,0.98)_0%,rgba(16,23,42,0.9)_43%,rgba(16,23,42,0.38)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_18%,rgba(36,87,255,0.28),transparent_30%),linear-gradient(0deg,rgba(16,23,42,0.65),transparent_45%)]" />

        <div className="mx-auto grid min-h-[650px] max-w-7xl items-end gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_370px] lg:py-16">
          <div className="max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-xs font-black uppercase tracking-[0.14em] text-blue-100 ring-1 ring-white/20 backdrop-blur">
              <Sparkles size={15} aria-hidden="true" />
              {copy.weeklyHighlight}
            </p>
            <h1 className="mt-6 text-5xl font-black leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[5.3rem]">
              {heroEvent.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
              {localizedEventTagline(heroEvent, locale)}
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <CalendarDays
                  size={18}
                  className="text-blue-300"
                  aria-hidden="true"
                />
                {formatEventDate(heroEvent, false, locale)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <MapPin
                  size={18}
                  className="text-blue-300"
                  aria-hidden="true"
                />
                {heroEvent.venue}, {localizeCity(heroEvent.city, locale)}
              </span>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {internalSale ? (
                <Link
                  href={
                    availability
                      ? `${eventHref(heroEvent, locale)}#tickets`
                      : eventHref(heroEvent, locale)
                  }
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white shadow-[0_14px_35px_rgba(36,87,255,0.35)] transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-300"
                >
                  {availability
                    ? copy.chooseTickets
                    : copy.moreInformation}
                  <ArrowRight size={19} aria-hidden="true" />
                </Link>
              ) : (
                <a
                  href={heroEvent.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white shadow-[0_14px_35px_rgba(36,87,255,0.35)] transition hover:-translate-y-0.5 hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-300"
                >
                  {heroEvent.sourceOfficial
                    ? copy.openOfficialPage
                    : copy.openSourcePage}
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
              )}
              {(availability || !internalSale) && (
                <Link
                  href={eventHref(heroEvent, locale)}
                  className="inline-flex h-13 items-center justify-center rounded-xl border border-white/25 bg-white/5 px-6 font-black text-white transition hover:bg-white/12"
                >
                  {copy.moreInformation}
                </Link>
              )}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/15 bg-white p-6 text-[#10172a] shadow-2xl shadow-black/25">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {internalSale
                    ? copy.ticketsFrom
                    : heroEvent.sourceOfficial
                      ? copy.officialListing
                      : copy.sourceListing}
                </p>
                <p className="mt-1 text-3xl font-black tracking-[-0.04em]">
                  {internalSale
                    ? formatPrice(heroEvent, locale)
                    : heroEvent.sourceName}
                </p>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#2457ff]">
                <Ticket size={23} aria-hidden="true" />
              </span>
            </div>

            <div className="my-5 h-px bg-slate-200" />
            {internalSale ? (
              <>
                <div className="grid gap-3">
                  {heroEvent.ticketTypes.map((type) => (
                    <div
                      key={type.id}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="inline-flex items-center gap-2 font-bold text-slate-600">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: type.accent }}
                        />
                        {type.label}
                      </span>
                      <span className="font-black text-slate-950">
                        {formatDualCurrencyPrice(type.price, locale)}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className={`mt-5 rounded-2xl p-4 ${
                    availability ? "bg-emerald-50" : "bg-amber-50"
                  }`}
                >
                  <p
                    className={`flex items-center gap-2 text-sm font-black ${
                      availability
                        ? "text-emerald-900"
                        : "text-amber-950"
                    }`}
                  >
                    {availability ? (
                      <Radio size={16} aria-hidden="true" />
                    ) : (
                      <CircleAlert size={16} aria-hidden="true" />
                    )}
                    {availability
                      ? copy.availableTickets(
                          availability.totalRemaining,
                        )
                      : copy.availabilityUnavailable}
                  </p>
                  <p
                    className={`mt-1 text-xs leading-5 ${
                      availability
                        ? "text-emerald-800"
                        : "text-amber-800"
                    }`}
                  >
                    {availability
                      ? copy.liveAvailability
                      : copy.availabilityUnavailableText}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-2xl bg-blue-50 p-4 text-blue-950">
                  <p className="flex items-center gap-2 text-sm font-black">
                    <ShieldCheck size={17} aria-hidden="true" />
                    {heroEvent.sourceOfficial
                      ? copy.sourceVerified
                      : copy.sourceAttributed}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-800">
                    {copy.externalAvailability}
                  </p>
                </div>
                <a
                  href={heroEvent.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#10172a] px-5 text-sm font-black text-white transition hover:bg-[#2457ff]"
                >
                  {heroEvent.sourceOfficial
                    ? copy.openOfficialPage
                    : copy.openSourcePage}
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </>
            )}
          </aside>
        </div>
      </section>
      ) : (
        <section className="relative overflow-hidden bg-[#10172a] px-4 py-24 text-white sm:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(36,87,255,0.4),transparent_32%),radial-gradient(circle_at_14%_90%,rgba(255,107,53,0.2),transparent_28%)]" />
          <div className="relative mx-auto max-w-7xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">
              TicketMe
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[1.02] tracking-[-0.05em] sm:text-7xl">
              {copy.emptyHeroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              {copy.emptyHeroText}
            </p>
            <Link
              href={localizeHref(locale, "/events")}
              className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white transition hover:bg-blue-700"
            >
              {copy.browseCalendar}
              <ArrowRight size={19} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="relative z-10 -mt-6 px-4">
        <form
          action={localizeHref(locale, "/events")}
          method="get"
          role="search"
          className="mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_55px_rgba(15,23,42,0.16)] sm:flex-row"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <Search
              size={20}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder={copy.searchPlaceholder}
              className="h-13 w-full rounded-xl bg-slate-50 pl-12 pr-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#10172a] px-7 text-sm font-black text-white transition hover:bg-[#2457ff] focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            <Search size={18} aria-hidden="true" />
            {copy.findEvent}
          </button>
        </form>
      </section>

      <section className="px-4 pb-12 pt-14 sm:pb-16 sm:pt-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2457ff]">
                {copy.popularNow}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                {copy.upcomingEvents}
              </h2>
            </div>
            <Link
              href={localizeHref(locale, "/events")}
              className="inline-flex items-center gap-2 text-sm font-black text-[#2457ff] transition hover:text-blue-800"
            >
              {copy.viewAll} {catalogEvents.length}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {featuredEvents.map((event, index) => (
              <EventCard
                key={event.id}
                event={event}
                priority={index < 4}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2457ff]">
                {copy.browseByInterest}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                {copy.categories}
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-500">
              {copy.categoryDescription}
            </p>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryCards.map((item) => (
              <CategoryCard
                key={item.category}
                category={item.category}
                count={item.count}
                image={item.image}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </section>

      {sofiaEvents.length > 0 && (
        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#2457ff]">
                  <MapPin size={15} aria-hidden="true" />
                  {localizeCity("София", locale)}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  {copy.soonInCity}
                </h2>
              </div>
              <Link
                href={localizeHref(
                  locale,
                  "/events?city=%D0%A1%D0%BE%D1%84%D0%B8%D1%8F",
                )}
                className="inline-flex items-center gap-2 text-sm font-black text-[#2457ff] transition hover:text-blue-800"
              >
                {copy.allEventsInSofia}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {sofiaEvents.map((event) => (
                <EventCard key={event.id} event={event} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-[#10172a] px-4 py-12 text-white sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">
              {copy.confidenceEyebrow}
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              {copy.confidenceTitle}
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              {copy.confidenceText}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TrustCard
              icon={<ShieldCheck size={21} />}
              title={copy.secureRequest}
              text={copy.secureRequestText}
            />
            <TrustCard
              icon={<CircleAlert size={21} />}
              title={copy.fairQueue}
              text={copy.fairQueueText}
            />
            <TrustCard
              icon={<CalendarDays size={21} />}
              title={copy.emailDelivery}
              text={copy.emailDeliveryText}
            />
            <TrustCard
              icon={<Ticket size={21} />}
              title={copy.liveInventory}
              text={copy.liveInventoryText}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white px-4 py-8">
        <div className="mx-auto grid max-w-7xl gap-4 text-center sm:grid-cols-3">
          <Stat
            value={`${catalogEvents.length}+`}
            label={copy.eventsStat}
          />
          <Stat value={`${cityCount}`} label={copy.citiesStat} />
          <Stat value="24/7" label={copy.accessStat} />
        </div>
      </section>

      <MarketplaceFooter />
    </main>
  );
}

function CategoryCard({
  category,
  count,
  image,
  locale,
}: {
  category: EventCategory;
  count: number;
  image: string;
  locale: "bg" | "en";
}) {
  const english = locale === "en";

  return (
    <Link
      href={localizeHref(locale, `/events?category=${category}`)}
      className="group relative isolate min-h-52 overflow-hidden rounded-2xl bg-slate-900 p-6 text-white outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
    >
      <Image
        src={image}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="-z-20 object-cover transition duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/10 transition group-hover:via-slate-950/45" />
      <div className="flex h-full min-h-40 flex-col justify-end">
        <p className="text-2xl font-black tracking-[-0.03em]">
          {categoryLabel(category, locale)}
        </p>
        <p className="mt-1 flex items-center justify-between gap-3 text-sm font-bold text-slate-200">
          {count}{" "}
          {english ? (count === 1 ? "event" : "events") : count === 1 ? "събитие" : "събития"}
          <ArrowRight
            size={18}
            className="transition group-hover:translate-x-1"
            aria-hidden="true"
          />
        </p>
      </div>
    </Link>
  );
}

const HOME_COPY = {
  bg: {
    weeklyHighlight: "Акцент на седмицата",
    chooseTickets: "Избери билети",
    moreInformation: "Повече информация",
    ticketsFrom: "Билети от",
    officialListing: "Официален източник",
    sourceListing: "Източник на събитието",
    sourceVerified: "Данните са свързани с официалния източник",
    sourceAttributed: "Обявата е свързана с посочения източник",
    externalAvailability:
      "Актуалните цени, наличност и условия се потвърждават на страницата на организатора.",
    openOfficialPage: "Към официалната страница",
    openSourcePage: "Към източника",
    availableTickets: (count: number) => `${count} билета са налични`,
    liveAvailability:
      "Наличността се актуализира в реално време при избор на билет.",
    availabilityUnavailable: "Проверяваме наличността",
    availabilityUnavailableText:
      "Разглеждането работи, но продажбата е временно поставена на пауза.",
    searchPlaceholder: "Търси събитие, артист или място",
    findEvent: "Намери събитие",
    popularNow: "Популярно сега",
    upcomingEvents: "Предстоящи събития",
    viewAll: "Виж всички",
    browseByInterest: "Разгледай по интереси",
    categories: "Категории",
    categoryDescription:
      "От големи концерти до семейни спектакли — открий точното преживяване за своя календар.",
    soonInCity: "Скоро в града",
    allEventsInSofia: "Всички събития в София",
    emptyHeroTitle: "Следващото голямо събитие започва тук",
    emptyHeroText:
      "Календарът се обновява с нови дати от разрешени източници. Разгледай категориите или се върни скоро.",
    browseCalendar: "Разгледай календара",
    confidenceEyebrow: "Прозрачност по дизайн",
    confidenceTitle: "Знаеш откъде идва всяка обява",
    confidenceText:
      "TicketMe различава ясно външните listings от събитията, продавани директно в платформата.",
    secureRequest: "Ясно посочен източник",
    secureRequestText:
      "Всяка външна обява води до атрибутирания източник на събитието.",
    fairQueue: "Без измислена наличност",
    fairQueueText:
      "Цена и свободни места се показват само когато идват от проверим source.",
    emailDelivery: "Само бъдещи дати",
    emailDeliveryText:
      "Изтеклите събития автоматично отпадат от каталога и директните страници.",
    liveInventory: "Защитена директна продажба",
    liveInventoryText:
      "Checkout, опашка и PDF билет се активират само за одобрен organizer inventory.",
    eventsStat: "предстоящи събития",
    citiesStat: "града в календара",
    accessStat: "достъп до твоите билети",
  },
  en: {
    weeklyHighlight: "Highlight of the week",
    chooseTickets: "Choose tickets",
    moreInformation: "More information",
    ticketsFrom: "Tickets from",
    officialListing: "Official source",
    sourceListing: "Event source",
    sourceVerified: "Details are linked to the official source",
    sourceAttributed: "The listing is linked to its attributed source",
    externalAvailability:
      "Current prices, availability and conditions are confirmed on the organizer’s page.",
    openOfficialPage: "Open official page",
    openSourcePage: "Open event source",
    availableTickets: (count: number) =>
      `${count} ${count === 1 ? "ticket is" : "tickets are"} available`,
    liveAvailability:
      "Availability updates in real time while customers choose tickets.",
    availabilityUnavailable: "Checking live availability",
    availabilityUnavailableText:
      "Browsing remains available while ticket sales are temporarily paused.",
    searchPlaceholder: "Search by event, artist or venue",
    findEvent: "Find an event",
    popularNow: "Popular right now",
    upcomingEvents: "Upcoming events",
    viewAll: "View all",
    browseByInterest: "Browse by interest",
    categories: "Categories",
    categoryDescription:
      "From major concerts to family shows — find the right experience for your calendar.",
    soonInCity: "Coming to the city",
    allEventsInSofia: "All events in Sofia",
    emptyHeroTitle: "Your next standout event starts here",
    emptyHeroText:
      "The calendar is refreshing with new dates from authorized sources. Browse the categories or check back soon.",
    browseCalendar: "Browse the calendar",
    confidenceEyebrow: "Transparency by design",
    confidenceTitle: "Know where every listing comes from",
    confidenceText:
      "TicketMe clearly separates external discovery listings from events sold directly on the platform.",
    secureRequest: "Clearly attributed sources",
    secureRequestText:
      "Every external listing links to its attributed event source.",
    fairQueue: "No invented availability",
    fairQueueText:
      "Prices and remaining tickets appear only when backed by a verifiable source.",
    emailDelivery: "Future dates only",
    emailDeliveryText:
      "Expired events automatically leave the catalogue and direct pages.",
    liveInventory: "Protected direct sales",
    liveInventoryText:
      "Checkout, fair allocation and PDF tickets activate only for approved organizer inventory.",
    eventsStat: "upcoming events",
    citiesStat: "cities in the calendar",
    accessStat: "access to your tickets",
  },
} as const;

function TrustCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
        {icon}
      </span>
      <p className="mt-4 font-black">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-5 py-6">
      <p className="text-3xl font-black tracking-[-0.04em] text-[#2457ff]">
        {value}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-500">{label}</p>
    </div>
  );
}
