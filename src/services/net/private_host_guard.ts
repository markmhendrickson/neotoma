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
  const mapped = normalized.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const candidate = mapped ? mapped[1] : normalized;

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
