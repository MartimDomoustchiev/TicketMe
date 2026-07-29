import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Ticket,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AuthPortal,
  type AuthMode,
} from "@/components/auth/AuthPortal";
import { LocaleSwitcher } from "@/components/marketplace/LocaleSwitcher";
import { getActiveAccount } from "@/lib/auth";
import { EVENT } from "@/lib/event";
import { getLocale, localizeHref } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return {
    title:
      locale === "en"
        ? "Sign in or create an account"
        : "Вход или създаване на профил",
    description:
      locale === "en"
        ? "Securely access your TicketMe account and tickets."
        : "Сигурен достъп до твоя TicketMe профил и билети.",
    robots: {
      index: false,
      follow: true,
    },
  };
}

type LoginSearchParams = {
  error?: string | string[];
  sent?: string | string[];
  email?: string | string[];
  mode?: string | string[];
  next?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function authHref({
  locale,
  mode,
  next,
  email,
}: {
  locale: "bg" | "en";
  mode: AuthMode;
  next: string;
  email?: string;
}): string {
  const params = new URLSearchParams({ mode, next });
  if (email) params.set("email", email);
  return `${localizeHref(locale, "/login")}?${params.toString()}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const [locale, query, accountState] = await Promise.all([
    getLocale(),
    searchParams,
    getActiveAccount()
      .then((account) => ({
        account,
        serviceUnavailable: false,
      }))
      .catch((error) => {
        console.error("Unable to load the active account.", error);
        return {
          account: null,
          serviceUnavailable: true,
        };
      }),
  ]);
  const { account } = accountState;
  const copy = PAGE_COPY[locale];

  if (account?.role === "admin") {
    redirect(localizeHref(locale, "/admin"));
  }

  const rawEmail = first(query.email)?.trim() ?? "";
  const email = rawEmail.slice(0, 254);
  const mode: AuthMode =
    first(query.mode) === "signup" ? "signup" : "login";
  const next = localizeHref(
    locale,
    safeReturnPath(
      first(query.next),
      localizeHref(locale, "/events"),
    ),
  );
  const loginHref = authHref({ locale, mode: "login", next, email });
  const signupHref = authHref({ locale, mode: "signup", next, email });
  const localEmailFallback =
    process.env.NODE_ENV !== "production" &&
    (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[#f5f7fb] text-[#111827]"
    >
      <div className="grid min-h-screen xl:grid-cols-[minmax(520px,0.94fr)_minmax(620px,1.06fr)]">
        <section className="relative isolate hidden min-h-screen overflow-hidden bg-[#0b1224] p-8 text-white xl:flex xl:flex-col 2xl:p-11">
          <Image
            src={EVENT.heroImage}
            alt=""
            fill
            loading="eager"
            sizes="46vw"
            className="-z-30 object-cover"
          />
          <div className="absolute inset-0 -z-20 bg-[linear-gradient(120deg,rgba(7,14,31,0.98)_4%,rgba(11,24,54,0.93)_52%,rgba(23,69,192,0.68)_100%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_18%,rgba(96,165,250,0.2),transparent_34%),linear-gradient(to_top,rgba(7,14,31,0.92),transparent_56%)]" />

          <Link
            href={localizeHref(locale, "/")}
            aria-label={copy.homeAria}
            className="inline-flex w-fit items-center gap-3 rounded-xl font-black tracking-[-0.04em] transition hover:opacity-90"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2864ff] shadow-[0_12px_36px_rgba(40,100,255,0.4)]">
              <Ticket size={22} aria-hidden="true" />
            </span>
            <span className="text-xl">TicketMe</span>
          </Link>

          <div className="my-auto max-w-xl py-14">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-100 backdrop-blur-md">
              <Sparkles size={15} aria-hidden="true" />
              {copy.eyebrow}
            </p>
            <p className="mt-7 text-5xl font-black leading-[1.02] tracking-[-0.055em] 2xl:text-[3.6rem]">
              {copy.heroTitle}
            </p>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-200 2xl:text-lg 2xl:leading-8">
              {copy.heroText}
            </p>

            <div className="mt-9 grid gap-3">
              <HeroFeature
                icon={<BadgeCheck size={19} aria-hidden="true" />}
                title={copy.oneAccountTitle}
                text={copy.oneAccountText}
              />
              <HeroFeature
                icon={<Zap size={19} aria-hidden="true" />}
                title={copy.fastTitle}
                text={copy.fastText}
              />
              <HeroFeature
                icon={<ShieldCheck size={19} aria-hidden="true" />}
                title={copy.secureTitle}
                text={copy.secureText}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6 border-t border-white/10 pt-5 text-xs font-semibold text-slate-300">
            <span className="inline-flex items-center gap-2">
              <LockKeyhole
                size={15}
                className="text-blue-300"
                aria-hidden="true"
              />
              {copy.secureConnection}
            </span>
            <span>{copy.footerNote}</span>
          </div>
        </section>

        <section className="flex min-h-screen flex-col bg-white">
          <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200/80 px-4 sm:px-8 lg:px-12">
            <Link
              href={localizeHref(locale, "/")}
              aria-label={copy.homeAria}
              className="inline-flex items-center gap-2.5 font-black tracking-[-0.04em] xl:hidden"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-[#2864ff] text-white">
                <Ticket size={18} aria-hidden="true" />
              </span>
              TicketMe
            </Link>

            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              <div className="rounded-lg bg-[#111a30]">
                <LocaleSwitcher />
              </div>
              <Link
                href={localizeHref(locale, "/events")}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-[#1f55e5] sm:px-3"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span className="hidden sm:inline">{copy.backToEvents}</span>
                <span className="sr-only sm:hidden">{copy.backToEvents}</span>
              </Link>
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center px-4 py-7 sm:px-8 sm:py-9 lg:px-12">
            <div className="w-full max-w-[540px]">
              <div className="mb-5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2864ff] ring-1 ring-blue-100">
                  <LockKeyhole size={20} aria-hidden="true" />
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[2.15rem]">
                  {mode === "signup"
                    ? copy.signupTitle
                    : copy.loginTitle}
                </h1>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {mode === "signup"
                    ? copy.signupDescription
                    : copy.loginDescription}
                </p>
              </div>

              <AuthPortal
                locale={locale}
                mode={mode}
                next={next}
                email={email}
                error={
                  accountState.serviceUnavailable
                    ? "service-unavailable"
                    : first(query.error)
                }
                sent={first(query.sent)}
                loginHref={loginHref}
                signupHref={signupHref}
                account={account}
                localEmailFallback={localEmailFallback}
              />

              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2
                    size={14}
                    className="text-emerald-600"
                    aria-hidden="true"
                  />
                  {copy.protected}
                </span>
                <Link
                  href={localizeHref(locale, "/terms")}
                  className="underline decoration-slate-300 underline-offset-4 transition hover:text-[#1f55e5]"
                >
                  {copy.terms}
                </Link>
                <Link
                  href={localizeHref(locale, "/privacy")}
                  className="underline decoration-slate-300 underline-offset-4 transition hover:text-[#1f55e5]"
                >
                  {copy.privacy}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroFeature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-md">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-400/15 text-blue-200 ring-1 ring-blue-300/20">
        {icon}
      </span>
      <div>
        <p className="text-sm font-extrabold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">{text}</p>
      </div>
    </div>
  );
}

const PAGE_COPY = {
  bg: {
    homeAria: "TicketMe — начална страница",
    eyebrow: "Твоят достъп до незабравими събития",
    heroTitle: "Всички преживявания. Един сигурен профил.",
    heroText:
      "Откривай събития, купувай с увереност и пази билетите си винаги под ръка.",
    oneAccountTitle: "Един вход за всеки",
    oneAccountText:
      "Клиенти и организатори използват една и съща защитена форма.",
    fastTitle: "Бърз достъп до билетите",
    fastText:
      "PDF билетите и QR кодовете са достъпни директно от профила ти.",
    secureTitle: "Сигурност по подразбиране",
    secureText:
      "Потвърден имейл и защитени сесии пазят профила и поръчките ти.",
    secureConnection: "Защитена връзка",
    footerNote: "Билетите ти. Винаги с теб.",
    backToEvents: "Към събитията",
    loginTitle: "Добре дошъл отново",
    loginDescription:
      "Влез с имейл и парола. Системата автоматично ще отвори правилния достъп за твоя профил.",
    signupTitle: "Създай своя профил",
    signupDescription:
      "Регистрацията отнема по-малко от минута. След това потвърди имейла си и си готов.",
    protected: "Защитено вписване",
    terms: "Условия",
    privacy: "Поверителност",
  },
  en: {
    homeAria: "TicketMe — home",
    eyebrow: "Your access to unforgettable events",
    heroTitle: "Every experience. One secure account.",
    heroText:
      "Discover events, buy with confidence and keep every ticket close at hand.",
    oneAccountTitle: "One sign-in for everyone",
    oneAccountText:
      "Customers and organizers use the same secure sign-in form.",
    fastTitle: "Instant ticket access",
    fastText:
      "PDF tickets and QR codes are available directly from your account.",
    secureTitle: "Security by default",
    secureText:
      "Verified email and protected sessions keep your account and orders safe.",
    secureConnection: "Secure connection",
    footerNote: "Your tickets. Always with you.",
    backToEvents: "Back to events",
    loginTitle: "Welcome back",
    loginDescription:
      "Sign in with your email and password. We will automatically open the right access for your account.",
    signupTitle: "Create your account",
    signupDescription:
      "Registration takes less than a minute. Verify your email and you are ready to go.",
    protected: "Protected sign-in",
    terms: "Terms",
    privacy: "Privacy",
  },
} as const;
