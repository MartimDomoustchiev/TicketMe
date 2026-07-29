import "server-only";
import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_HEADER_NAME,
  PUBLIC_URL_HEADER_NAME,
  type Locale,
} from "@/lib/i18n-config";

export {
  DEFAULT_LOCALE,
  isLocale,
  localizeHref,
  localeFromPathname,
  SUPPORTED_LOCALES,
  switchLocaleInHref,
  type Locale,
} from "@/lib/i18n-config";

export async function getLocale(): Promise<Locale> {
  const locale = (await headers()).get(LOCALE_HEADER_NAME);
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export async function getPublicUrl(): Promise<string> {
  return (await headers()).get(PUBLIC_URL_HEADER_NAME) || "/";
}

export function choose<T>(locale: Locale, bg: T, en: T): T {
  return locale === "en" ? en : bg;
}
