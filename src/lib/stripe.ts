import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export type StripeMode = "test" | "live";

export function stripeMode(): StripeMode | null {
  const key = process.env.STRIPE_SECRET_KEY;

  if (key?.startsWith("sk_test_")) {
    return "test";
  }

  if (key?.startsWith("sk_live_")) {
    return "live";
  }

  return null;
}

export function stripePublishableMode(): StripeMode | null {
  const key =
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (key?.startsWith("pk_test_")) {
    return "test";
  }

  if (key?.startsWith("pk_live_")) {
    return "live";
  }

  return null;
}

export function isStripeConfigured(): boolean {
  return stripeMode() !== null;
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
  );
}

export function isStripeEmbeddedTestConfigured(): boolean {
  return (
    stripeMode() === "test" &&
    stripePublishableMode() === "test" &&
    isStripeWebhookConfigured()
  );
}

export function getStripeTestPublishableKey(): string | null {
  if (!isStripeEmbeddedTestConfigured()) {
    return null;
  }

  return (
    process.env.STRIPE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    null
  );
}

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }

  stripeClient ??= new Stripe(secretKey, {
    appInfo: {
      name: "TicketMe",
      version: "0.1.0",
    },
    maxNetworkRetries: 2,
    timeout: 15_000,
  });

  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  if (!webhookSecret.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET must be a webhook signing secret.");
  }

  return webhookSecret;
}
