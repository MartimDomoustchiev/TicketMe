import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getDictionary } from "@/lib/dictionaries";
import {
  DEFAULT_LOCALE,
  localizeHref,
  type Locale,
} from "@/lib/i18n-config";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  query: Record<string, string>;
  locale?: Locale;
};

function pageHref(
  page: number,
  query: Record<string, string>,
  locale: Locale,
): string {
  const params = new URLSearchParams(query);
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }
  const suffix = params.toString();
  return localizeHref(
    locale,
    suffix ? `/events?${suffix}` : "/events",
  );
}

export function Pagination({
  currentPage,
  totalPages,
  query,
  locale = DEFAULT_LOCALE,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const dictionary = getDictionary(locale);

  return (
    <nav
      aria-label={dictionary.pagination.label}
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {currentPage > 1 ? (
        <Link
          href={pageHref(currentPage - 1, query, locale)}
          aria-label={dictionary.pagination.previous}
          className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-[#2457ff] hover:text-[#2457ff]"
        >
          <ChevronLeft size={17} aria-hidden="true" />
          <span className="hidden sm:inline">
            {dictionary.pagination.back}
          </span>
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex h-11 cursor-not-allowed items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-400"
        >
          <ChevronLeft size={17} />
          <span className="hidden sm:inline">
            {dictionary.pagination.back}
          </span>
        </span>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={pageHref(page, query, locale)}
          aria-label={`${dictionary.pagination.page} ${page}`}
          aria-current={page === currentPage ? "page" : undefined}
          className={`inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-black transition ${
            page === currentPage
              ? "border-[#2457ff] bg-[#2457ff] text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-[#2457ff] hover:text-[#2457ff]"
          }`}
        >
          {page}
        </Link>
      ))}

      {currentPage < totalPages ? (
        <Link
          href={pageHref(currentPage + 1, query, locale)}
          aria-label={dictionary.pagination.next}
          className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-[#2457ff] hover:text-[#2457ff]"
        >
          <span className="hidden sm:inline">
            {dictionary.pagination.forward}
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex h-11 cursor-not-allowed items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-400"
        >
          <span className="hidden sm:inline">
            {dictionary.pagination.forward}
          </span>
          <ChevronRight size={17} />
        </span>
      )}
    </nav>
  );
}
