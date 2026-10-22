/** Atomic admission through the existing schema registry and native transaction. */
import type { DbConnection } from "../repositories/db/driver.js";
import type { SchemaDefinition } from "./schema_registry.js";
import {
  assertAcceptedIdentityDefinition,
  createAcceptedIdentityBinding,
  EntityIdentityContractError,
  type AcceptedIdentityBinding,
} from "./entity_identity_contract.js";

export async function prepareIdentityRegistration(
  tx: DbConnection,
  params: {
    id: string;
    entityType: string;
    scope: "global" | "user";
    userId: string | null;
    definition: SchemaDefinition;
    tenantScopedEntityIds: boolean;
    activate: boolean;
  }
): Promise<AcceptedIdentityBinding | undefined> {
  const rows = (await tx
    .prepare("SELECT * FROM schema_registry WHERE entity_type = ?")
    .all(params.entityType)) as Array<Record<string, unknown>>;
  const overlapping = rows.filter(
    (row) =>
      row.scope == null ||
      row.scope === "global" ||
      params.scope === "global" ||
      row.user_id === params.userId
  );
  const accepted = overlapping.filter((row) => row.identity_binding != null);
  if (!params.definition.identity_contract && !accepted.length) return undefined;
  if (!params.definition.identity_contract)
    throw new EntityIdentityContractError(
      "The accepted exact identity declaration cannot be removed."
    );
  if (params.activate)
    throw new EntityIdentityContractError(
      "Exact identity activation is unavailable until all identity consumers support the accepted declaration."
    );
  if (accepted.length) {
    const raw = accepted[0].identity_binding;
    const binding = (typeof raw === "string" ? JSON.parse(raw) : raw) as AcceptedIdentityBinding;
    if (
      accepted.some((row) => row.identity_binding !== raw) ||
      binding.scope !== params.scope ||
      binding.user_id !== params.userId
    )
      throw new EntityIdentityContractError("The accepted identity scope is immutable.");
    assertAcceptedIdentityDefinition(binding, params.definition);
    return binding;
  }
  const occupied = await tx
    .prepare(
      "SELECT id FROM entities WHERE entity_type = ? AND (? = 'global' OR user_id IS ? OR user_id IS NULL) LIMIT 1"
    )
    .get(params.entityType, params.scope, params.userId);
  if (overlapping.length || occupied)
    throw new EntityIdentityContractError(
      "Exact identity admission requires a fresh schema namespace."
    );
  return createAcceptedIdentityBinding({
    anchorSchemaId: params.id,
    entityType: params.entityType,
    scope: params.scope,
    userId: params.userId,
    tenantScopedEntityIds: params.tenantScopedEntityIds,
    contract: params.definition.identity_contract,
  });
}

/** Inactive admission is a reservation, never permission to use legacy folding. */
export async function assertIdentityResolutionAvailable(
  tx: DbConnection,
  entityType: string,
  userId?: string | null
): Promise<void> {
  const rows = (await tx
    .prepare("SELECT * FROM schema_registry WHERE entity_type = ?")
    .all(entityType)) as Array<Record<string, unknown>>;
  if (
    rows.some(
      (row) =>
        row.identity_binding != null &&
        (row.scope === "global" || row.user_id === userId || !userId)
    )
  )
    throw new EntityIdentityContractError(
      "The accepted exact identity namespace is not active; legacy identity fallback is unavailable."
    );
}
