/**
 * Agent capability enforcement — grant-driven authorization.
 *
 * This layer sits **above** {@link enforceAttributionPolicy} (which gates
 * by {@link AttributionTier}) and **below** ordinary user auth. Where
 * the attribution policy asks "is this write attributable at all?",
 * capability enforcement asks "is *this* specific agent allowed to
 * touch *this* specific entity_type via *this* operation?".
 *
 * Source of truth (Stronger AAuth Admission plan):
 *   - Capabilities live on `agent_grant` entities, scoped per
 *     `user_id`, managed in the Inspector or via the standard
 *     entity-store toolkit when the caller has the bootstrap grant.
 *   - The admission service ({@link ./aauth_admission.js}) resolves
 *     a verified AAuth identity to the matching grant and stamps the
 *     resolved `capabilities` onto `req.aauthAdmission` /
 *     {@link RequestContext.aauthAdmission} before any handler runs.
 *   - {@link enforceAgentCapability} reads those capabilities directly.
 *
 * The legacy environment-variable registry (`NEOTOMA_AGENT_CAPABILITIES_*`)
 * is REMOVED in this release. {@link assertNoLegacyCapabilityEnv} runs
 * during boot and fails fast with a structured pointer to the
 * `neotoma agents grants import` migration command.
 */

import type { AttributionTier, AgentIdentity } from "../crypto/agent_identity.js";
import { logger } from "../utils/logger.js";
import { getCurrentAAuthAdmission } from "./request_context.js";
import type { AAuthAdmissionContext, AAuthAdmissionReason } from "./protected_entity_types.js";

/**
 * Canonical operation identifier. Mirrors the top-level MCP/REST entry
 * points that touch durable Neotoma state.
 *
 * The `github_harness:*` family covers repo-scoped operations performed
 * by the mcp-server-github-harness MCP server on behalf of swarm agents.
 * These ops are validated by the harness, not by Neotoma admission — they
 * live here so agent_grant entities can carry them without a validation
 * error, and so the harness can look them up from Neotoma instead of
 * falling back to HARNESS_GRANTS_JSON.
 */
export type AgentCapabilityOp =
  | "store"
  | "store_structured"
  | "create_relationship"
  | "correct"
  | "retrieve"
  /**
   * Registering a relationship type is a GOVERNANCE act, not a data write:
   * it changes what edges the instance will accept. Gated at the service
   * layer so MCP, HTTP and CLI inherit one check (#1972 / G25).
   *
   * Scoped by `relationship_types`, not `entity_types` — see the field below.
   */
  | "register_relationship_type"
  | "github_harness:read"
  | "github_harness:write"
  | "github_harness:*";

export interface AgentCapabilityEntry {
  op: AgentCapabilityOp;
  /** Allowed entity types for this op. `"*"` widens to any entity_type. */
  entity_types: string[];
  /**
   * Allowed relationship types for `register_relationship_type`. `"*"` widens.
   *
   * A PARALLEL field rather than an overload of `entity_types`, deliberately:
   * `entity_types` already means one vocabulary, and making it mean two
   * depending on the op is precisely the ambiguity #1972 is about. Additive —
   * grants written before this field simply carry no relationship capability,
   * which is the correct default for a governance op.
   *
   * The special value `"global"` is required IN ADDITION to a type match to
   * register at instance-wide scope.
   */
  relationship_types?: string[];
  /**
   * Repo-scope for `github_harness:*` ops — list of "owner/repo" strings.
   * `"*"` wildcards any repo. Only meaningful for github_harness ops;
   * ignored for Neotoma-native ops.
   */
  repos?: string[];
}

/** Identity match shape (still used by import / Inspector serialisation). */
export interface AgentCapabilityMatch {
  /** Match by AAuth `sub` claim. */
  sub?: string;
  /** Optional AAuth `iss` claim — when set, both `sub` AND `iss` must match. */
  iss?: string;
  /** Match by RFC 7638 JWK thumbprint. */
  thumbprint?: string;
}

/** Legacy registry shape — used only by the env-config import command. */
export interface AgentCapabilityAgent {
  match: AgentCapabilityMatch;
  capabilities: AgentCapabilityEntry[];
}

