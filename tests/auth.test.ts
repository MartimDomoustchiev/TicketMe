import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth-crypto";
import {
  consumeEmailVerification,
  createSession,
  createUser,
  deleteSession,
  findSession,
  findUserByEmail,
  promoteUser,
} from "../src/lib/auth-store-file";
import {
  acceptedTerms,
  isValidEmail,
  isValidName,
  isValidPassword,
} from "../src/lib/auth-validation";
import {
  consumeRateLimit,
  consumeRateLimitsInOrder,
} from "../src/lib/rate-limit";
import { isSameOriginRequest } from "../src/lib/request-security";
import { POST as sessionPost } from "../src/app/api/session/route";
import { GET as verificationGet } from "../src/app/api/verify/confirm/route";
import { POST as verificationStartPost } from "../src/app/api/verify/start/route";
import { CURRENT_TERMS_VERSION } from "../src/lib/legal";

let testDirectory = "";
let authDataPath = "";

before(async () => {
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "ticketforge-auth-"));
  authDataPath = path.join(testDirectory, "auth.json");
  process.env.AUTH_DATA_PATH = authDataPath;
});

after(async () => {
  delete process.env.AUTH_DATA_PATH;
  await rm(testDirectory, { recursive: true, force: true });
});

test("passwords use salted scrypt hashes and constant-time verification", async () => {
  const password = "Professional9";
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("WrongPassword9", first), false);
  assert.equal(await verifyPassword(password, DUMMY_PASSWORD_HASH), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});

test("auth input validation matches the signup contract", () => {
  assert.equal(isValidEmail("candidate@example.com"), true);
  assert.equal(isValidEmail("candidate@"), false);
  assert.equal(isValidName("Марти"), true);
  assert.equal(isValidName("M"), false);
  assert.equal(isValidPassword("Professional9"), true);
  assert.equal(isValidPassword("professional9"), false);
  assert.equal(isValidPassword("Professional"), false);
  assert.equal(acceptedTerms("accepted"), true);
  assert.equal(acceptedTerms("on"), true);
  assert.equal(acceptedTerms(null), false);
});

