import { getActiveAccount } from "@/lib/auth";
import { runEventDiscovery } from "@/lib/event-discovery";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  const account = await getActiveAccount();
  if (account?.role !== "admin") {
    return jsonResponse({ error: "Forbidden." }, 403);
  }

  try {
    const result = await runEventDiscovery({
      trigger: "admin",
      requestedBy: account.email,
    });
    return jsonResponse({ ok: true, result });
  } catch (error) {
    console.error("Admin event discovery failed.", error);
    return jsonResponse({ error: "Event discovery failed." }, 500);
  }
}
