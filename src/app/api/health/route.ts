import {
  databaseSchemaStatus,
  isDatabaseConfigured,
} from "@/lib/database";
import { isEmailReadyForArbitraryRecipients } from "@/lib/email";
import { resolvePublicBaseUrl } from "@/lib/site";
import {
  isStripeEmbeddedConfigured,
  isStripeWebhookConfigured,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READINESS_CACHE_TTL_MS = 30_000;
const MINIMUM_CRON_SECRET_LENGTH = 32;

type HealthReadiness = {
  ready: boolean;
};

let cachedReadiness:
  | {
      expiresAt: number;
      promise: Promise<HealthReadiness>;
    }
  | undefined;

function isCronSecretConfigured(): boolean {
  return [
    process.env.CRON_SECRET,
    process.env.EVENT_DISCOVERY_CRON_SECRET,
  ].some(
    (secret) =>
      (secret?.trim().length ?? 0) >= MINIMUM_CRON_SECRET_LENGTH,
  );
}

async function probeReadiness(): Promise<HealthReadiness> {
  const postgresConfigured = isDatabaseConfigured();
  const development = process.env.NODE_ENV !== "production";
  const stripeEmbedded = isStripeEmbeddedConfigured();
  const requiredChecks = {
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
    publicUrl: Boolean(resolvePublicBaseUrl()) || development,
    stripe:
      (stripeEmbedded && isStripeWebhookConfigured()) || development,
    cron: isCronSecretConfigured() || development,
  };

  // Readiness validates local configuration and database access only. It does
  // not make health-check traffic depend on external provider reachability.

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
    Object.values(requiredChecks).every((check) => check);

  return { ready };
}

function readiness(): Promise<HealthReadiness> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) {
    return cachedReadiness.promise;
  }

  const promise = probeReadiness();
  cachedReadiness = {
    expiresAt: now + READINESS_CACHE_TTL_MS,
    promise,
  };
  void promise.catch(() => {
    if (cachedReadiness?.promise === promise) {
      cachedReadiness = undefined;
    }
  });
  return promise;
}

export async function GET() {
  const { ready } = await readiness();

  return Response.json(
    {
      status: ready ? "ready" : "degraded",
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
