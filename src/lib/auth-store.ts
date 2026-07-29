import * as fileStore from "@/lib/auth-store-file";
import * as postgresStore from "@/lib/auth-store-postgres";
import { isDatabaseConfigured } from "@/lib/database";
import type {
  ActiveStoredSession,
  CreateUserResult,
  CreatedSession,
  EmailVerification,
  PromotionResult,
  StoredUser,
} from "@/lib/auth-store-types";

export type {
  ActiveStoredSession,
  CreateUserResult,
  CreatedSession,
  EmailVerification,
  PromotionResult,
  PublicUser,
  StoredAuthSession,
  StoredUser,
  UserRole,
} from "@/lib/auth-store-types";

function hasPostgres(): boolean {
  return isDatabaseConfigured();
}

function assertPersistenceConfigured(): void {
  if (process.env.NODE_ENV === "production" && !hasPostgres()) {
    throw new Error(
      "DATABASE_URL is required in production; local JSON authentication is development-only.",
    );
  }
}

export function authPersistenceMode(): "postgres" | "local-json" {
  return hasPostgres() ? "postgres" : "local-json";
}

export function findUserByEmail(email: string): Promise<StoredUser | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.findUserByEmail(email)
    : fileStore.findUserByEmail(email);
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<CreateUserResult> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.createUser(input)
    : fileStore.createUser(input);
}

export function issueEmailVerification(
  email: string,
): Promise<EmailVerification | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.issueEmailVerification(email)
    : fileStore.issueEmailVerification(email);
}

export function consumeEmailVerification(
  token: string,
): Promise<StoredUser | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.consumeEmailVerification(token)
    : fileStore.consumeEmailVerification(token);
}

export function createSession(
  userId: string,
  lifetimeMs?: number,
): Promise<CreatedSession | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.createSession(userId, lifetimeMs)
    : fileStore.createSession(userId, lifetimeMs);
}

export function findSession(
  token: string,
): Promise<ActiveStoredSession | null> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.findSession(token)
    : fileStore.findSession(token);
}

export function deleteSession(token: string): Promise<void> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.deleteSession(token)
    : fileStore.deleteSession(token);
}

export function promoteUser(email: string): Promise<PromotionResult> {
  assertPersistenceConfigured();
  return hasPostgres()
    ? postgresStore.promoteUser(email)
    : fileStore.promoteUser(email);
}
