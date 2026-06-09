/**
 * Repo discovery resolver (Layer 2 / M2).
 *
 * Reads a target repo's `.well-known/neotoma.json` manifest, validates the wire
 * format, and runs the two-layer trust check so a reporter's agent can route the
 * canonical issue record to the maintainer's declared Neotoma peer instead of
 * the reporter's globally-configured one.
 *
 * Spec: `docs/subsystems/repo_discovery_manifest.md`. This module is the resolver
 * core only — it returns a routing DECISION; wiring it into the live `submitIssue`
 * path and the CLI base-URL resolver are separate, focused follow-ups so the
 * trust-sensitive logic lands and is reviewed in isolation.
 *
 * Trust model (both MUST pass before `route` is returned):
 *   1. GitHub identity — the manifest is fetched only from the repo's
 *      GitHub-served raw URL, and its `repo` field MUST equal the owner/repo it
 *      was served from.
 *   2. Key pinning — the declared `peer.public_key_thumbprint` is surfaced so the
 *      downstream guest-token exchange / signed submission pins to it; a peer URL
 *      alone is never sufficient.
 *
 * The manifest is a DECLARATION, not a security boundary: `policy` lets the
 * reporter predict acceptance, but the receiving peer re-enforces every field.
 */

import { isHostedMode, isPrivateOrLoopbackHostname } from "../net/private_host_guard.js";

/** Manifest schema version this resolver understands. */
export const SUPPORTED_MANIFEST_VERSION = 1;

export interface RepoDiscoveryManifest {
  version: number;
  repo: string;
  peer: {
    url: string;
    public_key_thumbprint: string;
    peer_id?: string;
  };
  policy: {
    accepted_visibilities: Array<"public" | "private">;
    required_attestations: Array<"reporter_git_sha" | "reporter_app_version">;
    rate_limit_per_hour?: number;
    requires_approval?: boolean;
  };
  contact?: string;
}

/** Structured reason a discovery attempt did not yield a route. */
export type RepoDiscoveryFailureReason =
  | "no_manifest" // 404 / not published — fall through to the operator default
  | "fetch_error" // network / non-404 HTTP error fetching the manifest
  | "invalid_json"
  | "unsupported_version"
  | "schema_invalid"
  | "repo_mismatch" // manifest.repo != the repo it was served from (spoof guard)
  | "peer_url_invalid"
  | "peer_url_private_host"; // hosted-mode SSRF guard

export type RepoDiscoveryResult =
  | { route: RepoDiscoveryManifest; effective_repo: string }
  | { route: null; reason: RepoDiscoveryFailureReason; detail?: string };

/**
 * Fetches the raw manifest bytes for `owner/repo`. Injected so tests do not hit
 * the network and so the caller controls timeout / auth. Returns `null` for a
 * 404 (no manifest published); throws for any other transport failure.
 */
export type ManifestFetcher = (owner: string, repo: string) => Promise<string | null>;

