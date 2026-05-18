/**
 * Plural entity-type repair service — detects and resolves plural entity_type
 * names in the schema registry and entities table.
 *
 * Two repair modes for plural types:
 *
 *   1. Singular sibling exists: merge entities from the plural type into the
 *      singular type using the existing merge infrastructure, then mark the
 *      plural schema inactive.
 *
 *   2. No singular sibling: register a new schema for the singular name with
 *      the plural name recorded in aliases, leaving existing data in place
 *      (no entity moves required — the plural schema stays active until
 *      explicitly migrated by the operator).
 *
 * Dry-run by default. Pass dryRun: false to write changes.
 *
 * See entity_type_guard.ts for the naming rules (suggestSingular, etc.).
 */

import { db } from "../db.js";
import { checkPluralEntityType, suggestSingular } from "./entity_type_guard.js";
import { schemaRegistry } from "./schema_registry.js";
import { mergeEntities } from "./entity_merge.js";
import { logger } from "../utils/logger.js";

export interface PluralTypeAuditEntry {
  plural_type: string;
  suggested_singular: string;
  /** "merge" when a singular sibling exists; "alias" when it must be created */
  strategy: "merge" | "alias";
  /** Entity IDs of plural-type entities, grouped by user_id. */
  entity_groups: Array<{ user_id: string; entity_ids: string[] }>;
  /** Entity IDs of singular-type entities (merge target), grouped by user_id. */
  singular_entity_groups: Array<{ user_id: string; entity_ids: string[] }>;
}

export interface PluralTypeRepairResult {
  plural_type: string;
  strategy: "merge" | "alias";
  /** Number of entities merged into the singular type (merge strategy). */
  entities_merged: number;
  /** New schema registered (alias strategy). */
  alias_schema_registered: boolean;
  errors: string[];
}

export interface PluralTypeRepairRunResult {
  plural_types_found: number;
  plural_types_repaired: number;
  total_entities_merged: number;
  alias_schemas_registered: number;
  entries: PluralTypeRepairResult[];
  errors: string[];
}

/** Identify all plural entity types currently in the schema registry. */
export async function auditPluralTypes(): Promise<PluralTypeAuditEntry[]> {
  const schemas = await schemaRegistry.listActiveSchemas();
  const registeredTypes = new Set(schemas.map((s) => s.entity_type));

  const entries: PluralTypeAuditEntry[] = [];

  for (const schema of schemas) {
    const guardResult = checkPluralEntityType(schema.entity_type);
    if (guardResult.reason !== "looks_plural") continue;

    const singular = suggestSingular(schema.entity_type);
    if (!singular) continue;
    // Skip if suggestSingular returns the same name (shouldn't happen but guard anyway)
    if (singular === schema.entity_type.toLowerCase()) continue;

    const strategy: "merge" | "alias" = registeredTypes.has(singular) ? "merge" : "alias";

    // Fetch entities of the plural type grouped by user_id
    const { data: pluralEntities } = await (db
      .from("entities")
      .select("id, user_id")
      .eq("entity_type", schema.entity_type)
      .is("merged_to_entity_id", null) as any);

    const entityGroups = groupByUserId(pluralEntities ?? []);

    // Fetch entities of the singular type grouped by user_id (merge targets)
    let singularEntityGroups: Array<{ user_id: string; entity_ids: string[] }> = [];
    if (strategy === "merge") {
      const { data: singularEntities } = await (db
        .from("entities")
        .select("id, user_id")
        .eq("entity_type", singular)
        .is("merged_to_entity_id", null) as any);
      singularEntityGroups = groupByUserId(singularEntities ?? []);
    }

    entries.push({
      plural_type: schema.entity_type,
      suggested_singular: singular,
      strategy,
      entity_groups: entityGroups,
      singular_entity_groups: singularEntityGroups,
    });
  }

  return entries;
}

function groupByUserId(
  rows: Array<{ id: string; user_id: string | null }>
): Array<{ user_id: string; entity_ids: string[] }> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const uid = row.user_id ?? "00000000-0000-0000-0000-000000000000";
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid)!.push(row.id);
  }
  return Array.from(map.entries()).map(([user_id, entity_ids]) => ({ user_id, entity_ids }));
}

/**
 * Repair a single plural type entry (dry-run safe).
 *
 * merge strategy: for each entity in the plural type, attempts to find a
 * canonical merge target in the singular type (first entity of the same user).
 * If no entity exists in the singular type for that user, a new entity is NOT
 * created — the plural entity is left in place and reported as a skipped merge.
 *
 * alias strategy: registers a new schema for the singular name with the plural
 * name in aliases. The plural schema remains active; no entity data is moved.
 */
