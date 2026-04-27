/**
 * Session introspection service.
 *
 * Builds the `/session` / `get_session_identity` response payload from the
 * already-resolved {@link AgentIdentity} (populated by the AAuth middleware
 * and/or the MCP `initialize` handshake) plus the active
 * {@link AttributionPolicySnapshot}. Pure / read-only: this service must
 * never issue database writes, telemetry calls, or side-effectful logs.
 *
 * Consumers:
 *   - HTTP `GET /session` in {@link ../actions.ts} (preflight health check
 *     for local proxies before enabling writes).
 *   - MCP tool `get_session_identity` in {@link ../server.ts} (same shape,
 *     reachable via the MCP transport).
 *   - CLI `auth session` command.
 */

import type {
  AgentIdentity,
  AttributionDecisionDiagnostics,
  AttributionTier,
  ClientNameNormalisationReason,
} from "../crypto/agent_identity.js";
import { normaliseClientNameWithReason } from "../crypto/agent_identity.js";
import type { AttributionPolicySnapshot } from "./attribution_policy.js";
import { getAttributionPolicySnapshot } from "./attribution_policy.js";
import type {
  AAuthAdmissionContext,
  AAuthAdmissionReason,
} from "./protected_entity_types.js";

/** Attribution block surfaced in the session response. */
export interface SessionAttributionInfo {
  tier: AttributionTier;
  agent_thumbprint?: string;
  agent_sub?: string;
  agent_iss?: string;
  agent_algorithm?: string;
  agent_public_key?: string;
  client_name?: string;
  client_version?: string;
  connection_id?: string;
  /**
   * Optional structured summary of the most recent AAuth / clientInfo
   * resolution decision for this request (populated in Phase 2). Shape is
   * documented in `docs/subsystems/agent_attribution_integration.md`.
   */
  decision?: SessionAttributionDecision | null;
}

/**
 * Public mirror of the attestation revocation diagnostic produced by the
 * verifier. Shape matches
 * {@link import('../crypto/agent_identity.js').AttestationRevocationDiagnosticsField}
 * verbatim.
 */
