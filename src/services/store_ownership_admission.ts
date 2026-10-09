/** Read-only ownership refusal before fresh legacy claims or raw storage. */
import { EntityOwnerConflictError, resolveEntityWithTrace } from "./entity_resolution.js";
import { schemaRegistry } from "./schema_registry.js";
import type { StructuredStoreApiParams } from "./store_admission.js";

export async function preflightStructuredStoreOwnership(
  params: StructuredStoreApiParams,
  surface: "rest" | "mcp" = "rest"
): Promise<void> {
  const issues = [];
  for (const [observation_index, entity] of params.entities.entries()) {
    let entityType = (entity.entity_type as string) || (entity.type as string) || "generic";
    // Mirror REST's existing canonical type collapse; do not change a failed
    // equivalence/derivation into a new legacy refusal.
    if (surface === "rest") {
      try {
        if (!(await schemaRegistry.loadActiveSchema(entityType, params.userId))) {
          const { findEquivalentEntityType } = await import("./entity_type_equivalence.js");
          const match = await findEquivalentEntityType(entityType, { userId: params.userId });
          if (match) entityType = match.canonical_entity_type;
        }
      } catch {
        /* The original resolution pass retains its existing handling. */
      }
    }
    const fields = { ...entity };
    delete fields.entity_type;
    delete fields.type;
    delete fields.target_id;
    if (surface === "rest") delete fields.intent;
    else delete fields.schema_version;
    try {
      // commit:false skips both new-row insertion and unowned-row adoption.
      await resolveEntityWithTrace({
        entityType,
        fields,
        userId: params.userId,
        targetId: typeof entity.target_id === "string" ? entity.target_id : undefined,
        strict: params.strict === true || (surface === "rest" && entity.intent === "create_new"),
        commit: false,
      });
    } catch (error) {
      if (!(error instanceof EntityOwnerConflictError)) continue;
      if (surface === "mcp") throw error;
      issues.push({
        observation_index,
        entity_type: entityType,
        code: error.code,
        message: error.message,
        details: { entity_id: error.entityId },
      });
    }
  }
  if (issues.length) {
    throw Object.assign(
      new Error(`Structured store refused: ${issues.length} observation(s) failed resolution.`),
      { code: "ERR_STORE_RESOLUTION_FAILED", issues }
    );
  }
}
