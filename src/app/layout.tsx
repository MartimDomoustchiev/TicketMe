import type { Metadata } from "next";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans/800.css";
import "./globals.css";
import { getLocale, getPublicUrl, switchLocaleInHref } from "@/lib/i18n";
import { getBaseUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, publicUrl] = await Promise.all([
    getLocale(),
    getPublicUrl(),
  ]);
  const english = locale === "en";
  const canonicalPath = publicUrl.split(/[?#]/)[0] || `/${locale}`;
  const title = english
    ? "TicketMe | Tickets for events"
    : "TicketMe | Билети за събития";
  const description = english
    ? "Discover upcoming concerts, festivals, theatre and experiences across Bulgaria, with clearly attributed event sources."
    : "Открий предстоящи концерти, фестивали, театър и преживявания в България с ясно посочени източници.";

  return {
    metadataBase: new URL(getBaseUrl()),
    title: {
      default: title,
      template: "%s | TicketMe",
    },
    description,
    applicationName: "TicketMe",
    icons: {
      icon: "/icon.svg",
    },
    keywords: english
      ? ["tickets", "events", "concerts", "festivals", "theatre", "Bulgaria"]
      : [
          "билети",
          "събития",
          "концерти",
          "фестивали",
          "театър",
          "България",
        ],
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
      languages: {
        bg: switchLocaleInHref(canonicalPath, "bg"),
        en: switchLocaleInHref(canonicalPath, "en"),
        "x-default": switchLocaleInHref(canonicalPath, "bg"),
      },
    },
    openGraph: {
      type: "website",
      locale: english ? "en_GB" : "bg_BG",
      alternateLocale: [english ? "bg_BG" : "en_GB"],
      siteName: "TicketMe",
      title,
      description,
      images: [
        {
          url: "/events/concerts.webp",
          width: 1600,
          height: 800,
          alt: "TicketMe events in Bulgaria",
        },
      ],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 font-bold text-white transition focus:translate-y-0"
        >
          {locale === "en" ? "Skip to main content" : "Към основното съдържание"}
        </a>
        {children}
      </body>
    </html>
  );
}
