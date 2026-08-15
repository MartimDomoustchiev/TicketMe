import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getLocale, localizeHref } from "@/lib/i18n";
import { legalLastUpdatedDate } from "@/lib/legal";

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
            {copy.updatedPrefix} {legalLastUpdatedDate(locale)}
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

            <LegalSection title={copy.paymentsTitle}>
              {copy.payments}
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
    updatedPrefix: "Последна актуализация:",
    scopeTitle: "1. Обхват",
    scope:
      "Tiketko предоставя каталог със събития, информация за наличност и възможност за издаване на електронни билети. С използването на услугата приемате настоящите условия.",
    accountTitle: "2. Профил и потвърждение",
    account:
      "За издаване на билет е необходим валиден и потвърден имейл. Потребителят носи отговорност за коректността на въведените име и имейл и за сигурността на достъпа до своята поща.",
    ticketsTitle: "3. Билети и наличност",
    tickets:
      "Наличността се актуализира в реално време. Поръчката се счита за успешна едва след издаване на уникален запис. Само PDF и QR код, изрично означени като билет за вход, могат да се използват еднократно на събитието. Записите, означени като тестова симулация, не важат за вход. Не споделяйте билетни файлове или QR кодове публично.",
    paymentsTitle: "4. Плащания и външни източници",
    payments:
      "Stripe test mode не таксува реални средства. Правото на вход се определя отделно от вида на показаната оферта: билетът за вход може да бъде проверен на събитието, а тестовата симулация не може. Когато Tiketko препраща към външен източник или продавач, наличността, плащането, анулирането и възстановяването на средства се уреждат от условията на съответния продавач. Режимът, видът на офертата и източникът се показват преди продължаване.",
    eventDataTitle: "5. Данни за събитията",
    eventData:
      "Датата, началният час, мястото и правилата за достъп са посочени на страницата на съответното събитие. При промяна важи актуалната информация, публикувана от организатора.",
    useTitle: "6. Допустима употреба",
    use:
      "Не се допуска автоматизирано изкупуване, заобикаляне на опашката, злоупотреба с QR кодове или опит за достъп до чужди билети и административни функции.",
    dataTitle: "7. Лични данни",
    dataPrefix:
      "Обработването на лични данни и използването на сесийни бисквитки са описани в",
    privacyPolicy: "политиката за поверителност",
  },
  en: {
    eyebrow: "Legal information",
    title: "Terms of use",
    updatedPrefix: "Last updated:",
    scopeTitle: "1. Scope",
    scope:
      "Tiketko provides an event catalogue, availability information and electronic ticket issuance. By using the service, you agree to these terms.",
    accountTitle: "2. Account and verification",
    account:
      "A valid, verified email address is required before a ticket can be issued. You are responsible for the accuracy of your name and email and for keeping access to your inbox secure.",
    ticketsTitle: "3. Tickets and availability",
    tickets:
      "Availability updates in real time. An order is only successful once a unique record has been issued. Only a PDF and QR code explicitly identified as an admission ticket may be used once at the event. Records identified as test simulations are not valid for admission. Do not share ticket files or QR codes publicly.",
    paymentsTitle: "4. Payments and external sources",
    payments:
      "Stripe test mode does not charge real funds. Admission rights are determined separately by the displayed offer type: an admission ticket can be checked at the event, while a test simulation cannot. When Tiketko links to an external source or seller, availability, payment, cancellation and refunds are governed by that seller's terms. The applicable mode, offer type and source are shown before you continue.",
    eventDataTitle: "5. Event information",
    eventData:
      "The date, start time, venue and admission rules appear on the relevant event page. If details change, the latest information published by the organizer applies.",
    useTitle: "6. Acceptable use",
    use:
      "Automated purchasing, bypassing the queue, QR code abuse and attempts to access another customer's tickets or administrative functions are prohibited.",
    dataTitle: "7. Personal data",
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
