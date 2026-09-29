/**
 * Schema-driven derived entity extraction.
 *
 * When a schema declares `derived_entities`, this service evaluates each rule
 * against the stored payload and, for every matching rule, creates a new
 * derived entity and links it to the source entity.
 *
 * This is the schema-agnostic replacement for hardcoded "if entity_type ===
 * 'email' and direction === 'outbound', create a task" branches.
 * See `docs/foundation/schema_agnostic_design_rules.md`.
 */

import { logger } from "../utils/logger.js";
import type { SchemaDefinition } from "./schema_registry.js";

export interface DerivedEntityExtractionParams {
  entityId: string;
  entityType: string;
  fields: Record<string, unknown>;
  schema: SchemaDefinition | null | undefined;
  userId: string;
  sourceId?: string;
  idempotencyKey: string;
}

export interface DerivedEntityExtractionResult {
  created: number;
  skipped: number;
  details: Array<{
    rule_index: number;
    derived_entity_type: string;
    derived_entity_id: string | null;
    created: boolean;
    skip_reason?: string;
  }>;
}

/**
 * Evaluate a single condition against a payload.
 *
 * Exported for unit testing.
 */
export function evaluateCondition(
  condition: NonNullable<SchemaDefinition["derived_entities"]>[number]["conditions"][number],
  payload: Record<string, unknown>
): boolean {
  const rawValue = payload[condition.field];

  switch (condition.op) {
    case "present":
      return rawValue != null && rawValue !== "" && rawValue !== false;

    case "absent":
      return rawValue == null || rawValue === "" || rawValue === false;

    case "eq":
      return rawValue === condition.value;

    case "neq":
      return rawValue !== condition.value;

    case "matches_any_pattern": {
      if (!condition.patterns || condition.patterns.length === 0) return false;
      const strValue = typeof rawValue === "string" ? rawValue : null;
      if (!strValue) return false;
      const lc = strValue.toLowerCase();
      return condition.patterns.some((pattern) => {
        try {
          // Treat pattern as a RegExp source string first; fall back to
          // substring match if RegExp construction fails.
          const re = new RegExp(pattern, "i");
          return re.test(strValue);
        } catch {
          return lc.includes(pattern.toLowerCase());
        }
      });
    }

    default:
      return false;
  }
}

/**
 * Resolve a single derived field value from the rule declaration.
 *
 * Exported for unit testing.
 */
export function resolveDerivedField(
  spec: { value: unknown } | { template: string },
  sourceFields: Record<string, unknown>
): unknown {
  if ("value" in spec) {
    return spec.value;
  }
  // Template: replace {{fieldName}} with the source entity's field value.
  return spec.template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = sourceFields[key];
    return v != null ? String(v) : "";
  });
}

/**
 * Evaluate all derived-entity rules for the given stored entity and create
 * each matching derived entity. Failures are non-fatal.
 */
export async function extractDerivedEntities(
  params: DerivedEntityExtractionParams
): Promise<DerivedEntityExtractionResult> {
  const result: DerivedEntityExtractionResult = { created: 0, skipped: 0, details: [] };

  const rules = params.schema?.derived_entities;
  if (!rules || rules.length === 0) return result;

  const { storeStructuredForApi } = await import("../actions.js");
  const { relationshipsService } = await import("./relationships.js");

  for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
    const rule = rules[ruleIdx];

    // Evaluate all conditions; all must pass.
    const conditionsMet = rule.conditions.every((cond) => evaluateCondition(cond, params.fields));

    if (!conditionsMet) {
      result.skipped++;
      result.details.push({
        rule_index: ruleIdx,
        derived_entity_type: rule.derived_entity_type,
        derived_entity_id: null,
        created: false,
        skip_reason: "conditions_not_met",
      });
      continue;
    }

    // Build the derived entity fields.
    const derivedFields: Record<string, unknown> = {
      entity_type: rule.derived_entity_type,
    };
    for (const [fieldName, spec] of Object.entries(rule.derived_fields)) {
      derivedFields[fieldName] = resolveDerivedField(spec, params.fields);
    }

    try {
      // Re-use the main store path so all schema validation, observation
      // creation, snapshot computation, and relationship auto-linking apply
      // uniformly to the derived entity.
      const derivedIdempotencyKey = `${params.idempotencyKey}:derived:${ruleIdx}`;

      const storeResult = await storeStructuredForApi({
        userId: params.userId,
        entities: [derivedFields],
        sourcePriority: 100,
        observationSource: "workflow_state",
        idempotencyKey: derivedIdempotencyKey,
      });

      const derivedEntityId = storeResult.entities?.[0]?.entity_id ?? null;

      if (derivedEntityId) {
        // Link source entity → derived entity.
        const relationshipType = (rule.relationship_type ??
          "REFERS_TO") as import("./relationships.js").RelationshipType;
        await relationshipsService.createRelationship({
          relationship_type: relationshipType,
          source_entity_id: params.entityId,
          target_entity_id: derivedEntityId,
          source_id: params.sourceId,
          metadata: {
            auto_derived: true,
            derived_rule_index: ruleIdx,
            derived_from_entity_type: params.entityType,
          },
          user_id: params.userId,
        });

        result.created++;
        result.details.push({
          rule_index: ruleIdx,
          derived_entity_type: rule.derived_entity_type,
          derived_entity_id: derivedEntityId,
          created: true,
        });
      } else {
        result.skipped++;
        result.details.push({
          rule_index: ruleIdx,
          derived_entity_type: rule.derived_entity_type,
          derived_entity_id: null,
          created: false,
          skip_reason: "store_returned_no_entity_id",
        });
      }
    } catch (err) {
      result.skipped++;
      result.details.push({
        rule_index: ruleIdx,
        derived_entity_type: rule.derived_entity_type,
        derived_entity_id: null,
        created: false,
        skip_reason: err instanceof Error ? err.message : String(err),
      });
      logger.warn(
        `[SCHEMA_DERIVED] Failed to extract derived entity (rule ${ruleIdx}) ` +
          `from ${params.entityType}/${params.entityId}: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
