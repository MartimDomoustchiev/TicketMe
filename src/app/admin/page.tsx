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
import { isAdminSession } from "@/lib/auth";
import {
  CATALOG_EVENTS,
  formatPrice,
  getEventById,
  getTicketType,
  type CatalogEvent,
} from "@/lib/event";
import { getLocale, localizeHref, type Locale } from "@/lib/i18n";
import { listTickets, type StoredTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

const NUMBER_FORMATTER = new Intl.NumberFormat("bg-BG");
const ISSUED_AT_FORMATTER = new Intl.DateTimeFormat("bg-BG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Sofia",
});

type StatusFilter = "all" | "issued" | "checked_in";

type EventSummary = {
  event: CatalogEvent;
  capacity: number;
  sold: number;
  gross: number;
};

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
  const query = filters.q?.trim() ?? "";
  const normalizedQuery = query.toLocaleLowerCase("bg-BG");
  const selectedStatus: StatusFilter =
    filters.status === "issued" || filters.status === "checked_in"
      ? filters.status
      : "all";
  const selectedEventId = getEventById(filters.event ?? "")?.id ?? "all";

  const filteredTickets = tickets.filter((ticket) => {
    const matchesQuery =
      !normalizedQuery ||
      [
        ticket.id,
        ticket.buyerName,
        ticket.buyerEmail,
        ticket.eventName,
        ticket.seatLabel,
      ].some((value) =>
        value.toLocaleLowerCase("bg-BG").includes(normalizedQuery),
      );
    const matchesStatus =
      selectedStatus === "all" || ticket.status === selectedStatus;
    const matchesEvent =
      selectedEventId === "all" || ticket.eventId === selectedEventId;

    return matchesQuery && matchesStatus && matchesEvent;
  });

  const eventSummaries = buildEventSummaries(tickets);
  const totalCapacity = eventSummaries.reduce(
    (sum, summary) => sum + summary.capacity,
    0,
  );
  const checkedIn = tickets.filter(
    (ticket) =>
      ticket.status === "checked_in" &&
      getEventById(ticket.eventId)?.checkoutMode !== "test-simulation",
  ).length;
  const gross = eventSummaries.reduce(
    (sum, summary) => sum + summary.gross,
    0,
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />

      <main id="main-content" className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <section className="overflow-hidden rounded-3xl bg-[#10172a] px-5 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-blue-300">
                  Организаторски панел
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Продажби и достъп
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Единен преглед на {NUMBER_FORMATTER.format(CATALOG_EVENTS.length)}{" "}
                  събития, издадените билети и проверките на входа.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={localizeHref(locale, "/admin/discovery")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  <Sparkles size={18} aria-hidden="true" />
                  AI откриване
                </Link>
                <Link
                  href={localizeHref(locale, "/admin/check-in")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-4 text-sm font-black text-white transition hover:bg-blue-700"
                >
                  <ScanLine size={18} aria-hidden="true" />
                  Проверка на билет
                </Link>
                <a
                  href="/api/admin/tickets"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  <Download size={18} aria-hidden="true" />
                  JSON отчет
                </a>
              </div>
            </div>
          </section>

          <section
            aria-label="Ключови показатели"
            className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              icon={<Ticket size={21} aria-hidden="true" />}
              label="Издадени билети"
              value={NUMBER_FORMATTER.format(tickets.length)}
              note={`${NUMBER_FORMATTER.format(Math.max(0, totalCapacity - tickets.length))} свободни места`}
              tone="blue"
            />
            <MetricCard
              icon={<WalletCards size={21} aria-hidden="true" />}
              label="Стойност на поръчките"
              value={formatPrice(gross)}
              note="Сума по издадените билети"
              tone="violet"
            />
            <MetricCard
              icon={<ScanLine size={21} aria-hidden="true" />}
              label="Преминали вход"
              value={NUMBER_FORMATTER.format(checkedIn)}
              note={
                tickets.length
                  ? `${Math.round((checkedIn / tickets.length) * 100)}% от издадените`
                  : "Все още няма проверки"
              }
              tone="emerald"
            />
            <MetricCard
              icon={<CalendarDays size={21} aria-hidden="true" />}
              label="Активни събития"
              value={NUMBER_FORMATTER.format(CATALOG_EVENTS.length)}
              note={`${NUMBER_FORMATTER.format(totalCapacity)} места общ капацитет`}
              tone="amber"
            />
          </section>

          <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Портфолио от събития
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Капацитет и продажби за целия каталог.
                </p>
              </div>
              <Link
                href={localizeHref(locale, "/events")}
                className="text-sm font-black text-[#2457ff] hover:text-blue-800"
              >
                Към публичния каталог
              </Link>
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Събитие</th>
                    <th className="px-5 py-3">Дата</th>
                    <th className="px-5 py-3">Продадени</th>
                    <th className="px-5 py-3">Капацитет</th>
                    <th className="px-5 py-3">Стойност</th>
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
                            {summary.event.name}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {summary.event.city} · {summary.event.venue}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                          {summary.event.date}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="w-10 font-black">
                              {NUMBER_FORMATTER.format(summary.sold)}
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
                          {NUMBER_FORMATTER.format(summary.capacity)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-black">
                          {formatPrice(summary.gross)}
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
                Издадени билети
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Търсене по купувач, билет, място или събитие.
              </p>

              <form
                action={localizeHref(locale, "/admin")}
                method="get"
                className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]"
              >
                <label className="relative">
                  <span className="sr-only">Търсене в билетите</span>
                  <Search
                    size={18}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    name="q"
                    type="search"
                    defaultValue={query}
                    placeholder="Име, имейл, билет или събитие"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <label>
                  <span className="sr-only">Събитие</span>
                  <select
                    name="event"
                    defaultValue={selectedEventId}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="all">Всички събития</option>
                    {CATALOG_EVENTS.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="sr-only">Статус</span>
                  <select
                    name="status"
                    defaultValue={selectedStatus}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#2457ff] focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="all">Всички статуси</option>
                    <option value="issued">Издаден / тестов запис</option>
                    <option value="checked_in">Използван</option>
                  </select>
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#10172a] px-4 text-sm font-black text-white transition hover:bg-[#2457ff]"
                  >
                    Филтрирай
                  </button>
                  {(query ||
                    selectedStatus !== "all" ||
                    selectedEventId !== "all") && (
                    <Link
                      href={localizeHref(locale, "/admin")}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      Изчисти
                    </Link>
                  )}
                </div>
              </form>
            </div>

            <div className="flex items-center justify-between gap-4 bg-slate-50 px-5 py-3 text-sm text-slate-600 sm:px-6">
              <span>
                Показани{" "}
                <strong className="text-slate-950">
                  {NUMBER_FORMATTER.format(filteredTickets.length)}
                </strong>{" "}
                от {NUMBER_FORMATTER.format(tickets.length)}
              </span>
              <span className="hidden font-semibold sm:inline">
                Чувствителните ключове не се показват
              </span>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <Ticket size={23} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-black">
                  Няма намерени билети
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Промени филтрите или провери отново след нова поръчка.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
                  <thead className="bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Билет</th>
                      <th className="px-5 py-3">Събитие</th>
                      <th className="px-5 py-3">Купувач</th>
                      <th className="px-5 py-3">Категория</th>
                      <th className="px-5 py-3">Издаден</th>
                      <th className="px-5 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredTickets.map((ticket) => (
                      <TicketRow
                        key={ticket.id}
                        ticket={ticket}
                        locale={locale}
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

function buildEventSummaries(tickets: StoredTicket[]): EventSummary[] {
  const ticketsByEvent = new Map<string, StoredTicket[]>();

  for (const ticket of tickets) {
    const eventTickets = ticketsByEvent.get(ticket.eventId) ?? [];
    eventTickets.push(ticket);
    ticketsByEvent.set(ticket.eventId, eventTickets);
  }

  return CATALOG_EVENTS.map((event) => {
    const eventTickets = ticketsByEvent.get(event.id) ?? [];
    const capacity = event.ticketTypes.reduce(
      (sum, type) => sum + type.capacity,
      0,
    );
    const gross = eventTickets.reduce(
      (sum, ticket) =>
        sum + getTicketType(event.id, ticket.ticketType).price,
      0,
    );

    return {
      event,
      capacity,
      sold: eventTickets.length,
      gross,
    };
  }).sort(
    (left, right) =>
      right.sold - left.sold ||
      left.event.startsAt.localeCompare(right.event.startsAt),
  );
}

function TicketRow({
  ticket,
  locale,
}: {
  ticket: StoredTicket;
  locale: Locale;
}) {
  const type = getTicketType(ticket.eventId, ticket.ticketType);
  const event = getEventById(ticket.eventId);
  const simulation = event?.checkoutMode === "test-simulation";

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
            {ticket.eventName}
          </Link>
        ) : (
          <span className="font-black">{ticket.eventName}</span>
        )}
        <p className="mt-1 text-xs text-slate-500">{ticket.eventDate}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-black">{ticket.buyerName}</p>
        <p className="mt-1 text-xs text-slate-500">{ticket.buyerEmail}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-black">{type.label}</p>
        <p className="mt-1 text-xs text-slate-500">{type.priceLabel}</p>
      </td>
      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
        {ISSUED_AT_FORMATTER.format(new Date(ticket.issuedAt))}
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black ${
            simulation
              ? "bg-amber-50 text-amber-900"
              : ticket.status === "checked_in"
              ? "bg-slate-100 text-slate-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {simulation ? (
            <TriangleAlert size={14} aria-hidden="true" />
          ) : ticket.status === "checked_in" ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <Circle size={14} aria-hidden="true" />
          )}
          {simulation
            ? "Тестов - не важи за вход"
            : ticket.status === "checked_in"
              ? "Използван"
              : "Валиден"}
        </span>
      </td>
    </tr>
  );
}

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
