import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MailCheck,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/marketplace/LocaleSwitcher";
import { getLocale, localizeHref } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email verification",
  robots: {
    index: false,
    follow: false,
  },
};

type VerificationSearchParams = {
  token?: string | string[];
  next?: string | string[];
  delivery?: string | string[];
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<VerificationSearchParams>;
}) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  const copy = COPY[locale];
  const token = first(query.token);
  const validToken = token.length >= 32 && token.length <= 256;
  const localDelivery =
    process.env.NODE_ENV !== "production" &&
    first(query.delivery) === "local";
  const next = localizeHref(
    locale,
    safeReturnPath(
      first(query.next),
      localizeHref(locale, "/events"),
    ),
  );

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#e8efff_0,transparent_38%),#f6f8fc] px-4 py-5 text-slate-950 sm:px-8"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href={localizeHref(locale, "/")}
          className="inline-flex items-center gap-2.5 text-lg font-black tracking-[-0.04em]"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2864ff] text-white shadow-[0_10px_28px_rgba(40,100,255,0.3)]">
            <Ticket size={20} aria-hidden="true" />
          </span>
          TicketForge
        </Link>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[#111a30]">
            <LocaleSwitcher />
          </div>
          <Link
            href={localizeHref(locale, "/login")}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-extrabold text-slate-600 transition hover:bg-white hover:text-[#1f55e5]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{copy.back}</span>
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-90px)] max-w-xl items-center py-12">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
          <div className="h-1.5 bg-gradient-to-r from-[#2864ff] via-blue-500 to-cyan-400" />
          <div className="p-6 sm:p-9">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#2864ff] ring-1 ring-blue-100">
              <MailCheck size={27} aria-hidden="true" />
            </span>

            {localDelivery && (
              <div
                role="status"
                className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
              >
                <p className="text-sm font-black">
                  {copy.localDeliveryTitle}
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  {copy.localDeliveryDescription}
                </p>
              </div>
            )}

            <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[#2864ff]">
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
              {validToken ? copy.title : copy.invalidTitle}
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              {validToken ? copy.description : copy.invalidDescription}
            </p>

            {validToken ? (
              <>
                <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <Clock3
                      size={17}
                      className="text-[#2864ff]"
                      aria-hidden="true"
                    />
                    {copy.validFor}
                  </p>
                  <p className="flex items-center gap-2">
                    <ShieldCheck
                      size={17}
                      className="text-emerald-600"
                      aria-hidden="true"
                    />
                    {copy.singleUse}
                  </p>
                </div>

                <form
                  action="/api/verify/confirm"
                  method="post"
                  className="mt-6"
                >
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="next" value={next} />
                  <button
                    type="submit"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2864ff] px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(40,100,255,0.24)] transition hover:bg-[#1f55e5] focus-visible:ring-4 focus-visible:ring-blue-200"
                  >
                    <CheckCircle2 size={18} aria-hidden="true" />
                    {copy.confirm}
                  </button>
                </form>
                <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                  {copy.scannerProtection}
                </p>
              </>
            ) : (
              <Link
                href={localizeHref(locale, "/login?mode=login")}
                className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#111a30] px-5 text-sm font-black text-white transition hover:bg-[#2864ff]"
              >
                {copy.toLogin}
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

const COPY = {
  bg: {
    back: "Към входа",
    eyebrow: "Последна стъпка",
    title: "Потвърди своя имейл",
    description:
      "Натисни бутона, за да активираш профила си и да продължиш сигурно към TicketForge.",
    validFor: "Линкът важи 30 минути",
    singleUse: "Еднократно потвърждение",
    confirm: "Потвърди и активирай профила",
    scannerProtection:
      "Профилът се активира едва след това действие — автоматично отваряне на писмото не е достатъчно.",
    localDeliveryTitle: "Локално потвърждение",
    localDeliveryDescription:
      "Имейл услугата не е конфигурирана, затова не е изпратено реално писмо. Потвърди профила си с бутона по-долу.",
    invalidTitle: "Линкът не е валиден",
    invalidDescription:
      "Линкът липсва или е повреден. Върни се към входа и поискай нов имейл за потвърждение.",
    toLogin: "Към входа",
  },
  en: {
    back: "Back to sign in",
    eyebrow: "One last step",
    title: "Verify your email",
    description:
      "Continue to activate your account and securely return to TicketForge.",
    validFor: "Link valid for 30 minutes",
    singleUse: "Single-use verification",
    confirm: "Verify and activate account",
    scannerProtection:
      "Your account activates only after this action, so automated email previews cannot complete it.",
    localDeliveryTitle: "Local verification",
    localDeliveryDescription:
      "No email provider is configured, so no real message was sent. Use the button below to verify your account.",
    invalidTitle: "This link is not valid",
    invalidDescription:
      "The link is missing or damaged. Return to sign in and request a new verification email.",
    toLogin: "Back to sign in",
  },
} as const;
