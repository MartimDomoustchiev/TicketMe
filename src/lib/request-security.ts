const CANONICAL_ORIGIN = "https://www.tiketko.top";
const CANONICAL_REDIRECT_ORIGIN = "https://tiketko.top";

function expectedOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0];
  const host = request.headers.get("host") || forwardedHost?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");

  return host ? `${protocol}://${host}` : requestUrl.origin;
}

function isTrustedProvenanceOrigin(
  value: string,
  expected: string,
): boolean {
  try {
    const provenance = new URL(value).origin;

    if (provenance === expected) {
      return true;
    }

    // The owned apex domain permanently redirects to the canonical www host.
    // A 308 preserves form POSTs, so allow only that exact, one-way transition.
    return (
      expected === CANONICAL_ORIGIN &&
      provenance === CANONICAL_REDIRECT_ORIGIN
    );
  } catch {
    return false;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return false;
  }

  const expected = expectedOrigin(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    // A present, non-opaque Origin is authoritative. Never let a mismatched or
    // malformed value fall back to a more permissive Referer check.
    return isTrustedProvenanceOrigin(origin, expected);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    // Cross-origin redirects can serialize Origin as `null`. When available,
    // a policy-trimmed Referer can still prove the owned apex-to-www transition.
    return isTrustedProvenanceOrigin(referer, expected);
  }

  // A state-changing request without trustworthy provenance fails closed.
  return false;
}
