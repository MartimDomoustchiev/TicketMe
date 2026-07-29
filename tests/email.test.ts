import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  isEmailReadyForArbitraryRecipients,
  normalizeMailFrom,
  sendVerificationEmail,
} from "../src/lib/email";

const ENVIRONMENT_KEYS = [
  "NODE_ENV",
  "RESEND_API_KEY",
  "RESEND_BASE_URL",
  "MAIL_FROM",
  "EMAIL_OUTBOX_PATH",
] as const;

function setEnvironment(
  key: (typeof ENVIRONMENT_KEYS)[number],
  value: string | undefined,
): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    Reflect.set(process.env, key, value);
  }
}

test("Resend test-domain recipient restrictions fall back only in development", async () => {
  const previousEnvironment = Object.fromEntries(
    ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );
  const testDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ticketforge-email-"),
  );
  const outboxPath = path.join(testDirectory, "outbox.log");
  const requestBodies: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requestBodies.push(body);
      response.writeHead(403, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          statusCode: 403,
          name: "validation_error",
          message:
            "You can only send testing emails to your own email address (owner@example.com).",
        }),
      );
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  setEnvironment("NODE_ENV", "development");
  setEnvironment("RESEND_API_KEY", "resend-local-test-key");
  setEnvironment(
    "RESEND_BASE_URL",
    `http://127.0.0.1:${address.port}`,
  );
  setEnvironment("MAIL_FROM", "TicketForge <onboarding@resend.dev>");
  setEnvironment("EMAIL_OUTBOX_PATH", outboxPath);

  try {
    const delivery = await sendVerificationEmail({
      to: "candidate@example.com",
      name: "Local <Candidate>",
      verificationUrl: "https://tickets.example/en/verify?token=test-token",
      locale: "en",
    });

    assert.equal(delivery, "local-outbox");
    const outbox = await readFile(outboxPath, "utf8");
    assert.match(outbox, /TO candidate@example\.com/);
    assert.match(outbox, /Verify email and activate account/);
    assert.match(outbox, /role="presentation"/);
    assert.match(outbox, /Local &lt;Candidate&gt;/);
    assert.doesNotMatch(outbox, /Local <Candidate>/);
    assert.equal(
      JSON.parse(requestBodies[0])?.from,
      "TicketMe <onboarding@resend.dev>",
    );

    setEnvironment("MAIL_FROM", "TicketMe <tickets@verified.example>");
    await assert.rejects(
      sendVerificationEmail({
        to: "candidate@example.com",
        name: "Local Candidate",
        verificationUrl: "https://tickets.example/en/verify?token=test-token",
        locale: "en",
      }),
      /Email delivery failed/,
    );

    setEnvironment("NODE_ENV", "production");
    setEnvironment("MAIL_FROM", "TicketMe <onboarding@resend.dev>");
    await assert.rejects(
      sendVerificationEmail({
        to: "candidate@example.com",
        name: "Local Candidate",
        verificationUrl: "https://tickets.example/en/verify?token=test-token",
        locale: "en",
      }),
      /custom domain verified in Resend/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(testDirectory, { recursive: true, force: true });
    for (const key of ENVIRONMENT_KEYS) {
      setEnvironment(key, previousEnvironment[key]);
    }
  }
});

test("sender normalization preserves the verified address and enforces the TicketMe brand", () => {
  assert.equal(
    normalizeMailFrom("TicketForge <tickets@mail.example.com>"),
    "TicketMe <tickets@mail.example.com>",
  );
  assert.equal(
    normalizeMailFrom("tickets@mail.example.com"),
    "TicketMe <tickets@mail.example.com>",
  );
  assert.equal(
    normalizeMailFrom("TicketMe <first@example.com>, second@example.com"),
    null,
  );
  assert.equal(
    normalizeMailFrom("TicketMe <tickets@example.com>\r\nBcc: bad@example.com"),
    null,
  );
});

test("arbitrary-recipient readiness requires a custom sender domain", () => {
  const previousEnvironment = Object.fromEntries(
    ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );

  try {
    setEnvironment("RESEND_API_KEY", "resend-local-test-key");
    setEnvironment("MAIL_FROM", "TicketMe <onboarding@resend.dev>");
    assert.equal(isEmailReadyForArbitraryRecipients(), false);

    setEnvironment("MAIL_FROM", "TicketMe <tickets@mail.example.com>");
    assert.equal(isEmailReadyForArbitraryRecipients(), true);

    setEnvironment("RESEND_API_KEY", undefined);
    assert.equal(isEmailReadyForArbitraryRecipients(), false);
  } finally {
    for (const key of ENVIRONMENT_KEYS) {
      setEnvironment(key, previousEnvironment[key]);
    }
  }
});
