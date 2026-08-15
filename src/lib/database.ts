import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { ConnectionOptions } from "node:tls";
import postgres from "postgres";

export type SqlClient = ReturnType<typeof postgres>;

type DatabaseEnvironment = {
  DATABASE_AUTO_MIGRATE?: string;
  DATABASE_HOST?: string;
  DATABASE_NAME?: string;
  DATABASE_PASSWORD?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_PORT?: string;
  DATABASE_IDLE_SESSION_TIMEOUT_MS?: string;
  DATABASE_STATEMENT_TIMEOUT_MS?: string;
  DATABASE_SSL_CA?: string;
  DATABASE_SSL_CA_BASE64?: string;
  DATABASE_SSL_CA_PATH?: string;
  DATABASE_URL?: string;
  DATABASE_USER?: string;
  MIGRATION_DATABASE_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
};

type DatabaseSsl =
  | "allow"
  | "prefer"
  | "require"
  | "verify-full"
  | boolean
  | ConnectionOptions;

export type ResolvedDatabaseConnection = {
  database: string;
  hostname: string;
  poolMax: number;
  ssl: DatabaseSsl | undefined;
  url: string;
  username: string;
};

const RDS_HOST_SUFFIX = ".rds.amazonaws.com";

declare global {
  var __ticketForgeDatabaseSql: SqlClient | undefined;
}

export function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof (globalThis as typeof globalThis & { Cloudflare?: unknown })
      .Cloudflare !== "undefined"
  );
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function buildDatabaseUrl(env: DatabaseEnvironment): string | null {
  const explicitUrl = env.DATABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const host = env.DATABASE_HOST?.trim();
  const database = env.DATABASE_NAME?.trim();
  const username = env.DATABASE_USER?.trim();
  const password = env.DATABASE_PASSWORD;

  if (!host || !database || !username || !configured(password)) {
    return null;
  }

  const url = new URL("postgresql://localhost");
  url.hostname = host;
  url.port = env.DATABASE_PORT?.trim() || "5432";
  url.username = username;
  url.password = password ?? "";
  url.pathname = `/${database}`;
  return url.toString();
}

export function isDatabaseConfigured(
  env: DatabaseEnvironment = process.env,
): boolean {
  return buildDatabaseUrl(env) !== null;
}

