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
 *     → agent_grants.lookupGrantForIdentity
 *     → admitted: true + { user_id, grant_id, capabilities }
 *
 * Admission is key-bound: only a grant whose `match_thumbprint` equals
 * the signing key's thumbprint admits. A grant that matches `sub` /
 * `iss` but pins no key refuses with `grant_key_unbound`, and the
 * operator is told to pin the thumbprint. The capability layer treats
 * that reason as fail-closed for capability-gated writes, independent
 * of how the request authenticated (see `capabilityCeilingFromAdmission`
 * in `agent_capabilities.ts`).
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
import { lookupGrantForIdentity, recordMatch, type AgentGrant } from "./agent_grants.js";
import { GRANT_KEY_PIN_DOC } from "./agent_capabilities.js";
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
 * - Only a grant without a key pin matched sub/iss →
 *   `{ admitted: false, reason: "grant_key_unbound" }`.
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
  let unboundClaimMatch = false;
  let inactiveGrant: AgentGrant | null = null;
  let invalidGrantId: string | null = null;
  try {
    const lookup = await lookupGrantForIdentity({
      sub: ctx.sub,
      iss: ctx.iss,
      thumbprint: ctx.thumbprint,
    });
    grant = lookup.grant;
    unboundClaimMatch = lookup.unbound_claim_match;
    inactiveGrant = lookup.inactive_grant;
    invalidGrantId = lookup.invalid_grant_id;
  } catch (err) {
    logger.warn("aauth_admission lookup failed", {
      err: err instanceof Error ? err.message : String(err),
      sub: ctx.sub,
      thumbprint_prefix: ctx.thumbprint?.slice(0, 12),
    });
    return { admitted: false, reason: "no_match" };
  }

  if (!grant) {
    // The presented key was pinned to a grant that is now suspended or
    // revoked. Report the specific reason — fail closed — rather than
    // falling through to grant_key_unbound / no_match, which would give
    // a shut-off credential the same ceiling as an unrecognized one.
    if (inactiveGrant) {
      logger.warn(
        JSON.stringify({
          event: "aauth_admission_inactive_grant",
          sub: ctx.sub ?? null,
          iss: ctx.iss ?? null,
          thumbprint_prefix: ctx.thumbprint?.slice(0, 12) ?? null,
          grant_id: inactiveGrant.grant_id,
          grant_status: inactiveGrant.status,
          message:
            "The presented key is pinned to an agent_grant whose status is " +
            `"${inactiveGrant.status}", not "active". Admission is refused ` +
            "and capability-gated writes carrying this signature are denied " +
            "until the grant is restored to active.",
        })
      );
      if (inactiveGrant.status === "suspended") {
        return {
          admitted: false,
          reason: "grant_suspended",
          user_id: inactiveGrant.user_id,
          grant_id: inactiveGrant.grant_id,
          agent_label: inactiveGrant.label,
        };
      }
      if (inactiveGrant.status === "revoked") {
        return {
          admitted: false,
          reason: "grant_revoked",
          user_id: inactiveGrant.user_id,
          grant_id: inactiveGrant.grant_id,
          agent_label: inactiveGrant.label,
        };
      }
      // Defensive: any other non-active status behaves like no_match
      // rather than silently admitting.
      return { admitted: false, reason: reasonForUnmatched(ctx) };
    }
    if (unboundClaimMatch) {
      logger.warn(
        JSON.stringify({
          event: "aauth_admission_key_unbound",
          sub: ctx.sub ?? null,
          iss: ctx.iss ?? null,
          thumbprint_prefix: ctx.thumbprint?.slice(0, 12) ?? null,
          message:
            "An active agent_grant matches this agent's sub/iss but pins no " +
            "match_thumbprint. Signed admission requires a key binding, and " +
            "capability-gated writes carrying this signature are refused until " +
            "the grant is pinned. Set the grant's match_thumbprint to the RFC 7638 " +
            "thumbprint of the agent's public key, taken from the agent's own key " +
            "material (`neotoma auth session` on the agent's host). How to apply " +
            "it to an existing grant (Inspector, PATCH /agents/grants/{id}, or " +
            `correct): ${GRANT_KEY_PIN_DOC}`,
          docs: GRANT_KEY_PIN_DOC,
        })
      );
      return { admitted: false, reason: "grant_key_unbound" };
    }
    if (invalidGrantId) {
      // The presented key IS pinned to a real, active grant — but that
      // grant's stored shape failed validateCapabilities (or another
      // snapshotToGrant check), so lookupGrantForIdentity could not build
      // an AgentGrant from it. Report the specific grant id and fail
      // closed via grant_invalid rather than falling through to no_match,
      // which would give a broken, specifically-named credential the same
      // ceiling as a signature nothing recognizes at all.
      // warnInvalidGrant (agent_grants.ts) already logged the field-level
      // reason, rate-limited per grant per day; this line intentionally
      // does not repeat capability contents or any credential material.
      return { admitted: false, reason: "grant_invalid", grant_id: invalidGrantId };
    }
    return { admitted: false, reason: reasonForUnmatched(ctx) };
  }

  // Defense in depth, not the primary path: `lookupGrantForIdentity` only
  // ever returns an active grant in `.grant` (inactive key-bound matches
  // come back via `.inactive_grant` and are handled above, before this
  // point). These branches guard the invariant rather than rely on it —
  // if a future change to the lookup ever let a non-active grant through
  // as `.grant`, this still fails closed instead of admitting it.
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
