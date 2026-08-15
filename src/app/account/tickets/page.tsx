import {
  CalendarDays,
  Download,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getBuyerSession, isAdminSession } from "@/lib/auth";
import { getEventById } from "@/lib/event";
import { getLocale, localizeHref } from "@/lib/i18n";
import { listTicketsByEmail } from "@/lib/store";
import {
  formatMoneyTotal,
  historicalTicketView,
  isTrustedAdmissionTicket,
} from "@/lib/ticket-history";

export const dynamic = "force-dynamic";

export default async function MyTicketsPage() {
  const [session, admin, locale] = await Promise.all([
    getBuyerSession(),
    isAdminSession(),
    getLocale(),
  ]);
  const copy = ACCOUNT_COPY[locale];
  const dateTimeFormatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : "bg-BG",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Sofia",
    },
  );

  if (admin) {
    redirect(localizeHref(locale, "/admin"));
  }

  if (!session) {
    const destination = localizeHref(locale, "/account/tickets");
    redirect(
      `${localizeHref(locale, "/login")}?next=${encodeURIComponent(destination)}`,
    );
  }

  const tickets = await listTicketsByEmail(session.email);
  const checkedIn = tickets.filter(
    (ticket) =>
      ticket.status === "checked_in" &&
      isTrustedAdmissionTicket(ticket),
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />

      <main id="main-content" className="flex-1 px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-7xl">
          <section className="overflow-hidden rounded-3xl bg-[#10172a] px-5 py-8 text-white shadow-xl shadow-slate-300/30 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-blue-100 ring-1 ring-white/10">
                  <ShieldCheck size={16} aria-hidden="true" />
                  {copy.verifiedProfile}
                </p>
                <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                  {copy.myTickets}
                </h1>
                <p className="mt-2 text-sm text-slate-300 sm:text-base">
                  {session.name} · {session.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <Stat label={copy.totalTickets} value={String(tickets.length)} />
                <Stat label={copy.used} value={String(checkedIn)} />
              </div>
            </div>
          </section>

          {tickets.length === 0 ? (
            <section className="mt-8 rounded-3xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2457ff]">
                <Ticket size={27} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-2xl font-black">
                {copy.noTickets}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {copy.noTicketsText}
              </p>
              <Link
                href={localizeHref(locale, "/events")}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#2457ff] px-5 text-sm font-black text-white transition hover:bg-blue-700"
              >
                {copy.browseEvents}
              </Link>
            </section>
          ) : (
            <section className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {copy.issuedTickets}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {copy.privatePdf}
                  </p>
                </div>
                <Link
                  href={localizeHref(locale, "/events")}
                  className="text-sm font-black text-[#2457ff] hover:text-blue-800"
                >
                  {copy.findMore}
                </Link>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {tickets.map((ticket) => {
                  const event = getEventById(ticket.eventId);
                  const history = historicalTicketView(ticket);
                  const simulation =
                    history.offerKind === "test-simulation";
                  const legacy = !history.trustedSnapshot;

                  return (
                    <article
                      key={ticket.id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
                    >
                      <div className="border-b border-slate-100 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                                simulation
                                  ? "bg-amber-50 text-amber-900"
                                  : legacy
                                  ? "bg-rose-50 text-rose-800"
                                  : ticket.status === "checked_in"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {simulation ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <TriangleAlert size={13} aria-hidden="true" />
                                  {copy.testStatus}
                                </span>
                              ) : legacy ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <TriangleAlert size={13} aria-hidden="true" />
                                  {copy.legacyStatus}
                                </span>
                              ) : ticket.status === "checked_in"
                                ? copy.usedStatus
                                : copy.validStatus}
                            </span>
                            <h3 className="mt-3 text-xl font-black leading-tight">
                              {history.eventName}
                            </h3>
                          </div>
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2457ff]">
                            <Ticket size={21} aria-hidden="true" />
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <p className="inline-flex items-center gap-2">
                            <CalendarDays
                              size={16}
                              className="text-slate-400"
                              aria-hidden="true"
                            />
                            {history.eventDate}
                          </p>
                          <p className="inline-flex items-center gap-2">
                            <MapPin
                              size={16}
                              className="text-slate-400"
                              aria-hidden="true"
                            />
                            {history.venue}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
                        <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {copy.category}
                            </dt>
                            <dd className="mt-1 font-black">
                              {history.ticketLabel ?? copy.unavailable}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {simulation ? copy.reference : copy.seat}
                            </dt>
                            <dd className="mt-1 font-black">
                              {ticket.seatLabel}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {history.paymentMode === "test"
                                ? copy.testAmount
                                : history.paymentMode === "live"
                                  ? copy.pricePaid
                                  : copy.recordedAmount}
                            </dt>
                            <dd className="mt-1 font-black">
                              {history.unitAmountMinor !== null &&
                              history.currency
                                ? formatMoneyTotal(
                                    history.unitAmountMinor,
                                    history.currency,
                                    locale,
                                  )
                                : copy.unavailable}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              {copy.issued}
                            </dt>
                            <dd className="mt-1 font-black">
                              {dateTimeFormatter.format(
                                new Date(ticket.issuedAt),
                              )}
                            </dd>
                          </div>
                        </dl>

                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={localizeHref(
                              locale,
                              `/tickets/${ticket.id}`,
                            )}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-black transition hover:bg-slate-50"
                          >
                            {copy.details}
                          </Link>
                          <a
                            href={`/api/tickets/${ticket.id}/download`}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#10172a] px-3 text-sm font-black text-white transition hover:bg-[#2457ff]"
                          >
                            <Download size={16} aria-hidden="true" />
                            PDF
                          </a>
                        </div>
                      </div>

                      {(event ||
                        (simulation &&
                          history.sourceUrl &&
                          history.sourceName)) && (
                        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-100 bg-slate-50 px-5 py-3 text-right">
                          {simulation &&
                            history.sourceUrl &&
                            history.sourceName && (
                            <a
                              href={history.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-black text-[#2457ff] hover:text-blue-800"
                            >
                              {copy.source(history.sourceName)}
                              <ExternalLink size={13} aria-hidden="true" />
                            </a>
                          )}
                          {event && (
                            <Link
                              href={localizeHref(
                                locale,
                                `/events/${event.slug}`,
                              )}
                              className="text-xs font-black text-[#2457ff] hover:text-blue-800"
                            >
                              {copy.eventPage}
                            </Link>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const ACCOUNT_COPY = {
  bg: {
    verifiedProfile: "Потвърден профил",
    myTickets: "Моите билети",
    totalTickets: "Общо билети",
    used: "Използвани",
    noTickets: "Все още нямаш издадени билети",
    noTicketsText:
      "След успешна поръчка билетът ще се появи тук и ще можеш да изтеглиш PDF файла по всяко време.",
    browseEvents: "Разгледай събитията",
    issuedTickets: "Издадени билети",
    privatePdf:
      "PDF билетите са достъпни само от този потвърден профил.",
    findMore: "Намери още събития",
    usedStatus: "Използван",
    validStatus: "Валиден",
    testStatus: "Тестов - не важи за вход",
    legacyStatus: "Стар запис - непотвърден",
    category: "Категория",
    seat: "Място",
    reference: "Референция",
    pricePaid: "Платена цена",
    testAmount: "Тестова сума",
    recordedAmount: "Записана сума",
    issued: "Издаден",
    details: "Детайли",
    eventPage: "Към страницата на събитието",
    unavailable: "Няма надеждни данни",
    source: (source: string) => `Източник: ${source}`,
  },
  en: {
    verifiedProfile: "Verified account",
    myTickets: "My tickets",
    totalTickets: "Total tickets",
    used: "Used",
    noTickets: "You do not have any issued tickets yet",
    noTicketsText:
      "After a successful order, your ticket will appear here and its PDF will remain available for download.",
    browseEvents: "Browse events",
    issuedTickets: "Issued tickets",
    privatePdf:
      "PDF tickets are only available from this verified account.",
    findMore: "Find more events",
    usedStatus: "Used",
    validStatus: "Valid",
    testStatus: "Test - not valid for entry",
    legacyStatus: "Legacy record - unverified",
    category: "Category",
    seat: "Seat",
    reference: "Reference",
    pricePaid: "Price paid",
    testAmount: "Test amount",
    recordedAmount: "Recorded amount",
    issued: "Issued",
    details: "Details",
    eventPage: "View event page",
    unavailable: "Reliable data unavailable",
    source: (source: string) => `Source: ${source}`,
  },
} as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-300">{label}</p>
    </div>
  );
}
