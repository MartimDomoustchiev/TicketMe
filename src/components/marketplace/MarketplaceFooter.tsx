import { Headphones, Mail, ShieldCheck, Ticket } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/dictionaries";
import { getLocale, localizeHref } from "@/lib/i18n";

export async function MarketplaceFooter() {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);

  return (
    <footer className="mt-auto bg-[#10172a] px-4 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 border-b border-white/10 py-12 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
        <div>
          <Link
            href={localizeHref(locale, "/")}
            className="inline-flex items-center gap-2 text-xl font-black"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2457ff]">
              <Ticket size={19} aria-hidden="true" />
            </span>
            TicketMe
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            {dictionary.footer.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <ShieldCheck size={15} className="text-blue-300" aria-hidden="true" />
              {dictionary.footer.protectedOrder}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Mail size={15} className="text-blue-300" aria-hidden="true" />
              {dictionary.footer.emailTicket}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            TicketMe
          </h2>
          <ul className="mt-4 grid gap-3 text-sm text-slate-300">
            <li>
              <Link
                href={localizeHref(locale, "/events")}
                className="transition hover:text-white"
              >
                {dictionary.footer.allEvents}
              </Link>
            </li>
            <li>
              <Link
                href={localizeHref(locale, "/account/tickets")}
                className="transition hover:text-white"
              >
                {dictionary.footer.myProfile}
              </Link>
            </li>
            <li>
              <Link
                href={localizeHref(locale, "/events?sort=date")}
                className="transition hover:text-white"
              >
                {dictionary.footer.calendar}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-white">
            {dictionary.footer.help}
          </h2>
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-300">
            <Headphones
              size={17}
              className="mt-0.5 shrink-0 text-blue-300"
              aria-hidden="true"
            />
            {dictionary.footer.helpText}
          </p>
          <div className="mt-4 flex gap-4 text-sm font-bold text-slate-300">
            <Link
              href={localizeHref(locale, "/terms")}
              className="transition hover:text-white"
            >
              {dictionary.footer.terms}
            </Link>
            <Link
              href={localizeHref(locale, "/privacy")}
              className="transition hover:text-white"
            >
              {dictionary.footer.privacy}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 py-5 text-xs text-slate-400">
        <p>
          © {new Date().getFullYear()} TicketMe. {dictionary.footer.rights}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            href={localizeHref(locale, "/terms")}
            className="transition hover:text-white"
          >
            {dictionary.footer.termsFull}
          </Link>
          <Link
            href={localizeHref(locale, "/privacy")}
            className="transition hover:text-white"
          >
            {dictionary.footer.privacy}
          </Link>
          <Link
            href={localizeHref(locale, "/privacy#cookies")}
            className="transition hover:text-white"
          >
            {dictionary.footer.cookies}
          </Link>
        </div>
      </div>
    </footer>
  );
}
