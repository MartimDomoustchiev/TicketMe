import {
  ArrowLeft,
  CalendarDays,
  Database,
  ExternalLink,
  MapPin,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DiscoveryControls } from "@/components/admin/DiscoveryControls";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getActiveAccount } from "@/lib/auth";
import {
  listEventDiscoveryRuns,
  listPendingCatalogEvents,
} from "@/lib/catalog-postgres";
import { isDatabaseConfigured } from "@/lib/database";
import { getLocale, localizeHref } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function DiscoveryAdminPage() {
  const [account, locale] = await Promise.all([
    getActiveAccount(),
    getLocale(),
  ]);

  if (account?.role !== "admin") {
    const destination = localizeHref(locale, "/admin/discovery");
    redirect(
      `${localizeHref(locale, "/login")}?next=${encodeURIComponent(destination)}`,
    );
  }

  const copy = DISCOVERY_COPY[locale];
  const configured = isDatabaseConfigured();
  let unavailable = !configured;
  let pending:
    Awaited<ReturnType<typeof listPendingCatalogEvents>> | null = null;
  let runs: Awaited<ReturnType<typeof listEventDiscoveryRuns>> = [];

  if (configured) {
    try {
      [pending, runs] = await Promise.all([
        listPendingCatalogEvents({ limit: 50 }),
        listEventDiscoveryRuns({ limit: 8 }),
      ]);
    } catch {
      unavailable = true;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f8fc] text-[#10172a]">
      <MarketplaceHeader />

      <main id="main-content" className="flex-1 px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <Link
            href={localizeHref(locale, "/admin")}
            className="inline-flex items-center gap-2 text-sm font-black text-slate-600 transition hover:text-[#2457ff]"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            {copy.back}
          </Link>

          <section className="mt-5 overflow-hidden rounded-3xl bg-[#10172a] px-5 py-7 text-white shadow-xl shadow-slate-300/30 sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-blue-300">
                  <Sparkles size={17} aria-hidden="true" />
                  {copy.eyebrow}
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  {copy.title}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  {copy.description}
                </p>
              </div>
              {!unavailable && (
                <DiscoveryControls kind="run" locale={locale} />
              )}
            </div>
          </section>

          {unavailable ? (
            <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
              <Database
                size={28}
                className="text-amber-700"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-black">{copy.dbTitle}</h2>
              <p className="mt-2 max-w-3xl leading-7 text-slate-700">
                {copy.dbDescription}
              </p>
              <code className="mt-4 block w-fit rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                npm run db:migrate
              </code>
            </section>
          ) : (
            <>
              <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                  <h2 className="text-xl font-black">
                    {copy.pendingTitle} ({pending?.total ?? 0})
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {copy.pendingDescription}
                  </p>
                </div>

                {pending?.events.length ? (
                  <div className="divide-y divide-slate-100">
                    {pending.events.map((event) => (
                      <article
                        key={event.id}
                        className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">{event.title}</h3>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#2457ff]">
                              {event.category}
                            </span>
                            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">
                              {event.bangerScore}/100
                            </span>
                          </div>
                          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays size={15} aria-hidden="true" />
                              {new Intl.DateTimeFormat(
                                locale === "en" ? "en-GB" : "bg-BG",
                                {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: "Europe/Sofia",
                                },
                              ).format(new Date(event.startsAt))}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin size={15} aria-hidden="true" />
                              {event.venue}, {event.city}
                            </span>
                          </p>
                          {event.primarySource && (
                            <a
                              href={event.primarySource.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-1.5 text-sm font-black text-[#2457ff] hover:text-blue-800"
                            >
                              {event.primarySource.provider}
                              <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                        <DiscoveryControls
                          eventId={event.id}
                          kind="review"
                          locale={locale}
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="px-6 py-12 text-center font-semibold text-slate-500">
                    {copy.empty}
                  </p>
                )}
              </section>

              <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                  <h2 className="text-xl font-black">{copy.runsTitle}</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {runs.length ? (
                    runs.map((run) => (
                      <div
                        key={run.id}
                        className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6"
                      >
                        <div>
                          <p className="font-black">{run.model}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Intl.DateTimeFormat(
                              locale === "en" ? "en-GB" : "bg-BG",
                              {
                                dateStyle: "medium",
                                timeStyle: "short",
                                timeZone: "Europe/Sofia",
                              },
                            ).format(new Date(run.startedAt))}
                          </p>
                        </div>
                        <span className="font-bold text-slate-600">
                          {run.eventsCreated} + {run.eventsUpdated}
                        </span>
                        <span
                          className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${
                            run.status === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : run.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="px-6 py-8 text-sm font-semibold text-slate-500">
                      {copy.noRuns}
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const DISCOVERY_COPY = {
  bg: {
    back: "Назад към админ панела",
    eyebrow: "Автоматично откриване",
    title: "Нови събития с контрол преди публикуване",
    description:
      "Разрешените RSS, Atom, ICS и JSON източници се проверяват периодично. Gemini може да нормализира, превежда и класира данните, но не измисля цени или наличности и не използва Google Search.",
    dbTitle: "PostgreSQL още не е готов",
    dbDescription:
      "Откриването изисква постоянната база и migration 004. Попълни RDS password-а само в .env.local, след което изпълни migrations.",
    pendingTitle: "Чакат преглед",
    pendingDescription:
      "Провери датата, мястото и оригиналния source URL преди публикуване.",
    empty: "Няма събития, които чакат преглед.",
    runsTitle: "Последни изпълнения",
    noRuns: "Discovery pipeline-ът още не е стартиран.",
  },
  en: {
    back: "Back to admin",
    eyebrow: "Automated discovery",
    title: "New events with review before publishing",
    description:
      "Authorized RSS, Atom, ICS and JSON sources are checked periodically. Gemini may normalize, translate and rank the data, but never invents pricing or availability and does not use Google Search.",
    dbTitle: "PostgreSQL is not ready yet",
    dbDescription:
      "Discovery requires the durable database and migration 004. Put the RDS password only in .env.local, then run the migrations.",
    pendingTitle: "Awaiting review",
    pendingDescription:
      "Verify the date, venue and original source URL before publishing.",
    empty: "There are no events awaiting review.",
    runsTitle: "Recent runs",
    noRuns: "The discovery pipeline has not run yet.",
  },
} as const;
