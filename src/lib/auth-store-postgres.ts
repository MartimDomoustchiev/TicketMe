import type postgres from "postgres";
import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@/lib/auth-crypto";
import {
  publicUser,
  type ActiveStoredSession,
  type CreateUserResult,
  type CreatedSession,
  type EmailVerification,
  type PromotionResult,
  type StoredUser,
  type UserRole,
} from "@/lib/auth-store-types";
import {
  assertDatabaseSchema,
  databaseAutoMigrateEnabled,
  databaseSql,
} from "@/lib/database";

declare global {
  var __ticketForgeAuthSchemaReady: Promise<void> | undefined;
}

async function prepareSchema(): Promise<void> {
  const db = databaseSql();
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'buyer'
        CHECK (role IN ('buyer', 'admin')),
      email_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
    ON users (LOWER(email))
  `;
  await db`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
    ON auth_sessions (user_id)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
    ON auth_sessions (expires_at)
  `;
  await db`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
    ON email_verification_tokens (user_id)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
    ON email_verification_tokens (expires_at)
  `;
}

async function ensureSchema(): Promise<void> {
  globalThis.__ticketForgeAuthSchemaReady ??= (
    databaseAutoMigrateEnabled()
      ? prepareSchema()
      : assertDatabaseSchema()
  ).catch((error) => {
      globalThis.__ticketForgeAuthSchemaReady = undefined;
      throw error;
    });
  await globalThis.__ticketForgeAuthSchemaReady;
}

function iso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

function mapUser(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    role: String(row.role) as UserRole,
    emailVerifiedAt: row.email_verified_at
      ? iso(row.email_verified_at)
      : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function insertVerification(
  transaction: postgres.TransactionSql,
  user: StoredUser,
): Promise<EmailVerification> {
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  await transaction`
    DELETE FROM email_verification_tokens
    WHERE user_id = ${user.id} OR expires_at <= NOW()
  `;
  await transaction`
    INSERT INTO email_verification_tokens (
      token_hash, user_id, created_at, expires_at
    )
    VALUES (${tokenHash}, ${user.id}, ${createdAt}, ${expiresAt})
  `;

  return {
    token,
    user: publicUser(user),
    expiresAt,
  };
}

export async function findUserByEmail(
  email: string,
): Promise<StoredUser | null> {
  await ensureSchema();
  const rows = await databaseSql()`
    SELECT
      id, email, name, password_hash, role, email_verified_at,
      created_at, updated_at
    FROM users
    WHERE email = ${normalizeEmail(email)}
    LIMIT 1
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<CreateUserResult> {
  await ensureSchema();
  const db = databaseSql();
  const now = new Date().toISOString();

  return db.begin(async (transaction) => {
    const rows = await transaction`
      INSERT INTO users (
        id, email, name, password_hash, role, email_verified_at,
        created_at, updated_at
      )
      VALUES (
        ${`usr_${createOpaqueToken(18)}`},
        ${normalizeEmail(input.email)},
        ${input.name.trim()},
        ${input.passwordHash},
        'buyer',
        NULL,
        ${now},
        ${now}
      )
      ON CONFLICT DO NOTHING
      RETURNING
        id, email, name, password_hash, role, email_verified_at,
        created_at, updated_at
    `;
    if (!rows[0]) {
      return { status: "duplicate" };
    }

    const user = mapUser(rows[0]);
    return {
      status: "created",
      verification: await insertVerification(transaction, user),
    };
  });
}

export async function issueEmailVerification(
  email: string,
): Promise<EmailVerification | null> {
  await ensureSchema();
  return databaseSql().begin(async (transaction) => {
    const rows = await transaction`
      SELECT
        id, email, name, password_hash, role, email_verified_at,
        created_at, updated_at
      FROM users
      WHERE email = ${normalizeEmail(email)}
      FOR UPDATE
    `;
    if (!rows[0]) {
      return null;
    }
    const user = mapUser(rows[0]);
    if (user.emailVerifiedAt) {
      return null;
    }

    return insertVerification(transaction, user);
  });
}

export async function consumeEmailVerification(
  token: string,
): Promise<StoredUser | null> {
  await ensureSchema();
  return databaseSql().begin(async (transaction) => {
    const tokenRows = await transaction`
      DELETE FROM email_verification_tokens
      WHERE token_hash = ${hashOpaqueToken(token)}
      RETURNING user_id, expires_at
    `;
    const tokenRow = tokenRows[0];
    if (
      !tokenRow ||
      new Date(tokenRow.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }

    const userRows = await transaction`
      UPDATE users
      SET
        email_verified_at = COALESCE(email_verified_at, NOW()),
        updated_at = NOW()
      WHERE id = ${String(tokenRow.user_id)}
      RETURNING
        id, email, name, password_hash, role, email_verified_at,
        created_at, updated_at
    `;
    if (!userRows[0]) {
      return null;
    }

    await transaction`
      DELETE FROM email_verification_tokens
      WHERE user_id = ${String(tokenRow.user_id)}
    `;
    return mapUser(userRows[0]);
  });
}

export async function createSession(
  userId: string,
  lifetimeMs = 14 * 24 * 60 * 60_000,
): Promise<CreatedSession | null> {
  await ensureSchema();
  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();

  const rows = await databaseSql().begin(async (transaction) => {
    await transaction`
      DELETE FROM auth_sessions
      WHERE expires_at <= NOW()
    `;
    return transaction`
      INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
      SELECT ${tokenHash}, id, ${createdAt}, ${expiresAt}
      FROM users
      WHERE id = ${userId} AND email_verified_at IS NOT NULL
      RETURNING expires_at
    `;
  });
  if (!rows[0]) {
    return null;
  }
  return { token, expiresAt: iso(rows[0].expires_at) };
}

export async function findSession(
  token: string,
): Promise<ActiveStoredSession | null> {
  if (!token || token.length > 256) {
    return null;
  }
  await ensureSchema();
  const rows = await databaseSql()`
    SELECT
      s.token_hash,
      s.user_id,
      s.created_at AS session_created_at,
      s.expires_at AS session_expires_at,
      u.id,
      u.email,
      u.name,
      u.password_hash,
      u.role,
      u.email_verified_at,
      u.created_at,
      u.updated_at
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = ${hashOpaqueToken(token)}
      AND s.expires_at > NOW()
      AND u.email_verified_at IS NOT NULL
    LIMIT 1
  `;
  if (!rows[0]) {
    return null;
  }
  const row = rows[0];
  return {
    session: {
      tokenHash: String(row.token_hash),
      userId: String(row.user_id),
      createdAt: iso(row.session_created_at),
      expiresAt: iso(row.session_expires_at),
    },
    user: mapUser(row),
  };
}

export async function deleteSession(token: string): Promise<void> {
  if (!token || token.length > 256) {
    return;
  }
  await ensureSchema();
  await databaseSql()`
    DELETE FROM auth_sessions
    WHERE token_hash = ${hashOpaqueToken(token)}
  `;
}

export async function promoteUser(email: string): Promise<PromotionResult> {
  await ensureSchema();
  return databaseSql().begin(async (transaction) => {
    const rows = await transaction`
      SELECT role, email_verified_at
      FROM users
      WHERE email = ${normalizeEmail(email)}
      FOR UPDATE
    `;
    if (!rows[0]) {
      return "not-found";
    }
    if (!rows[0].email_verified_at) {
      return "unverified";
    }
    if (String(rows[0].role) === "admin") {
      return "already-admin";
    }

    await transaction`
      UPDATE users
      SET role = 'admin', updated_at = NOW()
      WHERE email = ${normalizeEmail(email)}
    `;
    return "promoted";
  });
}
