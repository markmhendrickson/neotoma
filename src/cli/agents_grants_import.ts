/**
 * `neotoma agents grants import` — one-shot migration command.
 *
 * Reads the legacy capability registry from
 *   1. `NEOTOMA_AGENT_CAPABILITIES_JSON` (raw JSON string)
 *   2. `NEOTOMA_AGENT_CAPABILITIES_FILE` (path to a JSON file)
 *   3. `config/agent_capabilities.default.json` (repo default)
 * and upserts each entry as an `agent_grant` entity owned by the supplied
 * `--owner-user-id`. The agent_grant entity_type is the new source of
 * truth — see docs/subsystems/agent_attribution_integration.md.
 *
 * Idempotent: rerunning the command after a partial migration finds the
 * existing grant for `(match_sub, match_iss, match_thumbprint)` and
 * updates label / capabilities in place via `correct` observations.
 *
 * Stamps each created or updated grant with
 * `import_source: "env_config"` so the audit history clearly shows the
 * migration origin.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  type AgentCapabilityAgent,
  type AgentCapabilityEntry,
  type AgentCapabilityOp,
} from "../services/agent_capabilities.js";
import {
  createGrant,
  listGrantsForUser,
  updateGrantFields,
  type AgentGrant,
  type AgentGrantDraft,
} from "../services/agent_grants.js";

export type ImportOutcome =
  | { kind: "created"; grant: AgentGrant; label: string }
  | { kind: "updated"; grant: AgentGrant; label: string; changed: string[] }
  | { kind: "skipped"; reason: string; label: string };

export interface ImportResult {
  source: "json" | "file" | "default" | "none";
  source_detail?: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  outcomes: ImportOutcome[];
}

interface RegistryFile {
  agents?: Record<string, AgentCapabilityAgent> | AgentCapabilityAgent[];
  default_deny?: boolean;
}

const ALLOWED_OPS: ReadonlySet<AgentCapabilityOp> = new Set([
  "store_structured",
  "create_relationship",
  "correct",
  "retrieve",
]);

/**
 * Resolve the legacy registry payload from the documented inputs.
 * Returns `null` when none of the env vars / repo config are present
 * (caller decides whether that is an error or a no-op).
 */
async function loadLegacyRegistry(repoRoot: string): Promise<{
  source: "json" | "file" | "default";
  source_detail: string;
  raw: string;
} | null> {
  const inlineJson = process.env.NEOTOMA_AGENT_CAPABILITIES_JSON?.trim();
  if (inlineJson && inlineJson.length > 0) {
    return {
      source: "json",
      source_detail: "NEOTOMA_AGENT_CAPABILITIES_JSON",
      raw: inlineJson,
    };
  }
  const filePath = process.env.NEOTOMA_AGENT_CAPABILITIES_FILE?.trim();
  if (filePath && filePath.length > 0) {
    const raw = await readFile(filePath, "utf-8");
    return {
      source: "file",
      source_detail: filePath,
      raw,
    };
  }
  const defaultPath = path.join(repoRoot, "config", "agent_capabilities.default.json");
  try {
    const raw = await readFile(defaultPath, "utf-8");
    return {
      source: "default",
      source_detail: defaultPath,
      raw,
    };
  } catch {
    return null;
  }
}

function coerceAgents(parsed: unknown): AgentCapabilityAgent[] {
  if (!parsed || typeof parsed !== "object") return [];
  const file = parsed as RegistryFile;
  const agents = file.agents;
  if (Array.isArray(agents)) {
    return agents.filter((a): a is AgentCapabilityAgent => Boolean(a && a.match));
  }
  if (agents && typeof agents === "object") {
    return Object.values(agents).filter((a): a is AgentCapabilityAgent => Boolean(a && a.match));
  }
  return [];
}

function normalizeCapabilities(input: unknown): AgentCapabilityEntry[] {
  if (!Array.isArray(input)) return [];
  const out: AgentCapabilityEntry[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const op = e.op;
    const types = e.entity_types;
    if (typeof op !== "string" || !ALLOWED_OPS.has(op as AgentCapabilityOp)) continue;
    if (!Array.isArray(types) || types.length === 0) continue;
    const normalized = Array.from(
      new Set(
        types
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim())
      )
    );
    if (normalized.length === 0) continue;
    out.push({ op: op as AgentCapabilityOp, entity_types: normalized });
  }
  return out;
}

function deriveLabel(name: string | undefined, agent: AgentCapabilityAgent): string {
  if (name && name.trim().length > 0) return name.trim();
  if (agent.match.sub) return agent.match.sub;
  if (agent.match.thumbprint) return `thumb:${agent.match.thumbprint.slice(0, 12)}`;
  return "imported_agent";
}

function findExistingGrant(
  grants: AgentGrant[],
  agent: AgentCapabilityAgent
): AgentGrant | undefined {
  const sub = agent.match.sub?.trim() || null;
  const iss = agent.match.iss?.trim() || null;
  const thumbprint = agent.match.thumbprint?.trim() || null;
  return grants.find((g) => {
    if (thumbprint && g.match_thumbprint && thumbprint === g.match_thumbprint) {
      return true;
    }
    if (sub && g.match_sub && sub === g.match_sub) {
      const gIss = g.match_iss ?? null;
      if (!iss && !gIss) return true;
      if (iss && gIss && iss === gIss) return true;
    }
    return false;
  });
}

