import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  assertDatabaseSchema,
  createDatabaseClient,
  databaseSchemaStatus,
  databaseSql,
  databaseAutoMigrateEnabled,
  isDatabaseConfigured,
  resolveDatabaseConnection,
  type SqlClient,
} from "../src/lib/database";

const TEST_CA =
  "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----";
const RDS_HOST =
  "ticket-db.placeholder.eu-central-1.rds.amazonaws.com";

function statusClient(
  row: Record<string, unknown>,
  queries: string[] = [],
): SqlClient {
  return ((strings: TemplateStringsArray) => {
    queries.push(strings.join(""));
    return Promise.resolve([row]);
  }) as unknown as SqlClient;
}

test("AWS RDS uses one verified TLS pool configuration", () => {
  const connection = resolveDatabaseConnection({
    DATABASE_URL: `postgresql://postgres:secret@${RDS_HOST}:5432/mydb?sslmode=verify-full`,
    DATABASE_SSL_CA: TEST_CA,
    DATABASE_POOL_MAX: "4",
  });

  assert.equal(connection.hostname, RDS_HOST);
  assert.equal(connection.database, "mydb");
  assert.equal(connection.username, "postgres");
  assert.equal(connection.poolMax, 4);
  assert.equal(typeof connection.ssl, "object");

  const ssl = connection.ssl as {
    ca: string;
    minVersion: string;
    rejectUnauthorized: boolean;
    servername: string;
  };
  assert.equal(ssl.ca, TEST_CA);
  assert.equal(ssl.minVersion, "TLSv1.2");
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.servername, RDS_HOST);
});

test("AWS RDS fails closed when its certificate authority is missing", () => {
  assert.throws(
    () =>
      resolveDatabaseConnection({
        DATABASE_URL: `postgresql://postgres:secret@${RDS_HOST}:5432/mydb`,
      }),
    /AWS RDS requires/,
  );
});

test("separate database fields safely encode a complex password", () => {
  const connection = resolveDatabaseConnection({
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "ticketforge",
    DATABASE_PASSWORD: "p@ss/word?#",
    DATABASE_PORT: "5432",
    DATABASE_USER: "ticketforge_app",
  });
  const parsed = new URL(connection.url);

  assert.equal(isDatabaseConfigured({
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "ticketforge",
    DATABASE_PASSWORD: "p@ss/word?#",
    DATABASE_USER: "ticketforge_app",
  }), true);
  assert.equal(parsed.password, "p%40ss%2Fword%3F%23");
  assert.equal(decodeURIComponent(parsed.password), "p@ss/word?#");
});

test("runtime DDL cannot be enabled in production", () => {
  assert.equal(
    databaseAutoMigrateEnabled({
      DATABASE_AUTO_MIGRATE: "false",
      NODE_ENV: "production",
    }),
    false,
  );
  assert.throws(
    () =>
      databaseAutoMigrateEnabled({
        DATABASE_AUTO_MIGRATE: "true",
        NODE_ENV: "production",
      }),
    /cannot be enabled in production/,
  );
});

test("checkout fairness migration allows one active hold per buyer and event", async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      "database",
      "migrations",
      "005_checkout_fairness.sql",
    ),
    "utf8",
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS\s+checkout_reservations_active_buyer_event_idx/,
  );
  assert.match(
    migration,
    /event_id,\s*\(LOWER\(BTRIM\(buyer_email\)\)\)/,
  );
  assert.match(
    migration,
    /WHERE status IN \('reserved', 'checkout_created'\)/,
  );
});

test("ticket quantity migration supports multi-ticket reservations", async () => {
  const migration = await readFile(
    path.join(
      process.cwd(),
      "database",
      "migrations",
      "010_ticket_quantity.sql",
    ),
    "utf8",
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1\s+CHECK \(quantity BETWEEN 1 AND 10\)/,
  );
  for (const indexName of [
    "tickets_checkout_reservation_idx",
    "tickets_stripe_checkout_session_idx",
    "tickets_stripe_payment_intent_idx",
  ]) {
    assert.match(migration, new RegExp(`DROP INDEX IF EXISTS ${indexName}`));
    assert.match(migration, new RegExp(`CREATE INDEX ${indexName}`));
    assert.doesNotMatch(
      migration,
      new RegExp(`CREATE UNIQUE INDEX ${indexName}`),
    );
  }
});

