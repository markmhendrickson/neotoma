/**
 * Agent capability registry — per-agent, per-entity-type authorization.
 *
 * This layer sits **above** {@link enforceAttributionPolicy} (which gates by
 * {@link AttributionTier}) and **below** ordinary user auth. Where the
 * attribution policy asks "is this write attributable at all?", the
 * capability registry asks "is *this* specific agent allowed to touch
 * *this* specific entity_type via *this* operation?".
 *
 * Use cases:
 *   - Scope the agent-site Netlify forwarder (sub `agent-site@neotoma.io`)
 *     to write only `neotoma_feedback` entities — not observations for
 *     arbitrary entity types, not corrections of unrelated records.
 *   - Give partner agents read-only access to a single entity type.
 *   - Preserve today's behaviour for unscoped agents (humans, general MCP
 *     clients) so rollout is additive.
 *
 * Configuration sources (resolved in priority order, most specific wins):
 *   1. `NEOTOMA_AGENT_CAPABILITIES_JSON` — inline JSON registry.
 *   2. `NEOTOMA_AGENT_CAPABILITIES_FILE` — path to a JSON registry file.
 *   3. `config/agent_capabilities.default.json` — committed default (if
 *      present and readable from the process cwd).
 *
 * Enforcement is gated by `NEOTOMA_AGENT_CAPABILITIES_ENFORCE`:
 *   - `true`  — deny on mismatch (throws {@link AgentCapabilityError}).
 *   - anything else — observe-only (logs would-be-denials, returns allow).
 *
 * Pure module, no DB/network access. Callers inject context explicitly so
 * tests can exercise every branch.
 */

import fs from "node:fs";
import path from "node:path";
import type { AttributionTier } from "../crypto/agent_identity.js";
import { logger } from "../utils/logger.js";

/**
 * Canonical operation identifier. Mirrors the top-level MCP/REST entry
 * points that touch durable Neotoma state.
 */
export type AgentCapabilityOp =
  | "store_structured"
  | "create_relationship"
  | "correct"
  | "retrieve";

/**
 * Context describing the acting agent on this request. Populated from the
 * resolved {@link AgentIdentity} in the active request context.
 */
export interface AgentCapabilityContext {
  sub?: string;
  iss?: string;
  thumbprint?: string;
  tier: AttributionTier;
}

export interface AgentCapabilityEntry {
  op: AgentCapabilityOp;
  /** Allowed entity types for this op. `"*"` widens to any entity_type. */
  entity_types: string[];
}

export interface AgentCapabilityMatch {
  /** Match by AAuth `sub` claim. */
  sub?: string;
  /** Optional AAuth `iss` claim — when set, both `sub` AND `iss` must match. */
  iss?: string;
  /** Match by RFC 7638 JWK thumbprint. */
  thumbprint?: string;
}

export interface AgentCapabilityAgent {
  match: AgentCapabilityMatch;
  capabilities: AgentCapabilityEntry[];
}

export interface AgentCapabilityRegistry {
  /**
   * Keyed by agent label (human-readable). Only matters for logs and
   * registry admin — matching is performed via `match` fields.
   */
  agents: Record<string, AgentCapabilityAgent>;
  /**
   * When true, any AAuth-verified agent whose identity does NOT match an
   * entry in `agents` is denied. Defaults to `false` so rollout is
   * additive: unknown agents keep their pre-plan behaviour.
   */
  default_deny?: boolean;
}

/** Empty registry — every agent falls through to attribution policy. */
export const EMPTY_REGISTRY: AgentCapabilityRegistry = { agents: {} };

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

function isAllowedOp(value: unknown): value is AgentCapabilityOp {
  return (
    value === "store_structured" ||
    value === "create_relationship" ||
    value === "correct" ||
    value === "retrieve"
  );
}

function parseRegistryFromJson(raw: string): AgentCapabilityRegistry | null {
  try {
    const parsed = JSON.parse(raw);
    return coerceRegistry(parsed);
  } catch {
    return null;
  }
}

