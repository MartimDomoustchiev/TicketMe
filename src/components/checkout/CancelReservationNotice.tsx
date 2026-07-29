"use client";

import { Loader2, RotateCcw, TicketX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { localizeHref, type Locale } from "@/lib/i18n-config";

type Status = "releasing" | "released" | "failed";

export function CancelReservationNotice({
  reservationId,
  eventSlug,
  locale,
}: {
  reservationId: string;
  eventSlug: string | null;
  locale: Locale;
}) {
  const [status, setStatus] = useState<Status>("releasing");
  const english = locale === "en";

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/stripe/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Cancellation failed");
        }
        setStatus("released");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setStatus("failed");
        }
      });

    return () => controller.abort();
  }, [reservationId]);

  const returnHref = localizeHref(
    locale,
    eventSlug ? `/events/${eventSlug}#tickets` : "/events",
  );

  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/60 sm:p-10">
      <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        {status === "releasing" ? (
          <Loader2 className="animate-spin" size={30} aria-hidden="true" />
        ) : (
          <TicketX size={30} aria-hidden="true" />
        )}
      </span>
      <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-950">
        {english ? "Checkout cancelled" : "Плащането е отказано"}
      </h1>
      <p className="mx-auto mt-3 max-w-md leading-7 text-slate-600">
        {status === "releasing"
          ? english
            ? "We are releasing your reserved ticket now."
            : "Освобождаваме резервирания билет."
          : status === "released"
            ? english
              ? "You were not charged. The ticket is available for someone else, and you can choose a new one whenever you are ready."
              : "Няма извършено плащане. Билетът отново е свободен, а ти можеш да избереш нов, когато си готов."
            : english
              ? "You were not charged. The reservation will be released automatically when the Stripe session expires."
              : "Няма извършено плащане. Резервацията ще се освободи автоматично при изтичане на Stripe сесията."}
      </p>
      <Link
        href={returnHref}
        className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#2457ff] px-6 font-black text-white transition hover:bg-blue-700"
      >
        <RotateCcw size={18} aria-hidden="true" />
        {english ? "Choose another ticket" : "Избери друг билет"}
      </Link>
    </section>
  );
}
