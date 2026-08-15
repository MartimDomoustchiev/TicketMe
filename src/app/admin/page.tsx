import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Download,
  ScanLine,
  Search,
  Sparkles,
  Ticket,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import {
  localizedEventTitle,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import { isAdminSession } from "@/lib/auth";
import {
  CATALOG_EVENTS,
  getEventById,
} from "@/lib/event";
import { getLocale, localizeHref, type Locale } from "@/lib/i18n";
import { listTickets, type StoredTicket } from "@/lib/store";
import {
  buildAdminTicketMetrics,
  buildAdmissionEventSummaries,
  formatMoneyTotal,
  formatMoneyTotals,
  historicalTicketView,
} from "@/lib/ticket-history";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "issued" | "checked_in";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    event?: string;
  }>;
}) {
  const [admin, locale] = await Promise.all([
    isAdminSession(),
    getLocale(),
  ]);

  if (!admin) {
    const destination = localizeHref(locale, "/admin");
    redirect(
      `${localizeHref(locale, "/login")}?next=${encodeURIComponent(destination)}`,
    );
  }

  const [tickets, filters] = await Promise.all([listTickets(), searchParams]);
  const copy = ADMIN_COPY[locale];
  const numberFormatter = new Intl.NumberFormat(
    locale === "en" ? "en-GB" : "bg-BG",
  );
  const eventDateFormatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : "bg-BG",
    {
      dateStyle: "medium",
      timeZone: "Europe/Sofia",
    },
  );
  const query = filters.q?.trim() ?? "";
  const languageTag = locale === "en" ? "en-GB" : "bg-BG";
  const issuedAtFormatter = new Intl.DateTimeFormat(languageTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  });
  const normalizedQuery = query.toLocaleLowerCase(languageTag);
  const selectedStatus: StatusFilter =
    filters.status === "issued" || filters.status === "checked_in"
      ? filters.status
      : "all";
  const selectedEventId = getEventById(filters.event ?? "")?.id ?? "all";

  const filteredTickets = tickets.filter((ticket) => {
    const history = historicalTicketView(ticket);
    const matchesQuery =
      !normalizedQuery ||
      [
        ticket.id,
        ticket.buyerName,
        ticket.buyerEmail,
        history.eventName,
        history.ticketLabel ?? "",
        history.sourceName ?? "",
        ticket.seatLabel,
      ].some((value) =>
        value.toLocaleLowerCase(languageTag).includes(normalizedQuery),
      );
    const matchesStatus =
      selectedStatus === "all" || ticket.status === selectedStatus;
    const matchesEvent =
      selectedEventId === "all" || ticket.eventId === selectedEventId;

    return matchesQuery && matchesStatus && matchesEvent;
  });

  const now = new Date();
  const eventSummaries = buildAdmissionEventSummaries(
    tickets,
    CATALOG_EVENTS,
    now,
  );
  const metrics = buildAdminTicketMetrics(tickets, CATALOG_EVENTS, now);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />

      <main id="main-content" className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <section className="overflow-hidden rounded-3xl bg-[#10172a] px-5 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-blue-300">
                  {copy.eyebrow}
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  {copy.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  {copy.summary(numberFormatter.format(metrics.activeEventCount))}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={localizeHref(locale, "/admin/discovery")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  <Sparkles size={18} aria-hidden="true" />
                  {copy.discovery}
                </Link>
                <Link
                  href={localizeHref(locale, "/admin/check-in")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-4 text-sm font-black text-white transition hover:bg-blue-700"
                >
                  <ScanLine size={18} aria-hidden="true" />
                  {copy.checkIn}
                </Link>
                <a
                  href="/api/admin/tickets"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  <Download size={18} aria-hidden="true" />
                  {copy.jsonReport}
                </a>
              </div>
            </div>
          </section>

          <section
            aria-label={copy.metricsAria}
            className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon={<Ticket size={21} aria-hidden="true" />}
              label={copy.admissionTickets}
              value={numberFormatter.format(metrics.admissionTicketCount)}
              note={copy.remainingSeats(
                numberFormatter.format(metrics.remainingAdmissionCapacity),
              )}
              tone="blue"
            />
            <MetricCard
              icon={<WalletCards size={21} aria-hidden="true" />}
              label={copy.orderValue}
              value={formatMoneyTotals(
                metrics.admissionGross,
                locale,
                formatMoneyTotal(0, "EUR", locale),
              )}
              note={copy.orderValueNote}
              tone="violet"
            />
            <MetricCard
              icon={<ScanLine size={21} aria-hidden="true" />}
              label={copy.checkedIn}
              value={numberFormatter.format(metrics.checkedInAdmissionCount)}
              note={
                metrics.admissionTicketCount
                  ? copy.checkedInPercent(metrics.checkInPercent)
                  : copy.noCheckIns
              }
              tone="emerald"
            />
            <MetricCard
              icon={<CalendarDays size={21} aria-hidden="true" />}
              label={copy.activeEvents}
              value={numberFormatter.format(metrics.activeEventCount)}
              note={copy.admissionCapacity(
                numberFormatter.format(metrics.activeAdmissionCapacity),
              )}
              tone="amber"
            />
          </section>

          <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  {copy.portfolioTitle}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {copy.portfolioText}
                </p>
              </div>
              <Link
                href={localizeHref(locale, "/events")}
                className="text-sm font-black text-[#2457ff] hover:text-blue-800"
              >
                {copy.publicCatalogue}
              </Link>
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{copy.event}</th>
                    <th className="px-5 py-3">{copy.date}</th>
                    <th className="px-5 py-3">{copy.sold}</th>
                    <th className="px-5 py-3">{copy.capacity}</th>
                    <th className="px-5 py-3">{copy.value}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {eventSummaries.map((summary) => {
                    const soldPercent = summary.capacity
                      ? Math.min(
                          100,
                          Math.round((summary.sold / summary.capacity) * 100),
                        )
                      : 0;

                    return (
                      <tr
                        key={summary.event.id}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={localizeHref(
                              locale,
                              `/events/${summary.event.slug}`,
                            )}
                            className="font-black text-slate-950 hover:text-[#2457ff]"
                          >
                            {localizedEventTitle(summary.event, locale)}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {localizeCity(summary.event.city, locale)} · {summary.event.venue}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                          {eventDateFormatter.format(
                            new Date(summary.event.startsAt),
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-10 font-black">
                              {numberFormatter.format(summary.sold)}
                            </span>
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-[#2457ff]"
                                style={{ width: `${soldPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-700">
                          {numberFormatter.format(summary.capacity)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-black">
                          {formatMoneyTotals(
                            summary.gross,
                            locale,
                            formatMoneyTotal(0, summary.event.currency, locale),
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
              <h2 className="text-xl font-black tracking-tight">
                {copy.issuedTickets}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {copy.ticketSearchText}
              </p>

              <form
                action={localizeHref(locale, "/admin")}
                method="get"
                className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]"
              >
                <label className="relative">
                  <span className="sr-only">{copy.ticketSearchLabel}</span>
                  <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    name="q"
                    type="search"
                    defaultValue={query}
                    placeholder={copy.ticketSearchPlaceholder}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="sr-only">{copy.eventFilterLabel}</span>
                  <select
                    name="event"
                    defaultValue={selectedEventId}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="all">{copy.allEvents}</option>
                    {CATALOG_EVENTS.map((event) => (
                      <option key={event.id} value={event.id}>
                        {localizedEventTitle(event, locale)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="sr-only">{copy.statusFilterLabel}</span>
                  <select
                    name="status"
                    defaultValue={selectedStatus}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="all">{copy.allStatuses}</option>
                    <option value="issued">{copy.issuedStatusFilter}</option>
                    <option value="checked_in">{copy.usedStatusFilter}</option>
                  </select>
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#10172a] px-4 text-sm font-black text-white transition hover:bg-[#2457ff]"
                  >
                    {copy.filter}
                  </button>
                  {(query ||
                    selectedStatus !== "all" ||
                    selectedEventId !== "all") && (
                    <Link
                      href={localizeHref(locale, "/admin")}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      {copy.clear}
                    </Link>
                  )}
                </div>
              </form>
            </div>

            <div className="flex items-center justify-between gap-4 bg-slate-50 px-5 py-3 text-sm text-slate-600 sm:px-6">
              <span>
                {copy.shown}{" "}
                <strong className="text-slate-950">
                  {numberFormatter.format(filteredTickets.length)}
                </strong>{" "}
                {copy.outOf} {numberFormatter.format(tickets.length)}
              </span>
              <span className="hidden font-semibold sm:inline">
                {copy.keysHidden}
              </span>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Ticket size={23} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-black">
                  {copy.noTickets}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {copy.noTicketsText}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
                  <thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{copy.ticket}</th>
                      <th className="px-5 py-3">{copy.event}</th>
                      <th className="px-5 py-3">{copy.buyer}</th>
                      <th className="px-5 py-3">{copy.category}</th>
                      <th className="px-5 py-3">{copy.issued}</th>
                      <th className="px-5 py-3">{copy.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredTickets.map((ticket) => (
                      <TicketRow
                        key={ticket.id}
                        ticket={ticket}
                        locale={locale}
                        copy={copy}
                        issuedAtFormatter={issuedAtFormatter}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

function TicketRow({
  ticket,
  locale,
  copy,
  issuedAtFormatter,
}: {
  ticket: StoredTicket;
  locale: Locale;
  copy: AdminCopy;
  issuedAtFormatter: Intl.DateTimeFormat;
}) {
  const event = getEventById(ticket.eventId);
  const history = historicalTicketView(ticket);
  const simulation = history.offerKind === "test-simulation";
  const legacy = !history.trustedSnapshot;
  const amount =
    history.unitAmountMinor !== null && history.currency
      ? `${formatMoneyTotal(history.unitAmountMinor, history.currency, locale)} · ${
          history.paymentMode === "test"
            ? copy.testAmount
            : history.paymentMode === "live"
              ? copy.livePayment
              : copy.paymentModeUnknown
        }`
      : copy.unavailable;
  const statusLabel = simulation
    ? copy.testStatus
    : legacy
      ? copy.legacyStatus
      : ticket.status === "checked_in"
        ? copy.usedStatus
        : copy.validStatus;

  return (
    <tr className="transition hover:bg-slate-50">
      <td className="px-5 py-4">
        <Link
          href={localizeHref(locale, `/tickets/${ticket.id}`)}
          className="font-mono text-xs font-black text-[#2457ff] hover:text-blue-800"
        >
          {ticket.id}
        </Link>
        <p className="mt-1 text-xs text-slate-500">{ticket.seatLabel}</p>
      </td>
      <td className="max-w-72 px-5 py-4">
        {event ? (
          <Link
            href={localizeHref(locale, `/events/${event.slug}`)}
            className="font-black text-slate-950 hover:text-[#2457ff]"
          >
            {history.eventName}
          </Link>
        ) : (
          <span className="font-black">{history.eventName}</span>
        )}
        <p className="mt-1 text-xs text-slate-500">{history.eventDate}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-black">{ticket.buyerName}</p>
        <p className="mt-1 text-xs text-slate-500">{ticket.buyerEmail}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-black">
          {history.ticketLabel ?? copy.unavailable}
        </p>
        <p className="mt-1 text-xs text-slate-500">{amount}</p>
      </td>
      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
        {issuedAtFormatter.format(new Date(ticket.issuedAt))}
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black ${
            simulation
              ? "bg-amber-50 text-amber-900"
              : legacy
              ? "bg-rose-50 text-rose-800"
              : ticket.status === "checked_in"
              ? "bg-slate-100 text-slate-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {simulation ? (
            <TriangleAlert size={14} aria-hidden="true" />
          ) : legacy ? (
            <TriangleAlert size={14} aria-hidden="true" />
          ) : ticket.status === "checked_in" ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <Circle size={14} aria-hidden="true" />
          )}
          {statusLabel}
        </span>
      </td>
    </tr>
  );
}

const ADMIN_COPY = {
  bg: {
    eyebrow: "Организаторски панел",
    title: "Продажби и достъп",
    summary: (count: string) =>
      `Преглед на ${count} активни събития, издадените билети за вход и проверките на входа.`,
    discovery: "AI откриване",
    checkIn: "Проверка на билет",
    jsonReport: "JSON отчет",
    metricsAria: "Ключови показатели",
    admissionTickets: "Билети за вход",
    remainingSeats: (count: string) => `${count} свободни места за вход`,
    orderValue: "Реални приходи от билети",
    orderValueNote: "Само потвърдени Stripe live плащания",
    checkedIn: "Преминали вход",
    checkedInPercent: (percent: number) =>
      `${percent}% от билетите за вход`,
    noCheckIns: "Все още няма проверки на входа",
    activeEvents: "Активни събития",
    admissionCapacity: (count: string) =>
      `${count} места в активни събития с вход`,
    portfolioTitle: "Активни събития с билети за вход",
    portfolioText: "Капацитет, издадени билети и Stripe live приходи без тестови симулации и минали събития.",
    publicCatalogue: "Към публичния каталог",
    event: "Събитие",
    date: "Дата",
    sold: "Издадени",
    capacity: "Капацитет",
    value: "Стойност",
    issuedTickets: "Издадени билети",
    ticketSearchText:
      "Търсене по купувач, билет, място или запазените данни от покупката.",
    ticketSearchLabel: "Търсене в билетите",
    ticketSearchPlaceholder: "Име, имейл, билет или събитие",
    eventFilterLabel: "Събитие",
    allEvents: "Всички събития",
    statusFilterLabel: "Статус",
    allStatuses: "Всички статуси",
    issuedStatusFilter: "Издаден / тестов запис",
    usedStatusFilter: "Използван",
    filter: "Филтрирай",
    clear: "Изчисти",
    shown: "Показани",
    outOf: "от",
    keysHidden: "Чувствителните ключове не се показват",
    noTickets: "Няма намерени билети",
    noTicketsText: "Промени филтрите или провери отново след нова поръчка.",
    ticket: "Билет",
    buyer: "Купувач",
    category: "Категория",
    issued: "Издаден",
    status: "Статус",
    testStatus: "Тестов - не важи за вход",
    legacyStatus: "Стар запис - непотвърден",
    usedStatus: "Използван",
    validStatus: "Валиден билет за вход",
    unavailable: "Няма надеждни данни",
    testAmount: "тестова сума",
    livePayment: "реално плащане",
    paymentModeUnknown: "неизвестен режим",
  },
  en: {
    eyebrow: "Organizer dashboard",
    title: "Sales and admission",
    summary: (count: string) =>
      `Overview of ${count} active events, issued admission tickets, and venue check-ins.`,
    discovery: "AI discovery",
    checkIn: "Check ticket",
    jsonReport: "JSON report",
    metricsAria: "Key metrics",
    admissionTickets: "Admission tickets",
    remainingSeats: (count: string) => `${count} admission seats remaining`,
    orderValue: "Live admission revenue",
    orderValueNote: "Confirmed Stripe live payments only",
    checkedIn: "Checked in",
    checkedInPercent: (percent: number) =>
      `${percent}% of admission tickets`,
    noCheckIns: "No admission check-ins yet",
    activeEvents: "Active events",
    admissionCapacity: (count: string) =>
      `${count} seats in active admission events`,
    portfolioTitle: "Active admission portfolio",
    portfolioText: "Capacity, issued tickets, and Stripe live revenue without test simulations or past events.",
    publicCatalogue: "Open public catalogue",
    event: "Event",
    date: "Date",
    sold: "Issued",
    capacity: "Capacity",
    value: "Value",
    issuedTickets: "Issued tickets",
    ticketSearchText: "Search by buyer, ticket, seat, or historical snapshot.",
    ticketSearchLabel: "Search tickets",
    ticketSearchPlaceholder: "Name, email, ticket, or event",
    eventFilterLabel: "Event",
    allEvents: "All events",
    statusFilterLabel: "Status",
    allStatuses: "All statuses",
    issuedStatusFilter: "Issued / test record",
    usedStatusFilter: "Used",
    filter: "Filter",
    clear: "Clear",
    shown: "Showing",
    outOf: "of",
    keysHidden: "Sensitive keys are never displayed",
    noTickets: "No tickets found",
    noTicketsText: "Change the filters or check again after a new order.",
    ticket: "Ticket",
    buyer: "Buyer",
    category: "Category",
    issued: "Issued",
    status: "Status",
    testStatus: "Test - not valid for entry",
    legacyStatus: "Legacy record - unverified",
    usedStatus: "Used",
    validStatus: "Valid admission ticket",
    unavailable: "Reliable data unavailable",
    testAmount: "test amount",
    livePayment: "live payment",
    paymentModeUnknown: "payment mode unknown",
  },
} as const;

type AdminCopy = (typeof ADMIN_COPY)[Locale];

function MetricCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "blue" | "violet" | "emerald" | "amber";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}
        >
          {icon}
        </span>
        <p className="text-sm font-bold text-slate-600">{label}</p>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
    </article>
  );
}
