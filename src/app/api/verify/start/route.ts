import { issueEmailVerification } from "@/lib/auth-store";
import { isValidEmail, normalizeEmail } from "@/lib/auth-validation";
import { sendVerificationEmail } from "@/lib/email";
import {
  consumeRateLimitsInOrder,
  requestIdentity,
} from "@/lib/rate-limit";
import { readJsonBodyWithinLimit } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl, safeReturnPath } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_VERIFICATION_BODY_BYTES = 16 * 1024;
const VERIFICATION_ACCOUNT_LIMIT = 5;
const VERIFICATION_IP_LIMIT = 15;
const VERIFICATION_WINDOW_MS = 15 * 60_000;

type VerificationBody = {
  email?: unknown;
  locale?: unknown;
  next?: unknown;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "generic" }, { status: 403 });
  }

  const parsedBody = await readJsonBodyWithinLimit<VerificationBody>(
    request,
    MAX_VERIFICATION_BODY_BYTES,
  );
  if (!parsedBody.ok) {
    return Response.json(
      { error: parsedBody.error },
      { status: parsedBody.status },
    );
  }

  const body = parsedBody.value;
  const email = normalizeEmail(
    typeof body?.email === "string" ? body.email : "",
  );
  const locale = body?.locale === "en" ? "en" : "bg";
  const next = safeReturnPath(
    typeof body?.next === "string" ? body.next : undefined,
    `/${locale}/events`,
  );

  if (!isValidEmail(email)) {
    return Response.json({ error: "email" }, { status: 400 });
  }

  const identity = requestIdentity(request);
  const rateLimit = await consumeRateLimitsInOrder([
    {
      key: `verification:ip:${identity}`,
      limit: VERIFICATION_IP_LIMIT,
      windowMs: VERIFICATION_WINDOW_MS,
    },
    {
      key: `verification:account:${email}`,
      limit: VERIFICATION_ACCOUNT_LIMIT,
      windowMs: VERIFICATION_WINDOW_MS,
    },
  ]);
  if (rateLimit.unavailable) {
    return Response.json(
      { error: "service-unavailable" },
      {
        status: 503,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "rate-limit" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let verification;
  try {
    verification = await issueEmailVerification(email);
  } catch (error) {
    console.error("Verification account lookup failed.", error);
    return Response.json(
      { error: "service-unavailable" },
      {
        status: 503,
        headers: { "Retry-After": "30" },
      },
    );
  }

  if (verification) {
    const verificationUrl = new URL(
      `/${locale}/verify`,
      getBaseUrl(request),
    );
    verificationUrl.searchParams.set("token", verification.token);
    verificationUrl.searchParams.set("next", next);
    try {
      await sendVerificationEmail({
        to: verification.user.email,
        name: verification.user.name,
        verificationUrl: verificationUrl.toString(),
        locale,
      });
    } catch (error) {
      console.error("Verification email delivery failed.", error);
      return Response.json(
        { error: "email-delivery" },
        { status: 502 },
      );
    }
  }

  // Generic success prevents account discovery through this compatibility API.
  return Response.json({ ok: true });
}
