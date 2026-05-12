/**
 * Agent identity abstraction for Neotoma MCP write-path attribution.
 *
 * Two attribution paths contribute to a single `AgentIdentity` shape:
 *
 * 1. **AAuth (preferred)** — cryptographically verified HTTP Message Signature
 *    with an agent-token JWT (RFC 9421 + AAuth profile). Populates
 *    `publicKey`, `thumbprint`, `algorithm`, `sub`, `iss`.
 *
 * 2. **Fallback (non-AAuth)** — MCP `initialize.clientInfo` (name + version)
 *    and/or resolved OAuth `connection_id`. Populates `clientName`,
 *    `clientVersion`, `connectionId`.
 *
 * The resulting record is stamped into every durable write-path row
 * (observations, relationships, timeline events, sources, interpretations)
 * so the Inspector and audit tooling can show "who stored this" and with
 * what level of assurance.
 *
 * See docs/proposals/agent-trust-framework.md and the AAuth Neotoma
 * integration plan for the broader rationale.
 */

import type { Request } from "express";

// ---------------------------------------------------------------------------
// External actor provenance (parallel to AAuth agent identity)
// ---------------------------------------------------------------------------

/**
 * Verification strength for an external actor claim. Ordered from weakest
 * to strongest; the stamping logic picks the strongest available path.
 */
export type ExternalActorVerifiedVia =
  | "claim"
  | "linked_attestation"
  | "oauth_link"
  | "webhook_signature";

/**
 * A GitHub (or future external-provider) identity that authored the
 * upstream artifact being ingested. Travels in `observations.provenance`
 * alongside the AAuth agent attribution but is never conflated with it.
 */
export interface ExternalActor {
  provider: "github";
  login: string;
  id: number;
  type: "User" | "Bot" | "Organization";
  verified_via: ExternalActorVerifiedVia;
  /** GitHub webhook delivery UUID — present when `verified_via === "webhook_signature"`. */
  delivery_id?: string;
  /** GitHub event type, e.g. "issues", "issue_comment". */
  event_type?: string;
  /** Repository full name, e.g. "owner/repo". */
  repository?: string;
  /** GitHub issue/event numeric id. */
  event_id?: number;
  /** GitHub comment id. */
  comment_id?: number;
  /** Operator-local user id; only populated by grant linkage (Phase 4). */
  linked_neotoma_user_id?: string;
  /** AAuth thumbprint that carried the agent_token claim (Phase 4b). */
  attesting_aauth_thumbprint?: string;
  /** Non-fatal warning when grant link didn't match inbound actor. */
  provenance_warning?: string;
}

/**
 * Trust tier shown in the Inspector and surfaced in API responses.
 *
 * - `hardware` — AAuth verified AND a `cnf.attestation` envelope was
 *   cryptographically verified against a trusted attestation root (Apple
 *   Secure Enclave, WebAuthn `packed`, or TPM 2.0). Algorithm alone is
 *   never enough — see docs/subsystems/aauth_attestation.md.
 * - `operator_attested` — AAuth verified and the resolved `iss` (or
 *   `iss:sub` composite) is in the operator-managed allowlist
 *   (`NEOTOMA_OPERATOR_ATTESTED_ISSUERS` / `NEOTOMA_OPERATOR_ATTESTED_SUBS`).
 *   Trust is operator-vouched rather than hardware-attested.
 * - `software` — AAuth verified but neither attestation nor the operator
 *   allowlist promoted the request further.
 * - `unverified_client` — No AAuth, but `clientInfo.name` was provided on
 *   the MCP `initialize` handshake. Self-reported, not verified.
 * - `anonymous` — No AAuth and no useful `clientInfo` (or generic values
 *   like the literal string "mcp").
 */
export type AttributionTier =
  | "hardware"
  | "operator_attested"
  | "software"
  | "unverified_client"
  | "anonymous";

export interface AgentIdentity {
  // --- AAuth fields (present iff AAuth verification succeeded) --------------
  /** Raw public key in JWK form (JSON-serialised). */
  publicKey?: string;
  /** RFC 7638 JWK thumbprint — stable key identifier across requests. */
  thumbprint?: string;
  /** JOSE algorithm name, e.g. "ES256", "EdDSA". */
  algorithm?: string;
  /** Agent subject from the `aa-agent+jwt` token — stable agent identifier. */
  sub?: string;
  /** Agent issuer URL from the `aa-agent+jwt` token. */
  iss?: string;

