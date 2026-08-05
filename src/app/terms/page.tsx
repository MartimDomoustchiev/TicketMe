import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getLocale, localizeHref } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Terms of use",
        description: "Terms for using Tiketko and its e-tickets.",
      }
    : {
        title: "Условия за ползване",
        description:
          "Условия за използване на Tiketko и електронните билети.",
      };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const copy = TERMS_COPY[locale];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <MarketplaceHeader />
      <main id="main-content" className="flex-1 px-4 py-12">
        <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-black uppercase tracking-wider text-[#2457ff]">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {copy.title}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {copy.updated}
          </p>

          <div className="mt-8 space-y-8 text-[15px] leading-7 text-slate-700">
            <LegalSection title={copy.scopeTitle}>
              {copy.scope}
            </LegalSection>

            <LegalSection title={copy.accountTitle}>
              {copy.account}
            </LegalSection>

            <LegalSection title={copy.ticketsTitle}>
              {copy.tickets}
            </LegalSection>

            <LegalSection title={copy.eventDataTitle}>
              {copy.eventData}
            </LegalSection>

            <LegalSection title={copy.useTitle}>
              {copy.use}
            </LegalSection>

            <LegalSection title={copy.dataTitle}>
              {copy.dataPrefix}{" "}
              <Link
                href={localizeHref(locale, "/privacy")}
                className="font-bold text-[#2457ff] underline-offset-4 hover:underline"
              >
                {copy.privacyPolicy}
              </Link>
              .
            </LegalSection>
          </div>
        </article>
      </main>
      <MarketplaceFooter />
    </div>
  );
}

const TERMS_COPY = {
  bg: {
    eyebrow: "Правна информация",
    title: "Условия за ползване",
    updated: "Последна актуализация: 27 юли 2026 г.",
    scopeTitle: "1. Обхват",
    scope:
      "Tiketko предоставя каталог със събития, информация за наличност и възможност за издаване на електронни билети. С използването на услугата приемате настоящите условия.",
    accountTitle: "2. Профил и потвърждение",
    account:
      "За издаване на билет е необходим валиден и потвърден имейл. Потребителят носи отговорност за коректността на въведените име и имейл и за сигурността на достъпа до своята поща.",
    ticketsTitle: "3. Билети и наличност",
    tickets:
      "Наличността се актуализира в реално време. Поръчката се счита за успешна едва след издаване на уникален билет. Всеки PDF билет и QR код са предназначени за еднократен достъп и не трябва да се споделят публично.",
    eventDataTitle: "4. Данни за събитията",
    eventData:
      "Датата, началният час, мястото и правилата за достъп са посочени на страницата на съответното събитие. При промяна важи актуалната информация, публикувана от организатора.",
    useTitle: "5. Допустима употреба",
    use:
      "Не се допуска автоматизирано изкупуване, заобикаляне на опашката, злоупотреба с QR кодове или опит за достъп до чужди билети и административни функции.",
    dataTitle: "6. Лични данни",
    dataPrefix:
      "Обработването на лични данни и използването на сесийни бисквитки са описани в",
    privacyPolicy: "политиката за поверителност",
  },
  en: {
    eyebrow: "Legal information",
    title: "Terms of use",
    updated: "Last updated: 27 July 2026",
    scopeTitle: "1. Scope",
    scope:
      "Tiketko provides an event catalogue, availability information and electronic ticket issuance. By using the service, you agree to these terms.",
    accountTitle: "2. Account and verification",
    account:
      "A valid, verified email address is required before a ticket can be issued. You are responsible for the accuracy of your name and email and for keeping access to your inbox secure.",
    ticketsTitle: "3. Tickets and availability",
    tickets:
      "Availability updates in real time. An order is only successful once a unique ticket has been issued. Each PDF ticket and QR code is intended for one-time admission and must not be shared publicly.",
    eventDataTitle: "4. Event information",
    eventData:
      "The date, start time, venue and admission rules appear on the relevant event page. If details change, the latest information published by the organizer applies.",
    useTitle: "5. Acceptable use",
    use:
      "Automated purchasing, bypassing the queue, QR code abuse and attempts to access another customer's tickets or administrative functions are prohibited.",
    dataTitle: "6. Personal data",
    dataPrefix:
      "Personal data processing and the use of session cookies are described in the",
    privacyPolicy: "privacy policy",
  },
} as const;

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
