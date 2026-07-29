import { ArrowLeft, CalendarSearch } from "lucide-react";
import Link from "next/link";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getLocale, localizeHref } from "@/lib/i18n";

export default async function EventNotFound() {
  const locale = await getLocale();
  const english = locale === "en";

  return (
    <main className="flex min-h-screen flex-col bg-[#f6f8fc] text-[#10172a]">
      <MarketplaceHeader />
      <section className="flex flex-1 items-center px-4 py-20">
        <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:px-12">
          <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#2457ff]">
            <CalendarSearch size={29} aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.16em] text-[#2457ff]">
            404
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
            {english
              ? "This event is unavailable"
              : "Това събитие не е налично"}
          </h1>
          <p className="mx-auto mt-4 max-w-lg leading-7 text-slate-500">
            {english
              ? "The address may have changed or ticket sales may have ended. Browse the current calendar for more events."
              : "Възможно е адресът да е променен или продажбата да е приключила. Разгледай актуалния календар за други интересни предложения."}
          </p>
          <Link
            href={localizeHref(locale, "/events")}
            className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-[#2457ff] px-5 font-black text-white transition hover:bg-blue-700"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {english ? "All events" : "Към всички събития"}
          </Link>
        </div>
      </section>
      <MarketplaceFooter />
    </main>
  );
}
