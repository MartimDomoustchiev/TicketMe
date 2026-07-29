import Link from "next/link";
import { getDictionary } from "@/lib/dictionaries";
import { getLocale, getPublicUrl, switchLocaleInHref } from "@/lib/i18n";

export async function LocaleSwitcher() {
  const [locale, publicUrl] = await Promise.all([
    getLocale(),
    getPublicUrl(),
  ]);
  const dictionary = getDictionary(locale);

  return (
    <nav
      aria-label={dictionary.header.language}
      className="inline-flex items-center rounded-lg bg-white/10 p-0.5 ring-1 ring-white/10"
    >
      {(["bg", "en"] as const).map((targetLocale) => (
        <Link
          key={targetLocale}
          href={switchLocaleInHref(publicUrl, targetLocale)}
          hrefLang={targetLocale}
          lang={targetLocale}
          aria-current={targetLocale === locale ? "page" : undefined}
          className={`rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wide transition ${
            targetLocale === locale
              ? "bg-white text-[#10172a]"
              : "text-white/70 hover:text-white"
          }`}
        >
          {targetLocale}
        </Link>
      ))}
    </nav>
  );
}