test("database readiness requires schema objects and runtime privileges", async () => {
  const queries: string[] = [];
  const ready = await databaseSchemaStatus(
    statusClient(
      {
        runtime_privileges_ready: true,
        schema_ready: true,
        tls: true,
      },
      queries,
    ),
  );

  assert.deepEqual(ready, {
    ready: true,
    runtimePrivilegesReady: true,
    schemaReady: true,
    tls: true,
  });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /SELECT bool_and\(/);
  assert.doesNotMatch(queries[0], /'SELECT,INSERT/);
  assert.match(
    queries[0],
    /has_column_privilege[\s\S]*purchase_queue[\s\S]*enqueued_at[\s\S]*UPDATE/,
  );
  assert.match(queries[0], /purchase_queue_position_seq/);
  assert.match(queries[0], /catalog_event_sources_id_seq/);
  assert.match(
    queries[0],
    /COUNT\(\*\) = 18[\s\S]*purchase_offer_kind[\s\S]*purchase_source_url/,
  );
  assert.match(
    queries[0],
    /checkout_reservations_purchase_snapshot_valid[\s\S]*tickets_purchase_snapshot_valid/,
  );
  assert.match(
    queries[0],
    /column_name = 'stripe_livemode'[\s\S]*checkout_reservations[\s\S]*tickets/,
  );
  assert.match(
    queries[0],
    /table_name = 'checkout_reservations'[\s\S]*column_name = 'quantity'/,
  );
  assert.match(
    queries[0],
    /tickets_checkout_reservation_idx[\s\S]*NOT indisunique[\s\S]*tickets_stripe_checkout_session_idx[\s\S]*NOT indisunique[\s\S]*tickets_stripe_payment_intent_idx[\s\S]*NOT indisunique/,
  );

  const missingQueueLockPrivilege = await databaseSchemaStatus(
    statusClient({
      runtime_privileges_ready: false,
      schema_ready: true,
      tls: true,
    }),
  );
  assert.deepEqual(missingQueueLockPrivilege, {
    ready: false,
    runtimePrivilegesReady: false,
    schemaReady: true,
    tls: true,
  });

  await assert.rejects(
    assertDatabaseSchema(
      statusClient({
        runtime_privileges_ready: true,
        schema_ready: false,
        tls: true,
      }),
    ),
    /schema is not ready/,
  );
  await assert.rejects(
    assertDatabaseSchema(
      statusClient({
        runtime_privileges_ready: false,
        schema_ready: true,
        tls: true,
      }),
    ),
    /runtime role lacks required privileges/,
  );
});

test("runtime role guide includes the queue lock grant and smoke test", async () => {
  const [guide, checkScript] = await Promise.all([
    readFile(
      path.join(process.cwd(), "docs", "SECURITY_GUIDE.md"),
      "utf8",
    ),
    readFile(
      path.join(process.cwd(), "scripts", "check-database.ts"),
      "utf8",
    ),
  ]);
  const updateGrant = guide.match(
    /GRANT UPDATE ON TABLE[\s\S]*?TO "<APP_RUNTIME_ROLE>";/,
  )?.[0];

  assert.ok(updateGrant);
  assert.doesNotMatch(updateGrant, /public\.purchase_queue/);
  assert.match(
    guide,
    /REVOKE UPDATE ON TABLE public\.purchase_queue FROM "<APP_RUNTIME_ROLE>";/,
  );
  assert.match(
    guide,
    /GRANT UPDATE \(enqueued_at\) ON TABLE public\.purchase_queue[\s\S]*?TO "<APP_RUNTIME_ROLE>";/,
  );
  assert.match(
    guide,
    /SELECT request_id[\s\S]*FROM public\.purchase_queue[\s\S]*WHERE FALSE[\s\S]*FOR UPDATE/,
  );
  assert.match(checkScript, /runtimePrivilegesReady/);
  assert.match(checkScript, /schemaReady: status\.schemaReady/);
});

test("Cloudflare creates isolated single-connection clients", async () => {
  const previousCloudflare = Reflect.get(globalThis, "Cloudflare");
  const previousUrl = process.env.DATABASE_URL;
  const previousPoolMax = process.env.DATABASE_POOL_MAX;

  Reflect.set(globalThis, "Cloudflare", {});
  process.env.DATABASE_URL =
    "postgresql://ticketforge:secret@localhost:5432/ticketforge";
  process.env.DATABASE_POOL_MAX = "5";

  try {
    const first = databaseSql();
    const second = databaseSql();

    assert.notEqual(first, second);
    assert.equal(first.options.max, 1);
    assert.equal(first.options.idle_timeout, 1);
    assert.equal(first.options.max_lifetime, 1);

    await Promise.all([
      first.end({ timeout: 0 }),
      second.end({ timeout: 0 }),
    ]);
  } finally {
    if (previousCloudflare === undefined) {
      Reflect.deleteProperty(globalThis, "Cloudflare");
    } else {
      Reflect.set(globalThis, "Cloudflare", previousCloudflare);
    }

    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }

    if (previousPoolMax === undefined) {
      delete process.env.DATABASE_POOL_MAX;
    } else {
      process.env.DATABASE_POOL_MAX = previousPoolMax;
    }
  }
});

