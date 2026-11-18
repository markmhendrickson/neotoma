import { runtimeEnv } from "../../config_embedded.js";
import { isLoopbackHost, resolveBindHostFromEnv } from "../../shared/bind_host.js";
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

/**
 * True when the private-host guard applies to caller-supplied outbound URLs.
 *
 * The rule, in order:
 *
 * 1. `NEOTOMA_HOSTED_MODE` set to `1` / `true` / `yes` turns the guard on.
 * 2. `NEOTOMA_HOSTED_MODE` set to `0` / `false` / `no` / `off` turns it off.
 *    This is the explicit local-development override: an operator who binds
 *    beyond loopback (for example a LAN or container test setup) and still
 *    needs webhooks or peers on private addresses opts out by name.
 * 3. Any other non-empty value turns the guard on, so a mistyped value never
 *    leaves the server unguarded.
 * 4. Unset or empty: the guard follows the HTTP listener's bind host
 *    (`NEOTOMA_HTTP_HOST`, resolved by the same `resolveBindHostFromEnv` the
 *    listener uses). A loopback-only bind (the default `127.0.0.1`,
 *    `localhost`, `::1`) leaves the guard off, matching single-user self-host
 *    behaviour; any other bind host (`0.0.0.0`, a LAN address, `::`) means the
 *    server is reachable from other machines and turns the guard on.
 *
 * The explicit flag therefore only ever makes the guard stricter than the
 * bind-derived default, except for the named off values in rule 2.
 */
export function isOutboundHostGuardEnabled(env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  const raw = (env.NEOTOMA_HOSTED_MODE ?? "").trim();
  if (raw.length > 0) {
    if (/^(1|true|yes)$/i.test(raw)) return true;
    if (/^(0|false|no|off)$/i.test(raw)) return false;
    return true;
  }
  return !isLoopbackHost(resolveBindHostFromEnv("NEOTOMA_HTTP_HOST", env));
}

/**
 * True when the outbound host guard is in force. Kept under its original name
 * so existing importers keep working; see {@link isOutboundHostGuardEnabled}
 * for the rule (the explicit `NEOTOMA_HOSTED_MODE` flag, otherwise the bind
 * host).
 */
export function isHostedMode(): boolean {
  return isOutboundHostGuardEnabled();
}

/**
 * True when `hostname` is private, loopback, or link-local (RFC 1918,
 * `127.0.0.0/8`, `169.254.0.0/16`, IPv6 `::1` / `fc00::/7` / `fe80::/10`, the
 * `localhost` family, `0.0.0.0`, and the unspecified IPv6 address `::`). Used to
 * reject `sender_peer_url` / `peer.url` hosts under hosted mode before any
 * outbound fetch.
 *
 * A fully qualified name may end in a dot (`localhost.` names the same host as
 * `localhost`), so trailing dots and IPv6 brackets are removed before any check.
 */
export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  // The unspecified address (`::`, `0::`, `0:0:0:0:0:0:0:0`) connects to the
  // local host, like `0.0.0.0`.
  if (/^[0:]+$/.test(normalized) && normalized.includes(":")) return true;
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
 * SECURITY: the check is enforced whenever {@link isOutboundHostGuardEnabled}
 * is true: hosted mode set explicitly, or a listener bound beyond loopback,
 * where a caller is not necessarily the host operator and must not be able to
 * aim the server at its own infrastructure. A loopback-only single-user
 * install legitimately points webhooks and peers at loopback, so the guard is
 * not applied there unless the flag turns it on.
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
 * When the guard is off (loopback-only bind, flag unset) this behaves exactly like a plain
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