function normalizePem(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function readCertificateAuthority(
  env: DatabaseEnvironment,
  rootCertificateHint: string | null,
): string | null {
  const inline = env.DATABASE_SSL_CA?.trim();
  const base64 = env.DATABASE_SSL_CA_BASE64?.trim();
  const configuredPath =
    env.DATABASE_SSL_CA_PATH?.trim() ||
    (rootCertificateHint && rootCertificateHint !== "system"
      ? rootCertificateHint
      : "");
  const sources = [inline, base64, configuredPath].filter(Boolean);

  if (sources.length > 1) {
    throw new Error(
      "Configure only one of DATABASE_SSL_CA, DATABASE_SSL_CA_BASE64, DATABASE_SSL_CA_PATH, or sslrootcert.",
    );
  }

  let certificate: string | null = null;
  if (inline) {
    certificate = normalizePem(inline);
  } else if (base64) {
    certificate = Buffer.from(base64, "base64").toString("utf8");
  } else if (configuredPath) {
    try {
      certificate = readFileSync(resolvePath(configuredPath), "utf8");
    } catch {
      throw new Error(
        "The configured PostgreSQL certificate authority file could not be read.",
      );
    }
  }

  if (
    certificate &&
    (!certificate.includes("-----BEGIN CERTIFICATE-----") ||
      !certificate.includes("-----END CERTIFICATE-----"))
  ) {
    throw new Error(
      "The configured PostgreSQL certificate authority is not a valid PEM bundle.",
    );
  }

  return certificate;
}

function resolveSsl(
  env: DatabaseEnvironment,
  url: URL,
  sslMode: string | null,
  rootCertificateHint: string | null,
): DatabaseSsl | undefined {
  const rds = url.hostname.endsWith(RDS_HOST_SUFFIX);
  if (rds && sslMode === "disable") {
    throw new Error("TLS cannot be disabled for an AWS RDS connection.");
  }

  const certificate = readCertificateAuthority(env, rootCertificateHint);
  if (certificate) {
    return {
      ca: certificate,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: url.hostname,
    };
  }

  if (rds) {
    throw new Error(
      "AWS RDS requires DATABASE_SSL_CA_PATH, DATABASE_SSL_CA_BASE64, or DATABASE_SSL_CA.",
    );
  }

  switch (sslMode) {
    case null:
    case "disable":
      return undefined;
    case "verify-full":
      return "verify-full";
    case "require":
      return "require";
    case "allow":
      return "allow";
    case "prefer":
      return "prefer";
    default:
      throw new Error("Unsupported PostgreSQL sslmode.");
  }
}

function poolMax(env: DatabaseEnvironment): number {
  const parsed = Number.parseInt(env.DATABASE_POOL_MAX?.trim() || "5", 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 20.");
  }

  // Each Fluid Compute instance owns its own module-global pool. A burst can
  // therefore multiply this value by the number of active Vercel instances
  // and exhaust a small RDS instance even when every query is short. Keep one
  // direct connection per instance until the deployment is placed behind a
  // server-side transaction pooler.
  return env.VERCEL === "1" ? 1 : parsed;
}

function statementTimeoutMs(env: DatabaseEnvironment): number {
  const parsed = Number.parseInt(
    env.DATABASE_STATEMENT_TIMEOUT_MS?.trim() || "15000",
    10,
  );
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 60_000) {
    throw new Error(
      "DATABASE_STATEMENT_TIMEOUT_MS must be an integer from 1000 to 60000.",
    );
  }
  return parsed;
}

function idleSessionTimeoutMs(env: DatabaseEnvironment): number {
  const fallback = env.VERCEL === "1" ? "5000" : "0";
  const parsed = Number.parseInt(
    env.DATABASE_IDLE_SESSION_TIMEOUT_MS?.trim() || fallback,
    10,
  );
  if (
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    (parsed > 0 && parsed < 5_000) ||
    parsed > 60_000
  ) {
    throw new Error(
      "DATABASE_IDLE_SESSION_TIMEOUT_MS must be 0 or an integer from 5000 to 60000.",
    );
  }
  return parsed;
}

export function resolveDatabaseConnection(
  env: DatabaseEnvironment = process.env,
): ResolvedDatabaseConnection {
  const rawUrl = buildDatabaseUrl(env);
  if (!rawUrl) {
    throw new Error(
      "Configure DATABASE_URL or all DATABASE_HOST/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD fields.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme.");
  }
  if (!url.hostname || !url.pathname.slice(1) || !url.username) {
    throw new Error("The PostgreSQL host, database, and user are required.");
  }

  const sslMode = url.searchParams.get("sslmode");
  const rootCertificateHint = url.searchParams.get("sslrootcert");
  const ssl = resolveSsl(env, url, sslMode, rootCertificateHint);

  // Postgres.js doesn't interpret an sslrootcert path itself and would send it
  // as a PostgreSQL startup parameter. The CA has already been loaded above.
  url.searchParams.delete("sslrootcert");

  return {
    database: decodeURIComponent(url.pathname.slice(1)),
    hostname: url.hostname,
    poolMax: poolMax(env),
    ssl,
    url: url.toString(),
    username: decodeURIComponent(url.username),
  };
}

