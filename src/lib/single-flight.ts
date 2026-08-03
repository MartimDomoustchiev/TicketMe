import "server-only";

declare global {
  var __ticketMeSingleFlight:
    | Map<string, Promise<unknown>>
    | undefined;
}

function isCloudflareWorkerRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

/**
 * Coalesce concurrent refreshes inside one Node/Vercel instance. Next's Data
 * Cache reduces reads between requests, while this guard prevents a burst at
 * the exact revalidation boundary from opening one database query per request.
 */
export function singleFlight<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  // Cloudflare request I/O objects cannot be shared across request contexts.
  if (isCloudflareWorkerRuntime()) {
    return load();
  }

  const flights =
    (globalThis.__ticketMeSingleFlight ??= new Map<string, Promise<unknown>>());
  const existing = flights.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const flight = load();
  flights.set(key, flight);

  const clear = () => {
    if (flights.get(key) === flight) {
      flights.delete(key);
    }
  };
  void flight.then(clear, clear);

  return flight;
}