/**
 * Capability ceiling for the current request.
 *
 * Kept separate from authentication on purpose. `admitted` answers "did
 * AAuth authenticate this caller?"; the ceiling answers "which
 * capability-gated operations may this request perform?". A request can
 * be authenticated by a bearer token or OAuth and still carry an AAuth
 * signature, and the signature decides the ceiling either way.
 *
 * - `grant`: the signature is bound to an active grant
 *   (`match_thumbprint`); the grant's capabilities are the ceiling.
 * - `deny`: the signature names a grant this key cannot currently use —
 *   because the grant pins no key (`grant_key_unbound`), or because the
 *   key WAS pinned to a grant the operator has since turned off
 *   (`grant_revoked` / `grant_suspended`). Capability-gated operations
 *   fail closed in all three cases, whatever authenticated the request
 *   and independent of `NEOTOMA_AGENT_DEFAULT_DENY`.
 * - `none`: no grant applies; `NEOTOMA_AGENT_DEFAULT_DENY` decides.
 */
export type AgentCapabilityCeiling =
  | { kind: "grant"; capabilities: AgentCapabilityEntry[] }
  | { kind: "deny"; reason: "grant_key_unbound" | "grant_revoked" | "grant_suspended" }
  | { kind: "none" };

/**
 * Exhaustive map from every {@link AAuthAdmissionReason} OTHER THAN
 * `"admitted"` (handled separately, via `admission.admitted`) to the
 * ceiling it produces.
 *
 * This is the fail-closed safety vocabulary itself: every reason the
 * admission layer can report must have an explicit entry here, and the
 * TypeScript `Record<...>` type below makes the compiler refuse a build
 * that adds a new {@link AAuthAdmissionReason} without also classifying
 * it here. New reasons default to nothing being added silently — a
 * missing key is a compile error, not a runtime fall-through — and any
 * reason whose classification is not obviously safe-to-allow must map to
 * `"deny"`, never `"none"`, per the repo's fail-closed-on-the-safety-field
 * rule: `none` is a real permissive state (`NEOTOMA_AGENT_DEFAULT_DENY`
 * decides), so only reasons that genuinely mean "this signature carries
 * no assertion about any grant" belong there.
 */
const CEILING_REASON_MAP: Record<Exclude<AAuthAdmissionReason, "admitted">, "deny" | "none"> = {
  // The signature names a grant this key cannot currently use — the
  // grant pins no key, or the key was pinned to a grant since turned
  // off. Fail closed independent of NEOTOMA_AGENT_DEFAULT_DENY.
  grant_key_unbound: "deny",
  grant_revoked: "deny",
  grant_suspended: "deny",
  // No grant asserts anything about this identity at all — the signature
  // is unrecognized, not refused. NEOTOMA_AGENT_DEFAULT_DENY governs.
  no_match: "none",
  no_grants_for_user: "none",
  strict_rejected: "none",
  aauth_disabled: "none",
  not_signed: "none",
};

/**
 * Derive the {@link AgentCapabilityCeiling} from an admission record.
 * Pure; exported for tests and diagnostics.
 *
 * The `deny` reasons carry the specific {@link AAuthAdmissionReason} they
 * were classified from (not a generic flag) so denial hints and log
 * lines can name what actually happened. Any reason not present in
 * {@link CEILING_REASON_MAP} — which TypeScript will not allow, since the
 * map type is exhaustive over `AAuthAdmissionReason` — would be a
 * compile error before it could ever reach here.
 */
export function capabilityCeilingFromAdmission(
  admission: AAuthAdmissionContext | null | undefined
): AgentCapabilityCeiling {
  if (admission?.admitted) {
    return { kind: "grant", capabilities: admission.capabilities ?? [] };
  }
  const reason = admission?.reason;
  if (!reason || reason === "admitted") return { kind: "none" };
  if (CEILING_REASON_MAP[reason] === "deny") {
    // Narrowed by the Record's key type to the three deny-mapped reasons.
    return {
      kind: "deny",
      reason: reason as "grant_key_unbound" | "grant_revoked" | "grant_suspended",
    };
  }
  return { kind: "none" };
}

