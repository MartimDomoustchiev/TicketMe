import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isLocale,
  LEGACY_LOCALE_COOKIE_NAME,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  localeFromAcceptLanguage,
  localeFromPathname,
  PUBLIC_URL_HEADER_NAME,
  stripLocale,
} from "@/lib/i18n-config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Next.js 16 renamed Middleware to Proxy. Keep this request-boundary logic
// limited to locale redirects and rewrites; authorization remains inside the
// pages and route handlers that access protected data.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const pathLocale = localeFromPathname(pathname);

  if (!pathLocale) {
    const cookieLocale =
      request.cookies.get(LOCALE_COOKIE_NAME)?.value ??
      request.cookies.get(LEGACY_LOCALE_COOKIE_NAME)?.value;
    const locale = isLocale(cookieLocale)
      ? cookieLocale
      : localeFromAcceptLanguage(request.headers.get("accept-language"));
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }

  const internalPathname = stripLocale(pathname);

  if (internalPathname === "/api" || internalPathname.startsWith("/api/")) {
    const apiUrl = request.nextUrl.clone();
    apiUrl.pathname = internalPathname;
    return NextResponse.redirect(apiUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER_NAME, pathLocale);
  requestHeaders.set(
    PUBLIC_URL_HEADER_NAME,
    `${pathname}${search}`.slice(0, 2048),
  );

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = internalPathname;
  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });

  response.headers.set(
    "Content-Language",
    pathLocale === "bg" ? "bg-BG" : "en",
  );
  response.cookies.set(LOCALE_COOKIE_NAME, pathLocale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  if (request.cookies.has(LEGACY_LOCALE_COOKIE_NAME)) {
    response.cookies.delete(LEGACY_LOCALE_COOKIE_NAME);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|icon.svg|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
