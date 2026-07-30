import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.stripe.com https://js.stripe.com https://*.js.stripe.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://r.stripe.com",
  "frame-src https://checkout.stripe.com https://hooks.stripe.com https://js.stripe.com https://*.js.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Let Wrangler resolve Postgres.js through its `workerd` conditional export
  // instead of baking the Node TCP implementation into the Next.js bundle.
  serverExternalPackages: ["postgres"],
  // DATABASE_SSL_CA_PATH is resolved at runtime. Next.js cannot infer that
  // dynamic filesystem dependency, so include the public AWS trust bundle in
  // every server trace that may open an authenticated session or query RDS.
  outputFileTracingIncludes: {
    "/*": ["./global-bundle.pem"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
