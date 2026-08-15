"use client";

import {
  Clock3,
  CreditCard,
  ExternalLink,
  Radio,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  externalSourceLabel,
  formatPrice,
} from "@/components/marketplace/catalog-ui";
import { useLiveTicketingStatus } from "@/components/ticketing/LiveTicketingProvider";
import {
  formatDualCurrencyPrice,
  isTestSimulationEvent,
  type CatalogEvent,
} from "@/lib/event";
import { localizeHref } from "@/lib/i18n-config";

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type Props = {
  event: CatalogEvent;
  checkoutEnabled: boolean;
  availabilityAvailable: boolean;
  locale: "bg" | "en";
};

const COPY = {
  bg: {
    ticketsFrom: "Билети от",
    availability: "Остават",
    queue: "В опашката",
    activeCheckouts: "В плащане",
    saleEndsIn: "Продажбата приключва след",
    eventStartsIn: "Събитието започва след",
    days: "дни",
    hours: "часа",
    minutes: "минути",
    seconds: "секунди",
    buyTicket: "Купи билет",
    testCheckout: "Тестово Stripe плащане",
    buyAt: "Купи билет сега",
    checkAt: (source: string) => `Провери билетите в ${source}`,
    soldOut: "Изчерпано",
    backToEvents: "Разгледай събитията",
    live: "На живо",
    connecting: "Свързване",
    secureVerified: "Сигурно Stripe плащане и потвърден имейл",
    externalSource: (source: string) =>
      `Покупката се завършва в ${source}`,
    attributedSource: (source: string) =>
      `Провери актуалната наличност в ${source}`,
    testOffer: "Tiketko Stripe test оферта",
    testNotice:
      "Това е тестово плащане без реално таксуване. PDF билетът не е валиден за вход, а наличността не е официалната наличност на организатора.",
    sourceLink: (source: string) => `Източник на събитието: ${source}`,
  },
  en: {
    ticketsFrom: "Tickets from",
    availability: "Remaining",
    queue: "In queue",
    activeCheckouts: "Checking out",
    saleEndsIn: "Ticket sales close in",
    eventStartsIn: "Event starts in",
    days: "days",
    hours: "hours",
    minutes: "minutes",
    seconds: "seconds",
    buyTicket: "Buy ticket",
    testCheckout: "Test Stripe payment",
    buyAt: "Buy your ticket now",
    checkAt: (source: string) => `Check tickets at ${source}`,
    soldOut: "Sold out",
    backToEvents: "Browse events",
    live: "Live",
    connecting: "Connecting",
    secureVerified: "Secure Stripe checkout and verified email",
    externalSource: (source: string) =>
      `You’ll complete your purchase at ${source}`,
    attributedSource: (source: string) =>
      `Check current ticket availability at ${source}`,
    testOffer: "Tiketko Stripe test offer",
    testNotice:
      "This is a test payment with no real charge. The PDF ticket is not valid for venue entry, and these counts are not the organizer's official inventory.",
    sourceLink: (source: string) => `Event source: ${source}`,
  },
} as const;