function coerceRegistry(input: unknown): AgentCapabilityRegistry | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const agentsRaw = obj.agents;
  if (!agentsRaw || typeof agentsRaw !== "object" || Array.isArray(agentsRaw)) {
    return null;
  }
  const agents: Record<string, AgentCapabilityAgent> = {};
  for (const [label, entryRaw] of Object.entries(
    agentsRaw as Record<string, unknown>,
  )) {
    if (!entryRaw || typeof entryRaw !== "object") continue;
    const entry = entryRaw as Record<string, unknown>;
    const matchRaw = entry.match as Record<string, unknown> | undefined;
    if (!matchRaw || typeof matchRaw !== "object") continue;
    const match: AgentCapabilityMatch = {};
    if (typeof matchRaw.sub === "string") match.sub = matchRaw.sub;
    if (typeof matchRaw.iss === "string") match.iss = matchRaw.iss;
    if (typeof matchRaw.thumbprint === "string") {
      match.thumbprint = matchRaw.thumbprint;
    }
    if (!match.sub && !match.thumbprint) {
      // No usable match key — skip silently; an administrator can fix.
      continue;
    }
    const capsRaw = entry.capabilities;
    if (!Array.isArray(capsRaw)) continue;
    const capabilities: AgentCapabilityEntry[] = [];
    for (const capRaw of capsRaw) {
      if (!capRaw || typeof capRaw !== "object") continue;
      const cap = capRaw as Record<string, unknown>;
      if (!isAllowedOp(cap.op)) continue;
      if (!Array.isArray(cap.entity_types)) continue;
      const entityTypes = cap.entity_types.filter(
        (t): t is string => typeof t === "string" && t.length > 0,
      );
      if (entityTypes.length === 0) continue;
      capabilities.push({ op: cap.op, entity_types: entityTypes });
    }
    if (capabilities.length === 0) continue;
    agents[label] = { match, capabilities };
  }
  const registry: AgentCapabilityRegistry = { agents };
  if (obj.default_deny === true) registry.default_deny = true;
  return registry;
}

let cachedRegistry: AgentCapabilityRegistry | null = null;
let cachedRegistrySource: string | null = null;

/**
 * Load and cache the registry from env. Returns an empty registry when no
 * configuration is present so callers never need null-guards.
 *
 * Exposed as a thin layer so tests can reset the cache with
 * {@link resetAgentCapabilitiesCache} between runs.
 */
export function loadAgentCapabilities(): AgentCapabilityRegistry {
  if (cachedRegistry) return cachedRegistry;

  const jsonEnv = process.env.NEOTOMA_AGENT_CAPABILITIES_JSON;
  if (jsonEnv) {
    const parsed = parseRegistryFromJson(jsonEnv);
    if (parsed) {
      cachedRegistry = parsed;
      cachedRegistrySource = "NEOTOMA_AGENT_CAPABILITIES_JSON";
      return cachedRegistry;
    }
    logger.warn(
      JSON.stringify({
        event: "agent_capabilities_parse_failed",
        source: "NEOTOMA_AGENT_CAPABILITIES_JSON",
      }),
    );
  }

  const fileEnv = process.env.NEOTOMA_AGENT_CAPABILITIES_FILE;
  if (fileEnv) {
    try {
      const resolved = path.isAbsolute(fileEnv)
        ? fileEnv
        : path.resolve(process.cwd(), fileEnv);
      const body = fs.readFileSync(resolved, "utf-8");
      const parsed = parseRegistryFromJson(body);
      if (parsed) {
        cachedRegistry = parsed;
        cachedRegistrySource = `file:${resolved}`;
        return cachedRegistry;
      }
    } catch (err) {
      logger.warn(
        JSON.stringify({
          event: "agent_capabilities_file_read_failed",
          source: fileEnv,
          error: (err as Error).message,
        }),
      );
    }
  }

  // Committed default — opportunistic, ignore if absent.
  try {
    const defaultPath = path.resolve(
      process.cwd(),
      "config/agent_capabilities.default.json",
    );
    if (fs.existsSync(defaultPath)) {
      const body = fs.readFileSync(defaultPath, "utf-8");
      const parsed = parseRegistryFromJson(body);
      if (parsed) {
        cachedRegistry = parsed;
        cachedRegistrySource = `file:${defaultPath}`;
        return cachedRegistry;
      }
    }
  } catch {
    // fall through
  }

  cachedRegistry = EMPTY_REGISTRY;
  cachedRegistrySource = "empty";
  return cachedRegistry;
}

/** Test/runtime hook to drop the cached registry. */
export function resetAgentCapabilitiesCache(): void {
  cachedRegistry = null;
  cachedRegistrySource = null;
}

/** Diagnostic: which config source built the active registry. */
export function getAgentCapabilitiesSource(): string {
  if (!cachedRegistry) loadAgentCapabilities();
  return cachedRegistrySource ?? "empty";
}

/**
 * Whether enforcement actually rejects. When `false` (observe-only), the
 * check still logs would-be denials so operators can soak the change.
 */
export function isAgentCapabilitiesEnforced(): boolean {
  const raw = process.env.NEOTOMA_AGENT_CAPABILITIES_ENFORCE;
  if (!raw) return false;
  const normalised = raw.trim().toLowerCase();
  return normalised === "true" || normalised === "1" || normalised === "yes";
}

