import type { Metadata } from "next";
import { CancelReservationNotice } from "@/components/checkout/CancelReservationNotice";
import { MarketplaceFooter } from "@/components/marketplace/MarketplaceFooter";
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { getEventBySlug } from "@/lib/event";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation_id?: string | string[];
    event?: string | string[];
  }>;
}) {
  const [locale, query] = await Promise.all([getLocale(), searchParams]);
  const reservationId =
    typeof query.reservation_id === "string" ? query.reservation_id : "";
  const requestedSlug = typeof query.event === "string" ? query.event : "";
  const eventSlug = getEventBySlug(requestedSlug)?.slug ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <MarketplaceHeader />
      <main
        id="main-content"
        className="flex flex-1 items-center px-4 py-12 sm:py-20"
      >
        <CancelReservationNotice
          reservationId={reservationId}
          eventSlug={eventSlug}
          locale={locale}
        />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
