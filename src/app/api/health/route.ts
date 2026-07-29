import {
  databaseSchemaStatus,
  isDatabaseConfigured,
} from "@/lib/database";
import { isEmailReadyForArbitraryRecipients } from "@/lib/email";
import { isPublicHttpsBaseUrl } from "@/lib/site";
import { stripeMode } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const postgresConfigured = isDatabaseConfigured();
  const development = process.env.NODE_ENV !== "production";
  const checks = {
    database: postgresConfigured || development,
    email:
      isEmailReadyForArbitraryRecipients() || development,
    storage:
      Boolean(
        process.env.S3_BUCKET &&
          process.env.S3_REGION &&
          process.env.S3_ACCESS_KEY_ID &&
          process.env.S3_SECRET_ACCESS_KEY,
      ) || development,
    publicUrl:
      isPublicHttpsBaseUrl(process.env.NEXT_PUBLIC_APP_URL) || development,
    stripe: stripeMode() === "test" || development,
    stripeWebhook:
      Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) ||
      development,
  };

  let databaseReachable = development;
  let databaseSchemaReady = development;
  let databaseTls: boolean | null = null;
  if (postgresConfigured) {
    try {
      const status = await databaseSchemaStatus();
      databaseReachable = true;
      databaseSchemaReady = status.ready;
      databaseTls = status.tls;
    } catch {
      databaseReachable = false;
      databaseSchemaReady = false;
    }
  }

  const databaseTlsReady = development || databaseTls === true;
  const ready =
    databaseReachable &&
    databaseSchemaReady &&
    databaseTlsReady &&
    Object.values(checks).every((check) => check);

  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      checks: {
        ...checks,
        databaseReachable,
        databaseSchemaReady,
        databaseTls,
        databaseTlsReady,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
