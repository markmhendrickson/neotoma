/**
 * CLI implementation for `neotoma access` commands.
 *
 * Subcommands:
 *   set <entity_type> <mode>  -- Set access policy for an entity type
 *   list                      -- Show all configured access policies
 *   reset <entity_type>       -- Reset an entity type to default (closed)
 *   enable-issues             -- Shortcut: set issue/conversation/conversation_message to submitter_scoped
 *   disable-issues            -- Shortcut: reset all three to closed
 */

import {
  loadAccessPolicyEntries,
  resolveAccessPolicyWithSource,
  setAccessPolicy,
  resetAccessPolicy,
  ISSUE_SUBMISSION_ENTITY_TYPES,
  VALID_MODES,
  DEFAULT_MODE,
  type AccessPolicyResolution,
  type AccessPolicyMode,
} from "../services/access_policy.js";

export interface AccessSetOpts {
  json?: boolean;
}

export interface AccessListOpts {
  json?: boolean;
}

export interface AccessResetOpts {
  json?: boolean;
}

export interface AccessIssuesOpts {
  json?: boolean;
}

function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else if (typeof data === "string") {
    process.stdout.write(data + "\n");
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

/**
 * Try to write guest_access_policy to SchemaMetadata via the registry.
 * Falls back to the config-file path with a deprecation warning when the
 * schema registry is unavailable or the schema doesn't exist.
 */
async function setViaMetadata(entityType: string, mode: AccessPolicyMode): Promise<void> {
  try {
    const { SchemaRegistryService } = await import("../services/schema_registry.js");
    const registry = new SchemaRegistryService();
    await registry.updateMetadata(entityType, { guest_access_policy: mode });
  } catch {
    process.stderr.write(
      `Warning: Could not update SchemaMetadata for "${entityType}"; ` +
        `falling back to config file (deprecated).\n`,
    );
    await setAccessPolicy(entityType, mode);
  }
}

async function resetViaMetadata(entityType: string): Promise<AccessPolicyResolution> {
  await resetAccessPolicy(entityType);
  try {
    const { SchemaRegistryService } = await import("../services/schema_registry.js");
    const registry = new SchemaRegistryService();
    const schema = await registry.loadGlobalSchema(entityType);
    if (schema) {
      await registry.updateMetadata(entityType, { guest_access_policy: DEFAULT_MODE });
    }
  } catch {
    // Config fallback has already been removed; unresolved schemas now use the default.
  }
  return await resolveAccessPolicyWithSource(entityType);
}

export async function accessSet(
  entityType: string,
  mode: string,
  opts: AccessSetOpts,
): Promise<void> {
  if (!VALID_MODES.has(mode as AccessPolicyMode)) {
    const msg = `Invalid mode "${mode}". Valid modes: ${Array.from(VALID_MODES).join(", ")}`;
    if (opts.json) {
      output({ error: msg }, true);
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
    process.exitCode = 1;
    return;
  }

  await setViaMetadata(entityType, mode as AccessPolicyMode);

  if (opts.json) {
    output({ entity_type: entityType, mode, status: "set" }, true);
  } else {
    process.stdout.write(`Access policy for "${entityType}" set to "${mode}".\n`);
  }
}

export async function accessList(opts: AccessListOpts): Promise<void> {
  const entriesByType = await loadAccessPolicyEntries();
  const policies = Object.fromEntries(
    Object.entries(entriesByType).map(([entityType, entry]) => [entityType, entry.mode]),
  );

  if (opts.json) {
    output({ policies, default_mode: DEFAULT_MODE }, true);
    return;
  }

  const entries = Object.entries(policies);
  if (entries.length === 0) {
    process.stdout.write(
      `No access policies configured. All entity types default to "${DEFAULT_MODE}".\n`,
    );
    return;
  }

  process.stdout.write("Configured access policies:\n");
  for (const [entityType, policyMode] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
    const source = entriesByType[entityType]?.source;
    const suffix = source ? ` (${source})` : "";
    process.stdout.write(`  ${entityType}: ${policyMode}${suffix}\n`);
  }
  process.stdout.write(`\nUnconfigured types default to "${DEFAULT_MODE}".\n`);
}

export async function accessReset(
  entityType: string,
  opts: AccessResetOpts,
): Promise<void> {
  const effective = await resetViaMetadata(entityType);

  if (opts.json) {
    output({
      entity_type: entityType,
      mode: DEFAULT_MODE,
      status: "reset",
      effective_mode: effective.mode,
      effective_source: effective.source,
    }, true);
  } else {
    if (effective.mode === DEFAULT_MODE) {
      process.stdout.write(
        `Access policy for "${entityType}" reset to default ("${DEFAULT_MODE}").\n`,
      );
    } else {
      process.stdout.write(
        `Access policy for "${entityType}" reset, but effective policy remains ` +
          `"${effective.mode}" from ${effective.source}.\n`,
      );
    }
  }
}

export async function accessEnableIssues(opts: AccessIssuesOpts): Promise<void> {
  const mode: AccessPolicyMode = "submitter_scoped";
  for (const et of ISSUE_SUBMISSION_ENTITY_TYPES) {
    await setViaMetadata(et, mode);
  }

  if (opts.json) {
    output({
      entity_types: [...ISSUE_SUBMISSION_ENTITY_TYPES],
      mode,
      status: "set",
    }, true);
  } else {
    process.stdout.write(
      `Access policies set to "${mode}" for: ${ISSUE_SUBMISSION_ENTITY_TYPES.join(", ")}.\n` +
        "External agents can now submit issues to this instance.\n",
    );
  }
}

export async function accessDisableIssues(opts: AccessIssuesOpts): Promise<void> {
  for (const et of ISSUE_SUBMISSION_ENTITY_TYPES) {
    await resetViaMetadata(et);
  }

  if (opts.json) {
    output({
      entity_types: [...ISSUE_SUBMISSION_ENTITY_TYPES],
      mode: DEFAULT_MODE,
      status: "reset",
    }, true);
  } else {
    process.stdout.write(
      `Access policies reset to "${DEFAULT_MODE}" for: ${ISSUE_SUBMISSION_ENTITY_TYPES.join(", ")}.\n` +
        "External agents can no longer submit issues to this instance.\n",
    );
  }
}
