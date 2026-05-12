/**
 * Entity-type access policy service.
 *
 * Controls guest (external agent) write and read access on a per-entity-type
 * basis. This is complementary to the per-agent grant system: grants whitelist
 * specific agents, while access policies define what any authenticated guest
 * can do with a given entity_type.
 *
 * Modes (most restrictive to most open):
 *   - closed (default)       — no guest access
 *   - read_only              — guests can read, cannot write
 *   - submit_only            — guests can write, cannot read
 *   - submitter_scoped       — guests can write and read only their own
 *   - open                   — guests can write and read everything
 *
 * Configuration resolution order (highest priority first):
 *   1. Env var NEOTOMA_ACCESS_POLICY_<ENTITY_TYPE_UPPERCASED>=<mode>
 *   2. SchemaMetadata.guest_access_policy on the active schema row
 *   3. Persisted config file (deprecated fallback)
 *   4. Default: closed
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "../utils/logger.js";

export type AccessPolicyMode =
  | "closed"
  | "read_only"
  | "submit_only"
  | "submitter_scoped"
  | "open";

const VALID_MODES = new Set<AccessPolicyMode>([
  "closed",
  "read_only",
  "submit_only",
  "submitter_scoped",
  "open",
]);

const DEFAULT_MODE: AccessPolicyMode = "closed";

export interface AccessPolicyMap {
  [entityType: string]: AccessPolicyMode;
}

export type AccessPolicySource =
  | "env"
  | "schema_metadata"
  | "config_file"
  | "default";

export interface AccessPolicyResolution {
  mode: AccessPolicyMode;
  source: AccessPolicySource;
}

export interface AccessPolicyEntry extends AccessPolicyResolution {
  entity_type: string;
}

function configFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".config", "neotoma", "config.json");
}

interface ConfigShape {
  access_policies?: AccessPolicyMap;
  [k: string]: unknown;
}

async function readConfig(): Promise<ConfigShape> {
  try {
    const raw = await fs.readFile(configFilePath(), "utf8");
    return JSON.parse(raw) as ConfigShape;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeConfig(cfg: ConfigShape): Promise<void> {
  const p = configFilePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), "utf8");
}

function parseMode(raw: string | undefined): AccessPolicyMode | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase() as AccessPolicyMode;
  return VALID_MODES.has(normalized) ? normalized : null;
}

function setIfNonDefault(
  entries: Record<string, AccessPolicyEntry>,
  entityType: string,
  mode: AccessPolicyMode,
  source: AccessPolicySource,
): void {
  if (mode === DEFAULT_MODE) {
    delete entries[entityType];
    return;
  }
  entries[entityType] = { entity_type: entityType, mode, source };
}

/**
 * Load all effective non-default access policies with their winning source.
 *
 * Precedence per key: env var > schema metadata > config file.
 */
export async function loadAccessPolicyEntries(): Promise<Record<string, AccessPolicyEntry>> {
  const entries: Record<string, AccessPolicyEntry> = {};

  // 1. Config file (deprecated fallback; lowest explicit priority)
  const cfg = await readConfig();
  const stored = cfg.access_policies ?? {};
  for (const [entityType, mode] of Object.entries(stored)) {
    if (VALID_MODES.has(mode)) {
      setIfNonDefault(entries, entityType, mode, "config_file");
    }
  }

  // 2. Schema metadata (canonical source; overrides deprecated config)
  try {
    const { SchemaRegistryService } = await import("./schema_registry.js");
    const registry = new SchemaRegistryService();
    const allSchemas = await registry.listActiveSchemas();
    for (const schema of allSchemas) {
      const policy = schema.metadata?.guest_access_policy;
      if (policy && VALID_MODES.has(policy as AccessPolicyMode)) {
        setIfNonDefault(
          entries,
          schema.entity_type,
          policy as AccessPolicyMode,
          "schema_metadata",
        );
      }
    }
  } catch {
    // Schema registry unavailable; continue with other sources
  }

  // 3. Env vars (highest priority)
  const envPrefix = "NEOTOMA_ACCESS_POLICY_";
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(envPrefix) && value) {
      const entityType = key.slice(envPrefix.length).toLowerCase();
      const mode = parseMode(value);
      if (mode) {
        setIfNonDefault(entries, entityType, mode, "env");
      }
    }
  }

  return entries;
}

