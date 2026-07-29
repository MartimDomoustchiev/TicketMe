import { POST as unifiedSessionPost } from "@/app/api/session/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility endpoint for old bookmarks and clients. Authentication is
// intentionally unified; the stored user role decides whether /admin opens.
export async function POST(request: Request): Promise<Response> {
  return unifiedSessionPost(request);
}
