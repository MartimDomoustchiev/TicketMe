const TRANSIENT_POSTGRES_READ_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "08000",
  "08001",
  "08003",
  "08006",
  "08007",
  "25P03",
  "57P01",
  "57P03",
  "57P05",
]);

const MAX_RETRY_DELAY_MS = 50;

export type PublicPostgresReadLabel =
  | "catalog-list"
  | "catalog-id"
  | "catalog-slug"
  | "availability"
  | "purchase-activity";

type TransientPostgresReadRetryOptions = {
  delayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  warn?: (message: string) => void;
};

function errorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.toUpperCase();
  }

  return null;
}

export function isTransientPostgresReadError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== null && TRANSIENT_POSTGRES_READ_CODES.has(code);
}

function retryDelayMs(value: number | undefined): number {
  if (value === undefined) {
    return MAX_RETRY_DELAY_MS;
  }
  if (!Number.isFinite(value)) {
    return MAX_RETRY_DELAY_MS;
  }
  return Math.max(0, Math.min(MAX_RETRY_DELAY_MS, Math.floor(value)));
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Public cached reads may safely reconnect once after an unambiguous transport
 * failure. Unknown, query, authentication and capacity errors propagate on the
 * first attempt so this never becomes a general database retry policy.
 */
export async function retryTransientPostgresRead<T>(
  label: PublicPostgresReadLabel,
  load: () => Promise<T>,
  options: TransientPostgresReadRetryOptions = {},
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const code = errorCode(error);
    if (code === null || !TRANSIENT_POSTGRES_READ_CODES.has(code)) {
      throw error;
    }

    const warn = options.warn ?? console.warn;
    warn(
      `Transient PostgreSQL public read failed (${label}, ${code}); retrying once.`,
    );

    const delayMs = retryDelayMs(options.delayMs);
    if (delayMs > 0) {
      await (options.sleep ?? wait)(delayMs);
    }
    return load();
  }
}
