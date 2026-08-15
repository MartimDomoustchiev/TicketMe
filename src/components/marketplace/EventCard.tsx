import { ArrowUpRight, ExternalLink, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  formatDualCurrencyPrice,
  isEventOpenForTicketMeCheckout,
  isTestSimulationEvent,
  type CatalogEvent,
} from "@/lib/event";
import {
  categoryLabel,
  eventHref,
  externalSourceLabel,
  formatEventDay,
  formatEventMonth,
  formatPrice,
  formatVenueLocation,
  localizedEventTitle,
} from "@/components/marketplace/catalog-ui";
import { getDictionary } from "@/lib/dictionaries";
import { getEventVisual } from "@/lib/event-visual";
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
  const visual = getEventVisual(event);
  const checkoutEnabled = isEventOpenForTicketMeCheckout(event);
  const testSimulation = isTestSimulationEvent(event);
  const checkoutPrice = event.ticketTypes.reduce(
    (lowest, ticketType) => Math.min(lowest, ticketType.price),
    Number.POSITIVE_INFINITY,
  );
  const testOfferLabel =
    locale === "en" ? "Tiketko test offer" : "Tiketko тестова оферта";
  const sourceLinkLabel =
    locale === "en" ? "Event source" : "Източник на събитието";
  const title = localizedEventTitle(event, locale);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(15,23,42,0.13)]">
      <Link
        href={eventHref(event, locale)}
        className="flex flex-1 flex-col outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-200"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
          <Image
            src={event.image}
            alt=""
            fill
            loading={priority ? "eager" : "lazy"}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
            style={{
              filter: visual.imageFilter,
              objectPosition: visual.objectPosition,
            }}
          />
          <div
            className="absolute inset-0 opacity-80 transition duration-500 group-hover:opacity-100"
            style={{ background: visual.overlay }}
          />
          <div
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: visual.accent }}
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
              {title}
            </h3>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{formatVenueLocation(event, locale)}</span>
            </p>

            <div className="mt-auto flex items-end justify-between gap-3 pt-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {testSimulation
                    ? testOfferLabel
                    : event.saleMode === "external"
                      ? externalSourceLabel(event, locale)
                      : dictionary.card.ticketsFrom}
                </p>
                <p className="mt-0.5 text-base font-black text-[#10172a]">
                  {testSimulation &&
                  checkoutEnabled &&
                  Number.isFinite(checkoutPrice)
                    ? formatDualCurrencyPrice(checkoutPrice, locale)
                    : event.saleMode === "external" &&
                        event.priceAvailable !== true
                      ? event.sourceName
                      : formatPrice(event, locale)}
                </p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-[#2457ff] group-hover:text-white">
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </Link>
      {event.saleMode === "external" && (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#2457ff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-200"
        >
          <span className="truncate">
            {sourceLinkLabel}: {event.sourceName}
          </span>
          <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