/**
 * Load all effective non-default access policies.
 *
 * Precedence per key: env var > schema metadata > config file.
 */
export async function loadAccessPolicies(): Promise<AccessPolicyMap> {
  const entries = await loadAccessPolicyEntries();
  return Object.fromEntries(
    Object.entries(entries).map(([entityType, entry]) => [entityType, entry.mode]),
  );
}

/**
 * Resolve the access policy for a specific entity type.
 *
 * Precedence: env var > schema metadata > config file (deprecated) > default.
 */
export async function resolveAccessPolicyWithSource(
  entityType: string,
): Promise<AccessPolicyResolution> {
  // 1. Env var override (highest priority — operator escape hatch)
  const envKey = `NEOTOMA_ACCESS_POLICY_${entityType.toUpperCase()}`;
  const envMode = parseMode(process.env[envKey]);
  if (envMode) return { mode: envMode, source: "env" };

  // 2. SchemaMetadata.guest_access_policy on the active schema row
  try {
    const { SchemaRegistryService } = await import("./schema_registry.js");
    const registry = new SchemaRegistryService();
    const schema = await registry.loadGlobalSchema(entityType);
    const metaPolicy = schema?.metadata?.guest_access_policy;
    if (metaPolicy && VALID_MODES.has(metaPolicy as AccessPolicyMode)) {
      return { mode: metaPolicy as AccessPolicyMode, source: "schema_metadata" };
    }
  } catch {
    // Schema registry unavailable (e.g. tests, early bootstrap); fall through
  }

  // 3. Config file (deprecated fallback)
  const cfg = await readConfig();
  const stored = cfg.access_policies?.[entityType];
  if (stored && VALID_MODES.has(stored)) {
    logger.warn(
      JSON.stringify({
        event: "access_policy_deprecated_config_file",
        entity_type: entityType,
        mode: stored,
        hint: "Move guest_access_policy to SchemaMetadata via: neotoma access set " + entityType + " " + stored,
      }),
    );
    return { mode: stored, source: "config_file" };
  }

  return { mode: DEFAULT_MODE, source: "default" };
}

export async function resolveAccessPolicy(entityType: string): Promise<AccessPolicyMode> {
  const resolution = await resolveAccessPolicyWithSource(entityType);
  return resolution.mode;
}

/**
 * Set the access policy for an entity type in persisted config.
 */
export async function setAccessPolicy(
  entityType: string,
  mode: AccessPolicyMode,
): Promise<void> {
  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `Invalid access policy mode "${mode}". Valid modes: ${Array.from(VALID_MODES).join(", ")}`,
    );
  }
  const cfg = await readConfig();
  if (!cfg.access_policies) cfg.access_policies = {};
  cfg.access_policies[entityType] = mode;
  await writeConfig(cfg);
}

/**
 * Reset the access policy for an entity type (removes from config, defaults to closed).
 */
export async function resetAccessPolicy(entityType: string): Promise<void> {
  const cfg = await readConfig();
  if (cfg.access_policies) {
    delete cfg.access_policies[entityType];
    await writeConfig(cfg);
  }
}

/**
 * Batch-set multiple entity types to the same mode.
 */
export async function setAccessPolicies(
  entityTypes: string[],
  mode: AccessPolicyMode,
): Promise<void> {
  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `Invalid access policy mode "${mode}". Valid modes: ${Array.from(VALID_MODES).join(", ")}`,
    );
  }
  const cfg = await readConfig();
  if (!cfg.access_policies) cfg.access_policies = {};
  for (const entityType of entityTypes) {
    cfg.access_policies[entityType] = mode;
  }
  await writeConfig(cfg);
}

/**
 * Batch-reset multiple entity types to default (closed).
 */
export async function resetAccessPolicies(entityTypes: string[]): Promise<void> {
  const cfg = await readConfig();
  if (cfg.access_policies) {
    for (const entityType of entityTypes) {
      delete cfg.access_policies[entityType];
    }
    await writeConfig(cfg);
  }
}

export interface GuestIdentity {
  thumbprint?: string;
  sub?: string;
  iss?: string;
  accessToken?: string;
}

export type GuestOp = "store" | "retrieve";

export interface AccessPolicyDecision {
  allowed: boolean;
  mode: AccessPolicyMode;
  reason: string;
  scopeFilter?: "submitter_only";
}