/** Find the registry entry (if any) matching this context. */
export function findMatchingAgent(
  registry: AgentCapabilityRegistry,
  ctx: AgentCapabilityContext,
): { label: string; agent: AgentCapabilityAgent } | null {
  // Thumbprint pin wins over sub so a rotated JWT issuer cannot quietly
  // change scope against a pinned key.
  if (ctx.thumbprint) {
    for (const [label, agent] of Object.entries(registry.agents)) {
      if (agent.match.thumbprint === ctx.thumbprint) {
        return { label, agent };
      }
    }
  }
  if (ctx.sub) {
    for (const [label, agent] of Object.entries(registry.agents)) {
      if (agent.match.sub !== ctx.sub) continue;
      if (agent.match.iss && agent.match.iss !== ctx.iss) continue;
      return { label, agent };
    }
  }
  return null;
}

function agentHasCapability(
  agent: AgentCapabilityAgent,
  op: AgentCapabilityOp,
  entityType: string,
): boolean {
  for (const cap of agent.capabilities) {
    if (cap.op !== op) continue;
    if (cap.entity_types.includes("*")) return true;
    if (cap.entity_types.includes(entityType)) return true;
  }
  return false;
}

function agentLabelFor(ctx: AgentCapabilityContext): string {
  if (ctx.sub) return ctx.sub;
  if (ctx.thumbprint) return `thumb:${ctx.thumbprint.slice(0, 12)}`;
  return "anonymous";
}

/**
 * Enforce capability-based authorization for an operation touching one or
 * more entity types. Rules:
 *
 * 1. If `entityTypes` is empty the call is a no-op (nothing to gate).
 * 2. If the registry has no matching agent for this context:
 *    - `default_deny === true` AND `tier in {hardware, software}` → deny
 *      (the caller is an AAuth-verified agent we do not recognise).
 *    - otherwise → allow (preserves legacy behaviour).
 * 3. If a matching agent is found, every entity_type must be covered by a
 *    `{op, entity_types}` capability on that agent.
 *
 * When {@link isAgentCapabilitiesEnforced} returns `false`, denials are
 * logged but never thrown — useful for a soak period.
 */
export function enforceAgentCapability(
  op: AgentCapabilityOp,
  entityTypes: string[],
  ctx: AgentCapabilityContext,
): void {
  if (!entityTypes || entityTypes.length === 0) return;
  const registry = loadAgentCapabilities();
  const distinctTypes = Array.from(new Set(entityTypes.filter(Boolean)));
  if (distinctTypes.length === 0) return;

  const match = findMatchingAgent(registry, ctx);
  const enforced = isAgentCapabilitiesEnforced();

  if (!match) {
    if (
      registry.default_deny &&
      (ctx.tier === "hardware" || ctx.tier === "software")
    ) {
      const err = new AgentCapabilityError({
        op,
        entityType: distinctTypes[0],
        agentLabel: agentLabelFor(ctx),
        hint:
          "No capability grant found for this agent. Add an entry to the " +
          "agent capability registry or set default_deny=false.",
      });
      logger.warn(
        JSON.stringify({
          event: "agent_capability_denied",
          enforced,
          reason: "default_deny_no_match",
          op,
          entity_types: distinctTypes,
          agent_label: err.agentLabel,
        }),
      );
      if (enforced) throw err;
    }
    return;
  }

  const denied: string[] = [];
  for (const entityType of distinctTypes) {
    if (!agentHasCapability(match.agent, op, entityType)) {
      denied.push(entityType);
    }
  }

  if (denied.length === 0) return;

  const err = new AgentCapabilityError({
    op,
    entityType: denied[0],
    agentLabel: match.label,
    hint:
      `Agent "${match.label}" is registered but has no "${op}" capability ` +
      `for entity_type${denied.length > 1 ? "s" : ""} ` +
      `${denied.map((t) => `"${t}"`).join(", ")}. Grant it in the ` +
      "capability registry if intentional.",
  });

  logger.warn(
    JSON.stringify({
      event: "agent_capability_denied",
      enforced,
      reason: "entity_type_out_of_scope",
      op,
      entity_types: denied,
      agent_label: match.label,
    }),
  );

  if (enforced) throw err;
}

/**
 * Pull an {@link AgentCapabilityContext} out of the current request's
 * AgentIdentity. Returns null when there is no useful identity — callers
 * should skip capability enforcement in that case (attribution policy
 * handles anonymous writes).
 */
export function contextFromAgentIdentity(
  identity:
    | {
        sub?: string;
        iss?: string;
        thumbprint?: string;
        tier: AttributionTier;
      }
    | null
    | undefined,
): AgentCapabilityContext | null {
  if (!identity) return null;
  if (!identity.sub && !identity.thumbprint) return null;
  return {
    sub: identity.sub,
    iss: identity.iss,
    thumbprint: identity.thumbprint,
    tier: identity.tier,
  };
}
