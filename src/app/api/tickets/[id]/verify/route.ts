import { redirect } from "next/navigation";
import { getActiveAccount } from "@/lib/auth";
import { isAdmissionPurchaseSnapshot } from "@/lib/checkout-purchase-snapshot";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  readJsonBodyWithinLimit,
  readUrlEncodedBodyWithinLimit,
} from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";
import { getTicket, markTicketCheckedIn } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_CHECK_IN_BODY_BYTES = 8 * 1024;

function checkInPath(id: string, secret?: string, status?: string): string {
  const params = new URLSearchParams({ id });
  if (secret) {
    params.set("secret", secret);
  }
  if (status) {
    params.set("status", status);
  }
  return `/admin/check-in?${params.toString()}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const secret = new URL(request.url).searchParams.get("secret") ?? "";
  const destination = checkInPath(id, secret);

  if ((await getActiveAccount())?.role !== "admin") {
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  redirect(destination);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Cross-site check-in request rejected." },
      { status: 403 },
    );
  }

  const account = await getActiveAccount();
  if (account?.role !== "admin") {
    return Response.json(
      { error: "Нужна е активна admin сесия за check-in." },
      { status: 403 },
    );
  }

  const rateLimit = await consumeRateLimit({
    key: `ticket-check-in:${account.email.trim().toLowerCase()}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: rateLimit.unavailable
          ? "Check-in service is temporarily unavailable."
          : "Too many check-in requests.",
      },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { id } = await params;
  const mediaType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const isForm = mediaType === "application/x-www-form-urlencoded";
  let secret: string;

  if (isForm) {
    const parsedBody = await readUrlEncodedBodyWithinLimit(
      request,
      MAX_CHECK_IN_BODY_BYTES,
    );
    if (!parsedBody.ok) {
      return Response.json(
        { error: parsedBody.error },
        { status: parsedBody.status },
      );
    }
    secret = parsedBody.value.get("secret") ?? "";
  } else {
    const parsedBody = await readJsonBodyWithinLimit<{
      secret?: unknown;
    } | null>(request, MAX_CHECK_IN_BODY_BYTES);
    if (!parsedBody.ok) {
      return Response.json(
        { error: parsedBody.error },
        { status: parsedBody.status },
      );
    }
    secret = String(parsedBody.value?.secret ?? "");
  }
  const existing = await getTicket(id);

  if (!existing || existing.qrSecret !== secret) {
    if (isForm) {
      redirect(checkInPath(id, undefined, "invalid"));
    }
    return Response.json(
      { error: "Невалиден или липсващ билет." },
      { status: 404 },
    );
  }

  if (!existing.purchaseSnapshot) {
    if (isForm) {
      redirect(checkInPath(id, undefined, "invalid"));
    }
    return Response.json(
      {
        error:
          "This legacy ticket has no trusted purchase snapshot and cannot be checked in.",
      },
      { status: 422 },
    );
  }

  if (!isAdmissionPurchaseSnapshot(existing.purchaseSnapshot)) {
    if (isForm) {
      redirect(checkInPath(id, undefined, "test-ticket"));
    }
    return Response.json(
      {
        error:
          "This QR verifies a Stripe test ticket only; it is not valid for venue check-in.",
      },
      { status: 422 },
    );
  }

  if (existing.status === "checked_in") {
    if (isForm) {
      redirect(checkInPath(id, undefined, "already-used"));
    }
    return Response.json(
      { error: "Билетът вече е използван." },
      { status: 409 },
    );
  }

  const ticket = await markTicketCheckedIn(id, secret, account.email);

  if (!ticket) {
    if (isForm) {
      redirect(checkInPath(id, undefined, "already-used"));
    }
    return Response.json(
      { error: "Билетът вече е използван." },
      { status: 409 },
    );
  }

  if (isForm) {
    redirect(checkInPath(id, undefined, "success"));
  }

  return Response.json({
    ok: true,
    ticketId: ticket.id,
    status: ticket.status,
    buyerName: ticket.buyerName,
    seatLabel: ticket.seatLabel,
  });
}
