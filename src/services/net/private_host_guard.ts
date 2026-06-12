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

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
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
