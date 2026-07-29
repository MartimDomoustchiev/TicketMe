type PublicUrlEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

function normalizePublicBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed}`;
  if (!isPublicHttpsBaseUrl(candidate)) return null;

  return new URL(candidate).origin;
}

export function resolvePublicBaseUrl(
  env: PublicUrlEnvironment = process.env,
): string | null {
  return (
    normalizePublicBaseUrl(env.NEXT_PUBLIC_APP_URL) ??
    normalizePublicBaseUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizePublicBaseUrl(env.VERCEL_URL)
  );
}

export function getBaseUrl(request?: Request): string {
  const publicBaseUrl = resolvePublicBaseUrl();
  if (publicBaseUrl) {
    return publicBaseUrl;
  }

  if (request) {
    const url = new URL(request.url);
    if (
      process.env.NODE_ENV !== "production" ||
      isPublicHttpsBaseUrl(url.origin)
    ) {
      return url.origin;
    }
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_APP_URL
  ) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export function isPublicHttpsBaseUrl(
  value: string | null | undefined,
): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHostname =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]";
    const privateIpv4 =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !localHostname &&
      !privateIpv4
    );
  } catch {
    return false;
  }
}

export function safeReturnPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://ticketforge.local");
    if (parsed.origin !== "https://ticketforge.local") {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
