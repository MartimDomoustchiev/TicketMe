export const SUPPORTED_LOCALES = ["bg", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "bg";
export const LOCALE_COOKIE_NAME = "ticketme_locale";
export const LEGACY_LOCALE_COOKIE_NAME = "ticketforge_locale";
export const LOCALE_HEADER_NAME = "x-ticketme-locale";
export const PUBLIC_URL_HEADER_NAME = "x-ticketme-public-url";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.includes(value as Locale)
  );
}

export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

export function stripLocale(pathname: string): string {
  const locale = localeFromPathname(pathname);
  if (!locale) return pathname || "/";

  const stripped = pathname.slice(locale.length + 1);
  return stripped || "/";
}

export function localeFromAcceptLanguage(
  acceptLanguage: string | null,
): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const preferences = acceptLanguage
    .split(",")
    .map((item) => {
      const [tag, ...parameters] = item.trim().toLowerCase().split(";");
      const qualityParameter = parameters.find((value) =>
        value.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.split("=")[1] ?? "0")
        : 1;
      return {
        language: tag.split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .sort((left, right) => right.quality - left.quality);

  for (const preference of preferences) {
    if (isLocale(preference.language)) return preference.language;
  }

  return DEFAULT_LOCALE;
}

export function localizeHref(locale: Locale, href: string): string {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.startsWith("/api/")
  ) {
    return href;
  }

  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const suffixIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  const pathname = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : href.slice(suffixIndex);

  return `/${locale}${stripLocale(pathname)}${suffix}`;
}

export function switchLocaleInHref(
  href: string,
  locale: Locale,
): string {
  try {
    const url = new URL(href || "/", "https://ticketme.local");
    url.pathname = `/${locale}${stripLocale(url.pathname)}`;

    const returnPath = url.searchParams.get("next");
    if (returnPath?.startsWith("/")) {
      url.searchParams.set("next", localizeHref(locale, returnPath));
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return localizeHref(locale, href || "/");
  }
}
