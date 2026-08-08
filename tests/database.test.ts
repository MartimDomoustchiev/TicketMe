import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  createDatabaseClient,
  databaseSql,
  databaseAutoMigrateEnabled,
  isDatabaseConfigured,
  resolveDatabaseConnection,
} from "../src/lib/database";

const TEST_CA =
  "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----";
const RDS_HOST =
  "ticket-db.placeholder.eu-central-1.rds.amazonaws.com";

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
