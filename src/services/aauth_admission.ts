/**
 * AAuth admission service.
 *
 * Maps a verified AAuth identity to a Neotoma `agent_grant` and returns
 * an admission decision that downstream middleware threads onto the
 * request as `req.aauthAdmission` and `req.authenticatedUserId`.
 *
 * High-level flow:
 *
 *   verified AAuth identity (sub / iss / thumbprint)
 *     → agent_grants.findActiveGrantByIdentity
 *     → admitted: true + { user_id, grant_id, capabilities }
 *
 * Unknown identities stay attribution-only — the caller's request is
 * NOT rejected by this service; it just doesn't gain user resolution.
 * Whether to reject afterwards is the responsibility of route gates.
 *
 * The admission service also opportunistically asks the grants service
 * to record a `last_used_at` observation (debounced once per UTC day
 * per grant) so the Inspector can surface "active in the last X days"
 * without spending an observation per request.
 */

import type { AAuthRequestContext } from "../crypto/agent_identity.js";
import type { AAuthAdmissionContext, AAuthAdmissionReason } from "./protected_entity_types.js";
import { findActiveGrantByIdentity, recordMatch, type AgentGrant } from "./agent_grants.js";
import { logger } from "../utils/logger.js";

export type { AAuthAdmissionContext, AAuthAdmissionReason };

/**
 * Result returned by {@link admitFromAAuthContext}. Always non-null so
 * callers can stamp it on the request without branching.
 */
export interface AdmissionResult extends AAuthAdmissionContext {
  /** When admitted, the matched grant entity (full shape, useful for diagnostics). */
  grant?: AgentGrant;
}

/**
 * Resolve a verified AAuth identity (or null) to an admission decision.
 *
 * - `null` / not-verified input → `{ admitted: false, reason: "not_signed" }`.
 * - Identity present but no matching active grant →
 *   `{ admitted: false, reason: "no_match" | "grant_revoked" | ... }`.
 * - Match found → `{ admitted: true, user_id, grant_id, capabilities, ... }`
 *   and a debounced `last_used_at` observation is fired off.
 *
 * The function never throws on lookup failure: any internal error is
 * logged and returned as `not_signed` / `no_match` so the request keeps
 * flowing through attribution-only paths.
 */
export async function admitFromAAuthContext(
  ctx: AAuthRequestContext | null
): Promise<AdmissionResult> {
  if (!ctx || !ctx.verified) {
    return { admitted: false, reason: "not_signed" };
  }

  if (process.env.NEOTOMA_AAUTH_ADMISSION_DISABLED === "1") {
    return { admitted: false, reason: "aauth_disabled" };
  }

  let grant: AgentGrant | null;
  try {
    grant = await findActiveGrantByIdentity({
      sub: ctx.sub,
      iss: ctx.iss,
      thumbprint: ctx.thumbprint,
    });
  } catch (err) {
    logger.warn("aauth_admission lookup failed", {
      err: err instanceof Error ? err.message : String(err),
      sub: ctx.sub,
      thumbprint_prefix: ctx.thumbprint?.slice(0, 12),
    });
    return { admitted: false, reason: "no_match" };
  }

  if (!grant) {
    return { admitted: false, reason: reasonForUnmatched(ctx) };
  }

  if (grant.status === "suspended") {
    return {
      admitted: false,
      reason: "grant_suspended",
      user_id: grant.user_id,
      grant_id: grant.grant_id,
      agent_label: grant.label,
    };
  }
  if (grant.status === "revoked") {
    return {
      admitted: false,
      reason: "grant_revoked",
      user_id: grant.user_id,
      grant_id: grant.grant_id,
      agent_label: grant.label,
    };
  }

  // Best-effort match recording. Awaiting on a debounced no-op when the
  // grant was already touched today; the work is bounded.
  recordMatch(grant).catch((err) => {
    logger.warn("aauth_admission recordMatch failed", {
      err: err instanceof Error ? err.message : String(err),
      grant_id: grant!.grant_id,
    });
  });

  return {
    admitted: true,
    reason: "admitted",
    user_id: grant.user_id,
    grant_id: grant.grant_id,
    agent_label: grant.label,
    capabilities: grant.capabilities,
    grant,
  };
}

/**
 * The unmatched case is the ambiguous one. We produce `no_match` by
 * default and reserve `no_grants_for_user` for environments where the
 * caller wants stricter diagnostics. Today both shapes flow through
 * the same `no_match` branch — kept here as a placeholder for the
 * tier plan's `default_deny` extensions.
 */
function reasonForUnmatched(_ctx: AAuthRequestContext): AAuthAdmissionReason {
  return "no_match";
}
