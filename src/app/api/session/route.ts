import {
  authenticateCredentials,
  clearAllSessions,
  createUserSession,
} from "@/lib/auth";
import { hashPassword } from "@/lib/auth-crypto";
import {
  createUser,
  findUserByEmail,
  issueEmailVerification,
  type EmailVerification,
} from "@/lib/auth-store";
import {
  acceptedTerms,
  isValidEmail,
  isValidName,
  isValidPassword,
  normalizeEmail,
  type AuthErrorCode,
} from "@/lib/auth-validation";
import {
  sendVerificationEmail,
  type EmailDelivery,
} from "@/lib/email";
import {
  consumeRateLimitsInOrder,
  requestIdentity,
} from "@/lib/rate-limit";
import { readUrlEncodedBodyWithinLimit } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl, safeReturnPath } from "@/lib/site";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Locale = "bg" | "en";
type AuthMode = "login" | "signup";
const MAX_AUTH_BODY_BYTES = 16 * 1024;

function localeFromRequest(
  request: Request,
  requestedLocale: string | null,
  next: string,
): Locale {
  if (requestedLocale === "en" || requestedLocale === "bg") {
    return requestedLocale;
  }
  if (next === "/en" || next.startsWith("/en/")) {
    return "en";
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const pathname = new URL(referer).pathname;
      if (pathname === "/en" || pathname.startsWith("/en/")) {
        return "en";
      }
    } catch {
      // A malformed referrer is ignored and Bulgarian remains the fallback.
    }
  }
  return "bg";
}

function loginUrl(
  locale: Locale,
  input: {
    mode: AuthMode;
    next: string;
    email?: string;
    error?: AuthErrorCode;
    sent?: "verification";
  },
): string {
  const params = new URLSearchParams({
    mode: input.mode,
    next: input.next,
  });
  if (input.email) {
    params.set("email", input.email);
  }
  if (input.error) {
    params.set("error", input.error);
  }
  if (input.sent) {
    params.set("sent", input.sent);
  }
  return `/${locale}/login?${params.toString()}`;
}

function redirectWithError(
  request: Request,
  locale: Locale,
  mode: AuthMode,
  next: string,
  error: AuthErrorCode,
  email?: string,
): Response {
  return seeOther(
    request,
    loginUrl(locale, { mode, next, email, error }),
  );
}

function seeOther(request: Request, destination: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(destination, request.url).toString(),
      "Cache-Control": "no-store",
    },
  });
}

async function rateLimitFor(
  request: Request,
  intent: string,
  email: string,
  identityLimit: number,
  ipLimit: number,
) {
  const identity = requestIdentity(request);
  return consumeRateLimitsInOrder([
    {
      key: `auth:${intent}:ip:${identity}`,
      limit: ipLimit,
      windowMs: 15 * 60_000,
    },
    {
      key: `auth:${intent}:account:${email || "anonymous"}`,
      limit: identityLimit,
      windowMs: 15 * 60_000,
    },
  ]);
}

async function deliverVerification(
  request: Request,
  verification: EmailVerification,
  locale: Locale,
  next: string,
): Promise<{
  mode: EmailDelivery;
  verificationHref: string;
}> {
  const verificationUrl = new URL(
    `/${locale}/verify`,
    getBaseUrl(request),
  );
  verificationUrl.searchParams.set("token", verification.token);
  verificationUrl.searchParams.set("next", next);

  const mode = await sendVerificationEmail({
    to: verification.user.email,
    name: verification.user.name,
    verificationUrl: verificationUrl.toString(),
    locale,
  });

  return {
    mode,
    verificationHref: `${verificationUrl.pathname}${verificationUrl.search}`,
  };
}

function localVerificationHref(verificationHref: string): string {
  const url = new URL(verificationHref, "http://local.ticketme");
  url.searchParams.set("delivery", "local");
  return `${url.pathname}${url.search}`;
}

async function handleSignup(input: {
  request: Request;
  formData: URLSearchParams;
  locale: Locale;
  next: string;
}): Promise<Response> {
  const email = normalizeEmail(String(input.formData.get("email") ?? ""));
  const name = String(input.formData.get("name") ?? "").trim();
  const password = String(input.formData.get("password") ?? "");
  const confirmPassword = String(
    input.formData.get("confirmPassword") ?? "",
  );
  const common = {
    locale: input.locale,
    mode: "signup" as const,
    next: input.next,
  };

  const signupLimit = await rateLimitFor(
    input.request,
    "signup",
    email.slice(0, 254),
    5,
    12,
  );
  if (signupLimit.unavailable) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (!signupLimit.allowed) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "rate-limit",
      email,
    );
  }
  if (!isValidEmail(email)) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "email",
    );
  }
  if (!isValidName(name)) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "name",
      email,
    );
  }
  if (!isValidPassword(password)) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "password",
      email,
    );
  }
  if (password !== confirmPassword) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "password-match",
      email,
    );
  }
  if (!acceptedTerms(input.formData.get("terms"))) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "terms",
      email,
    );
  }

  let existing;
  try {
    existing = await findUserByEmail(email);
  } catch (error) {
    console.error("Account lookup failed during signup.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (existing) {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "account-exists",
      email,
    );
  }

  let result;
  try {
    result = await createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      termsVersion: CURRENT_TERMS_VERSION,
    });
  } catch (error) {
    console.error("Account creation failed.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (result.status === "duplicate") {
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "account-exists",
      email,
    );
  }

  let delivery: Awaited<ReturnType<typeof deliverVerification>>;
  try {
    delivery = await deliverVerification(
      input.request,
      result.verification,
      input.locale,
      input.next,
    );
  } catch (error) {
    console.error("Signup verification email delivery failed.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "signup",
      input.next,
      "email-delivery",
      email,
    );
  }

  if (
    delivery.mode === "local-outbox" &&
    process.env.NODE_ENV !== "production"
  ) {
    return seeOther(
      input.request,
      localVerificationHref(delivery.verificationHref),
    );
  }

  return seeOther(
    input.request,
    loginUrl(input.locale, {
      ...common,
      mode: "login",
      email,
      sent: "verification",
    }),
  );
}

