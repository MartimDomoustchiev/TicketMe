export type BoundedBodyError =
  | "invalid-body"
  | "payload-too-large"
  | "unsupported-media-type";

export type BoundedBodyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: BoundedBodyError;
      status: 400 | 413 | 415;
    };

function failure(
  error: BoundedBodyError,
  status: 400 | 413 | 415,
): BoundedBodyResult<never> {
  return { ok: false, error, status };
}

function requestMediaType(request: Request): string {
  return (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function advertisedBodyExceedsLimit(
  request: Request,
  maxBytes: number,
): boolean {
  const rawLength = request.headers.get("content-length")?.trim();
  if (!rawLength || !/^\d+$/.test(rawLength)) {
    return false;
  }

  const length = Number(rawLength);
  return Number.isSafeInteger(length) && length > maxBytes;
}

export async function readTextBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBytes must be a positive integer.");
  }

  if (!request.body) {
    return "";
  }

  if (advertisedBodyExceedsLimit(request, maxBytes)) {
    await request.body.cancel("Payload too large.").catch(() => undefined);
    return null;
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Payload too large.").catch(() => undefined);
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }

    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBodyWithinLimit<T = unknown>(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult<T>> {
  if (requestMediaType(request) !== "application/json") {
    return failure("unsupported-media-type", 415);
  }

  const body = await readTextBodyWithinLimit(request, maxBytes);
  if (body === null) {
    return failure("payload-too-large", 413);
  }

  try {
    return { ok: true, value: JSON.parse(body) as T };
  } catch {
    return failure("invalid-body", 400);
  }
}

export async function readUrlEncodedBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult<URLSearchParams>> {
  if (requestMediaType(request) !== "application/x-www-form-urlencoded") {
    return failure("unsupported-media-type", 415);
  }

  const body = await readTextBodyWithinLimit(request, maxBytes);
  if (body === null) {
    return failure("payload-too-large", 413);
  }

  return { ok: true, value: new URLSearchParams(body) };
}
