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
    const binding = identityObject(raw) as unknown as AcceptedIdentityBinding;
    if (
      accepted.some((row) => row.identity_binding !== raw) ||
      binding.scope !== params.scope ||
      binding.user_id !== params.userId
    )
      throw new EntityIdentityContractError("The accepted identity scope is immutable.");
    const acceptedState = await loadAcceptedIdentityState(tx, params.entityType, params.userId);
    if (!acceptedState || JSON.stringify(acceptedState.binding) !== JSON.stringify(binding))
      throw new EntityIdentityContractError("Accepted identity history is unavailable or invalid.");
    assertAcceptedIdentityDefinition(acceptedState.binding, params.definition);
    return acceptedState.binding;
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

export interface AcceptedIdentityState {
  binding: AcceptedIdentityBinding;
  definition: SchemaDefinition;
  schemaId: string;
  schemaVersion: string;
  active: boolean;
}

function identityObject(value: unknown): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new EntityIdentityContractError("Accepted identity bytes are unavailable or invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new EntityIdentityContractError("Accepted identity bytes are unavailable or invalid.");
  return parsed as Record<string, unknown>;
}

function freezeIdentity<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeIdentity(child);
    Object.freeze(value);
  }
  return value;
}

/** Reopen from original native registry rows, including inactive anchors. */
export async function loadAcceptedIdentityState(
  tx: DbConnection,
  entityType: string,
  userId?: string | null
): Promise<AcceptedIdentityState | null> {
  const rows = (await tx
    .prepare(
      "SELECT * FROM schema_registry WHERE entity_type = ? AND (scope IS NULL OR scope = 'global' OR (scope = 'user' AND user_id = ?))"
    )
    .all(entityType, userId ?? null)) as Array<Record<string, unknown>>;
  const accepted: Array<{
    row: Record<string, unknown>;
    definition: SchemaDefinition;
    binding: AcceptedIdentityBinding;
  }> = [];
  for (const row of rows) {
    let definition: SchemaDefinition;
    if (row.identity_binding == null) {
      // Preserve historical legacy fallback; an explicit exact declaration may
      // never disappear behind an absent admission receipt.
      try {
        definition = identityObject(row.schema_definition) as unknown as SchemaDefinition;
      } catch {
        if (
          typeof row.schema_definition === "string" &&
          row.schema_definition.includes('"identity_contract"')
        )
          throw new EntityIdentityContractError(
            "Accepted identity bytes are unavailable or invalid."
          );
        continue;
      }
      if (definition.identity_contract !== undefined)
        throw new EntityIdentityContractError(
          "Exact identity declaration has no accepted binding."
        );
      continue;
    }
    definition = identityObject(row.schema_definition) as unknown as SchemaDefinition;
    const binding = identityObject(row.identity_binding) as unknown as AcceptedIdentityBinding;
    assertAcceptedIdentityDefinition(binding, definition);
    if (
      binding.entity_type !== entityType ||
      binding.scope !== row.scope ||
      binding.user_id !== row.user_id ||
      typeof row.id !== "string" ||
      typeof row.schema_version !== "string" ||
      ![true, false, 0, 1].includes(row.active as boolean | number)
    )
      throw new EntityIdentityContractError(
        "Accepted identity scope or schema metadata is invalid."
      );
    accepted.push({ row, definition, binding });
  }
  if (!accepted.length) return null;
  const binding = accepted[0].binding;
  if (
    accepted.length !== rows.length ||
    accepted.some((entry) => JSON.stringify(entry.binding) !== JSON.stringify(binding))
  )
    throw new EntityIdentityContractError("Accepted identity history is ambiguous or incomplete.");
  const anchors = accepted.filter((entry) => entry.row.id === binding.anchor_schema_id);
  const active = accepted.filter((entry) => entry.row.active === true || entry.row.active === 1);
  if (anchors.length !== 1 || active.length > 1)
    throw new EntityIdentityContractError("Accepted identity anchor is unavailable or ambiguous.");
  const selected = active[0] ?? anchors[0];
  return freezeIdentity({
    binding: structuredClone(binding),
    definition: structuredClone(selected.definition),
    schemaId: selected.row.id as string,
    schemaVersion: selected.row.schema_version as string,
    active: active.length === 1,
  });
}

/** Inactive admission is a reservation, never permission to use legacy folding. */
export async function assertIdentityResolutionAvailable(
  tx: DbConnection,
  entityType: string,
  userId?: string | null
): Promise<void> {
  const accepted = await loadAcceptedIdentityState(tx, entityType, userId);
  const ownerlessReservation = !userId
    ? ((await tx
        .prepare(
          "SELECT count(*) AS n FROM schema_registry WHERE entity_type = ? AND identity_binding IS NOT NULL"
        )
        .get(entityType)) as { n: number })
    : null;
  if (accepted || (ownerlessReservation && ownerlessReservation.n > 0))
    throw new EntityIdentityContractError(
      "Exact identity consumer activation is unavailable; legacy identity fallback is unavailable."
    );
}
