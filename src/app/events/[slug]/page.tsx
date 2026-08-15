import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  ExternalLink,
  MailCheck,
  MapPin,
  QrCode,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketDesk } from "@/components/TicketDesk";
import { EventCard } from "@/components/marketplace/EventCard";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { EventPurchasePanel } from "@/components/ticketing/EventPurchasePanel";
import { LiveTicketingProvider } from "@/components/ticketing/LiveTicketingProvider";
import {
  categoryLabel,
  formatEventDate,
  formatVenueLocation,
  localizedEventDescription,
  localizedEventTagline,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import { getBuyerSession } from "@/lib/auth";
import {
  findCatalogEventBySlug,
  listRelatedCatalogEvents,
} from "@/lib/catalog";
import {
  isEventOpenForInternalSale,
  isTestSimulationEvent,
} from "@/lib/event";
import { getLocale, localizeHref } from "@/lib/i18n";
import {
  getPublicAvailability,
  getPublicPurchaseActivity,
} from "@/lib/public-availability";
import { getBaseUrl } from "@/lib/site";
import { getStripePublishableKey, stripeMode } from "@/lib/stripe";
import { getEventVisual } from "@/lib/event-visual";

export const dynamic = "force-dynamic";

type EventPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const event = await findCatalogEventBySlug(slug);

  if (!event) {
    return {
      title: locale === "en" ? "Event not found" : "Събитието не е намерено",
    };
  }

  const ticketLabel = locale === "en" ? "tickets" : "билети";

  return {
    title: `${event.title} — ${ticketLabel}`,
    description: localizedEventDescription(event, locale),
    openGraph: {
      title: `${event.title} — ${ticketLabel}`,
      description: localizedEventTagline(event, locale),
      type: "website",
      images: [{ url: event.image, alt: event.title }],
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = await findCatalogEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const checkoutEnabled = isEventOpenForInternalSale(event);
  const testSimulation = isTestSimulationEvent(event);
  const visual = getEventVisual(event);
  const [
    availability,
    purchaseActivity,
    buyerSession,
    locale,
    relatedEvents,
  ] = await Promise.all([
    checkoutEnabled
      ? getPublicAvailability(event.id)
      : Promise.resolve(null),
    checkoutEnabled
      ? getPublicPurchaseActivity(event.id)
      : Promise.resolve({ queueDepth: 0, activeCheckouts: 0 }),
    checkoutEnabled
      ? getBuyerSession().catch(() => null)
      : Promise.resolve(null),
    getLocale(),
    listRelatedCatalogEvents(event),
  ]);
  const copy = EVENT_COPY[locale];

  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: localizedEventDescription(event, locale),
    image: [new URL(event.heroImage, getBaseUrl()).toString()],
    startDate: event.startsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        streetAddress:
          locale === "en"
            ? `${event.venue}, ${localizeCity(event.city, locale)}`
            : event.address,
        addressLocality: localizeCity(event.city, locale),
        addressCountry: "BG",
      },
    },
    ...(checkoutEnabled && !testSimulation
      ? availability
        ? {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: event.currency,
              lowPrice: event.priceFrom,
              availability:
                availability.totalRemaining > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/SoldOut",
            },
          }
        : {}
      : { url: event.sourceUrl }),
  };

  return (
    <LiveTicketingProvider
      eventId={checkoutEnabled && availability ? event.id : null}
      initialAvailability={availability}
      initialActivity={purchaseActivity}
    >
      <main
        id="main-content"
        className="min-h-screen bg-[#f6f8fc] text-[#10172a]"
      >
      <MarketplaceHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(eventSchema).replace(/</g, "\\u003c"),
        }}
      />

      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <nav
          aria-label={copy.navigation}
          className="mx-auto flex max-w-7xl items-center gap-2 overflow-hidden text-sm font-semibold text-slate-500"
        >
          <Link
            href={localizeHref(locale, "/")}
            className="shrink-0 transition hover:text-[#2457ff]"
          >
            {copy.home}
          </Link>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
          <Link
            href={localizeHref(
              locale,
              `/events?category=${event.category}`,
            )}
            className="shrink-0 transition hover:text-[#2457ff]"
          >
            {categoryLabel(event.category, locale)}
          </Link>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate font-bold text-slate-800">{event.title}</span>
        </nav>
      </section>

      <section className="relative isolate overflow-hidden bg-[#10172a] text-white">
        <Image
          src={event.heroImage}
          alt=""
          fill
          preload
          sizes="100vw"
          className="-z-20 object-cover"
          style={{
            filter: visual.imageFilter,
            objectPosition: visual.objectPosition,
          }}
        />
        <div
          className="absolute inset-0 -z-10 opacity-75"
          style={{ background: visual.overlay }}
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(16,23,42,0.98)_0%,rgba(16,23,42,0.88)_43%,rgba(16,23,42,0.38)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#10172a] via-transparent to-[#10172a]/20" />

        <div className="mx-auto grid min-h-[580px] max-w-7xl items-end gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-14">
          <div className="max-w-4xl">
            <Link
              href={localizeHref(locale, "/events")}
              className="inline-flex items-center gap-2 text-sm font-bold text-white/70 transition hover:text-white"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {copy.allEvents}
            </Link>
            <span className="mt-8 block w-fit rounded-lg bg-white/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-blue-100 ring-1 ring-white/15 backdrop-blur">
              {categoryLabel(event.category, locale)}
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              {event.title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-slate-200">
              {localizedEventTagline(event, locale)}
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <CalendarDays
                  size={18}
                  className="text-blue-300"
                  aria-hidden="true"
                />
                <time dateTime={event.startsAt}>
                  {formatEventDate(event, false, locale)}
                </time>
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <Clock3
                  size={18}
                  className="text-blue-300"
                  aria-hidden="true"
                />
                {event.time} {copy.hourSuffix}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <MapPin
                  size={18}
                  className="text-blue-300"
                  aria-hidden="true"
                />
                {formatVenueLocation(event, locale)}
              </span>
            </div>
          </div>

          <EventPurchasePanel
            event={event}
            checkoutEnabled={checkoutEnabled}
            availabilityAvailable={availability !== null}
            locale={locale}
          />
        </div>
      </section>

      {checkoutEnabled && (
        <section className="border-b border-slate-200 bg-white px-4">
          <div className="mx-auto grid max-w-7xl gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <TrustPoint
              icon={<ShieldCheck size={21} />}
              title={testSimulation ? copy.testPayment : copy.securePurchase}
              description={
                testSimulation
                  ? copy.testPaymentText
                  : copy.securePurchaseText
              }
            />
            <TrustPoint
              icon={<Users size={21} />}
              title={
                testSimulation ? copy.testInventory : copy.fairQueue
              }
              description={
                testSimulation
                  ? copy.testInventoryText
                  : copy.fairQueueText
              }
            />
            <TrustPoint
              icon={<MailCheck size={21} />}
              title={copy.emailTicket}
              description={copy.emailTicketText}
            />
            <TrustPoint
              icon={<QrCode size={21} />}
              title={testSimulation ? copy.notValidForEntry : copy.qrEntry}
              description={
                testSimulation
                  ? copy.notValidForEntryText
                  : copy.qrEntryText
              }
            />
          </div>
        </section>
      )}

      <section className="px-4 py-12 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2457ff]">
              {copy.aboutEvent}
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em]">
              {event.title}
            </h2>
            <p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-600">
              {localizedEventDescription(event, locale)}
            </p>
          </article>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">{copy.venueAndTime}</h2>
            <dl className="mt-5 grid gap-5">
              <DetailRow
                icon={<CalendarDays size={19} />}
                label={copy.date}
                value={formatEventDate(event, false, locale)}
              />
              <DetailRow
                icon={<Clock3 size={19} />}
                label={copy.start}
                value={`${event.time} ${copy.hourSuffix}`}
              />
              <DetailRow
                icon={<MapPin size={19} />}
                label={event.venue}
                value={
                  locale === "en"
                    ? formatVenueLocation(event, locale)
                    : event.address
                }
              />
            </dl>
          </aside>
        </div>
      </section>

      {checkoutEnabled ? (
        <section className="border-y border-slate-200 bg-white px-4 py-12 sm:py-16">
          {availability ? (
            <div className="mx-auto max-w-7xl">
              <TicketDesk
                event={event}
                initialAvailability={availability}
                initialSession={buyerSession}
                paymentMode={stripeMode()}
                stripePublishableKey={getStripePublishableKey()}
                locale={locale}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
              <ShieldCheck
                className="mx-auto text-amber-700"
                size={32}
                aria-hidden="true"
              />
              <h2 className="mt-4 text-2xl font-black">
                {copy.salesPausedTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600">
                {copy.salesPausedDescription}
              </p>
              <Link
                href={localizeHref(locale, "/events")}
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#10172a] px-6 font-black text-white transition hover:bg-[#2457ff]"
              >
                {copy.backToEvents}
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </div>
          )}
          {event.saleMode === "external" && (
            <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">
                  {copy.sourceAttribution}
                </p>
                <h2 className="mt-2 text-xl font-black text-slate-950">
                  {event.sourceName}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  {copy.sourceAttributionText}
                </p>
              </div>
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-5 text-sm font-black text-[#2457ff] transition hover:bg-blue-100"
              >
                {copy.openOfficialPage}
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          )}
        </section>
      ) : (
        <section className="border-y border-slate-200 bg-white px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl rounded-3xl border border-blue-200 bg-blue-50 p-6 text-center sm:p-8">
            <ShieldCheck
              className="mx-auto text-[#2457ff]"
              size={32}
              aria-hidden="true"
            />
            <h2 className="mt-4 text-2xl font-black">
              {event.sourceOfficial
                ? copy.officialEventTitle
                : copy.externalEventTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600">
              {event.sourceOfficial
                ? copy.officialEventDescription
                : copy.externalEventDescription}
            </p>
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white transition hover:bg-blue-700"
            >
              {copy.openOfficialPage}
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>
      )}

      {relatedEvents.length > 0 && (
        <section className="px-4 py-14 sm:py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2457ff]">
                  {copy.moreIdeas}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">
                  {copy.relatedEvents}
                </h2>
              </div>
              <Link
                href={localizeHref(
                  locale,
                  `/events?category=${event.category}`,
                )}
                className="inline-flex items-center gap-1 text-sm font-black text-[#2457ff] transition hover:text-blue-800"
              >
                {copy.viewAll}
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {relatedEvents.map((relatedEvent) => (
                <EventCard
                  key={relatedEvent.id}
                  event={relatedEvent}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <MarketplaceFooter />
      </main>
    </LiveTicketingProvider>
  );
}

function TrustPoint({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 bg-white px-5 py-5">
      <span className="mt-0.5 text-[#2457ff]">{icon}</span>
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-[#2457ff]">{icon}</span>
      <div>
        <dt className="font-black">{label}</dt>
        <dd className="mt-1 text-sm leading-6 text-slate-500">{value}</dd>
      </div>
    </div>
  );
}

const EVENT_COPY = {
  bg: {
    navigation: "Навигация",
    home: "Начало",
    allEvents: "Всички събития",
    hourSuffix: "ч.",
    ticketsFrom: "Билети от",
    availability: "Наличност",
    source: "Източник",
    ticketsAvailable: (count: number) => `${count} билета`,
    soldOut: "Изчерпано",
    availabilityUnavailable: "Временно недостъпна",
    chooseTickets: "Избери билети",
    backToEvents: "Разгледай събитията",
    openOfficialPage: "Отвори източника",
    secureVerified: "Сигурна заявка и потвърден имейл",
    officialSourceLinked: "Официален източник на събитието",
    sourceLinked: "Данните са свързани с посочения източник",
    officialEventTitle: "Цени и билети от официалния източник",
    officialEventDescription:
      "Tiketko показва това събитие за откриване и не продава билети за него. Проверете актуалните цени, наличност и условия в официалния източник.",
    externalEventTitle: "Цени и билети от източника на събитието",
    externalEventDescription:
      "Tiketko показва това събитие за откриване и не продава билети за него. Проверете актуалните цени, наличност и условия в посочения външен източник.",
    salesPausedTitle: "Продажбата е временно поставена на пауза",
    salesPausedDescription:
      "Пазим системата честна и не приемаме поръчки, докато не можем да потвърдим наличността. Опитай отново след малко.",
    securePurchase: "Защитена покупка",
    securePurchaseText: "Надеждна обработка на всяка заявка",
    testPayment: "Stripe test плащане",
    testPaymentText: "Не се таксуват реални средства",
    fairQueue: "Честна опашка",
    fairQueueText: "Заявките се обработват по ред",
    testInventory: "Симулационна наличност",
    testInventoryText: "Tiketko тестови бройки, не официални места",
    emailTicket: "Билет по имейл",
    emailTicketText: "PDF файл веднага след покупката",
    qrEntry: "QR вход",
    qrEntryText: "Бърза проверка на място",
    notValidForEntry: "Не важи за вход",
    notValidForEntryText: "Тестовият PDF демонстрира издаването на билет",
    sourceAttribution: "Източник на информацията за събитието",
    sourceAttributionText:
      "Програмата, мястото и датата са атрибутирани към посочения външен източник. Tiketko Stripe test плащането е отделна симулация и не купува билет от организатора.",
    aboutEvent: "За събитието",
    venueAndTime: "Място и час",
    date: "Дата",
    start: "Начало",
    moreIdeas: "Още идеи",
    relatedEvents: "Подобни събития",
    viewAll: "Виж всички",
  },
  en: {
    navigation: "Breadcrumb",
    home: "Home",
    allEvents: "All events",
    hourSuffix: "",
    ticketsFrom: "Tickets from",
    availability: "Availability",
    source: "Source",
    ticketsAvailable: (count: number) =>
      `${count} ${count === 1 ? "ticket" : "tickets"}`,
    soldOut: "Sold out",
    availabilityUnavailable: "Temporarily unavailable",
    chooseTickets: "Choose tickets",
    backToEvents: "Browse events",
    openOfficialPage: "Open event source",
    secureVerified: "Secure booking and verified email",
    officialSourceLinked: "Official event source",
    sourceLinked: "Details are linked to the attributed source",
    officialEventTitle: "Prices and tickets from the official source",
    officialEventDescription:
      "Tiketko lists this event for discovery and does not sell its tickets. Check current prices, availability and conditions on the official source.",
    externalEventTitle: "Prices and tickets from the event source",
    externalEventDescription:
      "Tiketko lists this event for discovery and does not sell its tickets. Check current prices, availability and conditions on the linked external source.",
    salesPausedTitle: "Ticket sales are temporarily paused",
    salesPausedDescription:
      "To keep allocation fair, we do not accept orders while live inventory cannot be confirmed. Please try again shortly.",
    securePurchase: "Secure booking",
    securePurchaseText: "Reliable handling of every request",
    testPayment: "Stripe test payment",
    testPaymentText: "No real funds are charged",
    fairQueue: "Fair queue",
    fairQueueText: "Requests are processed in order",
    testInventory: "Simulation inventory",
    testInventoryText: "Tiketko test counts, not official venue seats",
    emailTicket: "Ticket by email",
    emailTicketText: "PDF delivered immediately after booking",
    qrEntry: "QR admission",
    qrEntryText: "Fast validation at the venue",
    notValidForEntry: "Not valid for entry",
    notValidForEntryText: "The test PDF demonstrates ticket issuance only",
    sourceAttribution: "Event information source",
    sourceAttributionText:
      "The programme, venue and date are attributed to the linked external source. Tiketko's Stripe test payment is a separate simulation and does not buy an organizer ticket.",
    aboutEvent: "About the event",
    venueAndTime: "Venue and time",
    date: "Date",
    start: "Starts",
    moreIdeas: "More ideas",
    relatedEvents: "Similar events",
    viewAll: "View all",
  },
} as const;