  // --- Fallback attribution fields (always best-effort) ---------------------
  /**
   * Human-readable client name from MCP `initialize.clientInfo.name`.
   * Self-reported and NOT verified. Generic values like "mcp" or "client"
   * are normalised to `undefined` so they do not masquerade as attribution.
   */
  clientName?: string;
  /** Self-reported client version from `initialize.clientInfo.version`. */
  clientVersion?: string;
  /** Resolved OAuth connection id, when available. */
  connectionId?: string;

  // --- Derived -------------------------------------------------------------
  /** Derived trust tier. See {@link AttributionTier}. */
  tier: AttributionTier;
}

/**
 * Result of the AAuth middleware stamped onto the Express request.
 * The middleware is non-blocking, so absence just means no AAuth headers
 * were present (or they failed validation — the middleware logs and
 * proceeds with `aauth === null`).
 */
export interface AAuthRequestContext {
  verified: boolean;
  publicKey?: string;
  thumbprint?: string;
  algorithm?: string;
  sub?: string;
  iss?: string;
  /** External actor claims from the `https://neotoma.io/external_actors` JWT custom claim. */
  externalActorClaims?: Array<{
    provider: string;
    id: number;
    login: string;
    linked_at?: string;
  }>;
}

/**
 * Mirror of {@link import('../services/aauth_attestation_verifier.js').AttestationRevocationDiagnostic}
 * narrowed to the surface that is safe to expose on `/session`. Tag
 * values follow the revocation service's discriminator.
 */
export interface AttestationRevocationDiagnosticsField {
  checked: boolean;
  status?: "good" | "revoked" | "unknown";
  source?:
    | "disabled"
    | "cache"
    | "apple"
    | "ocsp"
    | "crl"
    | "no_endpoint"
    | "error";
  detail?: string;
  mode?: "disabled" | "log_only" | "enforce";
  demoted?: boolean;
}

/**
 * Diagnostic summary of the attribution resolution decision for a single
 * request. Mirrored onto the Express request as `req.attributionDecision`
 * by the AAuth middleware and returned verbatim in the
 * {@link SessionAttributionDecision} block of `/session`. Contains no
 * signatures or public keys so it is safe to surface to clients.
 */
export interface AttributionDecisionDiagnostics {
  signature_present: boolean;
  signature_verified: boolean;
  /** Short error code when `signature_verified === false`. */
  signature_error_code?: string;
  /** Raw `clientInfo.name` seen (pre-normalisation) when available. */
  client_info_raw_name?: string;
  /** Reason {@link normaliseClientNameWithReason} dropped the client name. */
  client_info_normalised_to_null_reason?: ClientNameNormalisationReason;
  /** Tier resolved for this request. */
  resolved_tier: AttributionTier;
  /**
   * Outcome of the `cnf.attestation` envelope verifier (when the request
   * carried one). Always present on AAuth-verified requests; absent on
   * unsigned requests. Mirrors the
   * {@link import('../services/aauth_attestation_verifier.js').AttestationOutcome}
   * shape so the diagnostic can be forwarded as-is.
   */
  attestation?:
    | {
        verified: true;
        format:
          | "apple-secure-enclave"
          | "webauthn-packed"
          | "tpm2";
        /**
         * Revocation evidence captured by the attestation verifier when
         * `NEOTOMA_AAUTH_REVOCATION_MODE` is `log_only` or `enforce`.
         * Always absent in `disabled` mode.
         */
        revocation?: AttestationRevocationDiagnosticsField;
      }
    | {
        verified: false;
        format:
          | "apple-secure-enclave"
          | "webauthn-packed"
          | "tpm2"
          | "unknown";
        reason:
          | "not_present"
          | "unsupported_format"
          | "key_binding_failed"
          | "challenge_mismatch"
          | "chain_invalid"
          | "signature_invalid"
          | "aaguid_not_trusted"
          | "pubarea_mismatch"
          | "not_implemented"
          | "malformed"
          | "revoked";
        revocation?: AttestationRevocationDiagnosticsField;
      };
  /**
   * Set when the operator allowlist promoted this request to
   * `operator_attested`. `"issuer"` means the `iss` matched
   * `NEOTOMA_OPERATOR_ATTESTED_ISSUERS`; `"issuer_subject"` means the
   * `iss:sub` composite matched `NEOTOMA_OPERATOR_ATTESTED_SUBS`. Absent
   * when the resolved tier is anything else (including `hardware` — the
   * cascade short-circuits at the first verified hit).
   */
  operator_allowlist_source?: "issuer" | "issuer_subject";
}

