import { ArrowUpRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CatalogEvent } from "@/lib/event";
import {
  categoryLabel,
  eventHref,
  formatEventDay,
  formatEventMonth,
  formatPrice,
  localizeCity,
} from "@/components/marketplace/catalog-ui";
import { getDictionary } from "@/lib/dictionaries";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n-config";

type EventCardProps = {
  event: CatalogEvent;
  priority?: boolean;
  locale?: Locale;
};

export function EventCard({
  event,
  priority = false,
  locale = DEFAULT_LOCALE,
}: EventCardProps) {
  const dictionary = getDictionary(locale);

  return (
    <Link
      href={eventHref(event, locale)}
      aria-label={`${event.title}, ${event.venue}, ${formatEventDateLabel(event, locale)}`}
      className="group block h-full rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition duration-300 group-hover:-translate-y-1 group-hover:border-blue-200 group-hover:shadow-[0_18px_45px_rgba(15,23,42,0.13)]">
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
          <Image
            src={event.image}
            alt=""
            fill
            loading={priority ? "eager" : "lazy"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/60 to-transparent" />
          <span className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#10172a] shadow-sm backdrop-blur">
            {categoryLabel(event.category, locale)}
          </span>
          {event.featured && (
            <span className="absolute right-3 top-3 rounded-lg bg-[#ff6b35] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-sm">
              {dictionary.card.featured}
            </span>
          )}
        </div>

        <div className="flex flex-1 gap-4 p-4">
          <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50 text-[#2457ff]">
            <span className="text-2xl font-black leading-none">
              {formatEventDay(event, locale)}
            </span>
            <span className="mt-1 text-[10px] font-black tracking-wider">
              {formatEventMonth(event, locale)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="line-clamp-2 text-[17px] font-black leading-6 tracking-[-0.02em] text-[#10172a] transition group-hover:text-[#2457ff]">
              {event.title}
            </h3>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">
                {event.venue}, {localizeCity(event.city, locale)}
              </span>
            </p>

            <div className="mt-auto flex items-end justify-between gap-3 pt-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {event.saleMode === "external"
                    ? locale === "en"
                      ? "Verified listing"
                      : "Проверено събитие"
                    : dictionary.card.ticketsFrom}
                </p>
                <p className="mt-0.5 text-base font-black text-[#10172a]">
                  {formatPrice(event, locale)}
                </p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-[#2457ff] group-hover:text-white">
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

function formatEventDateLabel(event: CatalogEvent, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "bg-BG", {
    dateStyle: "long",
    timeZone: "Europe/Sofia",
  }).format(new Date(event.startsAt));
}
