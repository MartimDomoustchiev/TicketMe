"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type StripeTicketResult = {
  ticketId: string;
  ticketUrl: string;
  downloadUrl: string;
  printUrl: string;
  emailDelivered: boolean;
  paymentReference: string;
};

type Props = {
  publishableKey: string;
  clientSecret: string;
  checkoutSessionId: string;
  locale: "bg" | "en";
  onComplete: (result: StripeTicketResult) => void;
};

const stripeClients = new Map<string, Promise<Stripe | null>>();

function stripeClient(publishableKey: string): Promise<Stripe | null> {
  const cached = stripeClients.get(publishableKey);
  if (cached) {
    return cached;
  }

  const client = loadStripe(publishableKey);
  stripeClients.set(publishableKey, client);
  return client;
}

const COPY = {
  bg: {
    finalizing: "Потвърждаваме плащането и подготвяме PDF билета…",
    failed:
      "Плащането е прието, но билетът още се подготвя. Провери статуса от защитената страница.",
    checkStatus: "Провери плащането",
    secured: "Картовите и wallet данните се обработват директно от Stripe.",
  },
  en: {
    finalizing: "Confirming payment and preparing your PDF ticket…",
    failed:
      "The payment was accepted, but the ticket is still being prepared. Check it on the secure status page.",
    checkStatus: "Check payment",
    secured: "Card and wallet details are processed directly by Stripe.",
  },
} as const;

export function StripeEmbeddedCheckout({
  publishableKey,
  clientSecret,
  checkoutSessionId,
  locale,
  onComplete,
}: Props) {
  const [completionState, setCompletionState] = useState<
    "checkout" | "finalizing" | "delayed"
  >("checkout");
  const copy = COPY[locale];
  const onCompleteRef = useRef(onComplete);
  const completionStartedRef = useRef(false);
  const stripePromise = useMemo(
    () => stripeClient(publishableKey),
    [publishableKey],
  );

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finishCheckout = useCallback(async () => {
    if (completionStartedRef.current) {
      return;
    }

    completionStartedRef.current = true;
    setCompletionState("finalizing");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const response = await fetch("/api/stripe/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: checkoutSessionId,
            locale,
          }),
        });
        const payload = (await response.json()) as Partial<StripeTicketResult> & {
          error?: string;
          status?: string;
        };

        if (
          response.ok &&
          payload.status === "ready" &&
          payload.ticketId &&
          payload.ticketUrl &&
          payload.downloadUrl &&
          payload.printUrl &&
          payload.paymentReference
        ) {
          onCompleteRef.current(payload as StripeTicketResult);
          return;
        }
      } catch {
        // A later attempt can recover from a short network interruption.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }

    setCompletionState("delayed");
  }, [checkoutSessionId, locale]);

  const options = useMemo(
    () => ({
      clientSecret,
      onComplete: finishCheckout,
    }),
    [clientSecret, finishCheckout],
  );
  const statusHref = `/${locale}/checkout/success?session_id=${encodeURIComponent(checkoutSessionId)}`;

  if (completionState !== "checkout") {
    return (
      <div
        className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center"
        role="status"
        aria-live="polite"
      >
        {completionState === "finalizing" ? (
          <Loader2
            className="mx-auto animate-spin text-blue-700"
            size={30}
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck
            className="mx-auto text-blue-700"
            size={30}
            aria-hidden="true"
          />
        )}
        <p className="mt-3 text-sm font-bold leading-6 text-blue-950">
          {completionState === "finalizing" ? copy.finalizing : copy.failed}
        </p>
        {completionState === "delayed" && (
          <Link
            href={statusHref}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800"
          >
            {copy.checkStatus}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="min-h-80 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout className="min-h-80" />
        </EmbeddedCheckoutProvider>
      </div>
      <p className="mt-3 flex items-center justify-center gap-2 text-center text-[11px] font-bold leading-5 text-slate-500">
        <ShieldCheck
          size={14}
          className="shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        {copy.secured}
      </p>
    </div>
  );
}
