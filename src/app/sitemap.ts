import type { MetadataRoute } from "next";
import { listCatalogEvents } from "@/lib/catalog";
import { SUPPORTED_LOCALES } from "@/lib/i18n-config";
import { getBaseUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const generatedAt = new Date();
  const catalogEvents = await listCatalogEvents();

  const paths = [
    { path: "", changeFrequency: "daily" as const, priority: 1 },
    { path: "/events", changeFrequency: "daily" as const, priority: 0.9 },
    { path: "/terms", changeFrequency: "monthly" as const, priority: 0.3 },
    { path: "/privacy", changeFrequency: "monthly" as const, priority: 0.3 },
    ...catalogEvents.map((event) => ({
      path: `/events/${encodeURIComponent(event.slug)}`,
      changeFrequency: "weekly" as const,
      priority: event.featured ? 0.9 : 0.7,
    })),
  ];

  return paths.flatMap((entry) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: `${baseUrl}/${locale}${entry.path}`,
      lastModified: generatedAt,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      alternates: {
        languages: {
          bg: `${baseUrl}/bg${entry.path}`,
          en: `${baseUrl}/en${entry.path}`,
        },
      },
    })),
  );
}
