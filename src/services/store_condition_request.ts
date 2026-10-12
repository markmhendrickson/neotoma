/** Pure shape gate shared by public store facades, before either leg can write. */
import { canonicalStoreRequest, StoreConditionError } from "./store_condition_keys.js";

export function assertConditionalStoreRequest(
  input: Record<string, unknown>,
  originalEntities?: unknown
): void {
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
  // Preserve explicit own nulls that a record parser may omit. The original
  // values must still be finite plain JSON; active schema, identity, policy
  // and constraint validation remain inside the conditional transaction.
  if (originalEntities !== undefined) {
    canonicalStoreRequest(originalEntities);
    if (!Array.isArray(originalEntities) || originalEntities.length !== 1)
      throw new StoreConditionError("VALIDATION_ERROR", "Conditional entities must match.");
    const original = originalEntities[0];
    if (!original || typeof original !== "object" || Array.isArray(original))
      throw new StoreConditionError("VALIDATION_ERROR", "A conditional entity must be an object.");
    const entity = { ...((input.entities as unknown[])[0] as Record<string, unknown>) };
    for (const [name, value] of Object.entries(original)) {
      if (value === null && !Object.hasOwn(entity, name))
        Object.defineProperty(entity, name, {
          value: null,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    input.entities = [entity];
  }
  canonicalStoreRequest(input.entities);
  const entity = (input.entities as unknown[])[0] as Record<string, unknown>;
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