test("explicit request-scoped clients do not inherit the Node pool size", async () => {
  const client = createDatabaseClient(
    {
      DATABASE_POOL_MAX: "9",
      DATABASE_URL:
        "postgresql://ticketforge:secret@localhost:5432/ticketforge",
    },
    { requestScoped: true },
  );

  try {
    assert.equal(client.options.max, 1);
    assert.equal(client.options.idle_timeout, 1);
    assert.equal(client.options.max_lifetime, 1);
  } finally {
    await client.end({ timeout: 0 });
  }
});

test("Vercel caps every instance to one direct database connection", async () => {
  const environment = {
    DATABASE_POOL_MAX: "9",
    DATABASE_URL:
      "postgresql://ticketforge:secret@localhost:5432/ticketforge",
    VERCEL: "1",
  };
  const connection = resolveDatabaseConnection(environment);
  const client = createDatabaseClient(environment);

  try {
    assert.equal(connection.poolMax, 1);
    assert.equal(client.options.max, 1);
    assert.equal(client.options.idle_timeout, 1);
    assert.equal(client.options.connection.application_name, "ticketme-web");
    assert.equal(client.options.connection.statement_timeout, 15_000);
    assert.equal(client.options.connection.lock_timeout, 5_000);
    assert.equal(
      client.options.connection.idle_in_transaction_session_timeout,
      15_000,
    );
    assert.equal(client.options.connection.idle_session_timeout, 5_000);
  } finally {
    await client.end({ timeout: 0 });
  }
});

test("database idle-session timeout is server enforced on Vercel", async () => {
  assert.throws(
    () =>
      createDatabaseClient({
        DATABASE_IDLE_SESSION_TIMEOUT_MS: "1000",
        DATABASE_URL:
          "postgresql://ticketforge:secret@localhost:5432/ticketforge",
      }),
    /DATABASE_IDLE_SESSION_TIMEOUT_MS/,
  );

  const client = createDatabaseClient({
    DATABASE_IDLE_SESSION_TIMEOUT_MS: "10000",
    DATABASE_URL:
      "postgresql://ticketforge:secret@localhost:5432/ticketforge",
  });
  try {
    assert.equal(client.options.connection.idle_session_timeout, 10_000);
  } finally {
    await client.end({ timeout: 0 });
  }
});

test("database statement timeout is bounded and configurable", async () => {
  assert.throws(
    () =>
      createDatabaseClient({
        DATABASE_STATEMENT_TIMEOUT_MS: "0",
        DATABASE_URL:
          "postgresql://ticketforge:secret@localhost:5432/ticketforge",
      }),
    /DATABASE_STATEMENT_TIMEOUT_MS/,
  );

  const client = createDatabaseClient({
    DATABASE_STATEMENT_TIMEOUT_MS: "25000",
    DATABASE_URL:
      "postgresql://ticketforge:secret@localhost:5432/ticketforge",
  });
  try {
    assert.equal(client.options.connection.statement_timeout, 25_000);
  } finally {
    await client.end({ timeout: 0 });
  }
});
