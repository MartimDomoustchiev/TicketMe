/**
 * Version recorded with new account consent. Keep the visible update date on
 * the terms page aligned with this ISO date whenever the terms change.
 */
export const CURRENT_TERMS_VERSION = "2026-08-16";

const LEGAL_LAST_UPDATED = {
  bg: "16 август 2026 г.",
  en: "16 August 2026",
} as const;

export function legalLastUpdatedDate(locale: "bg" | "en"): string {
  return LEGAL_LAST_UPDATED[locale];
}