/**
 * @deprecated Algorithm-based heuristics no longer drive tier resolution.
 * Tier promotion to `hardware` requires a verified `cnf.attestation`
 * envelope; promotion to `operator_attested` requires the operator
 * allowlist. This helper is retained only for legacy diagnostic purposes
 * (e.g. log lines that want to flag "looks SE-ish") and MUST NOT be used
 * to set {@link AttributionTier}. Will be removed once no callers remain.
 */
export function algorithmLooksHardwareBacked(
  algorithm: string | undefined
): boolean {
  if (!algorithm) return false;
  const normalised = algorithm.toUpperCase();
  return normalised === "ES256" || normalised === "EDDSA";
}

/**
 * Generic clientInfo names that should NOT count as self-identification.
 * Kept lowercase; comparison is case-insensitive.
 */
const GENERIC_CLIENT_NAMES = new Set([
  "",
  "mcp",
  "client",
  "mcp-client",
  "unknown",
  "anonymous",
]);

/**
 * Reason codes surfaced when {@link normaliseClientNameWithReason} drops an
 * input. Mirrored in diagnostics logs and on the `/session` response so
 * integrators can tell "I didn't send a name" from "I sent something that
 * was too generic to be attribution".
 */
export type ClientNameNormalisationReason =
  | "too_generic"
  | "empty"
  | "not_a_string";

/** Normalise a self-reported client name to `undefined` when too generic. */
export function normaliseClientName(
  name: string | null | undefined
): string | undefined {
  return normaliseClientNameWithReason(name).value;
}

/**
 * Normalise a self-reported client name and also return a reason code when
 * the value was rejected. Returns `{ value: <string> }` on acceptance and
 * `{ value: undefined, reason }` otherwise. Use this in middleware / the
 * diagnostics path; the legacy {@link normaliseClientName} stays as the
 * thin compatibility shim for existing call sites.
 */
export function normaliseClientNameWithReason(
  name: string | null | undefined
): { value: string | undefined; reason?: ClientNameNormalisationReason } {
  if (name === null || name === undefined) return { value: undefined };
  if (typeof name !== "string") return { value: undefined, reason: "not_a_string" };
  const trimmed = name.trim();
  if (!trimmed) return { value: undefined, reason: "empty" };
  if (GENERIC_CLIENT_NAMES.has(trimmed.toLowerCase())) {
    return { value: undefined, reason: "too_generic" };
  }
  return { value: trimmed };
}

/**
 * Derive the {@link AttributionTier} from the fields on an
 * {@link AgentIdentity}-in-progress. Pure function; safe to call multiple
 * times while assembling attribution.
 *
 * NOTE: this fallback ONLY returns `software` for AAuth-verified requests.
 * Promotion to `hardware` or `operator_attested` is decided by the AAuth
 * middleware, which has access to the `cnf.attestation` envelope and the
 * operator allowlist; pure derivation cannot make those calls.
 */
export function deriveAttributionTier(
  input: Omit<AgentIdentity, "tier">
): AttributionTier {
  const aauthVerified = !!(input.publicKey && input.thumbprint);
  if (aauthVerified) {
    return "software";
  }
  if (input.clientName) {
    return "unverified_client";
  }
  return "anonymous";
}

/**
 * Attribution fields stamped into provenance JSON blobs. This is the shape
 * written to observations, relationships, timeline events, sources, and
 * interpretations; it is also the shape consumed by the Inspector.
 *
 * Every field is optional so existing records without attribution continue
 * to parse cleanly.
 */
export interface AttributionProvenance {
  agent_public_key?: string;
  agent_thumbprint?: string;
  agent_algorithm?: string;
  agent_sub?: string;
  agent_iss?: string;
  client_name?: string;
  client_version?: string;
  connection_id?: string;
  attribution_tier?: AttributionTier;
  /** ISO-8601 timestamp when the attribution was recorded. */
  attributed_at?: string;
  /** External actor provenance — who authored the upstream artifact. */
  external_actor?: ExternalActor;
}

/**
 * Serialise an {@link AgentIdentity} into the provenance JSON shape. Omits
 * keys that are undefined so blobs stay compact.
 *
 * When an {@link ExternalActor} is provided it is attached under the
 * `external_actor` key. This keeps the two identity channels (AAuth agent
 * vs upstream artifact author) distinct in the persisted JSON.
 */
