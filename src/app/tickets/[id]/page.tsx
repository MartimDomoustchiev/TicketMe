import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  MapPin,
  QrCode,
  ShieldCheck,
  Ticket as TicketIcon,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import {
  formatEventDate,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import { getBuyerSession, isAdminSession } from "@/lib/auth";
import { getEventById, getTicketType } from "@/lib/event";
import { getLocale, localizeHref } from "@/lib/i18n";
import { getTicket } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const [ticket, session, admin] = await Promise.all([
    getTicket(id),
    getBuyerSession(),
    isAdminSession(),
  ]);

  if (!ticket) {
    notFound();
  }
  const copy = TICKET_COPY[locale];

  const isOwner =
    session?.email.trim().toLowerCase() ===
    ticket.buyerEmail.trim().toLowerCase();

  if (!isOwner && !admin) {
    if (!session) {
      const destination = localizeHref(locale, `/tickets/${ticket.id}`);
      redirect(
        `${localizeHref(locale, "/login")}?next=${encodeURIComponent(destination)}`,
      );
    }

    notFound();
  }

  const type = getTicketType(ticket.eventId, ticket.ticketType);
  const event = getEventById(ticket.eventId);
  const accountHref = localizeHref(
    locale,
    admin ? "/admin" : "/account/tickets",
  );
  const issuedAtFormatter = new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : "bg-BG",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Sofia",
    },
  );
  const typeLabel =
    locale === "en"
      ? {
          fan: "Fan zone",
          standard: "Standard",
          premium: "Premium",
        }[ticket.ticketType]
      : type.label;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />

      <main id="main-content" className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <Link
            href={accountHref}
            className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-[#2457ff]"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            {admin ? copy.backToAdmin : copy.backToTickets}
          </Link>

          <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30">
            <div className="relative overflow-hidden bg-[#10172a] p-6 text-white sm:p-8">
              <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#2457ff]/30 blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div>
                  <p
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black ring-1 ${
                      ticket.status === "checked_in"
                        ? "bg-white/10 text-slate-200 ring-white/15"
                        : "bg-emerald-400/10 text-emerald-100 ring-emerald-300/20"
                    }`}
                  >
                    {ticket.status === "checked_in" ? (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    ) : (
                      <ShieldCheck size={16} aria-hidden="true" />
                    )}
                    {ticket.status === "checked_in"
                      ? copy.usedTicket
                      : copy.validTicket}
                  </p>
                  <h1 className="mt-5 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                    {ticket.eventName}
                  </h1>
                  <p className="mt-2 font-semibold text-slate-300">
                    {typeLabel} · {ticket.seatLabel}
                  </p>
                </div>
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                  <TicketIcon size={29} aria-hidden="true" />
                </span>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1fr_320px]">
              <div className="p-5 sm:p-8">
                <h2 className="text-xl font-black">{copy.ticketDetails}</h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <TicketDetail
                    icon={<UserRound size={18} aria-hidden="true" />}
                    label={copy.holder}
                    value={ticket.buyerName}
                    secondary={ticket.buyerEmail}
                  />
                  <TicketDetail
                    icon={<TicketIcon size={18} aria-hidden="true" />}
                    label={copy.categoryAndSeat}
                    value={typeLabel}
                    secondary={ticket.seatLabel}
                  />
                  <TicketDetail
                    icon={<CalendarDays size={18} aria-hidden="true" />}
                    label={copy.dateAndTime}
                    value={
                      event
                        ? formatEventDate(event, false, locale)
                        : ticket.eventDate
                    }
                    secondary={
                      event?.time
                        ? `${copy.starts}: ${event.time}${locale === "bg" ? " ч." : ""}`
                        : undefined
                    }
                  />
                  <TicketDetail
                    icon={<MapPin size={18} aria-hidden="true" />}
                    label={copy.eventVenue}
                    value={ticket.venue}
                    secondary={
                      event ? localizeCity(event.city, locale) : undefined
                    }
                  />
                </dl>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-bold text-slate-500">
                        {copy.ticketNumber}
                      </dt>
                      <dd className="mt-1 break-all font-mono font-bold text-slate-950">
                        {ticket.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-500">
                        {copy.issuedOn}
                      </dt>
                      <dd className="mt-1 font-bold text-slate-950">
                        {issuedAtFormatter.format(new Date(ticket.issuedAt))}
                      </dd>
                    </div>
                  </dl>
                </div>

                <a
                  href={`/api/tickets/${ticket.id}/download`}
                  className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-5 font-black text-white transition hover:bg-blue-700 sm:w-auto"
                >
                  <Download size={19} aria-hidden="true" />
                  {copy.downloadPdf}
                </a>
              </div>

              <aside className="border-t border-slate-200 bg-slate-50 p-5 sm:p-8 lg:border-l lg:border-t-0">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-[#2457ff]">
                  <QrCode size={24} aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-xl font-black">{copy.qrAccess}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {copy.qrText}
                </p>
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <p className="font-black">{copy.keepSafe}</p>
                  <p className="mt-1">{copy.keepSafeText}</p>
                </div>

                {event && (
                  <Link
                    href={localizeHref(locale, `/events/${event.slug}`)}
                    className="mt-5 inline-flex text-sm font-black text-[#2457ff] hover:text-blue-800"
                  >
                    {copy.viewEvent}
                  </Link>
                )}
              </aside>
            </div>
          </section>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const TICKET_COPY = {
  bg: {
    backToAdmin: "Към организаторския панел",
    backToTickets: "Към моите билети",
    usedTicket: "Билетът е използван",
    validTicket: "Валиден електронен билет",
    ticketDetails: "Данни за билета",
    holder: "Притежател",
    categoryAndSeat: "Категория и място",
    dateAndTime: "Дата и час",
    starts: "Начало",
    eventVenue: "Място на събитието",
    ticketNumber: "Номер на билета",
    issuedOn: "Издаден на",
    downloadPdf: "Изтегли PDF билет",
    qrAccess: "Достъп със QR код",
    qrText:
      "Уникалният QR код се намира в PDF билета. Покажи го на входа от телефона си или на разпечатан носител.",
    keepSafe: "Пази билета си",
    keepSafeText:
      "Кодът е еднократен. Не публикувай снимка или копие преди събитието.",
    viewEvent: "Виж събитието",
  },
  en: {
    backToAdmin: "Back to organizer dashboard",
    backToTickets: "Back to my tickets",
    usedTicket: "This ticket has been used",
    validTicket: "Valid e-ticket",
    ticketDetails: "Ticket details",
    holder: "Holder",
    categoryAndSeat: "Category and seat",
    dateAndTime: "Date and time",
    starts: "Starts",
    eventVenue: "Event venue",
    ticketNumber: "Ticket number",
    issuedOn: "Issued on",
    downloadPdf: "Download PDF ticket",
    qrAccess: "QR code admission",
    qrText:
      "Your unique QR code is included in the PDF ticket. Present it on your phone or as a printed copy at the entrance.",
    keepSafe: "Keep your ticket safe",
    keepSafeText:
      "The code can only be used once. Do not publish a photo or copy before the event.",
    viewEvent: "View event",
  },
} as const;

function TicketDetail({
  icon,
  label,
  value,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <dt className="flex items-center gap-2 text-sm font-bold text-slate-500">
        <span className="text-[#2457ff]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-3 text-lg font-black">{value}</dd>
      {secondary && (
        <dd className="mt-1 break-words text-sm text-slate-600">{secondary}</dd>
      )}
    </div>
  );
}