export function createDatabaseClient(
  env: DatabaseEnvironment = process.env,
  options: { max?: number; requestScoped?: boolean } = {},
): SqlClient {
  const connection = resolveDatabaseConnection(env);
  const requestScoped =
    options.requestScoped ?? isCloudflareWorkerRuntime();
  const vercelRuntime = env.VERCEL === "1";

  return postgres(connection.url, {
    connect_timeout: 10,
    // Cloudflare does not allow a TCP socket created by one request to be
    // reused by another request. A short lifetime releases a request-local
    // connection promptly; Hyperdrive provides pooling outside the Worker.
    idle_timeout: requestScoped || vercelRuntime ? 1 : 20,
    max:
      requestScoped || vercelRuntime
        ? 1
        : (options.max ?? connection.poolMax),
    prepare: false,
    connection: {
      application_name: "ticketme-web",
      statement_timeout: statementTimeoutMs(env),
      lock_timeout: 5_000,
      idle_in_transaction_session_timeout: 15_000,
      // Vercel can suspend an instance before Postgres.js's local idle timer
      // fires. The database-side timer keeps those frozen sockets from
      // accumulating until the small RDS instance reaches max_connections.
      idle_session_timeout: idleSessionTimeoutMs(env),
    },
    ...(requestScoped ? { max_lifetime: 1 } : {}),
    ...(connection.ssl === undefined ? {} : { ssl: connection.ssl }),
  });
}

export function databaseSql(): SqlClient {
  if (isCloudflareWorkerRuntime()) {
    // Never retain Postgres.js clients in isolate-global state. Its TCP socket
    // belongs to the active Worker request and cannot be used by a later one.
    return createDatabaseClient(process.env, {
      max: 1,
      requestScoped: true,
    });
  }

  globalThis.__ticketForgeDatabaseSql ??= createDatabaseClient();
  return globalThis.__ticketForgeDatabaseSql;
}

export function databaseAutoMigrateEnabled(
  env: DatabaseEnvironment = process.env,
): boolean {
  const enabled = env.DATABASE_AUTO_MIGRATE?.trim().toLowerCase() === "true";
  if (enabled && env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_AUTO_MIGRATE cannot be enabled in production; run npm run db:migrate during deployment.",
    );
  }
  return enabled;
}

