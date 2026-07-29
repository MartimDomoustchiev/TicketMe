import {
  findCatalogEventById,
  isInternallySoldEvent,
} from "@/lib/catalog";
import { subscribeRealtimeAvailability } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";

  const event = await findCatalogEventById(eventId);
  if (!event || !isInternallySoldEvent(event)) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const releaseResources = () => {
    if (closed) {
      return;
    }

    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    unsubscribe?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (value: string): boolean => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(encoder.encode(value));
          return true;
        } catch {
          releaseResources();
          return false;
        }
      };

      const closeForAbort = () => {
        releaseResources();
        try {
          controller.close();
        } catch {
          // The stream may already have been cancelled by the client.
        }
      };

      request.signal.addEventListener("abort", closeForAbort, { once: true });
      enqueue("retry: 3000\n\n");

      try {
        const stop = await subscribeRealtimeAvailability(
          eventId,
          (payload) => {
            enqueue(`data: ${JSON.stringify(payload)}\n\n`);
          },
        );

        if (closed) {
          stop();
          return;
        }

        unsubscribe = stop;
        heartbeat = setInterval(() => {
          enqueue(": heartbeat\n\n");
        }, 15000);
      } catch (error) {
        releaseResources();
        controller.error(error);
      }
    },
    cancel() {
      releaseResources();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "CDN-Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
