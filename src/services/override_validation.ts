/**
 * Override validation service.
 *
 * Enforces `override_policy` — a JSON field stored on `agent_definition`
 * entities — at observation write time. This enables per-field write
 * restrictions based on the calling agent's role or tier, so individual
 * Ateles swarm daemons can be restricted from overwriting sensitive fields
 * they should never touch (e.g. `agent_grant`, `prompt_markdown`).
 *
 * Phase 1 scope: only `agent_definition` entities carry a policy; all other
 * entity types are passed through without inspection.
 *
 * # override_policy JSON format (stored in agent_definition.override_policy)
 *
 * ```json
 * {
 *   "field_policies": {
 *     "agent_grant": {
 *       "allowed_roles": ["operator"],
 *       "deny_message": "Only operators may change agent grants"
 *     },
 *     "prompt_markdown": {
 *       "allowed_roles": ["operator", "service"]
 *     }
 *   },
 *   "default_policy": "allow"
 * }
 * ```
 *
 * `default_policy` defaults to `"allow"` when omitted (fail-open). Fields
 * not mentioned in `field_policies` inherit `default_policy`.
 *
 * Role derivation:
 *   - If identity is null, or identity.tier is "operator_attested"/"hardware"
 *     → role is "operator".
 *   - If identity.sub ends in `@ateles-swarm`:
 *       → derive role from `agent_grant` field in the AAuth admission context,
 *         falling back to "service" when the admission did not carry one.
 *   - Otherwise → role is "service".
 */

import type { AgentIdentity } from "../crypto/agent_identity.js";
import type { LocalDbClient } from "../repositories/sqlite/local_db_adapter.js";
import type { AAuthAdmissionContext } from "./protected_entity_types.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Per-field access policy. `allowed_roles` is the exhaustive allow-list; a
 * caller whose role is absent is denied. `min_tier` is an optional additional
 * constraint — the caller's `AgentIdentity.tier` is compared against it when
 * present. Either constraint alone is sufficient to deny a write.
 */
export interface FieldPolicy {
  /** Role strings that are allowed to write this field. */
  allowed_roles: string[];
  /**
   * Optional minimum attribution tier the caller must carry.
   * Valid values mirror {@link AttributionTier}: "hardware" | "operator_attested"
   * | "software" | "unverified_client" | "anonymous".
   */
  min_tier?: string;
  /** Human-readable message surfaced in the thrown error. */
  deny_message?: string;
}

/**
 * Top-level shape of the `override_policy` JSON blob stored on an
 * `agent_definition` entity.
 */
export interface OverridePolicy {
  /** Per-field rules. Keys are field names as they appear in `observations.fields`. */
  field_policies: Record<string, FieldPolicy>;
  /**
   * Fallback when a field is not listed in `field_policies`.
   * Defaults to `"allow"` (fail-open) when omitted.
   */
  default_policy?: "allow" | "deny";
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link enforceOverridePolicy} when a field write is blocked.
 * HTTP handlers should surface this as 403 with `code: "OVERRIDE_POLICY_VIOLATION"`.
 */
export class OverridePolicyViolationError extends Error {
  readonly code = "OVERRIDE_POLICY_VIOLATION" as const;
  readonly statusCode = 403;
  readonly fieldName: string;
  readonly agentRole: string;
  readonly entityId: string;

  constructor(params: { fieldName: string; agentRole: string; entityId: string; reason?: string }) {
    const reason =
      params.reason ??
      `Role "${params.agentRole}" is not permitted to write field "${params.fieldName}"`;
    super(
      `Override policy blocked write to field "${params.fieldName}" on entity "${params.entityId}": ${reason}`
    );
    this.name = "OverridePolicyViolationError";
    this.fieldName = params.fieldName;
    this.agentRole = params.agentRole;
    this.entityId = params.entityId;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    field_name: string;
    agent_role: string;
    entity_id: string;
  } {
    return {
      code: this.code,
      message: this.message,
      field_name: this.fieldName,
      agent_role: this.agentRole,
      entity_id: this.entityId,
    };
  }
}

// ---------------------------------------------------------------------------
// Tier ordering (mirrors attribution_policy.ts TIER_RANK)
// ---------------------------------------------------------------------------