export interface SessionAttestationRevocationField {
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
 * Diagnostic record mirrored onto the session response (Phase 2). Shape
 * mirrors {@link AttributionDecisionDiagnostics}; they're kept as separate
 * names so the API surface name doesn't pull in the server-side type.
 */
export interface SessionAttributionDecision {
  signature_present: boolean;
  signature_verified: boolean;
  signature_error_code?: string;
  client_info_raw_name?: string;
  client_info_normalised_to_null_reason?: ClientNameNormalisationReason;
  resolved_tier: AttributionTier;
  /**
   * Outcome of the `cnf.attestation` envelope verifier. Mirrors the
   * server-side {@link AttributionDecisionDiagnostics.attestation} field
   * shape verbatim so consumers can switch on `format` / `verified` /
   * `reason` without translation.
   */
  attestation?:
    | {
        verified: true;
        format: "apple-secure-enclave" | "webauthn-packed" | "tpm2";
        revocation?: SessionAttestationRevocationField;
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
        revocation?: SessionAttestationRevocationField;
      };
  /**
   * Set when the operator allowlist promoted the request to
   * `operator_attested`. Mirrors
   * {@link AttributionDecisionDiagnostics.operator_allowlist_source}.
   */
  operator_allowlist_source?: "issuer" | "issuer_subject";
}

/**
 * AAuth admission diagnostics surfaced on the session response. Distinct
 * from {@link SessionAttributionInfo} on purpose: attribution describes
 * "how confident is the server that this signature came from this
 * identity", whereas admission describes "did Neotoma resolve that
 * identity to one of this user's `agent_grant` entities". Verified ≠
 * admitted: a verified AAuth signature with no matching active grant
 * stays attribution-only.
 *
 * See `docs/subsystems/agent_attribution_integration.md` and the
 * Stronger AAuth Admission plan for the full state machine.
 */
export interface SessionAAuthInfo {
  /** True when this request carried a verified AAuth signature. */
  verified: boolean;
  /** True when admission resolved that signature to an `agent_grant`. */
  admitted: boolean;
  /** Stable id of the matched grant when `admitted === true`, else null. */
  grant_id: string | null;
  /** Short status string suitable for display + machine checks. */
  admission_reason: AAuthAdmissionReason | null;
  /** Mirrors the matched grant's human-readable label, when admitted. */
  agent_label?: string;
}

/** Full `/session` payload. */
export interface SessionInfo {
  user_id: string;
  attribution: SessionAttributionInfo;
  /**
   * AAuth admission summary. Always populated; for non-signed requests
   * the block reports `verified: false, admitted: false,
   * admission_reason: "not_signed"` so callers can preflight without
   * special-casing missing fields.
   */
  aauth: SessionAAuthInfo;
  policy: AttributionPolicySnapshot;
  /**
   * Convenience flag: true iff a write with the current session's identity
   * would pass the currently active attribution policy. Mirrors the check
   * `enforceAttributionPolicy()` would make on the default write path.
   */
  eligible_for_trusted_writes: boolean;
}

/**
 * Assemble a {@link SessionInfo} from the resolved identity + optional
 * diagnostic decision. Pure; callers must already have authenticated the
 * request and resolved the identity.
 */
export function buildSessionInfo(params: {
  userId: string;
  identity: AgentIdentity | null;
  /**
   * Raw signature-side decision stashed by the AAuth middleware. Merged
   * with `rawClientInfoName` to produce the final decision surfaced on
   * the response.
   */
  middlewareDecision?: AttributionDecisionDiagnostics | null;
  /**
   * Untrimmed client name as provided by the caller (query param on
   * `/session`, or server-instance `clientInfo.name` for MCP). Passed
   * through {@link normaliseClientNameWithReason} here so the response
   * tells integrators why a generic name was dropped.
   */
  rawClientInfoName?: string | null;
  /**
   * Admission record stamped by the AAuth admission middleware. `null`
   * when this request did not pass through admission (e.g. local stdio,
   * unsigned request, public discovery route). When omitted we synthesise
   * a `not_signed` reason so the response is well-formed.
   */
  admission?: AAuthAdmissionContext | null;
}): SessionInfo {
  const { userId, identity, middlewareDecision, rawClientInfoName, admission } =
    params;
  const tier: AttributionTier = identity?.tier ?? "anonymous";

  const decision = mergeDecision({
    middlewareDecision: middlewareDecision ?? null,
    rawClientInfoName: rawClientInfoName ?? null,
    resolvedTier: tier,
  });

  const attribution: SessionAttributionInfo = {
    tier,
    decision,
  };
  if (identity?.thumbprint) attribution.agent_thumbprint = identity.thumbprint;
  if (identity?.sub) attribution.agent_sub = identity.sub;
  if (identity?.iss) attribution.agent_iss = identity.iss;
  if (identity?.algorithm) attribution.agent_algorithm = identity.algorithm;
  if (identity?.publicKey) attribution.agent_public_key = identity.publicKey;
  if (identity?.clientName) attribution.client_name = identity.clientName;
  if (identity?.clientVersion) attribution.client_version = identity.clientVersion;
  if (identity?.connectionId) attribution.connection_id = identity.connectionId;

  const aauth = buildAAuthInfo({
    middlewareDecision: middlewareDecision ?? null,
    admission: admission ?? null,
  });

  const policy = getAttributionPolicySnapshot();
  const eligible = isEligibleForTrustedWrites(tier, policy);

  return {
    user_id: userId,
    attribution,
    aauth,
    policy,
    eligible_for_trusted_writes: eligible,
  };
}

/**
 * Compose the public `aauth` block. Verified ≠ admitted on purpose: a
 * caller that signed correctly but has no active grant in this user's
 * scope still gets `verified: true, admitted: false,
 * admission_reason: "no_match" | "no_grants_for_user"` so they can
 * differentiate a missing signature from a missing grant.
 */
function buildAAuthInfo(params: {
  middlewareDecision: AttributionDecisionDiagnostics | null;
  admission: AAuthAdmissionContext | null;
}): SessionAAuthInfo {
  const { middlewareDecision, admission } = params;
  const verified = Boolean(middlewareDecision?.signature_verified);
  if (!admission) {
    return {
      verified,
      admitted: false,
      grant_id: null,
      admission_reason: verified ? null : "not_signed",
    };
  }
  const info: SessionAAuthInfo = {
    verified,
    admitted: Boolean(admission.admitted),
    grant_id: admission.admitted ? admission.grant_id ?? null : null,
    admission_reason: admission.reason ?? (admission.admitted ? "admitted" : null),
  };
  if (admission.agent_label) info.agent_label = admission.agent_label;
  return info;
}

/**
 * Combine the signature-side decision stashed by the AAuth middleware
 * with client-info normalisation to produce the final diagnostic record
 * surfaced to clients. Missing inputs degrade gracefully: when no
 * middleware decision is stashed (e.g. unsigned local stdio call) we
 * synthesise `signature_present: false`.
 */
function mergeDecision(params: {
  middlewareDecision: AttributionDecisionDiagnostics | null;
  rawClientInfoName: string | null;
  resolvedTier: AttributionTier;
}): SessionAttributionDecision {
  const { middlewareDecision, rawClientInfoName, resolvedTier } = params;
  const base: SessionAttributionDecision = middlewareDecision
    ? {
        signature_present: middlewareDecision.signature_present,
        signature_verified: middlewareDecision.signature_verified,
        signature_error_code: middlewareDecision.signature_error_code,
        resolved_tier: resolvedTier,
      }
    : {
        signature_present: false,
        signature_verified: false,
        resolved_tier: resolvedTier,
      };
  if (middlewareDecision?.attestation) {
    base.attestation = middlewareDecision.attestation;
  }
  if (middlewareDecision?.operator_allowlist_source) {
    base.operator_allowlist_source = middlewareDecision.operator_allowlist_source;
  }

  if (rawClientInfoName !== null && rawClientInfoName !== undefined) {
    const { value, reason } = normaliseClientNameWithReason(rawClientInfoName);
    if (typeof rawClientInfoName === "string" && rawClientInfoName.length > 0) {
      base.client_info_raw_name = rawClientInfoName;
    }
    if (value === undefined && reason) {
      base.client_info_normalised_to_null_reason = reason;
    }
  }

  return base;
}

/**
 * Mirrors the core decision that
 * {@link import('./attribution_policy.js').enforceAttributionPolicy} makes
 * on the default write path (`observations`). Kept in sync so the
 * session endpoint is a reliable preflight.
 */
function isEligibleForTrustedWrites(
  tier: AttributionTier,
  policy: AttributionPolicySnapshot,
): boolean {
  const mode = policy.per_path?.observations ?? policy.anonymous_writes;
  if (tier === "anonymous") {
    return mode !== "reject";
  }
  if (!policy.min_tier) return true;
  const rank: Record<AttributionTier, number> = {
    anonymous: 0,
    unverified_client: 1,
    software: 2,
    operator_attested: 3,
    hardware: 4,
  };
  return rank[tier] >= rank[policy.min_tier];
}
