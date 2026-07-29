import type { Metadata } from "next";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans/800.css";
import "./globals.css";
import { getLocale, getPublicUrl, switchLocaleInHref } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, publicUrl] = await Promise.all([
    getLocale(),
    getPublicUrl(),
  ]);
  const english = locale === "en";
  const canonicalPath = publicUrl.split(/[?#]/)[0] || `/${locale}`;
  const title = english
    ? "TicketForge | Tickets for events"
    : "TicketForge | Билети за събития";
  const description = english
    ? "Discover concerts, festivals, theatre and experiences across Bulgaria. Secure e-tickets and live availability."
    : "Открий концерти, фестивали, театър и преживявания в България. Сигурни електронни билети и наличност в реално време.";

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ),
    title: {
      default: title,
      template: "%s | TicketForge",
    },
    description,
    applicationName: "TicketForge",
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
      siteName: "TicketForge",
      title,
      description,
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
