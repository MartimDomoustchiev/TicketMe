"use client";

import {
  Check,
  CreditCard,
  Loader2,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Ticket,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BuyerSession } from "@/lib/auth";
import {
  formatDualCurrencyPrice,
  type CatalogEvent,
  type TicketTypeId,
} from "@/lib/event";
import type { Availability } from "@/lib/store";

type Props = {
  event: CatalogEvent;
  initialAvailability: Availability;
  initialSession: BuyerSession | null;
  locale?: "bg" | "en";
};

const COPY = {
  bg: {
    ticketTypesEyebrow: "Видове билети",
    chooseTicket: "Избери своя билет",
    live: "Наличност на живо",
    connecting: "Свързване…",
    soldOut: "Изчерпан",
    available: "налични",
    order: "Твоята поръчка",
    electronicTicket: "Електронен PDF билет",
    total: "Общо",
    remaining: "билета остават за събитието",
    soldProgress: "Продадени билети",
    verifiedEmail: "Потвърден имейл",
    redirecting: "Отваряме сигурното плащане…",
    checkout: "Продължи към плащане",
    signInTitle: "Вход преди поръчка",
    signInText: "Потвърди имейла си, за да получиш и изтеглиш билета.",
    signIn: "Вход или регистрация",
    secureIssuing: "Сигурно издаване",
    liveAvailability: "Жива наличност",
    processedBy: "Плащането се обработва сигурно от Stripe",
    paymentOptions: "Карта и допустими дигитални портфейли",
    walletHint:
      "Stripe Checkout показва само методите, налични за твоето устройство, държава и настройките на портфейла.",
    agreementStart: "С продължаването приемаш",
    terms: "Условията",
    and: "и",
    privacy: "Политиката за поверителност",
    genericError: "Плащането не можа да бъде стартирано. Опитай отново.",
    networkError: "Връзката беше прекъсната. Опитай отново.",
  },
  en: {
    ticketTypesEyebrow: "Ticket types",
    chooseTicket: "Choose your ticket",
    live: "Live availability",
    connecting: "Connecting…",
    soldOut: "Sold out",
    available: "available",
    order: "Your order",
    electronicTicket: "Electronic PDF ticket",
    total: "Total",
    remaining: "tickets left for this event",
    soldProgress: "Tickets sold",
    verifiedEmail: "Verified email",
    redirecting: "Opening secure checkout…",
    checkout: "Continue to payment",
    signInTitle: "Sign in to purchase",
    signInText: "Verify your email to receive and download your ticket.",
    signIn: "Sign in or register",
    secureIssuing: "Secure ticketing",
    liveAvailability: "Live availability",
    processedBy: "Secure payment processing by Stripe",
    paymentOptions: "Card and eligible digital wallets",
    walletHint:
      "Stripe Checkout only shows methods available for your device, country, and wallet setup.",
    agreementStart: "By continuing, you accept the",
    terms: "Terms",
    and: "and",
    privacy: "Privacy Policy",
    genericError: "We could not start the payment. Please try again.",
    networkError: "The connection was interrupted. Please try again.",
  },
} as const;

const TICKET_COPY = {
  bg: {
    fan: {
      label: "Фен зона",
      description: "Най-близо до сцената и сърцето на събитието.",
    },
    standard: {
      label: "Стандартен",
      description: "Пълен достъп до събитието и всички основни зони.",
    },
    premium: {
      label: "Премиум",
      description: "Приоритетен вход и премиум зона с отлична гледка.",
    },
  },
  en: {
    fan: {
      label: "Fan zone",
      description: "Closest to the stage and the heart of the event.",
    },
    standard: {
      label: "Standard",
      description: "Full event access and entry to all main areas.",
    },
    premium: {
      label: "Premium",
      description: "Priority entry and a premium area with a great view.",
    },
  },
} as const;

