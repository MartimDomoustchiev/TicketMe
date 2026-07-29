import type { Availability } from "@/lib/store";
import { getAvailability, subscribeAvailability } from "@/lib/store";

type Subscriber = (availability: Availability) => void;

type RealtimeChannel = {
  subscribers: Set<Subscriber>;
  lastPayload: string;
  poller?: ReturnType<typeof setInterval>;
  unsubscribeStore?: () => void;
  polling: boolean;
};

declare global {
  var __ticketForgeRealtimeChannels:
    | Map<string, RealtimeChannel>
    | undefined;
}

function channels(): Map<string, RealtimeChannel> {
  globalThis.__ticketForgeRealtimeChannels ??= new Map();
  return globalThis.__ticketForgeRealtimeChannels;
}

function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

function publish(channel: RealtimeChannel, availability: Availability): void {
  const payload = JSON.stringify(availability);
  if (payload === channel.lastPayload) {
    return;
  }

  channel.lastPayload = payload;
  for (const subscriber of channel.subscribers) {
    subscriber(availability);
  }
}

async function createChannel(eventId: string): Promise<RealtimeChannel> {
  const channel: RealtimeChannel = {
    subscribers: new Set(),
    lastPayload: "",
    polling: false,
  };

  channels().set(eventId, channel);
  channel.unsubscribeStore = subscribeAvailability(eventId, (availability) =>
    publish(channel, availability),
  );

  publish(channel, await getAvailability(eventId));
  channel.poller = setInterval(async () => {
    if (channel.polling) {
      return;
    }

    channel.polling = true;
    try {
      publish(channel, await getAvailability(eventId));
    } catch {
      // The next shared poll retries without disconnecting every client.
    } finally {
      channel.polling = false;
    }
  }, 3000);

  return channel;
}

/**
 * Cloudflare Workers cannot safely reuse I/O objects created by another
 * request. Keep the polling lifecycle inside the open SSE request instead of
 * sharing the Node process-level channel and database client across requests.
 */
async function subscribeRequestScopedAvailability(
  eventId: string,
  subscriber: Subscriber,
): Promise<() => void> {
  let cancelled = false;
  let lastPayload = "";
  let poller: ReturnType<typeof setTimeout> | undefined;

  const deliver = (availability: Availability): void => {
    const payload = JSON.stringify(availability);
    if (!cancelled && payload !== lastPayload) {
      lastPayload = payload;
      subscriber(availability);
    }
  };

  deliver(await getAvailability(eventId));

  const poll = async (): Promise<void> => {
    try {
      deliver(await getAvailability(eventId));
    } catch {
      // A later request-scoped poll retries while the SSE connection is open.
    } finally {
      if (!cancelled) {
        poller = setTimeout(() => {
          void poll();
        }, 3000);
      }
    }
  };

  poller = setTimeout(() => {
    void poll();
  }, 3000);

  return () => {
    cancelled = true;
    if (poller) {
      clearTimeout(poller);
    }
  };
}

export async function subscribeRealtimeAvailability(
  eventId: string,
  subscriber: Subscriber,
): Promise<() => void> {
  if (isCloudflareWorkerRuntime()) {
    return subscribeRequestScopedAvailability(eventId, subscriber);
  }

  const channel =
    channels().get(eventId) ?? (await createChannel(eventId));

  channel.subscribers.add(subscriber);

  if (channel.lastPayload) {
    subscriber(JSON.parse(channel.lastPayload) as Availability);
  }

  return () => {
    channel.subscribers.delete(subscriber);

    if (channel.subscribers.size === 0) {
      if (channel.poller) {
        clearInterval(channel.poller);
      }
      channel.unsubscribeStore?.();
      channels().delete(eventId);
    }
  };
}
