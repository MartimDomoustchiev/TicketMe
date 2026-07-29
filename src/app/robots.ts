import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: ["/bg", "/en"],
      disallow: [
        "/api",
        "/bg/admin",
        "/en/admin",
        "/bg/account",
        "/en/account",
        "/bg/login",
        "/en/login",
        "/bg/tickets",
        "/en/tickets",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
