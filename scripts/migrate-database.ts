import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  createDatabaseClient,
  type SqlClient,
} from "../src/lib/database";

loadEnvConfig(process.cwd());

const migrationsDirectory = join(
  process.cwd(),
  "database",
  "migrations",
);

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function migrate(sql: SqlClient): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL CHECK (LENGTH(checksum) = 64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  if (migrationNames.length === 0) {
    throw new Error("No database migrations were found.");
  }

  for (const name of migrationNames) {
    const contents = await readFile(join(migrationsDirectory, name), "utf8");
    const migrationChecksum = checksum(contents);
    const rows = await sql`
      SELECT checksum
      FROM schema_migrations
      WHERE name = ${name}
      LIMIT 1
    `;

    if (rows[0]) {
      if (rows[0].checksum !== migrationChecksum) {
        throw new Error(
          `Migration ${name} has changed since it was applied.`,
        );
      }
      console.log(`Already applied: ${name}`);
      continue;
    }

    await sql.unsafe(contents).simple();
    await sql`
      INSERT INTO schema_migrations (name, checksum)
      VALUES (${name}, ${migrationChecksum})
    `;
    console.log(`Applied: ${name}`);
  }
}

async function main(): Promise<void> {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim();
  const migrationEnvironment = {
    ...process.env,
    ...(migrationUrl ? { DATABASE_URL: migrationUrl } : {}),
    // Schema changes are an explicit deployment operation and may need more
    // time than latency-sensitive web queries.
    DATABASE_STATEMENT_TIMEOUT_MS:
      process.env.MIGRATION_STATEMENT_TIMEOUT_MS?.trim() || "60000",
  };
  const sql = createDatabaseClient(migrationEnvironment, { max: 1 });

  try {
    await migrate(sql);
    console.log("Database migrations are complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Database migration failed.",
  );
  process.exitCode = 1;
});