export async function repairPluralType(
  entry: PluralTypeAuditEntry,
  dryRun: boolean
): Promise<PluralTypeRepairResult> {
  const result: PluralTypeRepairResult = {
    plural_type: entry.plural_type,
    strategy: entry.strategy,
    entities_merged: 0,
    alias_schema_registered: false,
    errors: [],
  };

  if (entry.strategy === "merge") {
    // Build a user_id → first-singular-entity map
    const singularTarget = new Map<string, string>();
    for (const group of entry.singular_entity_groups) {
      if (group.entity_ids.length > 0) {
        singularTarget.set(group.user_id, group.entity_ids[0]);
      }
    }

    for (const group of entry.entity_groups) {
      const toId = singularTarget.get(group.user_id);
      if (!toId) {
        // No singular entity exists for this user; skip (no data to merge into)
        logger.warn(
          `[PLURAL_TYPE_REPAIR] No singular entity of type "${entry.suggested_singular}" ` +
            `found for user ${group.user_id}; skipping ${group.entity_ids.length} entity(-ies) ` +
            `of type "${entry.plural_type}"`
        );
        continue;
      }

      for (const fromId of group.entity_ids) {
        if (fromId === toId) continue; // already the same entity
        if (dryRun) {
          result.entities_merged += 1;
          continue;
        }
        try {
          await mergeEntities({
            fromEntityId: fromId,
            toEntityId: toId,
            userId: group.user_id,
            mergeReason: `plural-type repair: "${entry.plural_type}" merged into "${entry.suggested_singular}"`,
            mergedBy: "neotoma/plural-type-repair",
          });
          result.entities_merged += 1;
        } catch (err) {
          const msg = `merge ${fromId} → ${toId}: ${(err as Error).message}`;
          result.errors.push(msg);
          logger.warn(`[PLURAL_TYPE_REPAIR] ${msg}`);
        }
      }
    }
  } else {
    // alias strategy: register singular schema with plural listed in aliases
    if (!dryRun) {
      try {
        const pluralSchema = await schemaRegistry.loadActiveSchema(entry.plural_type);
        const baseDefinition = pluralSchema?.schema_definition ?? { fields: {} };
        const singularDefinition = {
          ...baseDefinition,
          aliases: [
            ...(baseDefinition.aliases ?? []),
            entry.plural_type,
          ],
          // singular types should declare identity_opt_out if the plural had it
          ...(baseDefinition.identity_opt_out
            ? { identity_opt_out: baseDefinition.identity_opt_out }
            : !baseDefinition.canonical_name_fields
              ? { identity_opt_out: "heuristic_canonical_name" as const }
              : {}),
        };

        await schemaRegistry.register({
          entity_type: entry.suggested_singular,
          schema_version: "1.0",
          schema_definition: singularDefinition,
          reducer_config: pluralSchema?.reducer_config ?? { merge_policies: {} },
          activate: true,
          force: false, // singular name passes the guard
        });
        result.alias_schema_registered = true;
      } catch (err) {
        const msg = `register singular schema "${entry.suggested_singular}": ${(err as Error).message}`;
        result.errors.push(msg);
        logger.warn(`[PLURAL_TYPE_REPAIR] ${msg}`);
      }
    } else {
      // dry-run: just report that we would register the alias
      result.alias_schema_registered = true;
    }
  }

  return result;
}

/**
 * Audit and (optionally) repair all plural entity types.
 * @param dryRun When true, report changes but write nothing. Default: true.
 */
export async function repairAllPluralTypes(
  dryRun = true
): Promise<PluralTypeRepairRunResult> {
  const runResult: PluralTypeRepairRunResult = {
    plural_types_found: 0,
    plural_types_repaired: 0,
    total_entities_merged: 0,
    alias_schemas_registered: 0,
    entries: [],
    errors: [],
  };

  const entries = await auditPluralTypes();
  runResult.plural_types_found = entries.length;

  for (const entry of entries) {
    const repairResult = await repairPluralType(entry, dryRun);
    runResult.entries.push(repairResult);

    if (repairResult.errors.length === 0) {
      runResult.plural_types_repaired += 1;
    } else {
      runResult.errors.push(...repairResult.errors);
    }

    runResult.total_entities_merged += repairResult.entities_merged;
    if (repairResult.alias_schema_registered) {
      runResult.alias_schemas_registered += 1;
    }
  }

  return runResult;
}
