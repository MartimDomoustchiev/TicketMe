import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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
  type StoredAuthSession,
  type StoredUser,
} from "@/lib/auth-store-types";

type StoredVerification = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthState = {
  version: 1;
  users: Record<string, StoredUser>;
  userIdsByEmail: Record<string, string>;
  sessions: Record<string, StoredAuthSession>;
  verificationTokens: Record<string, StoredVerification>;
};

type AuthStoreLock = {
  tail: Promise<void>;
};

declare global {
  var __ticketForgeAuthStoreLock: AuthStoreLock | undefined;
}

function authFilePath(): string {
  const configured = process.env.AUTH_DATA_PATH;
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error("AUTH_DATA_PATH must be an absolute path.");
    }
    return path.resolve(/* turbopackIgnore: true */ configured);
  }
  return path.join(process.cwd(), ".data", "auth.json");
}

function initialState(): AuthState {
  return {
    version: 1,
    users: {},
    userIdsByEmail: {},
    sessions: {},
    verificationTokens: {},
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeState(value: unknown): AuthState {
  if (!value || typeof value !== "object") {
    return initialState();
  }

  const candidate = value as Partial<AuthState>;
  const users =
    candidate.users && typeof candidate.users === "object"
      ? candidate.users
      : {};
  const userIdsByEmail: Record<string, string> = {};

  for (const user of Object.values(users)) {
    if (user?.id && user.email) {
      userIdsByEmail[normalizeEmail(user.email)] = user.id;
    }
  }

  return {
    version: 1,
    users,
    userIdsByEmail,
    sessions:
      candidate.sessions && typeof candidate.sessions === "object"
        ? candidate.sessions
        : {},
    verificationTokens:
      candidate.verificationTokens &&
      typeof candidate.verificationTokens === "object"
        ? candidate.verificationTokens
        : {},
  };
}

async function readState(): Promise<AuthState> {
  const filePath = authFilePath();
  try {
    return normalizeState(
      JSON.parse(
        await readFile(/* turbopackIgnore: true */ filePath, "utf8"),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return initialState();
    }
    throw error;
  }
}

async function writeState(state: AuthState): Promise<void> {
  const filePath = authFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${createOpaqueToken(8)}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tempPath, filePath);
}

function storeLock(): AuthStoreLock {
  globalThis.__ticketForgeAuthStoreLock ??= {
    tail: Promise.resolve(),
  };
  return globalThis.__ticketForgeAuthStoreLock;
}

async function withMutation<T>(
  mutate: (state: AuthState) => T | Promise<T>,
): Promise<T> {
  const lock = storeLock();
  const previous = lock.tail;
  let release!: () => void;
  lock.tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const state = await readState();
    const result = await mutate(state);
    await writeState(state);
    return result;
  } finally {
    release();
  }
}

function removeExpiredRecords(state: AuthState, now = Date.now()): void {
  for (const [tokenHash, session] of Object.entries(state.sessions)) {
    if (Date.parse(session.expiresAt) <= now) {
      delete state.sessions[tokenHash];
    }
  }
  for (const [tokenHash, verification] of Object.entries(
    state.verificationTokens,
  )) {
    if (Date.parse(verification.expiresAt) <= now) {
      delete state.verificationTokens[tokenHash];
    }
  }
}

function createVerificationForUser(
  state: AuthState,
  user: StoredUser,
): EmailVerification {
  for (const [tokenHash, verification] of Object.entries(
    state.verificationTokens,
  )) {
    if (verification.userId === user.id) {
      delete state.verificationTokens[tokenHash];
    }
  }

  const token = createOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const tokenHash = hashOpaqueToken(token);
  state.verificationTokens[tokenHash] = {
    tokenHash,
    userId: user.id,
    createdAt: now.toISOString(),
    expiresAt,
  };

  return {
    token,
    user: publicUser(user),
    expiresAt,
  };
}

export async function findUserByEmail(
  email: string,
): Promise<StoredUser | null> {
  const state = await readState();
  const userId = state.userIdsByEmail[normalizeEmail(email)];
  return userId && state.users[userId] ? { ...state.users[userId] } : null;
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<CreateUserResult> {
  return withMutation((state) => {
    removeExpiredRecords(state);
    const email = normalizeEmail(input.email);
    if (state.userIdsByEmail[email]) {
      return { status: "duplicate" };
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: `usr_${createOpaqueToken(18)}`,
      email,
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      role: "buyer",
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.users[user.id] = user;
    state.userIdsByEmail[email] = user.id;

    return {
      status: "created",
      verification: createVerificationForUser(state, user),
    };
  });
}

export function issueEmailVerification(
  email: string,
): Promise<EmailVerification | null> {
  return withMutation((state) => {
    removeExpiredRecords(state);
    const userId = state.userIdsByEmail[normalizeEmail(email)];
    const user = userId ? state.users[userId] : null;
    if (!user || user.emailVerifiedAt) {
      return null;
    }
    return createVerificationForUser(state, user);
  });
}

export function consumeEmailVerification(
  token: string,
): Promise<StoredUser | null> {
  return withMutation((state) => {
    const tokenHash = hashOpaqueToken(token);
    const verification = state.verificationTokens[tokenHash];
    delete state.verificationTokens[tokenHash];

    if (
      !verification ||
      Date.parse(verification.expiresAt) <= Date.now()
    ) {
      removeExpiredRecords(state);
      return null;
    }

    const user = state.users[verification.userId];
    if (!user) {
      return null;
    }

    const now = new Date().toISOString();
    user.emailVerifiedAt ??= now;
    user.updatedAt = now;

    for (const [otherHash, otherToken] of Object.entries(
      state.verificationTokens,
    )) {
      if (otherToken.userId === user.id) {
        delete state.verificationTokens[otherHash];
      }
    }

    return { ...user };
  });
}

export function createSession(
  userId: string,
  lifetimeMs = 14 * 24 * 60 * 60_000,
): Promise<CreatedSession | null> {
  return withMutation((state) => {
    removeExpiredRecords(state);
    const user = state.users[userId];
    if (!user?.emailVerifiedAt) {
      return null;
    }

    const token = createOpaqueToken();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
    const tokenHash = hashOpaqueToken(token);
    state.sessions[tokenHash] = {
      tokenHash,
      userId,
      createdAt,
      expiresAt,
    };

    return { token, expiresAt };
  });
}

export async function findSession(
  token: string,
): Promise<ActiveStoredSession | null> {
  if (!token || token.length > 256) {
    return null;
  }

  const state = await readState();
  const session = state.sessions[hashOpaqueToken(token)];
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    return null;
  }
  const user = state.users[session.userId];
  if (!user?.emailVerifiedAt) {
    return null;
  }

  return {
    session: { ...session },
    user: { ...user },
  };
}

export function deleteSession(token: string): Promise<void> {
  return withMutation((state) => {
    if (token && token.length <= 256) {
      delete state.sessions[hashOpaqueToken(token)];
    }
    removeExpiredRecords(state);
  });
}

export function promoteUser(email: string): Promise<PromotionResult> {
  return withMutation((state) => {
    const userId = state.userIdsByEmail[normalizeEmail(email)];
    const user = userId ? state.users[userId] : null;
    if (!user) {
      return "not-found";
    }
    if (!user.emailVerifiedAt) {
      return "unverified";
    }
    if (user.role === "admin") {
      return "already-admin";
    }

    user.role = "admin";
    user.updatedAt = new Date().toISOString();
    return "promoted";
  });
}
