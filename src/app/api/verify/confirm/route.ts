import { createUserSession } from "@/lib/auth";
import { consumeEmailVerification } from "@/lib/auth-store";
import { isSameOriginRequest } from "@/lib/request-security";
import { safeReturnPath } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Locale = "bg" | "en";

function requestContext(request: Request, rawNext: string | null) {
  const next = safeReturnPath(rawNext, "/bg/events");
  const locale: Locale =
    next === "/en" || next.startsWith("/en/") ? "en" : "bg";
  return { locale, next };
}

function authErrorUrl(
  request: Request,
  locale: Locale,
  next: string,
  error = "generic",
): URL {
  const url = new URL(`/${locale}/login`, request.url);
  url.searchParams.set("mode", "login");
  url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return url;
}

function seeOther(destination: URL | string, request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(destination, request.url).toString(),
      "Cache-Control": "no-store",
    },
  });
}

// Compatibility for verification emails created by an older app version.
// The GET only opens the confirmation screen; it never mutates auth state.
export function GET(request: Request): Response {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  const { locale, next } = requestContext(
    request,
    requestUrl.searchParams.get("next"),
  );
  const confirmationUrl = new URL(`/${locale}/verify`, request.url);
  confirmationUrl.searchParams.set("token", token);
  confirmationUrl.searchParams.set("next", next);

  return Response.redirect(confirmationUrl, 307);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Cross-site request rejected." }, {
      status: 403,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return seeOther("/bg/login?mode=login&error=generic", request);
  }

  const token = String(formData.get("token") ?? "");
  const { locale, next } = requestContext(
    request,
    String(formData.get("next") ?? ""),
  );

  if (token.length < 32 || token.length > 256) {
    return seeOther(authErrorUrl(request, locale, next), request);
  }

  try {
    const user = await consumeEmailVerification(token);
    if (!user) {
      return seeOther(authErrorUrl(request, locale, next), request);
    }
    await createUserSession(user.id);
  } catch (error) {
    console.error("Email verification failed.", error);
    return seeOther(
      authErrorUrl(request, locale, next, "service-unavailable"),
      request,
    );
  }

  return seeOther(next, request);
}
