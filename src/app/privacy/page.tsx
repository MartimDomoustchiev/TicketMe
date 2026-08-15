import type { Metadata } from "next";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getLocale } from "@/lib/i18n";
import { legalLastUpdatedDate } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Privacy",
        description:
          "How Tiketko handles personal data and essential cookies.",
      }
    : {
        title: "Поверителност",
        description:
          "Информация за обработването на лични данни и бисквитки в Tiketko.",
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
            {copy.updatedPrefix} {legalLastUpdatedDate(locale)}
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
    updatedPrefix: "Последна актуализация:",
    dataTitle: "Какви данни обработваме",
    data:
      "При регистрация, вход и поръчка обработваме име, имейл адрес, данни за избрания билет, платежен статус и идентификатори от Stripe, както и ограничена техническа информация, необходима за защита от злоупотреби. Данните за картата се въвеждат в интерфейса на Stripe и не преминават през Tiketko. Паролите, сесийните и потвърдителните токени се съхраняват само в хеширан вид.",
    purposeTitle: "За какво използваме данните",
    purpose:
      "Използваме данните, за да предоставим поисканата услуга: потвърждение на имейла, тестово или реално плащане според ясно показания режим, издаване и изпращане на PDF файла, показване на записите в профила, проверка на валидни билети за вход, предотвратяване на злоупотреби и изпълнение на приложими законови задължения.",
    providersTitle: "Доставчици",
    providers:
      "Stripe обработва тестовия или активирания платежен интерфейс, Resend доставя служебни имейли, а private S3/R2 хранилище пази PDF файловете. Хостингът и базата данни се обслужват от инфраструктурни доставчици. Всеки доставчик получава само данните, необходими за съответната функция.",
    storageTitle: "Съхранение и достъп",
    storage:
      "Достъпът до билетите е ограничен до потвърдения собственик и оторизиран организатор. Сесиите изтичат най-късно след 14 дни, а линковете за потвърждение - след 30 минути. Данните за поръчки, билети и одит се пазят толкова, колкото е необходимо за събитието, сигурността, отчетността и приложимите законови задължения.",
    cookiesTitle: "Бисквитки",
    cookies:
      "Tiketko използва строго необходими, защитени бисквитки. Бисквитката за вход и авторизация изтича най-късно след 14 дни. Бисквитката за избрания език се пази до една година. Те не се използват за рекламно проследяване.",
    rightsTitle: "Вашите права",
    rights:
      "Можете да поискате информация, корекция или изтриване на личните си данни, когато приложимото законодателство позволява това. Някои записи могат да бъдат запазени за сигурност и изпълнение на законови задължения.",
  },
  en: {
    eyebrow: "Personal data",
    title: "Privacy policy",
    updatedPrefix: "Last updated:",
    dataTitle: "Data we process",
    data:
      "When you register, sign in or order, we process your name, email address, selected ticket, payment status and Stripe identifiers, and limited technical information required to prevent abuse. Card details are entered in Stripe's interface and do not pass through Tiketko. Passwords, session tokens and verification tokens are stored only in hashed form.",
    purposeTitle: "How we use the data",
    purpose:
      "We use the data to provide the requested service: email verification, test or real payment according to the clearly displayed mode, PDF issuance and delivery, account history, verification of valid admission tickets, abuse prevention and compliance with applicable legal obligations.",
    providersTitle: "Service providers",
    providers:
      "Stripe provides the test or enabled payment interface, Resend delivers transactional email, and private S3/R2 storage holds PDF files. Hosting and database infrastructure are operated by infrastructure providers. Each provider receives only the data required for its function.",
    storageTitle: "Storage and access",
    storage:
      "Ticket access is restricted to the verified owner and an authorized organizer. Sessions expire after no more than 14 days and verification links after 30 minutes. Order, ticket and audit records are retained for as long as needed to operate the event, maintain security and records, and meet applicable legal obligations.",
    cookiesTitle: "Cookies",
    cookies:
      "Tiketko uses strictly necessary, secure cookies. The sign-in and authorization cookie expires after no more than 14 days. The selected-language cookie lasts for up to one year. They are not used for advertising tracking.",
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
