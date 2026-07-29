import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

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
