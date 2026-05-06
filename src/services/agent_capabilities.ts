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

/**
 * Canonical operation identifier. Mirrors the top-level MCP/REST entry
 * points that touch durable Neotoma state.
 */
export type AgentCapabilityOp =
  | "store"
  | "store_structured"
  | "create_relationship"
  | "correct"
  | "retrieve";

export interface AgentCapabilityEntry {
  op: AgentCapabilityOp;
  /** Allowed entity types for this op. `"*"` widens to any entity_type. */
  entity_types: string[];
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
 * Acting agent on the current request. Built from the resolved
 * {@link AgentIdentity}, possibly enriched by the admission service.
 *
 * `capabilities` is non-null only when the request was admitted via an
 * `agent_grant` — otherwise the registry has no information about
 * this caller and {@link enforceAgentCapability} relies on
 * `default_deny` to decide.
 */
export interface AgentCapabilityContext {
  sub?: string;
  iss?: string;
  thumbprint?: string;
  tier: AttributionTier;
  capabilities: AgentCapabilityEntry[] | null;
  agentLabel: string;
  admitted: boolean;
}

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
        `entity_type "${params.entityType}".`,
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
  readonly migrationCommand =
    "neotoma agents grants import --owner-user-id <user_id>";

  constructor(variables: string[]) {
    super(
      "NEOTOMA_AGENT_CAPABILITIES_* environment variables are no longer " +
        "supported. Capabilities are now stored on agent_grant entities. " +
        `Run \`${"neotoma agents grants import --owner-user-id <user_id>"}\` ` +
        "once before this release, then unset these variables: " +
        variables.join(", ") +
        ".",
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
export function assertNoLegacyCapabilityEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
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

function agentLabelFor(
  identity: AgentIdentity | null | undefined,
  admittedLabel?: string,
): string {
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
 * caller is treated as an unrecognised agent.
 */
export function contextFromAgentIdentity(
  identity: AgentIdentity | null | undefined,
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
    capabilities: admission?.admitted ? admission.capabilities ?? [] : null,
    agentLabel: agentLabelFor(identity, admission?.agent_label),
    admitted: Boolean(admission?.admitted),
  };
}

/** ---------- Enforcement ---------- */

function grantOpMatchesRequested(grantOp: AgentCapabilityOp, requestedOp: AgentCapabilityOp): boolean {
  if (grantOp === requestedOp) return true;
  const storeFamily = new Set<AgentCapabilityOp>(["store", "store_structured"]);
  return storeFamily.has(grantOp) && storeFamily.has(requestedOp);
}

function entryCovers(
  caps: AgentCapabilityEntry[],
  op: AgentCapabilityOp,
  entityType: string,
): boolean {
  for (const cap of caps) {
    if (!grantOpMatchesRequested(cap.op, op)) continue;
    if (cap.entity_types.includes("*")) return true;
    if (cap.entity_types.includes(entityType)) return true;
  }
  return false;
}

/**
 * Enforce capability-based authorization. Behaviour:
 *
 *   1. `entityTypes` empty → no-op.
 *   2. Admitted agent → every `(op, entity_type)` pair must be covered
 *      by the grant's capabilities. Mismatch → throw.
 *   3. Unadmitted but signature-verified agent (`tier in {hardware,
 *      software, operator_attested}`) AND
 *      {@link isAgentDefaultDenyEnabled} → throw.
 *   4. Otherwise → allow (preserves legacy behaviour for unknown
 *      agents during rollout).
 *
 * Throws {@link AgentCapabilityError} on denial.
 */
export function enforceAgentCapability(
  op: AgentCapabilityOp,
  entityTypes: string[],
  ctx: AgentCapabilityContext,
): void {
  if (!entityTypes || entityTypes.length === 0) return;
  const distinctTypes = Array.from(new Set(entityTypes.filter(Boolean)));
  if (distinctTypes.length === 0) return;

  if (ctx.admitted && ctx.capabilities) {
    const denied: string[] = [];
    for (const entityType of distinctTypes) {
      if (!entryCovers(ctx.capabilities, op, entityType)) {
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
        `{ op: "${op}", entity_types: [${denied
          .map((t) => `"${t}"`)
          .join(", ")}] }.`,
    });
    logger.warn(
      JSON.stringify({
        event: "agent_capability_denied",
        reason: "entity_type_out_of_scope",
        op,
        entity_types: denied,
        agent_label: ctx.agentLabel,
        admitted: true,
      }),
    );
    throw err;
  }

  // Unadmitted: optionally apply default-deny for verified-signature tiers.
  const enforcedTier =
    ctx.tier === "hardware" ||
    ctx.tier === "software" ||
    ctx.tier === "operator_attested";
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
    }),
  );
  throw err;
}

/** ---------- Test/diagnostic helpers ---------- */

export function getAgentCapabilitiesSource(): string {
  return "agent_grant_entities";
}