/**
 * Enforce access policy for a guest operation on a set of entity types.
 *
 * Returns a decision per entity_type. Callers should check `allowed` and,
 * for retrieve operations, apply `scopeFilter` when present.
 */
export async function enforceGuestAccess(
  op: GuestOp,
  entityTypes: string[],
  _identity: GuestIdentity,
): Promise<Map<string, AccessPolicyDecision>> {
  const decisions = new Map<string, AccessPolicyDecision>();

  for (const entityType of entityTypes) {
    const mode = await resolveAccessPolicy(entityType);
    decisions.set(entityType, evaluatePolicy(op, mode));
  }

  return decisions;
}

function evaluatePolicy(op: GuestOp, mode: AccessPolicyMode): AccessPolicyDecision {
  switch (mode) {
    case "closed":
      return { allowed: false, mode, reason: "entity_type_closed" };

    case "read_only":
      if (op === "retrieve") {
        return { allowed: true, mode, reason: "read_only_allows_reads" };
      }
      return { allowed: false, mode, reason: "read_only_denies_writes" };

    case "submit_only":
      if (op === "store") {
        return { allowed: true, mode, reason: "submit_only_allows_writes" };
      }
      return { allowed: false, mode, reason: "submit_only_denies_reads" };

    case "submitter_scoped":
      if (op === "store") {
        return { allowed: true, mode, reason: "submitter_scoped_allows_writes" };
      }
      return {
        allowed: true,
        mode,
        reason: "submitter_scoped_allows_scoped_reads",
        scopeFilter: "submitter_only",
      };

    case "open":
      return { allowed: true, mode, reason: "open_allows_all" };

    default:
      return { allowed: false, mode: "closed", reason: "unknown_mode_defaults_closed" };
  }
}

/**
 * Check whether a guest write is allowed for ALL entity types in a batch.
 * Returns true if every entity_type in the batch permits writes.
 * Throws with a structured error if any type denies.
 */
export async function assertGuestWriteAllowed(
  entityTypes: string[],
  identity: GuestIdentity,
): Promise<void> {
  const decisions = await enforceGuestAccess("store", entityTypes, identity);

  decisions.forEach((decision, entityType) => {
    if (!decision.allowed) {
      const err = new AccessPolicyError({
        op: "store",
        entityType,
        mode: decision.mode,
        reason: decision.reason,
      });
      logger.warn(
        JSON.stringify({
          event: "access_policy_denied",
          op: "store",
          entity_type: entityType,
          mode: decision.mode,
          reason: decision.reason,
        }),
      );
      throw err;
    }
  });
}

/**
 * Determine read access for a guest on a specific entity type.
 * Returns the decision including any scope filter to apply.
 */
export async function resolveGuestReadAccess(
  entityType: string,
  identity: GuestIdentity,
): Promise<AccessPolicyDecision> {
  const decisions = await enforceGuestAccess("retrieve", [entityType], identity);
  return decisions.get(entityType)!;
}

export class AccessPolicyError extends Error {
  readonly code = "access_policy_denied" as const;
  readonly statusCode = 403;
  readonly op: GuestOp;
  readonly entityType: string;
  readonly mode: AccessPolicyMode;
  readonly policyReason: string;

  constructor(params: {
    op: GuestOp;
    entityType: string;
    mode: AccessPolicyMode;
    reason: string;
  }) {
    super(
      `Access policy "${params.mode}" for entity_type "${params.entityType}" ` +
        `denies "${params.op}" for guest callers.`,
    );
    this.name = "AccessPolicyError";
    this.op = params.op;
    this.entityType = params.entityType;
    this.mode = params.mode;
    this.policyReason = params.reason;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    op: GuestOp;
    entity_type: string;
    mode: AccessPolicyMode;
    reason: string;
    hint: string;
  } {
    return {
      code: this.code,
      message: this.message,
      op: this.op,
      entity_type: this.entityType,
      mode: this.mode,
      reason: this.policyReason,
      hint:
        `Entity type "${this.entityType}" has access policy "${this.mode}" which ` +
        `does not allow guest "${this.op}". Ask the instance operator to update ` +
        `the policy with: neotoma access set ${this.entityType} <mode>`,
    };
  }
}

/** Entity types that form the GitHub Issues submission surface. */
export const ISSUE_SUBMISSION_ENTITY_TYPES = [
  "issue",
  "conversation",
  "conversation_message",
] as const;

export { VALID_MODES, DEFAULT_MODE };