test("local auth persists users while keeping passwords and tokens opaque", async () => {
  const plaintextPassword = "CandidatePass9";
  const result = await createUser({
    email: "Candidate@Example.com",
    name: "Candidate User",
    passwordHash: await hashPassword(plaintextPassword),
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.equal(result.status, "created");
  if (result.status !== "created") {
    assert.fail("Expected account creation to succeed.");
  }
  assert.equal(
    result.verification.user.termsAcceptedVersion,
    CURRENT_TERMS_VERSION,
  );
  assert.ok(result.verification.user.termsAcceptedAt);
  assert.equal(
    Number.isNaN(
      Date.parse(result.verification.user.termsAcceptedAt ?? ""),
    ),
    false,
  );

  const duplicate = await createUser({
    email: "candidate@example.com",
    name: "Duplicate",
    passwordHash: await hashPassword("AnotherPass9"),
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.deepEqual(duplicate, { status: "duplicate" });

  const beforeVerification = await readFile(authDataPath, "utf8");
  assert.equal(beforeVerification.includes(plaintextPassword), false);
  assert.equal(beforeVerification.includes(result.verification.token), false);
  assert.match(beforeVerification, /"tokenHash": "[a-f0-9]{64}"/);

  const verifiedUser = await consumeEmailVerification(
    result.verification.token,
  );
  assert.ok(verifiedUser?.emailVerifiedAt);
  assert.equal(
    await consumeEmailVerification(result.verification.token),
    null,
  );

  const session = await createSession(verifiedUser!.id);
  assert.ok(session);
  const storedAfterSession = await readFile(authDataPath, "utf8");
  assert.equal(storedAfterSession.includes(session!.token), false);
  assert.match(storedAfterSession, /"tokenHash": "[a-f0-9]{64}"/);

  const active = await findSession(session!.token);
  assert.equal(active?.user.email, "candidate@example.com");
  assert.equal(active?.user.role, "buyer");

  assert.equal(await promoteUser("candidate@example.com"), "promoted");
  assert.equal(
    (await findSession(session!.token))?.user.role,
    "admin",
  );
  assert.equal(
    await promoteUser("candidate@example.com"),
    "already-admin",
  );

  await deleteSession(session!.token);
  assert.equal(await findSession(session!.token), null);
  assert.equal(
    (await findUserByEmail("CANDIDATE@example.com"))?.name,
    "Candidate User",
  );
});

test("an unverified account cannot be promoted or receive a session", async () => {
  const result = await createUser({
    email: "unverified@example.com",
    name: "Unverified User",
    passwordHash: await hashPassword("Unverified9"),
    termsVersion: CURRENT_TERMS_VERSION,
  });
  assert.equal(result.status, "created");
  if (result.status !== "created") {
    assert.fail("Expected account creation to succeed.");
  }

  assert.equal(
    await promoteUser("unverified@example.com"),
    "unverified",
  );
  assert.equal(await createSession(result.verification.user.id), null);
});

test("state-changing form requests enforce their origin", () => {
  const sameOrigin = new Request("https://tickets.example/api/session", {
    method: "POST",
    headers: {
      host: "tickets.example",
      origin: "https://tickets.example",
      "sec-fetch-site": "same-origin",
    },
  });
  const forwardedOrigin = new Request(
    "http://internal:3000/api/session",
    {
      method: "POST",
      headers: {
        origin: "https://tickets.example",
        "x-forwarded-host": "tickets.example",
        "x-forwarded-proto": "https",
      },
    },
  );
  const crossSite = new Request("https://tickets.example/api/session", {
    method: "POST",
    headers: {
      host: "tickets.example",
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
  });
  const missingProvenance = new Request(
    "https://tickets.example/api/session",
    { method: "POST" },
  );

  assert.equal(isSameOriginRequest(sameOrigin), true);
  assert.equal(isSameOriginRequest(forwardedOrigin), true);
  assert.equal(isSameOriginRequest(crossSite), false);
  assert.equal(isSameOriginRequest(missingProvenance), false);
});

test("canonical redirects preserve trusted form provenance without weakening CSRF", () => {
  const request = (headers: Record<string, string>, host = "www.tiketko.top") =>
    new Request(`https://${host}/api/session`, {
      method: "POST",
      headers: { host, ...headers },
    });

  assert.equal(
    isSameOriginRequest(
      request({
        origin: "https://tiketko.top",
        "sec-fetch-site": "same-site",
      }),
    ),
    true,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        origin: "null",
        referer: "https://tiketko.top/bg/login",
        "sec-fetch-site": "same-site",
      }),
    ),
    true,
  );

  for (const untrustedOrigin of [
    "https://shop.tiketko.top",
    "https://tiketko.top.evil.example",
    "http://tiketko.top",
    "https://tiketko.top:444",
    "not a valid origin",
  ]) {
    assert.equal(
      isSameOriginRequest(
        request({
          origin: untrustedOrigin,
          "sec-fetch-site": "same-site",
        }),
      ),
      false,
    );
  }

  assert.equal(
    isSameOriginRequest(
      request({
        origin: "https://evil.example",
        referer: "https://tiketko.top/bg/login",
        "sec-fetch-site": "same-site",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        origin: "null",
        referer: "https://evil.example/login",
        "sec-fetch-site": "same-site",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request(
        {
          origin: "https://tiketko.top",
          "sec-fetch-site": "same-site",
        },
        "preview.tiketko.top",
      ),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        origin: "https://tiketko.top",
        "sec-fetch-site": "cross-site",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request(
        {
          origin: "https://www.tiketko.top",
          "sec-fetch-site": "same-site",
        },
        "tiketko.top",
      ),
    ),
    false,
  );
});

test("session accepts an apex form POST replayed on the canonical host", async () => {
  const response = await sessionPost(
    new Request("https://www.tiketko.top/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "www.tiketko.top",
        origin: "null",
        referer: "https://tiketko.top/bg/login",
        "sec-fetch-site": "same-site",
      },
      body: new URLSearchParams({
        intent: "login",
        locale: "bg",
        email: "not-an-email",
        password: "SecretPassword9",
        next: "/bg/events",
      }),
    }),
  );

  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin, "https://www.tiketko.top");
  assert.equal(location.pathname, "/bg/login");
  assert.equal(location.searchParams.get("error"), "email");
});

test("session form outcomes use 303 so credentials are never reposted", async () => {
  const response = await sessionPost(
    new Request("https://tickets.example/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "tickets.example",
        origin: "https://tickets.example",
        "sec-fetch-site": "same-origin",
      },
      body: new URLSearchParams({
        intent: "login",
        locale: "en",
        email: "not-an-email",
        password: "SecretPassword9",
        next: "/en/events",
      }),
    }),
  );

  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.pathname, "/en/login");
  assert.equal(location.searchParams.get("error"), "email");
  assert.equal(location.searchParams.get("mode"), "login");
  assert.equal(location.searchParams.get("next"), "/en/events");
});

