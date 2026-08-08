import { findCatalogEventById } from "@/lib/catalog";
import { isEventOpenForTicketMeCheckout } from "@/lib/event";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { subscribeRealtimeAvailability } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STREAM_LIFETIME_MS = 90_000;

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Cross-site stream rejected" }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const eventId = new URL(request.url).searchParams.get("eventId") ?? "";
  if (eventId.length < 1 || eventId.length > 200) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  // A generous IP ceiling supports hundreds of buyers behind a school or
  // mobile-carrier NAT while still bounding reconnect floods globally across
  // Vercel instances through the persistent limiter.
  const rateLimit = await consumeRateLimit({
    key: `sse-connect:${requestIdentity(request)}`,
    limit: 600,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    const error = rateLimit.unavailable
      ? "Service unavailable"
      : "Too many connections";
    return Response.json(
      { error },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const event = await findCatalogEventById(eventId);
  if (!event || !isEventOpenForTicketMeCheckout(event)) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const releaseResources = () => {
    if (closed) {
      return;
    }

    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    if (lifetime) {
      clearTimeout(lifetime);
    }
    unsubscribe?.();
  };

  const stream = new ReadableStream<Uint8Array>(
    {
      async start(controller) {
        const enqueue = (value: string): boolean => {
          if (closed) {
            return false;
          }

          // A slow or abandoned reader must not build an unbounded server-side
          // queue. EventSource reconnects automatically after the stream closes.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            releaseResources();
            try {
              controller.close();
            } catch {
              // The stream may already be closed by an abort.
            }
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
          lifetime = setTimeout(() => {
            releaseResources();
            try {
              controller.close();
            } catch {
              // The client may have disconnected at the same time.
            }
          }, STREAM_LIFETIME_MS);
        } catch (error) {
          releaseResources();
          controller.error(error);
        }
      },
      cancel() {
        releaseResources();
      },
    },
    // The initial retry directive and first availability event can be emitted
    // before the Response consumer attaches. Keep only a few chunks buffered.
    { highWaterMark: 4 },
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "CDN-Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