export function TicketDesk({
  event,
  initialAvailability,
  initialSession,
  locale = "bg",
}: Props) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [selectedType, setSelectedType] = useState<TicketTypeId>(
    event.ticketTypes.find((type) => type.id === "standard")?.id ??
      event.ticketTypes[0].id,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const session = initialSession;
  const copy = COPY[locale];

  useEffect(() => {
    const source = new EventSource(
      `/api/events?eventId=${encodeURIComponent(event.id)}`,
    );

    source.onopen = () => setIsLive(true);
    source.onmessage = (messageEvent) => {
      try {
        setAvailability(JSON.parse(messageEvent.data) as Availability);
        setIsLive(true);
      } catch {
        setIsLive(false);
      }
    };
    source.onerror = () => setIsLive(false);

    return () => source.close();
  }, [event.id]);

  const selectedTicket = useMemo(
    () =>
      event.ticketTypes.find((type) => type.id === selectedType) ??
      event.ticketTypes[0],
    [event.ticketTypes, selectedType],
  );
  const selectedRemaining = availability.byType[selectedType] ?? 0;
  const selectedTicketCopy = TICKET_COPY[locale][selectedTicket.id];
  const selectedPrice = formatDualCurrencyPrice(
    selectedTicket.price,
    locale,
  );
  const soldPercent =
    availability.totalCapacity > 0
      ? Math.round(
          (availability.sold / availability.totalCapacity) * 100,
        )
      : 0;

  async function buyTicket() {
    if (isBuying || selectedRemaining <= 0) {
      return;
    }

    setIsBuying(true);
    setMessage(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          ticketType: selectedType,
          locale,
        }),
      });
      const data = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.checkoutUrl) {
        setMessage(data.error ?? copy.genericError);
        return;
      }

      window.location.assign(data.checkoutUrl);
    } catch {
      setMessage(copy.networkError);
    } finally {
      setIsBuying(false);
    }
  }

  return (
    <section id="tickets" className="scroll-mt-24">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
                {copy.ticketTypesEyebrow}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {copy.chooseTicket}
              </h2>
            </div>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${
                isLive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <Radio size={14} className={isLive ? "animate-pulse" : ""} />
              {isLive ? copy.live : copy.connecting}
            </span>
          </div>

          <div className="mt-6 grid gap-3">
            {event.ticketTypes.map((type) => {
              const isSelected = type.id === selectedType;
              const remaining = availability.byType[type.id] ?? 0;
              const isSoldOut = remaining <= 0;

              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isSoldOut}
                  onClick={() => setSelectedType(type.id)}
                  className={`group flex min-h-28 w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition sm:p-5 ${
                    isSelected
                      ? "border-blue-600 shadow-[0_12px_35px_rgba(37,99,235,0.12)] ring-1 ring-blue-600"
                      : "border-slate-200 hover:border-slate-400 hover:shadow-md"
                  } disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  <span
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-transparent"
                    }`}
                  >
                    <Check size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-black text-slate-950">
                      {TICKET_COPY[locale][type.id].label}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {TICKET_COPY[locale][type.id].description}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xl font-black text-slate-950">
                      {formatDualCurrencyPrice(type.price, locale)}
                    </span>
                    <span className="mt-1 block text-xs font-bold text-slate-500">
                      {isSoldOut
                        ? copy.soldOut
                        : `${remaining} ${copy.available}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">{copy.order}</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                {event.name}
              </h3>
            </div>
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Ticket size={21} />
            </span>
          </div>

          <div className="mt-5 border-y border-slate-200 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-slate-950">
                  1 × {selectedTicketCopy.label}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {copy.electronicTicket}
                </p>
              </div>
              <p className="font-black text-slate-950">
                {selectedPrice}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-4 text-lg">
            <span className="font-bold text-slate-600">{copy.total}</span>
            <span className="text-2xl font-black text-slate-950">
              {selectedPrice}
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={copy.soldProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={soldPercent}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${soldPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">
              {availability.totalRemaining} {copy.remaining}
            </p>
          </div>

          {session ? (
            <>
              <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-emerald-900">
                  <ShieldCheck size={17} />
                  {copy.verifiedEmail}
                </p>
                <p className="mt-1 truncate text-sm text-emerald-800">
                  {session.email}
                </p>
              </div>
              <button
                type="button"
                onClick={buyTicket}
                disabled={isBuying || selectedRemaining <= 0}
                aria-busy={isBuying}
                className="mt-4 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isBuying ? (
                  <Loader2 className="animate-spin" size={19} />
                ) : (
                  <CreditCard size={18} />
                )}
                {isBuying ? copy.redirecting : copy.checkout}
              </button>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="flex items-center justify-center gap-2 text-xs font-black text-slate-700">
                  <WalletCards
                    size={16}
                    className="text-blue-600"
                    aria-hidden="true"
                  />
                  {copy.paymentOptions}
                </p>
                <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                  {copy.walletHint}
                </p>
              </div>
              <p className="mt-3 text-center text-xs font-bold text-slate-500">
                {copy.processedBy}
              </p>
              <p className="mt-2 text-center text-[11px] leading-5 text-slate-500">
                {copy.agreementStart}{" "}
                <Link
                  href={`/${locale}/terms`}
                  className="font-bold underline underline-offset-2 hover:text-slate-800"
                >
                  {copy.terms}
                </Link>{" "}
                {copy.and}{" "}
                <Link
                  href={`/${locale}/privacy`}
                  className="font-bold underline underline-offset-2 hover:text-slate-800"
                >
                  {copy.privacy}
                </Link>
                .
              </p>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="flex items-center gap-2 text-sm font-black text-blue-950">
                <LockKeyhole size={17} />
                {copy.signInTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                {copy.signInText}
              </p>
              <Link
                href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/events/${event.slug}#tickets`)}`}
                className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 font-black text-white transition hover:bg-slate-800"
              >
                {copy.signIn}
              </Link>
            </div>
          )}

          <div aria-live="polite">
            {message && (
              <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                {message}
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-600" />
              {copy.secureIssuing}
            </span>
            <span className="flex items-center justify-end gap-1.5">
              <Radio size={15} className="text-blue-600" />
              {copy.liveAvailability}
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
