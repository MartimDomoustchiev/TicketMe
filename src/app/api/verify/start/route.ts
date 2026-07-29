import { issueEmailVerification } from "@/lib/auth-store";
import { isValidEmail, normalizeEmail } from "@/lib/auth-validation";
import { sendVerificationEmail } from "@/lib/email";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/request-security";
import { getBaseUrl, safeReturnPath } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "generic" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    locale?: string;
    next?: string;
  } | null;
  const email = normalizeEmail(body?.email ?? "");
  const locale = body?.locale === "en" ? "en" : "bg";
  const next = safeReturnPath(body?.next, `/${locale}/events`);

  if (!isValidEmail(email)) {
    return Response.json({ error: "email" }, { status: 400 });
  }

  const rateLimit = consumeRateLimit({
    key: `verification:${requestIdentity(request)}:${email}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
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