export async function databaseSchemaStatus(
  client: SqlClient = databaseSql(),
): Promise<{
  ready: boolean;
  runtimePrivilegesReady: boolean;
  schemaReady: boolean;
  tls: boolean;
}> {
  const rows = await client`
    SELECT
      (
        to_regclass('public.event_inventory') IS NOT NULL
        AND to_regclass('public.verification_tokens') IS NOT NULL
        AND to_regclass('public.tickets') IS NOT NULL
        AND to_regclass('public.purchase_queue') IS NOT NULL
        AND to_regclass('public.purchase_queue_position_seq') IS NOT NULL
        AND to_regclass('public.checkout_reservations') IS NOT NULL
        AND to_regclass(
          'public.checkout_reservations_active_buyer_event_idx'
        ) IS NOT NULL
        AND to_regclass('public.audit_log') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
        AND to_regclass('public.auth_sessions') IS NOT NULL
        AND to_regclass('public.email_verification_tokens') IS NOT NULL
        AND to_regclass('public.catalog_events') IS NOT NULL
        AND to_regclass('public.catalog_event_sources') IS NOT NULL
        AND to_regclass('public.catalog_event_sources_id_seq') IS NOT NULL
        AND to_regclass('public.event_discovery_runs') IS NOT NULL
        AND to_regclass('public.request_rate_limits') IS NOT NULL
      ) AS schema_ready,
      (
        has_schema_privilege(current_user, 'public', 'USAGE')
        AND COALESCE(
          (
            SELECT bool_and(
              has_table_privilege(
                current_user,
                to_regclass(required.table_name),
                required.privilege
              )
            )
            FROM (
              VALUES
                ('public.event_inventory', 'SELECT'),
                ('public.event_inventory', 'INSERT'),
                ('public.event_inventory', 'UPDATE'),
                ('public.verification_tokens', 'SELECT'),
                ('public.verification_tokens', 'INSERT'),
                ('public.verification_tokens', 'DELETE'),
                ('public.tickets', 'SELECT'),
                ('public.tickets', 'INSERT'),
                ('public.tickets', 'UPDATE'),
                ('public.tickets', 'DELETE'),
                ('public.purchase_queue', 'SELECT'),
                ('public.purchase_queue', 'INSERT'),
                ('public.purchase_queue', 'DELETE'),
                ('public.checkout_reservations', 'SELECT'),
                ('public.checkout_reservations', 'INSERT'),
                ('public.checkout_reservations', 'UPDATE'),
                ('public.audit_log', 'INSERT'),
                ('public.users', 'SELECT'),
                ('public.users', 'INSERT'),
                ('public.users', 'UPDATE'),
                ('public.auth_sessions', 'SELECT'),
                ('public.auth_sessions', 'INSERT'),
                ('public.auth_sessions', 'DELETE'),
                ('public.email_verification_tokens', 'SELECT'),
                ('public.email_verification_tokens', 'INSERT'),
                ('public.email_verification_tokens', 'DELETE'),
                ('public.catalog_events', 'SELECT'),
                ('public.catalog_events', 'INSERT'),
                ('public.catalog_events', 'UPDATE'),
                ('public.catalog_event_sources', 'SELECT'),
                ('public.catalog_event_sources', 'INSERT'),
                ('public.catalog_event_sources', 'UPDATE'),
                ('public.event_discovery_runs', 'SELECT'),
                ('public.event_discovery_runs', 'INSERT'),
                ('public.event_discovery_runs', 'UPDATE'),
                ('public.request_rate_limits', 'SELECT'),
                ('public.request_rate_limits', 'INSERT'),
                ('public.request_rate_limits', 'UPDATE'),
                ('public.request_rate_limits', 'DELETE')
            ) AS required(table_name, privilege)
          ),
          FALSE
        )
        -- SELECT ... FOR UPDATE requires UPDATE privilege even though this
        -- queue is never changed with an UPDATE statement.
        AND has_column_privilege(
          current_user,
          to_regclass('public.purchase_queue'),
          'enqueued_at',
          'UPDATE'
        )
        AND has_sequence_privilege(
          current_user,
          to_regclass('public.purchase_queue_position_seq'),
          'USAGE'
        )
        AND has_sequence_privilege(
          current_user,
          to_regclass('public.catalog_event_sources_id_seq'),
          'USAGE'
        )
      ) AS runtime_privileges_ready,
      COALESCE(
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
        FALSE
      ) AS tls
  `;
  const row = rows[0];
  const schemaReady = Boolean(row?.schema_ready);
  const runtimePrivilegesReady = Boolean(row?.runtime_privileges_ready);

  return {
    ready: schemaReady && runtimePrivilegesReady,
    runtimePrivilegesReady,
    schemaReady,
    tls: Boolean(row?.tls),
  };
}

export async function assertDatabaseSchema(
  client: SqlClient = databaseSql(),
): Promise<void> {
  const status = await databaseSchemaStatus(client);
  if (!status.schemaReady) {
    throw new Error(
      "The PostgreSQL schema is not ready. Run npm run db:migrate.",
    );
  }
  if (!status.runtimePrivilegesReady) {
    throw new Error(
      "The PostgreSQL runtime role lacks required privileges. Apply the SECURITY_GUIDE grants.",
    );
  }
}

export async function authDatabaseSchemaStatus(
  client: SqlClient = databaseSql(),
): Promise<{ ready: boolean; tls: boolean }> {
  const rows = await client`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.auth_sessions') IS NOT NULL AS auth_sessions,
      to_regclass('public.email_verification_tokens') IS NOT NULL
        AS email_verification_tokens,
      COALESCE(
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
        FALSE
      ) AS tls
  `;
  const row = rows[0];
  return {
    ready: Boolean(
      row?.users &&
        row.auth_sessions &&
        row.email_verification_tokens,
    ),
    tls: Boolean(row?.tls),
  };
}

export async function assertAuthDatabaseSchema(
  client: SqlClient = databaseSql(),
): Promise<void> {
  const status = await authDatabaseSchemaStatus(client);
  if (!status.ready) {
    throw new Error(
      "The PostgreSQL authentication schema is not ready. Run npm run db:migrate.",
    );
  }
}