const TIER_RANK: Record<string, number> = {
  anonymous: 0,
  unverified_client: 1,
  software: 2,
  operator_attested: 3,
  hardware: 4,
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether `agentRole` (and optionally `agentTier`) is allowed to
 * write a field governed by `policy`. Returns a structured result so callers
 * can distinguish "allowed" from "denied with reason" without catching errors.
 *
 * @param fieldName   - The field name being written (used only in the reason string).
 * @param policy      - The {@link FieldPolicy} for this field.
 * @param agentRole   - Derived role string for the calling agent ("operator" | "service" | …).
 * @param agentTier   - Optional attribution tier string from {@link AgentIdentity.tier}.
 */
export function checkFieldAllowed(
  fieldName: string,
  policy: FieldPolicy,
  agentRole: string,
  agentTier?: string
): { allowed: boolean; reason?: string } {
  // Role check — must appear in the allow-list.
  if (!policy.allowed_roles.includes(agentRole)) {
    const reason =
      policy.deny_message ??
      `Role "${agentRole}" is not in allowed_roles [${policy.allowed_roles.join(", ")}] for field "${fieldName}"`;
    return { allowed: false, reason };
  }

  // Optional tier floor — only evaluated when both min_tier and agentTier are known.
  if (policy.min_tier && agentTier) {
    const requiredRank = TIER_RANK[policy.min_tier] ?? 0;
    const currentRank = TIER_RANK[agentTier] ?? 0;
    if (currentRank < requiredRank) {
      const reason = `Attribution tier "${agentTier}" is below required minimum "${policy.min_tier}" for field "${fieldName}"`;
      return { allowed: false, reason };
    }
  }

  return { allowed: true };
}

/**
 * Parse a raw JSON string into an {@link OverridePolicy}. Returns `null` on
 * invalid / missing JSON (fail-open: callers treat `null` as "no restrictions").
 */
export function parseOverridePolicy(json: string): OverridePolicy | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    // field_policies is required; if absent or wrong type, treat as invalid.
    if (!parsed.field_policies || typeof parsed.field_policies !== "object") {
      return null;
    }
    const fieldPolicies: Record<string, FieldPolicy> = {};
    for (const [key, val] of Object.entries(parsed.field_policies)) {
      if (!val || typeof val !== "object" || Array.isArray(val)) continue;
      const v = val as Record<string, unknown>;
      if (!Array.isArray(v.allowed_roles)) continue;
      const fp: FieldPolicy = {
        allowed_roles: (v.allowed_roles as unknown[]).filter(
          (r): r is string => typeof r === "string"
        ),
      };
      if (typeof v.min_tier === "string") fp.min_tier = v.min_tier;
      if (typeof v.deny_message === "string") fp.deny_message = v.deny_message;
      fieldPolicies[key] = fp;
    }
    const policy: OverridePolicy = { field_policies: fieldPolicies };
    if (parsed.default_policy === "allow" || parsed.default_policy === "deny") {
      policy.default_policy = parsed.default_policy;
    }
    return policy;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Role derivation
// ---------------------------------------------------------------------------

/**
 * Derive a role string from the agent identity and optional admission context.
 * The role is intentionally coarse (operator | service | …) and distinct from
 * the attribution tier, which measures cryptographic assurance rather than
 * business permission.
 *
 * Role derivation rules (in priority order):
 *   1. No identity → "operator" (local/CLI write with no agent context).
 *   2. AAuth tier of "operator_attested" or "hardware" → "operator".
 *   3. Sub ends in "@ateles-swarm" → use `agent_label` from admission if
 *      admitted, otherwise "service".
 *   4. All other identities → "service".
 */
function deriveAgentRole(
  identity: AgentIdentity | null,
  admission: AAuthAdmissionContext | null
): string {
  // No identity or operator-tier AAuth → treat as operator.
  if (!identity) return "operator";
  if (identity.tier === "operator_attested" || identity.tier === "hardware") {
    return "operator";
  }

  // Ateles swarm daemons: sub ends in @ateles-swarm.
  if (identity.sub && identity.sub.endsWith("@ateles-swarm")) {
    // Use the grant label from the admission context as the role when available.
    if (admission?.admitted && admission.agent_label) {
      return admission.agent_label;
    }
    return "service";
  }

  // Default: non-swarm, non-operator AAuth identity → "service".
  return "service";
}

// ---------------------------------------------------------------------------
// Main enforcement function
// ---------------------------------------------------------------------------

/**
 * Params accepted by {@link enforceOverridePolicy}.
 *
 * `db` is the database client so the function is testable without patching
 * the module-level singleton, but callers on the write path should pass the
 * imported `db` instance from `../../db.js`.
 */
export interface EnforceOverridePolicyParams {
  /** Entity type of the observation being written. */
  entityType: string;
  /** Entity id of the target entity. `null` for brand-new entities (no policy to enforce). */
  entityId: string | null;
  /** Fields being written by this observation. */
  fields: Record<string, unknown>;
  /**
   * Owning user id for the write. The snapshot lookup is scoped to this user
   * so a colliding entity_id in another tenant can never supply the policy
   * (same failure class as the 2026-05-21 relationship tenant-isolation
   * advisory).
   */
  userId: string;
  /** Calling agent identity from the active request context. */
  identity: AgentIdentity | null;
  /** AAuth admission context, if available (used for role derivation). */
  admission?: AAuthAdmissionContext | null;
  /** Database client. Pass the `db` singleton from `../../db.js`. */
  db: LocalDbClient;
}

/**
 * Enforce the `override_policy` attached to an `agent_definition` entity.
 *
 * - Skips immediately for any entity type other than `"agent_definition"`.
 * - Skips when `entityId` is null (new entity has no existing policy).
 * - Looks up the current entity snapshot; if no snapshot exists, or the
 *   snapshot lacks an `override_policy` field, allows the write (fail-open).
 * - Iterates over the fields being written and calls
 *   {@link checkFieldAllowed} for each; throws
 *   {@link OverridePolicyViolationError} on the first violation.
 */
export async function enforceOverridePolicy(params: EnforceOverridePolicyParams): Promise<void> {
  const { entityType, entityId, fields, identity, admission, userId, db: dbClient } = params;

  // Phase 1: only agent_definition entities carry a policy. No agent_definition
  // schema is seeded yet, so this guard is inert until that schema lands;
  // shipping the enforcement hook first keeps the write path ready.
  if (entityType !== "agent_definition") return;

  // New entities have no snapshot, so no policy to enforce yet.
  if (entityId === null) return;

  // Fetch the current snapshot for this entity, scoped to the owning user so a
  // cross-tenant entity_id collision can never supply the policy.
  const { data: snapshotData, error: snapshotError } = await dbClient
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", entityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (snapshotError) {
    // Fail-open: if we can't read the snapshot, don't block the write.
    logger.warn(
      JSON.stringify({
        event: "override_policy_snapshot_fetch_error",
        entity_id: entityId,
        error: snapshotError.message,
      })
    );
    return;
  }

  if (!snapshotData) return;

  // The `snapshot` column is JSON TEXT; the local adapter may surface it as a
  // parsed object or a raw string depending on the read path. Accept both.
  const rawSnapshot = (snapshotData as { snapshot?: unknown }).snapshot ?? null;
  let snapshot: Record<string, unknown> | null = null;
  if (typeof rawSnapshot === "string") {
    try {
      snapshot = JSON.parse(rawSnapshot) as Record<string, unknown>;
    } catch {
      snapshot = null;
    }
  } else if (rawSnapshot && typeof rawSnapshot === "object") {
    snapshot = rawSnapshot as Record<string, unknown>;
  }
  if (!snapshot) return;

  const rawPolicy = snapshot["override_policy"];
  if (typeof rawPolicy !== "string" || !rawPolicy) return;

  const policy = parseOverridePolicy(rawPolicy);
  if (!policy) {
    // Fail-open on invalid JSON.
    logger.warn(
      JSON.stringify({
        event: "override_policy_invalid_json",
        entity_id: entityId,
      })
    );
    return;
  }

  const agentRole = deriveAgentRole(identity, admission ?? null);
  const agentTier = identity?.tier;

  for (const fieldName of Object.keys(fields)) {
    const fieldPolicy = policy.field_policies[fieldName];

    if (fieldPolicy) {
      const result = checkFieldAllowed(fieldName, fieldPolicy, agentRole, agentTier);
      if (!result.allowed) {
        throw new OverridePolicyViolationError({
          fieldName,
          agentRole,
          entityId,
          reason: result.reason,
        });
      }
    } else if (policy.default_policy === "deny") {
      throw new OverridePolicyViolationError({
        fieldName,
        agentRole,
        entityId,
        reason: `Field "${fieldName}" is not explicitly allowed and default_policy is "deny"`,
      });
    }
    // default_policy === "allow" (or omitted) → allow unlisted fields.
  }
}
