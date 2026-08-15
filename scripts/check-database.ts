import { loadEnvConfig } from "@next/env";
import {
  createDatabaseClient,
  databaseSchemaStatus,
  resolveDatabaseConnection,
} from "../src/lib/database";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const connection = resolveDatabaseConnection();
  const sql = createDatabaseClient(process.env, { max: 1 });

  try {
    const status = await databaseSchemaStatus(sql);
    console.log(
      JSON.stringify(
        {
          connected: true,
          database: connection.database,
          host: connection.hostname,
          runtimePrivilegesReady: status.runtimePrivilegesReady,
          schemaReady: status.schemaReady,
          tlsVerified: status.tls,
          user: connection.username,
        },
        null,
        2,
      ),
    );

    if (!status.ready) {
      process.exitCode = 2;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Database check failed.",
  );
  process.exitCode = 1;
});