export function toAttributionProvenance(
  identity: AgentIdentity | null | undefined,
  externalActor?: ExternalActor | null
): AttributionProvenance {
  if (!identity && !externalActor) return {};
  const out: AttributionProvenance = {};
  if (identity) {
    out.attribution_tier = identity.tier;
    out.attributed_at = new Date().toISOString();
    if (identity.publicKey) out.agent_public_key = identity.publicKey;
    if (identity.thumbprint) out.agent_thumbprint = identity.thumbprint;
    if (identity.algorithm) out.agent_algorithm = identity.algorithm;
    if (identity.sub) out.agent_sub = identity.sub;
    if (identity.iss) out.agent_iss = identity.iss;
    if (identity.clientName) out.client_name = identity.clientName;
    if (identity.clientVersion) out.client_version = identity.clientVersion;
    if (identity.connectionId) out.connection_id = identity.connectionId;
  }
  if (externalActor) {
    out.external_actor = externalActor;
  }
  return out;
}

/**
 * Merge an {@link AttributionProvenance} block into an existing provenance
 * object, returning a JSON string ready for persistence. When either input
 * is empty the output preserves existing fields rather than overwriting
 * them. The merge is shallow and last-write-wins at the attribution key
 * level — which matches how Phase 1 stamps attribution (once per write).
 */
export function mergeAttributionIntoProvenance(
  existing: string | Record<string, unknown> | null | undefined,
  attribution: AttributionProvenance
): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (existing && typeof existing === "string") {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed JSON — fall through to empty base so we never throw.
    }
  } else if (
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing)
  ) {
    base = { ...(existing as Record<string, unknown>) };
  }
  if (Object.keys(attribution).length === 0) return base;
  return { ...base, ...attribution };
}

/**
 * Legacy helper retained for backwards compatibility with FU-053 callers.
 * Prefer {@link getAgentIdentityFromRequest} in new code.
 */
export function getAgentPublicKey(req?: Request): string | null {
  if (!req) return null;
  const aauth = (req as Request & { aauth?: AAuthRequestContext }).aauth;
  return aauth?.publicKey ?? null;
}

/**
 * Build a fresh {@link AgentIdentity} from AAuth verification result plus
 * fallback attribution inputs. Any field can be undefined; the returned
 * object's {@link AttributionTier} reflects what is actually available.
 */
export function createAgentIdentity(
  input: Omit<AgentIdentity, "tier"> & { tier?: AttributionTier }
): AgentIdentity {
  const tier = input.tier ?? deriveAttributionTier(input);
  return { ...input, tier };
}

/**
 * Extract the full {@link AgentIdentity} for an Express request. The AAuth
 * middleware populates `req.aauth`; the server layer separately exposes
 * `clientInfo` / `connection_id` via the NeotomaServer session state. This
 * helper is usable in HTTP handlers that want attribution before the MCP
 * `initialize` handshake has completed.
 */
export function getAgentIdentityFromRequest(
  req: Request,
  extra?: {
    clientName?: string | null;
    clientVersion?: string | null;
    connectionId?: string | null;
  }
): AgentIdentity | null {
  const aauth = (req as Request & { aauth?: AAuthRequestContext }).aauth;
  const clientName = normaliseClientName(extra?.clientName);
  const clientVersion = extra?.clientVersion ?? undefined;
  const connectionId = extra?.connectionId ?? undefined;
  const hasAnything =
    !!aauth?.verified || !!clientName || !!clientVersion || !!connectionId;
  if (!hasAnything) return null;
  // Prefer the tier resolved by the AAuth middleware (which has the
  // attestation envelope and operator allowlist in scope) over the
  // pure-derivation fallback. `createAgentIdentity` will only run
  // `deriveAttributionTier` when `tier` is undefined.
  const decision = (
    req as Request & { attributionDecision?: AttributionDecisionDiagnostics }
  ).attributionDecision;
  const decisionTier = decision?.signature_verified
    ? decision.resolved_tier
    : undefined;
  return createAgentIdentity({
    publicKey: aauth?.publicKey,
    thumbprint: aauth?.thumbprint,
    algorithm: aauth?.algorithm,
    sub: aauth?.sub,
    iss: aauth?.iss,
    clientName,
    clientVersion: clientVersion ?? undefined,
    connectionId: connectionId ?? undefined,
    tier: decisionTier,
  });
}

/**
 * Minimal structural validation. Kept permissive because the middleware
 * already enforces the heavy lifting (signature, JWT, JWKS).
 */
export function validateAgentIdentity(identity: AgentIdentity): boolean {
  if (!identity || typeof identity !== "object") return false;
  if (
    identity.publicKey !== undefined &&
    (typeof identity.publicKey !== "string" || identity.publicKey.length === 0)
  ) {
    return false;
  }
  const tier = identity.tier;
  return (
    tier === "hardware" ||
    tier === "operator_attested" ||
    tier === "software" ||
    tier === "unverified_client" ||
    tier === "anonymous"
  );
}