function countdownTo(target: string): Countdown {
  const remaining = Math.max(0, Date.parse(target) - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function EventPurchasePanel({
  event,
  checkoutEnabled,
  availabilityAvailable,
  locale,
}: Props) {
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const liveStatus = useLiveTicketingStatus();
  const copy = COPY[locale];
  const availability = liveStatus?.availability;
  const activity = liveStatus?.activity;
  const remaining = availability?.totalRemaining ?? 0;
  const soldOut = availabilityAvailable && remaining <= 0;
  const testSimulation = isTestSimulationEvent(event);
  const sourceSellsTickets = event.sourceSellsTickets === true;
  const checkoutPrice = event.ticketTypes.reduce(
    (lowest, ticketType) => Math.min(lowest, ticketType.price),
    Number.POSITIVE_INFINITY,
  );
  const checkoutPriceLabel = Number.isFinite(checkoutPrice)
    ? formatDualCurrencyPrice(checkoutPrice, locale)
    : formatPrice(event, locale);
  const internalHref = availabilityAvailable
    ? "#tickets"
    : localizeHref(locale, "/events");

  useEffect(() => {
    const update = () => setCountdown(countdownTo(event.startsAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [event.startsAt]);

  return (
    <aside className="rounded-2xl border border-white/15 bg-white p-5 text-[#10172a] shadow-2xl shadow-black/25 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            {checkoutEnabled
              ? testSimulation
                ? copy.testOffer
                : copy.ticketsFrom
              : externalSourceLabel(event, locale)}
          </p>
          <p className="mt-1 text-3xl font-black tracking-[-0.03em]">
            {checkoutEnabled || event.priceAvailable === true
              ? checkoutPriceLabel
              : event.sourceName}
          </p>
        </div>
        {checkoutEnabled && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-black ${
              liveStatus?.isLive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <Radio
              size={13}
              className={liveStatus?.isLive ? "animate-pulse" : ""}
              aria-hidden="true"
            />
            {liveStatus?.isLive ? copy.live : copy.connecting}
          </span>
        )}
      </div>

      <div className="my-5 h-px bg-slate-200" />

      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
        <Clock3 size={15} className="text-blue-600" aria-hidden="true" />
        {checkoutEnabled ? copy.saleEndsIn : copy.eventStartsIn}
      </p>
      <div
        className="mt-3 grid grid-cols-4 gap-2"
        aria-label={checkoutEnabled ? copy.saleEndsIn : copy.eventStartsIn}
      >
        {[
          [countdown?.days, copy.days],
          [countdown?.hours, copy.hours],
          [countdown?.minutes, copy.minutes],
          [countdown?.seconds, copy.seconds],
        ].map(([value, label]) => (
          <span
            key={String(label)}
            className="rounded-xl bg-slate-50 px-1 py-2.5 text-center"
          >
            <span className="block text-lg font-black tabular-nums text-slate-950">
              {typeof value === "number"
                ? String(value).padStart(2, "0")
                : "--"}
            </span>
            <span className="mt-0.5 block truncate text-[9px] font-bold uppercase text-slate-500">
              {label}
            </span>
          </span>
        ))}
      </div>

      {checkoutEnabled && availabilityAvailable && (
        <div
          className="mt-4 grid grid-cols-3 gap-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <Metric
            icon={<Ticket size={15} />}
            label={copy.availability}
            value={remaining}
            emphasis
          />
          <Metric
            icon={<Users size={15} />}
            label={copy.queue}
            value={activity?.queueDepth ?? 0}
          />
          <Metric
            icon={<CreditCard size={15} />}
            label={copy.activeCheckouts}
            value={activity?.activeCheckouts ?? 0}
          />
        </div>
      )}

      <a
        href={checkoutEnabled ? internalHref : event.sourceUrl}
        target={checkoutEnabled ? undefined : "_blank"}
        rel={checkoutEnabled ? undefined : "noreferrer"}
        aria-disabled={checkoutEnabled && soldOut ? true : undefined}
        className={`mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-center font-black text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
          checkoutEnabled && soldOut
            ? "cursor-not-allowed bg-slate-400"
            : "bg-[#2457ff] hover:bg-blue-700"
        }`}
      >
        <Ticket size={18} aria-hidden="true" />
        {checkoutEnabled
          ? soldOut
            ? copy.soldOut
            : availabilityAvailable
              ? testSimulation
                ? copy.testCheckout
                : copy.buyTicket
              : copy.backToEvents
          : sourceSellsTickets
            ? copy.buyAt
            : copy.checkAt(event.sourceName)}
      </a>
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-500">
        <ShieldCheck
          size={15}
          className="shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        {checkoutEnabled
          ? testSimulation
            ? copy.testNotice
            : copy.secureVerified
          : sourceSellsTickets
            ? copy.externalSource(event.sourceName)
            : copy.attributedSource(event.sourceName)}
      </p>
      {event.saleMode === "external" && (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 border-t border-slate-200 pt-4 text-center text-xs font-black text-[#2457ff] transition hover:text-blue-800"
        >
          {copy.sourceLink(event.sourceName)}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
    </aside>
  );
}

function Metric({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <span
      className={`rounded-xl p-2.5 ${
        emphasis ? "bg-blue-50 text-blue-800" : "bg-slate-50 text-slate-700"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        <span className="text-lg font-black tabular-nums">{value}</span>
      </span>
      <span className="mt-1 block text-[9px] font-black uppercase leading-3 tracking-wide">
        {label}
      </span>
    </span>
  );
}
