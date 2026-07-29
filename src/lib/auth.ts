import { cookies } from "next/headers";
import {
  DUMMY_PASSWORD_HASH,
  verifyPassword,
} from "@/lib/auth-crypto";
import {
  createSession,
  deleteSession,
  findSession,
  findUserByEmail,
  type ActiveStoredSession,
  type StoredUser,
} from "@/lib/auth-store";

const COOKIE_NAME = "ticket_forge_session";
const LEGACY_ADMIN_COOKIE_NAME = "ticket_forge_admin";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 14;

export type BuyerSession = {
  email: string;
  name: string;
  verifiedAt: string;
  expiresAt: string;
};

export type ActiveAccount =
  | {
      role: "admin";
      email: string;
      name: string;
    }
  | {
      role: "buyer";
      email: string;
      name: string;
      verifiedAt: string;
    };

export type CredentialResult =
  | { status: "invalid" }
  | { status: "unverified"; user: StoredUser }
  | { status: "authenticated"; user: StoredUser };

async function sessionFromCookie(): Promise<ActiveStoredSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ? findSession(token) : null;
}

export async function authenticateCredentials(input: {
  email: string;
  password: string;
}): Promise<CredentialResult> {
  const user = await findUserByEmail(input.email);
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    return { status: "invalid" };
  }
  if (!user.emailVerifiedAt) {
    return { status: "unverified", user };
  }
  return { status: "authenticated", user };
}

export async function createUserSession(userId: string): Promise<void> {
  const session = await createSession(
    userId,
    SESSION_LIFETIME_SECONDS * 1000,
  );
  if (!session) {
    throw new Error("Unable to create a session for an unverified user.");
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(COOKIE_NAME)?.value;
  if (previousToken) {
    await deleteSession(previousToken);
  }

  cookieStore.set(COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_LIFETIME_SECONDS,
    expires: new Date(session.expiresAt),
    path: "/",
    priority: "high",
  });
  cookieStore.delete(LEGACY_ADMIN_COOKIE_NAME);
}

export async function clearAllSessions(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await deleteSession(token);
  }
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(LEGACY_ADMIN_COOKIE_NAME);
}

export async function getBuyerSession(): Promise<BuyerSession | null> {
  const active = await sessionFromCookie();
  if (!active?.user.emailVerifiedAt) {
    return null;
  }

  return {
    email: active.user.email,
    name: active.user.name,
    verifiedAt: active.user.emailVerifiedAt,
    expiresAt: active.session.expiresAt,
  };
}

export async function isAdminSession(): Promise<boolean> {
  const active = await sessionFromCookie();
  return active?.user.role === "admin";
}

export async function getActiveAccount(): Promise<ActiveAccount | null> {
  const active = await sessionFromCookie();
  if (!active?.user.emailVerifiedAt) {
    return null;
  }

  if (active.user.role === "admin") {
    return {
      role: "admin",
      email: active.user.email,
      name: active.user.name,
    };
  }

  return {
    role: "buyer",
    email: active.user.email,
    name: active.user.name,
    verifiedAt: active.user.emailVerifiedAt,
  };
}
