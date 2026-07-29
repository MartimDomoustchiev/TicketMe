import { LogOut, MapPin, Search, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/marketplace/LocaleSwitcher";
import { getActiveAccount } from "@/lib/auth";
import { getDictionary } from "@/lib/dictionaries";
import { getLocale, localizeHref } from "@/lib/i18n";

type MarketplaceHeaderProps = {
  query?: string;
};

export async function MarketplaceHeader({
  query = "",
}: MarketplaceHeaderProps) {
  const [account, locale] = await Promise.all([
    getActiveAccount(),
    getLocale(),
  ]);
  const dictionary = getDictionary(locale);
  const navItems = [
    { label: dictionary.header.concerts, value: "Concerts" },
    { label: dictionary.header.theatre, value: "Theatre" },
    { label: dictionary.header.festivals, value: "Festivals" },
    { label: dictionary.header.sports, value: "Sports" },
  ];
  const accountName = account
    ? account.role === "admin"
      ? dictionary.header.organizer
      : account.name.split(" ")[0]
    : dictionary.header.signIn;
  const accountHref = localizeHref(
    locale,
    account?.role === "admin"
      ? "/admin"
      : account?.role === "buyer"
        ? "/account/tickets"
        : "/login",
  );

  return (
    <>
      <div className="bg-[#10172a] px-4 py-2 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-xs font-semibold text-white/70">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" />
            {dictionary.header.location}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">
              {dictionary.header.benefits}
            </span>
            <LocaleSwitcher />
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4">
          <Link
            href={localizeHref(locale, "/")}
            className="group inline-flex shrink-0 items-center gap-2 text-[#10172a]"
            aria-label={dictionary.header.homeAria}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2457ff] text-white shadow-[0_8px_20px_rgba(36,87,255,0.25)] transition group-hover:-rotate-3">
              <Ticket size={21} aria-hidden="true" />
            </span>
            <span className="hidden text-xl font-black tracking-[-0.04em] sm:inline">
              Ticket<span className="text-[#2457ff]">Forge</span>
            </span>
          </Link>

          <form
            action={localizeHref(locale, "/events")}
            method="get"
            role="search"
            className="relative mx-auto hidden w-full max-w-xl md:block"
          >
            <label htmlFor="global-event-search" className="sr-only">
              {dictionary.header.searchLabel}
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={19}
              aria-hidden="true"
            />
            <input
              id="global-event-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder={dictionary.header.searchPlaceholder}
              className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-[#2457ff] focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href={localizeHref(locale, "/events")}
              className="hidden h-10 items-center rounded-lg px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 lg:inline-flex"
            >
              {dictionary.header.allEvents}
            </Link>
            <Link
              href={accountHref}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#10172a] px-3.5 text-sm font-extrabold text-white transition hover:bg-[#2457ff]"
            >
              <UserRound size={17} aria-hidden="true" />
              <span className="max-w-24 truncate">{accountName}</span>
            </Link>
            {account && (
              <form action="/api/session" method="post">
                <input type="hidden" name="intent" value="logout" />
                <button
                  type="submit"
                  aria-label={dictionary.header.signOut}
                  title={dictionary.header.signOut}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950"
                >
                  <LogOut size={18} aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>

        <nav
          aria-label={dictionary.header.eventCategories}
          className="mx-auto hidden h-11 max-w-7xl items-center gap-7 border-t border-slate-100 text-sm font-bold text-slate-600 lg:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.value}
              href={localizeHref(
                locale,
                `/events?category=${item.value}`,
              )}
              className="inline-flex h-full items-center border-b-2 border-transparent transition hover:border-[#2457ff] hover:text-[#2457ff]"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={localizeHref(locale, "/events?sort=date")}
            className="ml-auto text-[#2457ff] transition hover:text-blue-800"
          >
            {dictionary.header.upcoming}
          </Link>
        </nav>
      </header>
    </>
  );
}
