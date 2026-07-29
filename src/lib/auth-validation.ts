export type AuthErrorCode =
  | "invalid"
  | "unverified"
  | "email"
  | "name"
  | "password"
  | "password-match"
  | "terms"
  | "account-exists"
  | "rate-limit"
  | "email-delivery"
  | "service-unavailable"
  | "generic";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function isValidName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

export function isValidPassword(value: string): boolean {
  return (
    value.length >= 8 &&
    value.length <= 128 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export function acceptedTerms(value: FormDataEntryValue | null): boolean {
  return (
    value === "accepted" ||
    value === "on" ||
    value === "true" ||
    value === "1"
  );
}