/**
 * Acting agent on the current request. Built from the resolved
 * {@link AgentIdentity}, possibly enriched by the admission service.
 *
 * `admitted` records whether AAuth admission authenticated the caller.
 * `ceiling` records which capability limits apply (see
 * {@link AgentCapabilityCeiling}); it is what {@link enforceAgentCapability}
 * reads. `capabilities` mirrors the grant's capabilities when admitted
 * and is kept for existing callers.
 */
export interface AgentCapabilityContext {
  sub?: string;
  iss?: string;
  thumbprint?: string;
  tier: AttributionTier;
  capabilities: AgentCapabilityEntry[] | null;
  agentLabel: string;
  admitted: boolean;
  /**
   * Capability ceiling. When absent (contexts built by hand), it is
   * derived from `admitted` / `capabilities`.
   */
  ceiling?: AgentCapabilityCeiling;
}

/** Resolve the ceiling for a context, deriving it for hand-built contexts. */
function ceilingOf(ctx: AgentCapabilityContext): AgentCapabilityCeiling {
  if (ctx.ceiling) return ctx.ceiling;
  if (ctx.admitted && ctx.capabilities) {
    return { kind: "grant", capabilities: ctx.capabilities };
  }
  return { kind: "none" };
}

/**
 * Where operators find how to pin a key to an existing grant. Referenced
 * from denial hints and the admission log line.
 */
export const GRANT_KEY_PIN_DOC =
  "docs/subsystems/agent_capabilities.md#pin-a-key-to-an-existing-grant";

/** Structured denial. HTTP handlers surface this as 403 `capability_denied`. */
export class AgentCapabilityError extends Error {
  readonly code = "capability_denied" as const;
  readonly statusCode = 403;
  readonly op: AgentCapabilityOp;
  readonly entityType: string;
  readonly agentLabel: string;
  readonly hint: string;

  constructor(params: {
    op: AgentCapabilityOp;
    entityType: string;
    agentLabel: string;
    hint: string;
  }) {
    super(
      `Agent "${params.agentLabel}" is not permitted to ${params.op} ` +
        `entity_type "${params.entityType}".`
    );
    this.name = "AgentCapabilityError";
    this.op = params.op;
    this.entityType = params.entityType;
    this.agentLabel = params.agentLabel;
    this.hint = params.hint;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    op: AgentCapabilityOp;
    entity_type: string;
    agent_label: string;
    hint: string;
  } {
    return {
      code: this.code,
      message: this.message,
      op: this.op,
      entity_type: this.entityType,
      agent_label: this.agentLabel,
      hint: this.hint,
    };
  }
}

/** ---------- Boot-time legacy env removal check ---------- */

const LEGACY_CAPABILITY_ENV_VARS = [
  "NEOTOMA_AGENT_CAPABILITIES_JSON",
  "NEOTOMA_AGENT_CAPABILITIES_FILE",
  "NEOTOMA_AGENT_CAPABILITIES_ENFORCE",
] as const;

export class LegacyAgentCapabilityEnvError extends Error {
  readonly code = "legacy_agent_capabilities_env" as const;
  readonly variables: string[];
  readonly migrationCommand = "neotoma agents grants import --owner-user-id <user_id>";

  constructor(variables: string[]) {
    super(
      "NEOTOMA_AGENT_CAPABILITIES_* environment variables are no longer " +
        "supported. Capabilities are now stored on agent_grant entities. " +
        `Run \`${"neotoma agents grants import --owner-user-id <user_id>"}\` ` +
        "once before this release, then unset these variables: " +
        variables.join(", ") +
        "."
    );
    this.name = "LegacyAgentCapabilityEnvError";
    this.variables = variables;
  }
}

/**
 * Throws {@link LegacyAgentCapabilityEnvError} when any of the legacy
 * `NEOTOMA_AGENT_CAPABILITIES_*` variables are still set. Call once
 * during server boot (see {@link assertCapabilityEnvOnBoot} for the
 * Express-friendly wrapper used in `src/server.ts`).
 */
