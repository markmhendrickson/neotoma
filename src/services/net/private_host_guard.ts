/**
 * Shared SSRF guard: detect private / loopback / link-local hostnames so remote
 * fetches (peer sync inbound, repo-discovery manifest fetch, guest-token
 * exchange) cannot be tricked into hitting the host's own loopback or an
 * internal address.
 *
 * Extracted from `src/services/sync/sync_webhook_inbound.ts` so both the peer
 * sync path and the repo-discovery resolver (`repo_discovery_resolver.ts`) share
 * one implementation. Behavior is identical to the prior inline guard; see
 * `docs/security/threat_model.md` and `docs/subsystems/peer_sync.md`
 * (`NEOTOMA_HOSTED_MODE`).
 */

/** True when `NEOTOMA_HOSTED_MODE` opts the process into multi-tenant SSRF hardening. */
export function isHostedMode(): boolean {
  return /^(1|true|yes)$/i.test(process.env.NEOTOMA_HOSTED_MODE ?? "");
}

/**
 * True when `hostname` is private, loopback, or link-local (RFC 1918,
 * `127.0.0.0/8`, `169.254.0.0/16`, IPv6 `::1` / `fc00::/7` / `fe80::/10`, the
 * `localhost` family, and `0.0.0.0`). Used to reject `sender_peer_url` /
 * `peer.url` hosts under hosted mode before any outbound fetch.
 */
export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  // Platform-internal service discovery suffixes (Fly.io `*.internal`,
  // Kubernetes `*.cluster.local`). These resolve only inside the deployment
  // network, so a caller supplying one is asking us to reach infrastructure
  // they cannot reach themselves.
  if (normalized === "internal" || normalized.endsWith(".internal")) return true;
  if (normalized.endsWith(".cluster.local")) return true;

  // IPv4-mapped / IPv4-compatible IPv6 (`::ffff:127.0.0.1`, `::127.0.0.1`) carry
  // an IPv4 address inside an IPv6 literal. Unwrap to the embedded IPv4 before
  // the checks below, or a loopback/private target slips through as "public".
  const mappedDotted = normalized.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  // Node's WHATWG URL parser normalizes an IPv4-mapped IPv6 literal to its
  // canonical hex-group form (`::ffff:127.0.0.1` -> `::ffff:7f00:1`), so a URL
  // reaching this function via `isPublicFetchUrlAllowed` never carries the
  // dotted-quad form above. The `ffff:` segment is OPTIONAL here too: the
  // deprecated IPv4-COMPATIBLE form (no `ffff:`) normalizes to the identical
  // two-hex-group shape one segment narrower (`::169.254.169.254` ->
  // `::a9fe:a9fe`) and bypassed every branch below when this regex required
  // the literal `ffff:` — reproduced end-to-end via probePeerRemoteHealth().
  // Unwrap the two trailing 16-bit hex groups back to the embedded IPv4
  // octets, or either mapped/compatible form bypasses every check below.
  const mappedHex = normalized.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  let candidate = normalized;
  if (mappedDotted) {
    candidate = mappedDotted[1];
  } else if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    candidate = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
  }

  const ipv4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map((part) => Number.parseInt(part, 10));
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  return (
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

/**
 * True when `urlStr` is safe to fetch from the server: parseable, http(s), and
 * not pointing at a private, loopback, link-local, or platform-internal host.
 *
 * This is the URL-level companion to {@link isPrivateOrLoopbackHostname}, for
 * the outbound-fetch sinks that accept a caller-supplied URL (subscription
 * webhooks, submission mirrors, peer registration, peer health probes, peer
 * conflict resolution). Those callers hold only a URL string, so centralizing
 * the parse-plus-check here keeps every sink on one implementation rather than
 * each re-deriving the hostname.
 *
 * SECURITY: the check is enforced under hosted/multi-tenant mode
 * ({@link isHostedMode}), where a caller is not the host operator and must not
 * be able to aim the server at its own infrastructure. Self-hosted single-user
 * installs legitimately point webhooks and peers at loopback, so the guard is
 * not applied there.
 */
export function isPublicFetchUrlAllowed(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (!isHostedMode()) return true;
  // Strip the brackets IPv6 authorities carry in URL form so the hostname
  // check sees the same shape it does elsewhere.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  return !isPrivateOrLoopbackHostname(hostname);
}

const MAX_GUARDED_REDIRECTS = 5;

/**
 * `fetch()`, but for every guarded outbound sink: refuses to follow a
 * redirect without re-checking the `Location` it points at against
 * {@link isPublicFetchUrlAllowed}.
 *
 * SECURITY: `isPublicFetchUrlAllowed` only ever checked the URL the caller
 * supplied — the pre-redirect URL. None of the five guarded sinks passed
 * `redirect: "manual"` to `fetch`, so a validated public host that responds
 * with a 3xx to a private/loopback/link-local/metadata target was followed
 * straight through by the platform's default automatic-redirect behavior,
 * with the guard never seeing the real destination. This wraps `fetch` so
 * that gap is closed once, for every sink, rather than per call site:
 * every hop — including the first request — is checked before it is
 * reachable, and a redirect to a disallowed target is refused rather than
 * followed.
 *
 * Under self-hosted (non-hosted) mode this behaves exactly like a plain
 * `fetch` with automatic redirects: `isPublicFetchUrlAllowed` always returns
 * true there, so every hop passes and is fetched, matching prior behavior
 * for the single-user case this guard was never meant to restrict.
 *
 * `init.redirect` is intentionally not accepted — manual redirect handling
 * is the entire point of this wrapper, so silently accepting and overriding
 * a caller-supplied value would hide a footgun rather than remove it.
 */
export async function guardedFetch(
  urlStr: string,
  init?: Omit<RequestInit, "redirect">
): Promise<Response> {
  let currentUrl = urlStr;
  for (let hop = 0; hop <= MAX_GUARDED_REDIRECTS; hop++) {
    if (!isPublicFetchUrlAllowed(currentUrl)) {
      throw new Error(
        `guardedFetch: refusing to fetch a private/loopback/link-local/platform-internal host` +
          `${hop > 0 ? " reached via redirect" : ""}: ${currentUrl}`
      );
    }
    const res = await fetch(currentUrl, { ...init, redirect: "manual" });
    // `type: "opaqueredirect"` never happens here (we never pass
    // redirect:"follow"/"error" upstream), but a 3xx status with a Location
    // header is exactly what redirect:"manual" surfaces for us to check.
    if (res.status < 300 || res.status >= 400) {
      return res;
    }
    const location = res.headers.get("location");
    if (!location) {
      // A 3xx with no Location is not a redirect we can follow; hand the
      // response back as-is rather than guessing.
      return res;
    }
    // Location may be relative; resolve it against the URL that produced it.
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`guardedFetch: exceeded ${MAX_GUARDED_REDIRECTS} redirects fetching ${urlStr}`);
}
