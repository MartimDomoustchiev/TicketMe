import {
  ArrowRight,
  CheckCircle2,
  Download,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getBuyerSession } from "@/lib/auth";
import { getLocale, localizeHref } from "@/lib/i18n";
import { getBaseUrl } from "@/lib/site";
import { stripeMode } from "@/lib/stripe";
import {
  getCheckoutReservationBySession,
  getTicket,
  type StoredTicket,
} from "@/lib/store";
import { fulfillStripeCheckoutSession } from "@/lib/stripe-fulfillment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Payment confirmation",
  robots: { index: false, follow: false },
};

type CheckoutState = {
  ticket: StoredTicket | null;
  delivered: boolean;
  processing: boolean;
};

async function checkoutState(
  sessionId: string,
  buyerEmail: string,
): Promise<CheckoutState> {
  if (
    (!sessionId.startsWith("cs_test_") &&
      !sessionId.startsWith("cs_live_")) ||
    sessionId.length > 255
  ) {
    return { ticket: null, delivered: false, processing: false };
  }

  const ownedReservation = await getCheckoutReservationBySession(
    sessionId,
  ).catch(() => null);
  if (
    !ownedReservation ||
    ownedReservation.buyerEmail.trim().toLowerCase() !==
      buyerEmail.trim().toLowerCase()
  ) {
    return { ticket: null, delivered: false, processing: false };
  }

  try {
    const delivery = await fulfillStripeCheckoutSession(
      sessionId,
      getBaseUrl(),
    );
    return {
      ticket: delivery.ticket,
      delivered: delivery.delivered,
      processing: delivery.inProgress,
    };
  } catch (error) {
    console.error("Checkout confirmation failed", error);

    // A webhook may already have persisted the paid ticket while its delivery
    // worker is still uploading or emailing. Show that safe intermediate state
    // instead of telling a paid customer the order failed.
    const reservation = await getCheckoutReservationBySession(
      sessionId,
    ).catch(() => null);
    if (
      !reservation ||
      reservation.buyerEmail.trim().toLowerCase() !==
        buyerEmail.trim().toLowerCase()
    ) {
      return { ticket: null, delivered: false, processing: false };
    }
    const ticket = reservation?.ticketId
      ? await getTicket(reservation.ticketId).catch(() => null)
      : null;
    return {
      ticket,
      delivered: reservation?.deliveryStatus === "completed",
      processing:
        reservation?.deliveryStatus === "processing" ||
        reservation?.deliveryStatus === "pending",
    };
  }
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const [locale, buyer, query] = await Promise.all([
    getLocale(),
    getBuyerSession(),
    searchParams,
  ]);
  const english = locale === "en";
  const testMode = stripeMode() === "test";
  const sessionId =
    typeof query.session_id === "string" ? query.session_id : "";
  const state = buyer
    ? await checkoutState(sessionId, buyer.email)
    : { ticket: null, delivered: false, processing: false };
  const isOwner =
    Boolean(state.ticket && buyer) &&
    state.ticket!.buyerEmail.trim().toLowerCase() ===
      buyer!.email.trim().toLowerCase();
  const refreshHref = localizeHref(
    locale,
    `/checkout/success?session_id=${encodeURIComponent(sessionId)}`,
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />
      <main id="main-content" className="flex-1 px-4 py-10 sm:py-16">
        <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div
            className={`px-6 py-9 text-center text-white sm:px-10 ${
              state.ticket ? "bg-emerald-700" : "bg-[#10172a]"
            }`}
          >
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              {state.ticket ? (
                <CheckCircle2 size={33} aria-hidden="true" />
              ) : (
                <RefreshCw size={30} aria-hidden="true" />
              )}
            </span>
            <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
              {state.ticket
                ? english
                  ? testMode
                    ? "Test payment confirmed"
                    : "Payment confirmed"
                  : testMode
                    ? "Тестовото плащане е потвърдено"
                    : "Плащането е потвърдено"
                : english
                  ? "Confirming your payment"
                  : "Потвърждаваме плащането"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-white/80">
              {state.ticket
                ? state.delivered
                  ? english
                    ? testMode
                      ? "No real funds were charged. Your ticket is ready and has been sent to your verified email."
                      : "Your ticket is ready and has been sent to your verified email."
                    : testMode
                      ? "Не са таксувани реални средства. Билетът е готов и е изпратен на потвърдения ти имейл."
                      : "Билетът е готов и е изпратен на потвърдения ти имейл."
                  : english
                    ? "Your order is secured. We are preparing the PDF ticket and email now."
                    : "Поръчката е запазена. Подготвяме PDF билета и имейла."
                : english
                  ? "Stripe is still returning the final status. Refresh this page in a moment."
                  : "Stripe все още връща крайния статус. Обнови страницата след малко."}
            </p>
          </div>

          <div className="p-6 sm:p-10">
            {state.ticket && isOwner ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[#2457ff]">
                      <Ticket size={23} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        {english ? "Your ticket" : "Твоят билет"}
                      </p>
                      <h2 className="mt-1 text-xl font-black">
                        {state.ticket.eventName}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {state.ticket.eventDate} · {state.ticket.venue}
                      </p>
                      <p className="mt-2 break-all font-mono text-xs font-bold text-slate-500">
                        {state.ticket.id}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link
                    href={localizeHref(
                      locale,
                      `/tickets/${state.ticket.id}`,
                    )}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-5 font-black text-white transition hover:bg-blue-700"
                  >
                    <Ticket size={18} aria-hidden="true" />
                    {english ? "View ticket" : "Виж билета"}
                  </Link>
                  {state.delivered ? (
                    <a
                      href={`/api/tickets/${state.ticket.id}/download`}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 font-black text-slate-900 transition hover:bg-slate-50"
                    >
                      <Download size={18} aria-hidden="true" />
                      {english ? "Download PDF" : "Изтегли PDF"}
                    </a>
                  ) : (
                    <Link
                      href={refreshHref}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 font-black text-slate-900 transition hover:bg-slate-50"
                    >
                      <RefreshCw size={18} aria-hidden="true" />
                      {english ? "Check status" : "Провери статуса"}
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="leading-7 text-slate-600">
                  {state.ticket
                    ? english
                      ? "The ticket is protected by the verified buyer account. Sign in with that email to open it here."
                      : "Билетът е защитен в профила на потвърдения купувач. Влез със същия имейл, за да го отвориш."
                    : english
                      ? "If you completed the payment, your ticket will also arrive by email. You can safely check the status again."
                      : "Ако плащането е завършено, билетът ще пристигне и по имейл. Можеш безопасно да провериш статуса отново."}
                </p>
                <Link
                  href={
                    state.ticket
                      ? localizeHref(
                          locale,
                          `/login?next=${encodeURIComponent(refreshHref)}`,
                        )
                      : refreshHref
                  }
                  className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white transition hover:bg-blue-700"
                >
                  {state.ticket ? (
                    <ShieldCheck size={18} aria-hidden="true" />
                  ) : (
                    <RefreshCw size={18} aria-hidden="true" />
                  )}
                  {state.ticket
                    ? english
                      ? "Sign in"
                      : "Вход"
                    : english
                      ? "Check again"
                      : "Провери отново"}
                </Link>
              </div>
            )}

            <div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 text-sm font-bold text-slate-600 sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <ShieldCheck
                  size={18}
                  className="text-emerald-600"
                  aria-hidden="true"
                />
                {english
                  ? "Payment protected by Stripe"
                  : "Плащане, защитено от Stripe"}
              </p>
              <p className="flex items-center gap-2 sm:justify-end">
                <MailCheck
                  size={18}
                  className="text-[#2457ff]"
                  aria-hidden="true"
                />
                {english
                  ? "Delivery to a verified email"
                  : "Доставка до потвърден имейл"}
              </p>
            </div>

            <Link
              href={localizeHref(locale, "/account/tickets")}
              className="mt-6 flex items-center justify-center gap-2 text-sm font-black text-[#2457ff] hover:text-blue-800"
            >
              {english ? "Go to my tickets" : "Към моите билети"}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
