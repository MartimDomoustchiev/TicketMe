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
