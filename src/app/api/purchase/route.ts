import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  return Response.json(
    {
      error:
        "Direct demo ticket issuing has been removed. Continue with the embedded Stripe test checkout.",
    },
    { status: 410 },
  );
}
