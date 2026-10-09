/** Pure shape gate shared by public store facades, before either leg can write. */
import { canonicalStoreRequest, StoreConditionError } from "./store_condition_keys.js";

export function assertConditionalStoreRequest(input: Record<string, unknown>): void {
  const flag = input.expected_entity_absent;
  if (flag !== undefined && typeof flag !== "boolean")
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "The absent-entity condition must be boolean."
    );
  if (flag !== true) return;
  if (
    input.commit === false ||
    !Array.isArray(input.entities) ||
    input.entities.length !== 1 ||
    typeof input.idempotency_key !== "string" ||
    !input.idempotency_key.length ||
    [
      "relationships",
      "interpretation",
      "interpretation_source_id",
      "file_content",
      "file_path",
      "file_idempotency_key",
      "mime_type",
      "source_peer_id",
      "intake",
    ].some((key) => input[key] !== undefined) ||
    input.source_storage === "reference"
  )
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires one keyed structured entity and no file, reference, interpretation, relationship or sync operation."
    );
  const entity = input.entities[0] as Record<string, unknown>;
  canonicalStoreRequest(entity);
  if (
    !entity ||
    typeof entity !== "object" ||
    Array.isArray(entity) ||
    typeof entity.entity_type !== "string" ||
    !entity.entity_type ||
    Object.hasOwn(entity, "target_id") ||
    Object.hasOwn(entity, "intent")
  )
    throw new StoreConditionError(
      "VALIDATION_ERROR",
      "Conditional store requires a declared entity type and identity without target or intent overrides."
    );
}