test("session rejects oversized and unsupported form bodies", async () => {
  const oversized = await sessionPost(
    new Request("https://tickets.example/api/session", {
      method: "POST",
      headers: {
        "content-length": String(16 * 1024 + 1),
        "content-type": "application/x-www-form-urlencoded",
        host: "tickets.example",
        origin: "https://tickets.example",
        "sec-fetch-site": "same-origin",
      },
      body: "intent=login",
    }),
  );
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "payload-too-large" });

  const unsupported = await sessionPost(
    new Request("https://tickets.example/api/session", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        host: "tickets.example",
        origin: "https://tickets.example",
        "sec-fetch-site": "same-origin",
      },
      body: "intent=login",
    }),
  );
  assert.equal(unsupported.status, 415);
  assert.deepEqual(await unsupported.json(), {
    error: "unsupported-media-type",
  });
});

test("database outages use a dedicated account-service error", async () => {
  const keys = [
    "NODE_ENV",
    "DATABASE_URL",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
  ] as const;
  const previous = new Map(
    keys.map((key) => [key, process.env[key]]),
  );

  Reflect.set(process.env, "NODE_ENV", "production");
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_HOST;
  delete process.env.DATABASE_NAME;
  delete process.env.DATABASE_USER;
  delete process.env.DATABASE_PASSWORD;

  try {
    const response = await sessionPost(
      new Request("https://tickets.example/api/session", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "tickets.example",
          origin: "https://tickets.example",
          "sec-fetch-site": "same-origin",
        },
        body: new URLSearchParams({
          intent: "signup",
          locale: "en",
          name: "Production Candidate",
          email: "outage-candidate@example.com",
          password: "Professional9",
          confirmPassword: "Professional9",
          terms: "accepted",
          next: "/en/events",
        }),
      }),
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/en/login");
    assert.equal(location.searchParams.get("mode"), "signup");
    assert.equal(
      location.searchParams.get("error"),
      "service-unavailable",
    );
    assert.equal(location.searchParams.get("next"), "/en/events");
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
});

test("local signup continues directly to truthful email verification", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousMailFrom = process.env.MAIL_FROM;
  const previousOutboxPath = process.env.EMAIL_OUTBOX_PATH;
  const outboxPath = path.join(testDirectory, "outbox.log");
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  process.env.EMAIL_OUTBOX_PATH = outboxPath;

  try {
    const response = await sessionPost(
      new Request("https://tickets.example/api/session", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "tickets.example",
          origin: "https://tickets.example",
          "sec-fetch-site": "same-origin",
        },
        body: new URLSearchParams({
          intent: "signup",
          locale: "en",
          name: "Local Candidate",
          email: "local-candidate@example.com",
          password: "Professional9",
          confirmPassword: "Professional9",
          terms: "accepted",
          next: "/en/events",
        }),
      }),
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/en/verify");
    assert.equal(location.searchParams.get("next"), "/en/events");
    assert.equal(location.searchParams.get("delivery"), "local");
    assert.match(
      location.searchParams.get("token") ?? "",
      /^[A-Za-z0-9_-]{32,256}$/,
    );

    const outbox = await readFile(outboxPath, "utf8");
    assert.match(outbox, /TO local-candidate@example\.com/);
    assert.match(outbox, /Verify email and activate account/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousMailFrom === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = previousMailFrom;
    if (previousOutboxPath === undefined) {
      delete process.env.EMAIL_OUTBOX_PATH;
    } else {
      process.env.EMAIL_OUTBOX_PATH = previousOutboxPath;
    }
  }
});