/** Canonical GitHub raw URL for a repo's manifest on its default branch. */
export function githubRawManifestUrl(owner: string, repo: string, ref = "HEAD"): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/.well-known/neotoma.json`;
}

/**
 * Default fetcher: GET the GitHub-served raw manifest. A 404 → `null`
 * (no manifest). Any other non-2xx → throw. Binds the manifest to the repo's
 * GitHub identity by construction — it is only ever read from that repo's URL.
 */
export const defaultManifestFetcher: ManifestFetcher = async (owner, repo) => {
  const res = await fetch(githubRawManifestUrl(owner, repo), {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`manifest fetch failed: HTTP ${res.status}`);
  }
  return await res.text();
};

function isOwnerRepo(value: unknown): value is string {
  return typeof value === "string" && /^[^/\s]+\/[^/\s]+$/.test(value);
}

/** Validate the parsed object against the v1 schema. Returns an error reason or null. */
function validateManifestShape(
  obj: unknown
): { manifest: RepoDiscoveryManifest } | { reason: RepoDiscoveryFailureReason; detail: string } {
  if (typeof obj !== "object" || obj === null) {
    return { reason: "schema_invalid", detail: "manifest is not an object" };
  }
  const m = obj as Record<string, unknown>;

  if (typeof m.version !== "number") {
    return { reason: "schema_invalid", detail: "version must be a number" };
  }
  if (m.version !== SUPPORTED_MANIFEST_VERSION) {
    return { reason: "unsupported_version", detail: `version ${m.version} not supported` };
  }
  if (!isOwnerRepo(m.repo)) {
    return { reason: "schema_invalid", detail: "repo must be owner/repo" };
  }

  const peer = m.peer as Record<string, unknown> | undefined;
  if (typeof peer !== "object" || peer === null) {
    return { reason: "schema_invalid", detail: "peer must be an object" };
  }
  if (typeof peer.url !== "string" || peer.url.trim().length === 0) {
    return { reason: "schema_invalid", detail: "peer.url must be a non-empty string" };
  }
  if (
    typeof peer.public_key_thumbprint !== "string" ||
    peer.public_key_thumbprint.trim().length === 0
  ) {
    return { reason: "schema_invalid", detail: "peer.public_key_thumbprint required" };
  }
  if (peer.peer_id !== undefined && typeof peer.peer_id !== "string") {
    return { reason: "schema_invalid", detail: "peer.peer_id must be a string" };
  }

  const policy = m.policy as Record<string, unknown> | undefined;
  if (typeof policy !== "object" || policy === null) {
    return { reason: "schema_invalid", detail: "policy must be an object" };
  }
  const vis = policy.accepted_visibilities;
  if (
    !Array.isArray(vis) ||
    vis.length === 0 ||
    !vis.every((v) => v === "public" || v === "private")
  ) {
    return {
      reason: "schema_invalid",
      detail: "policy.accepted_visibilities must be a non-empty subset of [public, private]",
    };
  }
  const att = policy.required_attestations;
  if (
    !Array.isArray(att) ||
    !att.every((a) => a === "reporter_git_sha" || a === "reporter_app_version")
  ) {
    return {
      reason: "schema_invalid",
      detail: "policy.required_attestations must be a subset of the known attestations",
    };
  }
  if (policy.rate_limit_per_hour !== undefined && typeof policy.rate_limit_per_hour !== "number") {
    return { reason: "schema_invalid", detail: "policy.rate_limit_per_hour must be a number" };
  }
  if (policy.requires_approval !== undefined && typeof policy.requires_approval !== "boolean") {
    return { reason: "schema_invalid", detail: "policy.requires_approval must be a boolean" };
  }

  return {
    manifest: {
      version: m.version,
      repo: m.repo,
      peer: {
        url: peer.url,
        public_key_thumbprint: peer.public_key_thumbprint,
        ...(typeof peer.peer_id === "string" ? { peer_id: peer.peer_id } : {}),
      },
      policy: {
        accepted_visibilities: vis as Array<"public" | "private">,
        required_attestations: att as Array<"reporter_git_sha" | "reporter_app_version">,
        ...(typeof policy.rate_limit_per_hour === "number"
          ? { rate_limit_per_hour: policy.rate_limit_per_hour }
          : {}),
        ...(typeof policy.requires_approval === "boolean"
          ? { requires_approval: policy.requires_approval }
          : {}),
      },
      ...(typeof m.contact === "string" ? { contact: m.contact } : {}),
    },
  };
}

/**
 * Resolve where issues about `targetRepo` (owner/repo) should route by reading and
 * trust-checking its `.well-known/neotoma.json`. Returns a `route` only when the
 * manifest is published, well-formed, self-consistent (`repo` matches the served
 * path), and the peer URL passes the hosted-mode SSRF guard. Otherwise returns a
 * structured failure reason the caller maps to the rejection fallback (M4) or the
 * operator default.
 */
export async function resolveRepoDiscovery(
  targetRepo: string,
  fetcher: ManifestFetcher = defaultManifestFetcher
): Promise<RepoDiscoveryResult> {
  if (!isOwnerRepo(targetRepo)) {
    return { route: null, reason: "schema_invalid", detail: "targetRepo must be owner/repo" };
  }
  const [owner, repo] = targetRepo.split("/");

  let raw: string | null;
  try {
    raw = await fetcher(owner, repo);
  } catch (err) {
    return {
      route: null,
      reason: "fetch_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (raw === null) {
    return { route: null, reason: "no_manifest" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { route: null, reason: "invalid_json" };
  }

  const validated = validateManifestShape(parsed);
  if ("reason" in validated) {
    return { route: null, reason: validated.reason, detail: validated.detail };
  }
  const manifest = validated.manifest;

  // Trust layer 1: the manifest must claim the repo it was served from. The
  // fetcher only ever reads from the GitHub raw URL for `owner/repo`, so a
  // mismatch means a copied/forged manifest pointing elsewhere.
  if (manifest.repo.toLowerCase() !== targetRepo.toLowerCase()) {
    return {
      route: null,
      reason: "repo_mismatch",
      detail: `manifest.repo ${manifest.repo} != served repo ${targetRepo}`,
    };
  }

  // SSRF guard on the declared peer URL (hosted mode). Trust layer 2 (key
  // pinning) is enforced downstream at the guest-token exchange using
  // manifest.peer.public_key_thumbprint, which is surfaced on the route.
  let peerHostname: string;
  try {
    peerHostname = new URL(manifest.peer.url).hostname;
  } catch {
    return { route: null, reason: "peer_url_invalid", detail: manifest.peer.url };
  }
  if (isHostedMode() && isPrivateOrLoopbackHostname(peerHostname)) {
    return { route: null, reason: "peer_url_private_host", detail: peerHostname };
  }

  return { route: manifest, effective_repo: targetRepo };
}