export function assertNoLegacyCapabilityEnv(env: NodeJS.ProcessEnv = process.env): void {
  const present = LEGACY_CAPABILITY_ENV_VARS.filter((name) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (present.length > 0) {
    throw new LegacyAgentCapabilityEnvError(present);
  }
}

/** ---------- Default-deny configuration ---------- */

/**
 * Whether to deny otherwise-unrecognised AAuth-verified agents. Mirrors
 * the legacy `default_deny` registry flag: an admitted agent always
 * follows its grant capabilities; an UN-admitted but signature-verified
 * agent is denied iff this flag is true and its tier is sufficient.
 */
export function isAgentDefaultDenyEnabled(): boolean {
  const raw = process.env.NEOTOMA_AGENT_DEFAULT_DENY;
  if (!raw) return false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "true" || normalised === "1" || normalised === "yes";
}

/** ---------- Context assembly ---------- */

function agentLabelFor(identity: AgentIdentity | null | undefined, admittedLabel?: string): string {
  if (admittedLabel && admittedLabel.length > 0) return admittedLabel;
  if (identity?.sub) return identity.sub;
  if (identity?.thumbprint) return `thumb:${identity.thumbprint.slice(0, 12)}`;
  if (identity?.clientName) return identity.clientName;
  return "anonymous";
}

/**
 * Assemble an {@link AgentCapabilityContext} for the current request.
 *
 * Returns `null` when the request has no agent identity at all — pure
 * user-authenticated traffic (Bearer / OAuth / local / Inspector)
 * should not flow through capability enforcement.
 *
 * Admission context is read from {@link getCurrentAAuthAdmission}
 * (lazy-imported to break a module cycle): when an `admitted` grant is
 * resolved, its capabilities and label are surfaced; otherwise the
 * caller is treated as an unrecognised agent. The capability ceiling is
 * derived from the same record by {@link capabilityCeilingFromAdmission},
 * independent of how the request authenticated.
 */
export function contextFromAgentIdentity(
  identity: AgentIdentity | null | undefined
): AgentCapabilityContext | null {
  if (!identity) return null;
  if (!identity.sub && !identity.thumbprint && !identity.clientName) {
    return null;
  }
  // Static import is fine here — request_context has no transitive
  // dependency on agent_capabilities, so there is no real cycle. We
  // call `getCurrentAAuthAdmission()` lazily on the existing AsyncLocalStorage.
  const admission = getCurrentAAuthAdmission();
  return {
    sub: identity.sub,
    iss: identity.iss,
    thumbprint: identity.thumbprint,
    tier: identity.tier,
    capabilities: admission?.admitted ? (admission.capabilities ?? []) : null,
    agentLabel: agentLabelFor(identity, admission?.agent_label),
    admitted: Boolean(admission?.admitted),
    ceiling: capabilityCeilingFromAdmission(admission),
  };
}

/** ---------- Enforcement ---------- */

function grantOpMatchesRequested(
  grantOp: AgentCapabilityOp,
  requestedOp: AgentCapabilityOp
): boolean {
  if (grantOp === requestedOp) return true;
  const storeFamily = new Set<AgentCapabilityOp>(["store", "store_structured"]);
  return storeFamily.has(grantOp) && storeFamily.has(requestedOp);
}

function entryCovers(
  caps: AgentCapabilityEntry[],
  op: AgentCapabilityOp,
  entityType: string
): boolean {
  for (const cap of caps) {
    if (!grantOpMatchesRequested(cap.op, op)) continue;
    if (cap.entity_types.includes("*")) return true;
    if (cap.entity_types.includes(entityType)) return true;
  }
  return false;
}

/**
 * Enforce capability-based authorization. Behaviour, keyed on the
 * request's {@link AgentCapabilityCeiling}:
 *
 *   1. `entityTypes` empty → no-op.
 *   2. `grant` ceiling → every `(op, entity_type)` pair must be covered
 *      by the grant's capabilities. Mismatch → throw.
 *   3. `deny` ceiling (the signature names a grant that pins no key, or
 *      that WAS pinned to a grant since revoked/suspended) → throw,
 *      whatever authenticated the request and regardless of
 *      `NEOTOMA_AGENT_DEFAULT_DENY`.
 *   4. `none` ceiling, signature-verified agent (`tier in {hardware,
 *      software, operator_attested}`) AND
 *      {@link isAgentDefaultDenyEnabled} → throw.
 *   5. Otherwise → allow (preserves legacy behaviour for unknown
 *      agents during rollout).
 *
 * Throws {@link AgentCapabilityError} on denial.
 */
export function enforceAgentCapability(
  op: AgentCapabilityOp,
  entityTypes: string[],
  ctx: AgentCapabilityContext
): void {
  if (!entityTypes || entityTypes.length === 0) return;
  const distinctTypes = Array.from(new Set(entityTypes.filter(Boolean)));
  if (distinctTypes.length === 0) return;

  const ceiling = ceilingOf(ctx);

  if (ceiling.kind === "grant") {
    const denied: string[] = [];
    for (const entityType of distinctTypes) {
      if (!entryCovers(ceiling.capabilities, op, entityType)) {
        denied.push(entityType);
      }
    }
    if (denied.length === 0) return;
    const err = new AgentCapabilityError({
      op,
      entityType: denied[0],
      agentLabel: ctx.agentLabel,
      hint:
        `Admitted agent "${ctx.agentLabel}" has no "${op}" capability for ` +
        `entity_type${denied.length > 1 ? "s" : ""} ` +
        `${denied.map((t) => `"${t}"`).join(", ")}. ` +
        `Edit the grant in Inspector → Agents → Grants and add ` +
        `{ op: "${op}", entity_types: [${denied.map((t) => `"${t}"`).join(", ")}] }.`,
    });
    logger.warn(
      JSON.stringify({
        event: "agent_capability_denied",
        reason: "entity_type_out_of_scope",
        op,
        entity_types: denied,
        agent_label: ctx.agentLabel,
        admitted: true,
      })
    );
    throw err;
  }

  if (ceiling.kind === "deny") {
    const hint =
      ceiling.reason === "grant_revoked"
        ? "This request is signed by a key that was pinned to an agent_grant " +
          "that has since been revoked, so capability-gated writes are refused. " +
          "Restore the grant to active in Inspector → Agents → Grants (or create " +
          "a new grant and pin it) before this agent can write again."
        : ceiling.reason === "grant_suspended"
          ? "This request is signed by a key that was pinned to an agent_grant " +
            "that is currently suspended, so capability-gated writes are refused. " +
            "Restore the grant to active in Inspector → Agents → Grants before " +
            "this agent can write again."
          : "This request is signed by a key that is not pinned on the agent_grant " +
            "matching its sub/iss, so the grant's capabilities cannot be applied " +
            "and capability-gated writes are refused. Set the grant's " +
            "match_thumbprint to this agent's key thumbprint (see " +
            `${GRANT_KEY_PIN_DOC}).`;
    const err = new AgentCapabilityError({
      op,
      entityType: distinctTypes[0],
      agentLabel: ctx.agentLabel,
      hint,
    });
    logger.warn(
      JSON.stringify({
        event: "agent_capability_denied",
        reason: ceiling.reason,
        op,
        entity_types: distinctTypes,
        agent_label: ctx.agentLabel,
        admitted: ctx.admitted,
      })
    );
    throw err;
  }

  // No grant applies: optionally apply default-deny for verified-signature tiers.
  const enforcedTier =
    ctx.tier === "hardware" || ctx.tier === "software" || ctx.tier === "operator_attested";
  if (!enforcedTier) return;
  if (!isAgentDefaultDenyEnabled()) return;

  const err = new AgentCapabilityError({
    op,
    entityType: distinctTypes[0],
    agentLabel: ctx.agentLabel,
    hint:
      "No active agent_grant matches this AAuth identity and " +
      "NEOTOMA_AGENT_DEFAULT_DENY is enabled. Create a grant in " +
      "Inspector → Agents → Grants for this agent or unset the env var.",
  });
  logger.warn(
    JSON.stringify({
      event: "agent_capability_denied",
      reason: "default_deny_no_match",
      op,
      entity_types: distinctTypes,
      agent_label: ctx.agentLabel,
      admitted: false,
    })
  );
  throw err;
}

/** ---------- Test/diagnostic helpers ---------- */

export function getAgentCapabilitiesSource(): string {
  return "agent_grant_entities";
}

/**
 * Enforce the `register_relationship_type` capability (#1972 / G25).
 *
 * Registering a relationship type is a governance act: it changes the set of
 * edges the instance will accept. It is therefore gated here, in the service
 * layer BEFORE any state mutation, so the MCP, HTTP and CLI surfaces inherit
 * one check rather than three — the shape
 * `services/bundles/activation.ts`'s `assertAdminGateHook` note asks for.
 *
 * Two properties, both deliberate:
 *
 *   - The relationship type is matched against `relationship_types`, a
 *     PARALLEL field, not against `entity_types`. Overloading one field to
 *     mean two vocabularies depending on the op is the ambiguity #1972 is
 *     about.
 *   - GLOBAL scope needs `"global"` in that list IN ADDITION to a type match.
 *     A grant that lets an agent register `LEASE` for itself does not let it
 *     change the vocabulary for every tenant on the instance.
 *
 * NOTE ON WHAT THIS DOES NOT DO: `register_schema` — the same defect one
 * vocabulary over — has NO authorization check at all beyond authentication,
 * and its scope is caller-chosen with `global` as the DEFAULT and the
 * unattributed branch. That is deliberately left alone here. Adding a
 * capability requirement to a tool that has never had one breaks every
 * existing caller whose grant does not name it, and deserves its own issue
 * with its own back-compat analysis. Gating only the NEW surface means it is
 * safe from day one with no migration, which is the right asymmetry.
 */
/**
 * #2482 (ux round-2 finding, PR #2511): when the refused name is one of the
 * BUILT-INs (`PART_OF`, `REFERS_TO`, ...) AND the registry is actually
 * unhealthy for that type, telling the caller to get a grant and
 * self-register is the wrong remedy — built-ins are meant to be seeded, not
 * registered by an ungranted caller, and `list_relationship_types` already
 * lazy-repairs an empty registry on read (`registry.ts`'s
 * `resolveAllWithRepair`). If a built-in still reads as missing after that,
 * the fix is an operator seed/repair, not a grant edit.
 *
 * The UX finding this fixes: the first cut of this function checked ONLY
 * built-in-name membership, so the repair-hint text was appended to EVERY
 * denial for a built-in name regardless of registry health — including the
 * ordinary, ungranted-agent, perfectly-healthy-registry case, which is the
 * single most common trigger of this denial. That sent a well-behaved agent
 * chasing a nonexistent registry investigation instead of accepting a plain
 * capability boundary. Fixed by actually checking registry health for this
 * type (`relationshipTypeRegistry.get`, which returns null only when no
 * EFFECTIVE registration exists) rather than inferring health from the name
 * alone. `get()` routes through `resolveAll` (not the repair path) — this
 * function is called AFTER `enforceRelationshipTypeCapability` has already
 * denied, at which point `list_relationship_types`/`assertRegisteredType`
 * upstream of registration would already have attempted the lazy repair for
 * this process if the registry were ever empty, so a null `get()` result here
 * reflects genuine current unavailability, not an unattempted repair.
 *
 * Computed lazily (dynamic import) to avoid a module cycle between
 * `agent_capabilities.ts` and `relationship_types/`.
 */
async function builtInRepairHint(relationshipType: string): Promise<string | null> {
  const { BUILT_IN_RELATIONSHIP_TYPES } = await import("./relationship_types/seed_registry.js");
  if (!BUILT_IN_RELATIONSHIP_TYPES.some((t) => t.relationship_type === relationshipType)) {
    return null;
  }
  const { relationshipTypeRegistry } = await import("./relationship_types/registry.js");
  const effective = await relationshipTypeRegistry.get(relationshipType);
  if (effective) {
    // Registry is healthy for this type: an ordinary grant-scope denial, not
    // a registry problem. Say nothing extra — the existing capability-denial
    // message already tells the caller the accurate, actionable next step.
    return null;
  }
  return (
    `Separately: "${relationshipType}" is a built-in relationship type that is currently missing ` +
    `from this instance's registry — call list_relationship_types to check for an ` +
    `empty_reason: "registry_unseeded" diagnostic; if present, that is a seed/registry failure ` +
    `that self-repairs on a subsequent read, and registering it here would only mask the ` +
    `underlying gap, not fix it. This is unrelated to whether your own grant covers it.`
  );
}

export function enforceRelationshipTypeCapability(
  relationshipType: string,
  scope: "user" | "global",
  ctx: AgentCapabilityContext | null
): void {
  const op: AgentCapabilityOp = "register_relationship_type";

  const ceiling = ctx ? ceilingOf(ctx) : ({ kind: "none" } as const);
  if (ctx && ceiling.kind === "grant") {
    const matching = ceiling.capabilities.filter((cap) => grantOpMatchesRequested(cap.op, op));
    const types = matching.flatMap((cap) => cap.relationship_types ?? []);
    const coversType = types.includes("*") || types.includes(relationshipType);
    const coversGlobal = types.includes("global");

    if (!coversType || (scope === "global" && !coversGlobal)) {
      const missing = !coversType
        ? `relationship_types: ["${relationshipType}"]`
        : `relationship_types: ["${relationshipType}", "global"]`;
      const err = new AgentCapabilityError({
        op,
        entityType: relationshipType,
        agentLabel: ctx.agentLabel,
        hint:
          `Admitted agent "${ctx.agentLabel}" may not register relationship type ` +
          `"${relationshipType}"${scope === "global" ? " at global scope" : ""}. ` +
          `Edit the grant in Inspector → Agents → Grants and add ` +
          `{ op: "${op}", entity_types: [], ${missing} }.`,
      });
      logger.warn(
        JSON.stringify({
          event: "agent_capability_denied",
          reason: coversType ? "global_scope_not_granted" : "relationship_type_out_of_scope",
          op,
          relationship_type: relationshipType,
          scope,
          agent_label: ctx.agentLabel,
          admitted: true,
        })
      );
      throw err;
    }
    return;
  }

  // Governance registration is always grant-gated, independent of rollout flags.
  throw new AgentCapabilityError({
    op,
    entityType: relationshipType,
    agentLabel: ctx?.agentLabel ?? "unattributed",
    hint:
      "Relationship type registration requires an active agent_grant with the " +
      "register_relationship_type capability. Global scope additionally requires global permission.",
  });
}

/**
 * Async wrapper around `enforceRelationshipTypeCapability` that appends the
 * built-in-aware repair hint to a thrown `AgentCapabilityError`'s message
 * ONLY when the refused name is a built-in AND the registry is currently
 * unhealthy for it (#2482; corrected per ux round-2 review on PR #2511 —
 * see `builtInRepairHint`'s doc for what the first cut got wrong). An
 * ordinary grant-scope denial on a perfectly healthy built-in type is left
 * exactly as `enforceRelationshipTypeCapability` produced it, with nothing
 * appended. Callers on a path that can await (MCP/REST
 * `register_relationship_type` handlers) should prefer this;
 * `enforceRelationshipTypeCapability` itself stays synchronous for callers
 * that cannot.
 */
export async function enforceRelationshipTypeCapabilityWithHint(
  relationshipType: string,
  scope: "user" | "global",
  ctx: AgentCapabilityContext | null
): Promise<void> {
  try {
    enforceRelationshipTypeCapability(relationshipType, scope, ctx);
  } catch (err) {
    if (err instanceof AgentCapabilityError) {
      const repairHint = await builtInRepairHint(relationshipType);
      if (repairHint) {
        throw new AgentCapabilityError({
          op: err.op,
          entityType: err.entityType,
          agentLabel: err.agentLabel,
          hint: `${err.hint} ${repairHint}`,
        });
      }
    }
    throw err;
  }
}
