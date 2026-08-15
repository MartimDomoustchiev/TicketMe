import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://checkout.stripe.com https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://r.stripe.com",
  "frame-src https://checkout.stripe.com https://hooks.stripe.com https://js.stripe.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Let Wrangler resolve Postgres.js through its `workerd` conditional export
  // instead of baking the Node TCP implementation into the Next.js bundle.
  serverExternalPackages: ["postgres"],
  // DATABASE_SSL_CA_PATH is resolved at runtime. Next.js cannot infer that
  // dynamic filesystem dependency, so include the public AWS trust bundle in
  // every server trace that may open an authenticated session or query RDS.
  outputFileTracingIncludes: {
    "/*": ["./global-bundle.pem"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "tiketko.top" }],
        destination: "https://www.tiketko.top/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
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
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
      // Form pages need an origin signal for CSRF validation. `strict-origin`
      // preserves only that origin and never exposes a token-bearing path.
      ...[
        {
          source: "/:locale(bg|en)/verify",
          referrerPolicy: "strict-origin",
        },
        {
          source: "/:locale(bg|en)/admin/check-in",
          referrerPolicy: "strict-origin",
        },
        {
          source: "/api/tickets/:id/verify",
          referrerPolicy: "no-referrer",
        },
      ].map(({ source, referrerPolicy }) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: referrerPolicy },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
};

export default nextConfig;