test("verification GET only opens the confirmation screen", () => {
  const token = "a".repeat(43);
  const response = verificationGet(
    new Request(
      `https://tickets.example/api/verify/confirm?token=${token}&next=%2Fen%2Fevents`,
    ),
  );
  const location = new URL(response.headers.get("location")!);

  assert.equal(response.status, 307);
  assert.equal(location.pathname, "/en/verify");
  assert.equal(location.searchParams.get("token"), token);
  assert.equal(location.searchParams.get("next"), "/en/events");
});

test("verification resend has independent fixed IP and account limits", async () => {
  globalThis.__ticketForgeRateLimits?.clear();

  const request = (ip: string, email: string) =>
    verificationStartPost(
      new Request("https://tickets.example/api/verify/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "tickets.example",
          origin: "https://tickets.example",
          "sec-fetch-site": "same-origin",
          "x-vercel-forwarded-for": ip,
        },
        body: JSON.stringify({ email, locale: "en" }),
      }),
    );

  for (let index = 0; index < 15; index += 1) {
    const response = await request(
      "203.0.113.10",
      `rotating-${index}@example.com`,
    );
    assert.equal(response.status, 200);
  }

  const ipLimited = await request(
    "203.0.113.10",
    "rotating-denied@example.com",
  );
  assert.equal(ipLimited.status, 429);
  assert.deepEqual(await ipLimited.json(), { error: "rate-limit" });
  assert.equal(
    globalThis.__ticketForgeRateLimits?.has(
      "verification:account:rotating-denied@example.com",
    ),
    false,
  );

  globalThis.__ticketForgeRateLimits?.clear();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(
      (await request(`198.51.100.${index + 1}`, "shared@example.com"))
        .status,
      200,
    );
  }
  assert.equal(
    (await request("198.51.100.99", "shared@example.com")).status,
    429,
  );

  globalThis.__ticketForgeRateLimits?.clear();
});

test("ordered rate limits stop before writing a novel secondary bucket", async () => {
  globalThis.__ticketForgeRateLimits?.clear();
  const primary = {
    key: "ordered-test:ip:203.0.113.20",
    limit: 1,
    windowMs: 60_000,
  };

  assert.equal(
    (
      await consumeRateLimitsInOrder([
        primary,
        {
          key: "ordered-test:account:first@example.com",
          limit: 5,
          windowMs: 60_000,
        },
      ])
    ).allowed,
    true,
  );
  assert.equal(
    (
      await consumeRateLimitsInOrder([
        primary,
        {
          key: "ordered-test:account:novel@example.com",
          limit: 5,
          windowMs: 60_000,
        },
      ])
    ).allowed,
    false,
  );
  assert.equal(
    globalThis.__ticketForgeRateLimits?.has(
      "ordered-test:account:novel@example.com",
    ),
    false,
  );

  globalThis.__ticketForgeRateLimits?.clear();
});

test("the in-process limiter opportunistically bounds its memory", async () => {
  for (let index = 0; index < 5_250; index += 1) {
    await consumeRateLimit({
      key: `bounded-map-test:${index}`,
      limit: 1,
      windowMs: 60 * 60_000,
    });
  }

  assert.ok(globalThis.__ticketForgeRateLimits);
  assert.ok(globalThis.__ticketForgeRateLimits.size <= 5_000);
  globalThis.__ticketForgeRateLimits.clear();
});
