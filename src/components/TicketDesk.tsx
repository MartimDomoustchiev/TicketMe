"use client";

import {
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  Loader2,
  LockKeyhole,
  Printer,
  Radio,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  StripeEmbeddedCheckout,
  type StripeTicketResult,
} from "@/components/checkout/StripeEmbeddedCheckout";
import { useLiveTicketingStatus } from "@/components/ticketing/LiveTicketingProvider";
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
  stripePublishableKey: string | null;
  locale?: "bg" | "en";
};

type StripeCheckoutSession = {
  clientSecret: string;
  checkoutSessionId: string;
  reservationId: string;
  expiresAt: string;
  mode: "test";
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
    processing: "Създаваме защитената Stripe форма…",
    payStripe: "Плати със Stripe",
    signInTitle: "Вход преди поръчка",
    signInText: "Потвърди имейла си, за да получиш и изтеглиш билета.",
    signIn: "Вход или регистрация",
    secureIssuing: "Сигурно издаване",
    liveAvailability: "Жива наличност",
    processedBy: "Stripe test mode — няма реално таксуване",
    paymentOptions: "Stripe плащане в TicketMe",
    walletHint: "Карта · Apple Pay · Google Pay",
    reservationWindow:
      "При отваряне мястото се резервира през честната опашка. Stripe формата остава в TicketMe.",
    testNoticeTitle: "Stripe sandbox",
    testNotice:
      "Използвай тестова карта 4242 4242 4242 4242, бъдеща дата и произволен CVC. Apple Pay и Google Pay се показват само на поддържани устройства.",
    successTitle: "Тестовото Stripe плащане е успешно",
    successText: "Твоят PDF билет с QR код е готов.",
    paymentReference: "Stripe референция",
    cancelCheckout: "Смени билета",
    cancellingCheckout: "Освобождаваме мястото…",
    missingPublishableKey:
      "Stripe sandbox конфигурацията е непълна. Нужни са matching sk_test_, pk_test_ и whsec_ стойности.",
    openTicket: "Виж билета",
    downloadPdf: "Изтегли PDF",
    printPdf: "Отвори за печат",
    buyAnother: "Купи още един",
    emailSent: "Билетът е изпратен и по имейл.",
    emailPending:
      "Билетът е готов в профила ти; имейлът ще бъде изпратен повторно.",
    agreementStart: "С продължаването приемаш",
    terms: "Условията",
    and: "и",
    privacy: "Политиката за поверителност",
    genericError: "Билетът не можа да бъде издаден. Опитай отново.",
    networkError: "Връзката беше прекъсната. Опитай отново.",
    queueNow: "в опашката сега",
    activeCheckouts: "активни Stripe плащания",
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
    processing: "Creating the secure Stripe form…",
    payStripe: "Pay with Stripe",
    signInTitle: "Sign in to purchase",
    signInText: "Verify your email to receive and download your ticket.",
    signIn: "Sign in or register",
    secureIssuing: "Secure ticketing",
    liveAvailability: "Live availability",
    processedBy: "Stripe test mode — no real charge",
    paymentOptions: "Stripe payment inside TicketMe",
    walletHint: "Card · Apple Pay · Google Pay",
    reservationWindow:
      "Opening checkout reserves the ticket through the fair queue. The Stripe form stays inside TicketMe.",
    testNoticeTitle: "Stripe sandbox",
    testNotice:
      "Use test card 4242 4242 4242 4242, any future date and any CVC. Apple Pay and Google Pay only appear on eligible devices.",
    successTitle: "Stripe test payment successful",
    successText: "Your PDF ticket with its QR code is ready.",
    paymentReference: "Stripe reference",
    cancelCheckout: "Change ticket",
    cancellingCheckout: "Releasing the ticket…",
    missingPublishableKey:
      "Stripe sandbox configuration is incomplete. Matching sk_test_, pk_test_, and whsec_ values are required.",
    openTicket: "View ticket",
    downloadPdf: "Download PDF",
    printPdf: "Open to print",
    buyAnother: "Buy another",
    emailSent: "The ticket was also sent by email.",
    emailPending:
      "The ticket is ready in your account; email delivery will be retried.",
    agreementStart: "By continuing, you accept the",
    terms: "Terms",
    and: "and",
    privacy: "Privacy Policy",
    genericError: "We could not issue the ticket. Please try again.",
    networkError: "The connection was interrupted. Please try again.",
    queueNow: "in queue now",
    activeCheckouts: "active checkouts",
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
  stripePublishableKey,
  locale = "bg",
}: Props) {
  const [selectedType, setSelectedType] = useState<TicketTypeId>(
    event.ticketTypes.find((type) => type.id === "standard")?.id ??
      event.ticketTypes[0].id,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [stripeSession, setStripeSession] =
    useState<StripeCheckoutSession | null>(null);
  const [purchaseResult, setPurchaseResult] =
    useState<StripeTicketResult | null>(null);
  const liveStatus = useLiveTicketingStatus();
  const availability =
    liveStatus?.availability ?? initialAvailability;
  const activity = liveStatus?.activity ?? {
    queueDepth: 0,
    activeCheckouts: 0,
  };
  const isLive = liveStatus?.isLive ?? false;
  const session = initialSession;
  const copy = COPY[locale];

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

  async function startStripeCheckout() {
    if (
      isBuying ||
      stripeSession ||
      !stripePublishableKey ||
      selectedRemaining <= 0
    ) {
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
      const data = (await response.json()) as Partial<StripeCheckoutSession> & {
        error?: string;
      };

      if (
        !response.ok ||
        !data.clientSecret ||
        !data.checkoutSessionId ||
        !data.reservationId ||
        !data.expiresAt ||
        data.mode !== "test"
      ) {
        setMessage(data.error ?? copy.genericError);
        return;
      }

      setStripeSession(data as StripeCheckoutSession);
    } catch {
      setMessage(copy.networkError);
    } finally {
      setIsBuying(false);
    }
  }

  async function cancelStripeCheckout() {
    if (!stripeSession || isCancelling) {
      return;
    }

    setIsCancelling(true);
    setMessage(null);

    try {
      const response = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: stripeSession.reservationId,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        completed?: boolean;
      };

      if (!response.ok) {
        setMessage(payload.error ?? copy.genericError);
        return;
      }

      if (payload.completed) {
        setMessage(copy.genericError);
        return;
      }

      setStripeSession(null);
    } catch {
      setMessage(copy.networkError);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <section id="tickets" className="scroll-mt-24">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px]">
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
                  disabled={isSoldOut || Boolean(stripeSession)}
                  onClick={() => setSelectedType(type.id)}
                  className={`group flex min-h-28 w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left transition sm:items-center sm:gap-4 sm:p-5 ${
                    isSelected
                      ? "border-blue-600 shadow-[0_12px_35px_rgba(37,99,235,0.12)] ring-1 ring-blue-600"
                      : "border-slate-200 hover:border-slate-400 hover:shadow-md"
                  } disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 sm:h-11 sm:w-11 ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-transparent"
                    }`}
                  >
                    <Check size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <span className="block text-lg font-black text-slate-950">
                        {TICKET_COPY[locale][type.id].label}
                      </span>
                      <span className="block break-words text-base font-black leading-6 text-slate-950 sm:shrink-0 sm:text-right sm:text-xl">
                        {formatDualCurrencyPrice(type.price, locale)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {TICKET_COPY[locale][type.id].description}
                    </span>
                    <span className="mt-2 block text-xs font-bold text-slate-500">
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
              <p className="max-w-[58%] text-right text-sm font-black leading-6 text-slate-950 sm:text-base">
                {selectedPrice}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-4 text-lg">
            <span className="font-bold text-slate-600">{copy.total}</span>
            <span className="max-w-[62%] text-right text-xl font-black leading-7 text-slate-950 sm:text-2xl">
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

          <div className="mt-4 grid grid-cols-2 gap-2">
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
              <Users size={15} className="text-blue-600" aria-hidden="true" />
              <span>
                <strong className="tabular-nums">
                  {activity.queueDepth}
                </strong>{" "}
                {copy.queueNow}
              </span>
            </p>
            <p className="flex items-center justify-end gap-2 rounded-xl bg-slate-50 px-3 py-2 text-right text-xs font-black text-slate-700">
              <CreditCard
                size={15}
                className="text-blue-600"
                aria-hidden="true"
              />
              <span>
                <strong className="tabular-nums">
                  {activity.activeCheckouts}
                </strong>{" "}
                {copy.activeCheckouts}
              </span>
            </p>
          </div>

          {purchaseResult ? (
            <div
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
              role="status"
              aria-live="polite"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
                <CheckCircle2 size={23} aria-hidden="true" />
              </span>
              <h4 className="mt-3 text-lg font-black text-emerald-950">
                {copy.successTitle}
              </h4>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                {copy.successText}
              </p>
              <dl className="mt-3 rounded-xl bg-white/75 p-3 text-xs text-emerald-950">
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-bold">{copy.paymentReference}</dt>
                  <dd className="break-all text-right font-mono font-black">
                    {purchaseResult.paymentReference}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs font-bold leading-5 text-emerald-800">
                {purchaseResult.emailDelivered
                  ? copy.emailSent
                  : copy.emailPending}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Link
                  href={purchaseResult.ticketUrl}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800"
                >
                  <Ticket size={17} aria-hidden="true" />
                  {copy.openTicket}
                </Link>
                <a
                  href={purchaseResult.downloadUrl}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-emerald-800 ring-1 ring-emerald-300 transition hover:bg-emerald-100"
                >
                  <Download size={17} aria-hidden="true" />
                  {copy.downloadPdf}
                </a>
                <a
                  href={purchaseResult.printUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-emerald-800 ring-1 ring-emerald-300 transition hover:bg-emerald-100"
                >
                  <Printer size={17} aria-hidden="true" />
                  {copy.printPdf}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPurchaseResult(null);
                    setStripeSession(null);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  {copy.buyAnother}
                </button>
              </div>
            </div>
          ) : session ? (
            <>
              <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-black text-emerald-900">
                  <ShieldCheck size={17} aria-hidden="true" />
                  {copy.verifiedEmail}
                </p>
                <p className="mt-1 truncate text-sm text-emerald-800">
                  {session.email}
                </p>
              </div>
              {stripeSession && stripePublishableKey ? (
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">
                        Stripe · Test mode
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {copy.walletHint}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelStripeCheckout}
                      disabled={isCancelling}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCancelling ? (
                        <Loader2
                          className="animate-spin"
                          size={15}
                          aria-hidden="true"
                        />
                      ) : (
                        <X size={15} aria-hidden="true" />
                      )}
                      {isCancelling
                        ? copy.cancellingCheckout
                        : copy.cancelCheckout}
                    </button>
                  </div>
                  <StripeEmbeddedCheckout
                    publishableKey={stripePublishableKey}
                    clientSecret={stripeSession.clientSecret}
                    checkoutSessionId={stripeSession.checkoutSessionId}
                    locale={locale}
                    onComplete={(result) => {
                      setStripeSession(null);
                      setPurchaseResult(result);
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border border-blue-100 bg-[linear-gradient(145deg,#f8fbff,#eef4ff)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                          {copy.paymentOptions}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {copy.processedBy}
                        </p>
                      </div>
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#635bff] text-white shadow-sm">
                        <WalletCards size={20} aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                      <span className="rounded-lg bg-black px-2 py-2 text-white">
                        Apple Pay
                      </span>
                      <span className="rounded-lg bg-white px-2 py-2 text-slate-800 ring-1 ring-slate-200">
                        G Pay
                      </span>
                      <span className="rounded-lg bg-white px-2 py-2 text-slate-800 ring-1 ring-slate-200">
                        Card
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                    <p className="flex items-center gap-2 text-xs font-black text-amber-950">
                      <ShieldCheck
                        size={16}
                        className="shrink-0 text-amber-700"
                        aria-hidden="true"
                      />
                      {copy.testNoticeTitle}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-amber-900">
                      {copy.testNotice}
                    </p>
                  </div>
                  <p className="mt-3 text-xs font-bold leading-5 text-slate-600">
                    {copy.reservationWindow}
                  </p>
                  {!stripePublishableKey && (
                    <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-800">
                      {copy.missingPublishableKey}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={startStripeCheckout}
                    disabled={
                      isBuying ||
                      !stripePublishableKey ||
                      selectedRemaining <= 0
                    }
                    aria-busy={isBuying}
                    className="mt-3 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#635bff] px-5 font-black text-white transition hover:bg-[#5148e5] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isBuying ? (
                      <Loader2
                        className="animate-spin"
                        size={19}
                        aria-hidden="true"
                      />
                    ) : (
                      <CreditCard size={18} aria-hidden="true" />
                    )}
                    {isBuying
                      ? copy.processing
                      : `${copy.payStripe} · ${selectedPrice}`}
                  </button>
                  <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
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
              )}
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
