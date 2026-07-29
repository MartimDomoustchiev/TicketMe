import type { Metadata } from "next";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Privacy",
        description:
          "How TicketForge handles personal data and essential cookies.",
      }
    : {
        title: "Поверителност",
        description:
          "Информация за обработването на лични данни и бисквитки в TicketForge.",
      };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const copy = PRIVACY_COPY[locale];

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
            <PrivacySection title={copy.dataTitle}>
              {copy.data}
            </PrivacySection>

            <PrivacySection title={copy.purposeTitle}>
              {copy.purpose}
            </PrivacySection>

            <PrivacySection title={copy.providersTitle}>
              {copy.providers}
            </PrivacySection>

            <PrivacySection title={copy.storageTitle}>
              {copy.storage}
            </PrivacySection>

            <section id="cookies" className="scroll-mt-32">
              <h2 className="text-lg font-black text-slate-950">
                {copy.cookiesTitle}
              </h2>
              <p className="mt-2">
                {copy.cookies}
              </p>
            </section>

            <PrivacySection title={copy.rightsTitle}>
              {copy.rights}
            </PrivacySection>
          </div>
        </article>
      </main>
      <MarketplaceFooter />
    </div>
  );
}

const PRIVACY_COPY = {
  bg: {
    eyebrow: "Лични данни",
    title: "Политика за поверителност",
    updated: "Последна актуализация: 27 юли 2026 г.",
    dataTitle: "Какви данни обработваме",
    data:
      "При вход и поръчка обработваме име, имейл адрес, данни за избрания билет и техническа информация, необходима за защита от злоупотреби.",
    purposeTitle: "За какво използваме данните",
    purpose:
      "Данните са необходими за потвърждаване на имейла, издаване и изпращане на PDF билета, показване на билетите в профила и валидиране на достъпа при събитието.",
    providersTitle: "Доставчици",
    providers:
      "За изпращане на служебни имейли и съхранение на PDF файлове може да използваме специализирани доставчици. До тях се предават само данните, нужни за конкретната услуга.",
    storageTitle: "Съхранение и достъп",
    storage:
      "Достъпът до билетите е ограничен до потвърдения собственик и оторизиран организатор. Данните се пазят за периода, необходим за обслужване на събитието, сигурност и отчетност.",
    cookiesTitle: "Бисквитки",
    cookies:
      "TicketForge използва строго необходими, защитени сесийни бисквитки за вход и авторизация. Те не се използват за рекламно проследяване и изтичат автоматично.",
    rightsTitle: "Вашите права",
    rights:
      "Можете да поискате информация, корекция или изтриване на личните си данни, когато приложимото законодателство позволява това. Някои записи могат да бъдат запазени за сигурност и изпълнение на законови задължения.",
  },
  en: {
    eyebrow: "Personal data",
    title: "Privacy policy",
    updated: "Last updated: 27 July 2026",
    dataTitle: "Data we process",
    data:
      "When you sign in or order, we process your name, email address, selected ticket details and technical information required to prevent abuse.",
    purposeTitle: "How we use the data",
    purpose:
      "The data is required to verify your email, issue and deliver the PDF ticket, display tickets in your account and validate admission at the event.",
    providersTitle: "Service providers",
    providers:
      "We may use specialist providers to deliver transactional emails and store PDF files. They only receive the data required to provide that specific service.",
    storageTitle: "Storage and access",
    storage:
      "Ticket access is restricted to the verified owner and an authorized organizer. Data is retained for as long as needed to operate the event, maintain security and provide an audit record.",
    cookiesTitle: "Cookies",
    cookies:
      "TicketForge uses strictly necessary, secure session cookies for sign-in and authorization. They are not used for advertising tracking and expire automatically.",
    rightsTitle: "Your rights",
    rights:
      "You may request access, correction or deletion of your personal data where applicable law permits. Some records may be retained for security and legal obligations.",
  },
} as const;

function PrivacySection({
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
