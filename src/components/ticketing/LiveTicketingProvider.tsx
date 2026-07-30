"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Availability,
  PurchaseActivity,
} from "@/lib/store";

export type LiveTicketingStatus = {
  availability: Availability;
  activity: PurchaseActivity;
};

type LiveTicketingContextValue = LiveTicketingStatus & {
  isLive: boolean;
};

type Props = {
  eventId: string | null;
  initialAvailability: Availability | null;
  initialActivity: PurchaseActivity;
  children: React.ReactNode;
};

const LiveTicketingContext =
  createContext<LiveTicketingContextValue | null>(null);

function isLiveTicketingStatus(
  value: unknown,
): value is LiveTicketingStatus {
  if (!value || typeof value !== "object") {
    return false;
  }

  const status = value as Partial<LiveTicketingStatus>;
  return (
    typeof status.availability?.totalRemaining === "number" &&
    typeof status.availability?.totalCapacity === "number" &&
    typeof status.availability?.sold === "number" &&
    typeof status.availability?.byType === "object" &&
    typeof status.activity?.queueDepth === "number" &&
    typeof status.activity?.activeCheckouts === "number"
  );
}

export function LiveTicketingProvider({
  eventId,
  initialAvailability,
  initialActivity,
  children,
}: Props) {
  const [status, setStatus] = useState<LiveTicketingStatus | null>(
    initialAvailability
      ? {
          availability: initialAvailability,
          activity: initialActivity,
        }
      : null,
  );
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!eventId || !initialAvailability) {
      return;
    }

    let cancelled = false;
    const source = new EventSource(
      `/api/events?eventId=${encodeURIComponent(eventId)}`,
    );

    const applyStatus = (value: unknown) => {
      if (!cancelled && isLiveTicketingStatus(value)) {
        setStatus(value);
        setIsLive(true);
      }
    };

    source.onopen = () => {
      if (!cancelled) {
        setIsLive(true);
      }
    };
    source.onmessage = (messageEvent) => {
      try {
        applyStatus(JSON.parse(messageEvent.data) as unknown);
      } catch {
        setIsLive(false);
      }
    };
    source.onerror = () => {
      if (!cancelled) {
        setIsLive(false);
      }
    };

    const fallbackPoller = window.setInterval(async () => {
      if (cancelled || source.readyState === EventSource.OPEN) {
        return;
      }

      try {
        const response = await fetch(
          `/api/event?eventId=${encodeURIComponent(eventId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          availability?: unknown;
          activity?: unknown;
        };
        applyStatus({
          availability: payload.availability,
          activity: payload.activity,
        });
      } catch {
        // EventSource reconnects automatically; a later poll is a fallback.
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(fallbackPoller);
      source.close();
    };
  }, [eventId, initialAvailability]);

  const value = useMemo<LiveTicketingContextValue | null>(
    () => (status ? { ...status, isLive } : null),
    [isLive, status],
  );

  return (
    <LiveTicketingContext.Provider value={value}>
      {children}
    </LiveTicketingContext.Provider>
  );
}

export function useLiveTicketingStatus() {
  return useContext(LiveTicketingContext);
}