async function handleLogin(input: {
  request: Request;
  formData: URLSearchParams;
  locale: Locale;
  next: string;
}): Promise<Response> {
  const email = normalizeEmail(String(input.formData.get("email") ?? ""));
  const password = String(input.formData.get("password") ?? "");

  const loginLimit = await rateLimitFor(
    input.request,
    "login",
    email.slice(0, 254),
    8,
    30,
  );
  if (loginLimit.unavailable) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (!loginLimit.allowed) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "rate-limit",
      email,
    );
  }
  if (!isValidEmail(email)) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "email",
    );
  }
  if (!password || password.length > 128) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "invalid",
      email,
    );
  }

  let result;
  try {
    result = await authenticateCredentials({ email, password });
  } catch (error) {
    console.error("Credential verification failed.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (result.status === "invalid") {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "invalid",
      email,
    );
  }
  if (result.status === "unverified") {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "unverified",
      email,
    );
  }

  try {
    await createUserSession(result.user.id);
  } catch (error) {
    console.error("Session creation failed.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "service-unavailable",
      email,
    );
  }

  if (result.user.role === "admin") {
    const adminDestination =
      input.next.startsWith("/admin") ||
      input.next.startsWith("/bg/admin") ||
      input.next.startsWith("/en/admin")
        ? input.next
        : `/${input.locale}/admin`;
    return seeOther(input.request, adminDestination);
  }
  return seeOther(input.request, input.next);
}

async function handleResend(input: {
  request: Request;
  formData: URLSearchParams;
  locale: Locale;
  next: string;
}): Promise<Response> {
  const email = normalizeEmail(String(input.formData.get("email") ?? ""));
  if (!isValidEmail(email)) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "email",
    );
  }
  const resendLimit = await rateLimitFor(
    input.request,
    "resend",
    email,
    5,
    15,
  );
  if (resendLimit.unavailable) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "service-unavailable",
      email,
    );
  }
  if (!resendLimit.allowed) {
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "rate-limit",
      email,
    );
  }

  let verification: EmailVerification | null;
  try {
    verification = await issueEmailVerification(email);
  } catch (error) {
    console.error("Verification token creation failed.", error);
    return redirectWithError(
      input.request,
      input.locale,
      "login",
      input.next,
      "service-unavailable",
      email,
    );
  }

  let delivery:
    | Awaited<ReturnType<typeof deliverVerification>>
    | undefined;
  if (verification) {
    try {
      delivery = await deliverVerification(
        input.request,
        verification,
        input.locale,
        input.next,
      );
    } catch (error) {
      console.error("Verification email redelivery failed.", error);
      return redirectWithError(
        input.request,
        input.locale,
        "login",
        input.next,
        "email-delivery",
        email,
      );
    }
  }

  if (
    delivery?.mode === "local-outbox" &&
    process.env.NODE_ENV !== "production"
  ) {
    return seeOther(
      input.request,
      localVerificationHref(delivery.verificationHref),
    );
  }

  // Provider-backed production responses stay generic for missing, verified,
  // and unverified accounts. Development may continue a real local account
  // directly because the file adapter and outbox are never enabled in production.
  return seeOther(
    input.request,
    loginUrl(input.locale, {
      mode: "login",
      next: input.next,
      email,
      sent: "verification",
    }),
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Cross-site request rejected." },
      { status: 403 },
    );
  }

  const parsedBody = await readUrlEncodedBodyWithinLimit(
    request,
    MAX_AUTH_BODY_BYTES,
  );
  if (!parsedBody.ok) {
    return Response.json(
      { error: parsedBody.error },
      {
        status: parsedBody.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const formData = parsedBody.value;

  const rawNext = safeReturnPath(
    String(formData.get("next") ?? ""),
    "/events",
  );
  const locale = localeFromRequest(request, formData.get("locale"), rawNext);
  const next =
    rawNext === "/events" && !formData.get("next")
      ? `/${locale}/events`
      : rawNext;
  const intent = String(formData.get("intent") ?? "");

  if (intent === "logout") {
    try {
      await clearAllSessions();
    } catch (error) {
      console.error("Session deletion failed.", error);
      return redirectWithError(
        request,
        locale,
        "login",
        next,
        "service-unavailable",
      );
    }
    return seeOther(request, `/${locale}`);
  }
  if (intent === "signup") {
    return handleSignup({ request, formData, locale, next });
  }
  if (intent === "login") {
    return handleLogin({ request, formData, locale, next });
  }
  if (intent === "resend") {
    return handleResend({ request, formData, locale, next });
  }

  return redirectWithError(
    request,
    locale,
    "login",
    next,
    "generic",
  );
}