function capabilitiesEqual(a: AgentCapabilityEntry[], b: AgentCapabilityEntry[]): boolean {
  if (a.length !== b.length) return false;
  const stringify = (cap: AgentCapabilityEntry) =>
    JSON.stringify({ op: cap.op, entity_types: [...cap.entity_types].sort() });
  const aKeys = a.map(stringify).sort();
  const bKeys = b.map(stringify).sort();
  return aKeys.every((k, i) => k === bKeys[i]);
}

export interface ImportOptions {
  ownerUserId: string;
  repoRoot?: string;
}

/**
 * Run the migration. The caller is expected to have validated the
 * `ownerUserId` exists; we treat the value as opaque to avoid a heavy
 * users-table dependency from the CLI.
 */
export async function runAgentsGrantsImport(options: ImportOptions): Promise<ImportResult> {
  const ownerUserId = options.ownerUserId.trim();
  if (!ownerUserId) {
    throw new Error("--owner-user-id is required");
  }
  const repoRoot = options.repoRoot ?? process.cwd();
  const loaded = await loadLegacyRegistry(repoRoot);
  if (!loaded) {
    return {
      source: "none",
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      outcomes: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.raw);
  } catch (err) {
    throw new Error(
      `Failed to parse capability registry from ${loaded.source_detail}: ${(err as Error).message}`
    );
  }
  const agentsByName = (() => {
    const file = parsed as RegistryFile;
    if (file && typeof file === "object" && file.agents && !Array.isArray(file.agents)) {
      return file.agents;
    }
    return null;
  })();
  const agents = coerceAgents(parsed);
  const result: ImportResult = {
    source: loaded.source,
    source_detail: loaded.source_detail,
    total: agents.length,
    created: 0,
    updated: 0,
    skipped: 0,
    outcomes: [],
  };
  if (agents.length === 0) {
    return result;
  }

  const existingGrants = await listGrantsForUser(ownerUserId, { status: "all" });

  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i];
    const knownName = agentsByName
      ? Object.entries(agentsByName).find(([, value]) => value === agent)?.[0]
      : undefined;
    const label = deriveLabel(knownName, agent);
    const sub = agent.match.sub?.trim();
    const thumbprint = agent.match.thumbprint?.trim();
    if (!sub && !thumbprint) {
      result.skipped += 1;
      result.outcomes.push({
        kind: "skipped",
        reason: "match requires at least one of sub or thumbprint",
        label,
      });
      continue;
    }
    const capabilities = normalizeCapabilities(agent.capabilities);
    const existing = findExistingGrant(existingGrants, agent);
    try {
      if (!existing) {
        const draft: AgentGrantDraft = {
          label,
          capabilities,
          status: "active",
          match_sub: agent.match.sub ?? null,
          match_iss: agent.match.iss ?? null,
          match_thumbprint: agent.match.thumbprint ?? null,
          import_source: "env_config",
        };
        const grant = await createGrant(ownerUserId, draft);
        result.created += 1;
        result.outcomes.push({ kind: "created", grant, label });
        existingGrants.push(grant);
      } else {
        const changed: string[] = [];
        const updates: Parameters<typeof updateGrantFields>[2] = {};
        if (existing.label !== label) {
          updates.label = label;
          changed.push("label");
        }
        if (!capabilitiesEqual(existing.capabilities, capabilities)) {
          updates.capabilities = capabilities;
          changed.push("capabilities");
        }
        if (changed.length === 0) {
          result.skipped += 1;
          result.outcomes.push({
            kind: "skipped",
            reason: "no fields differ",
            label,
          });
          continue;
        }
        const grant = await updateGrantFields(ownerUserId, existing.grant_id, updates);
        result.updated += 1;
        result.outcomes.push({ kind: "updated", grant, label, changed });
      }
    } catch (err) {
      result.skipped += 1;
      result.outcomes.push({
        kind: "skipped",
        reason: (err as Error).message,
        label,
      });
    }
  }

  return result;
}

/**
 * Format an {@link ImportResult} for human-readable CLI output.
 */
export function formatImportResult(result: ImportResult): string {
  const lines: string[] = [];
  if (result.source === "none") {
    lines.push("No legacy capability registry was found.");
    lines.push(
      "Checked: NEOTOMA_AGENT_CAPABILITIES_JSON, NEOTOMA_AGENT_CAPABILITIES_FILE, config/agent_capabilities.default.json."
    );
    return lines.join("\n");
  }
  lines.push(
    `Loaded registry from ${result.source}${result.source_detail ? ` (${result.source_detail})` : ""}.`
  );
  lines.push(
    `Total: ${result.total}  Created: ${result.created}  Updated: ${result.updated}  Skipped: ${result.skipped}`
  );
  for (const outcome of result.outcomes) {
    if (outcome.kind === "created") {
      lines.push(`  + created  ${outcome.label}  → ${outcome.grant.grant_id}`);
    } else if (outcome.kind === "updated") {
      lines.push(
        `  ~ updated  ${outcome.label}  (${outcome.changed.join(", ")})  → ${outcome.grant.grant_id}`
      );
    } else {
      lines.push(`  - skipped  ${outcome.label}  (${outcome.reason})`);
    }
  }
  return lines.join("\n");
}
