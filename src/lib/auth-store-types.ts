export type UserRole = "buyer" | "admin";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Omit<StoredUser, "passwordHash">;

export type StoredAuthSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type ActiveStoredSession = {
  session: StoredAuthSession;
  user: StoredUser;
};

export type EmailVerification = {
  token: string;
  user: PublicUser;
  expiresAt: string;
};

export type CreateUserResult =
  | {
      status: "created";
      verification: EmailVerification;
    }
  | {
      status: "duplicate";
    };

export type CreatedSession = {
  token: string;
  expiresAt: string;
};

export type PromotionResult =
  | "promoted"
  | "already-admin"
  | "not-found"
  | "unverified";

export function publicUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}
