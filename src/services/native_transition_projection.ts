/**
 * Deterministic projections for correction-transaction native records.
 * These functions do not authenticate a caller, admit a transition, acquire
 * rows, or prove their origin. The transaction must do those things separately.
 */
import { createHash } from "node:crypto";
import { generateEntityId } from "./entity_resolution.js";
import { canonicalStoreRequest } from "./store_condition_keys.js";

const SHA256 = /^[0-9a-f]{64}$/;
const TRANSITIONS = new Set([
  "checkpoint.raise",
  "checkpoint.resolve",
  "lease.acquire",
  "lease.renew",
  "lease.return",
  "verdict.submit",
]);

export class NativeProjectionError extends Error {
  constructor(
    readonly code: "VALIDATION_ERROR" | "NATIVE_DEPENDENCY_UNAVAILABLE",
    message: string,
    readonly dependency?: "receipt_projection_version"
  ) {
    super(message);
  }
}

function invalid(message: string): never {
  throw new NativeProjectionError("VALIDATION_ERROR", message);
}

function nonempty(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) invalid("A nonempty identity value is required.");
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalStoreRequest(value), "utf8").digest("hex");
}

/** Caller supplies the actual resolved principal, never an input actor claim. */
export function nativeOperationKey(tenant: string, actualPrincipal: string, key: string): string {
  nonempty(tenant);
  nonempty(actualPrincipal);
  nonempty(key);
  if (key.length > 200) invalid("The operation key exceeds the transaction bound.");
  return "native-transition:" + hash([tenant, actualPrincipal, key]);
}

export function nativeEntityIdentity(
  operationKey: string,
  transition: string,
  entityType: "checkpoint" | "verdict" | "finding",
  options: { tenantSalt?: string; findingIndex?: number } = {}
): { scope: string; canonicalName: string; entityId: string } {
  if (
    typeof operationKey !== "string" ||
    !/^native-transition:[0-9a-f]{64}$/.test(operationKey) ||
    !TRANSITIONS.has(transition)
  )
    invalid("The native operation identity or transition is invalid.");
  if (!["checkpoint", "verdict", "finding"].includes(entityType))
    invalid("The native entity family is invalid.");
  if (!record(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
    invalid("The identity options must be a plain object.");
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key)!;
    if (
      (key !== "tenantSalt" && key !== "findingIndex") ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      invalid("The identity options are invalid.");
  }
  if (options.tenantSalt !== undefined) nonempty(options.tenantSalt);
  if (entityType === "finding") {
    if (!Number.isSafeInteger(options.findingIndex) || options.findingIndex! < 0)
      invalid("A finding requires a nonnegative safe integer ordinal.");
  } else if (options.findingIndex !== undefined) {
    invalid("Only a finding has an ordinal.");
  }
  const scope = hash(["native-entity-v1", operationKey, transition]);
  const canonicalName =
    `native-${entityType}:${scope}` + (entityType === "finding" ? `:${options.findingIndex}` : "");
  return {
    scope,
    canonicalName,
    entityId: generateEntityId(entityType, canonicalName, options.tenantSalt),
  };
}

const PROJECTION = {
  observations: [
    "id",
    "entity_id",
    "entity_type",
    "schema_version",
    "source_id",
    "interpretation_id",
    "observed_at",
    "specificity_score",
    "source_priority",
    "observation_source",
    "fields",
    "created_at",
    "user_id",
    "idempotency_key",
    "canonical_hash",
    "identity_basis",
    "identity_rule",
    "provenance",
    "source_peer_id",
    "canonical_key",
    "sighting_source_id",
  ],
  relationship_observations: [
    "id",
    "relationship_key",
    "relationship_type",
    "source_entity_id",
    "target_entity_id",
    "source_id",
    "interpretation_id",
    "observed_at",
    "specificity_score",
    "source_priority",
    "metadata",
    "canonical_hash",
    "created_at",
    "user_id",
    "provenance",
  ],
  entities: ["id", "entity_type", "user_id"],
} as const;
const ENTITY_EXCLUSIONS = [
  "canonical_name",
  "aliases",
  "created_at",
  "updated_at",
  "first_seen_at",
  "last_seen_at",
  "merged_to_entity_id",
  "merged_at",
] as const;
export type NativeReceiptTable = keyof typeof PROJECTION;
export interface NativeReceiptMember {
  table: NativeReceiptTable;
  id: string;
  payload_sha256: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Requires complete stored logical rows, not decorated or truncated API rows. */
export function nativeReceiptProjection(
  table: NativeReceiptTable,
  row: Record<string, unknown>,
  anchorObservationId: string
): Record<string, unknown> {
  if (typeof table !== "string" || !Object.hasOwn(PROJECTION, table) || !record(row))
    invalid("The receipt row is invalid.");
  // Validate before reading values: this also refuses accessors, cycles and nonfinite data.
  canonicalStoreRequest(row);
  const included: readonly string[] = PROJECTION[table];
  const classified = table === "entities" ? [...included, ...ENTITY_EXCLUSIONS] : included;
  if (
    classified.some((key) => !Object.hasOwn(row, key)) ||
    Object.keys(row).some((key) => !classified.includes(key))
  )
    throw new NativeProjectionError(
      "NATIVE_DEPENDENCY_UNAVAILABLE",
      "The complete stored row does not match the receipt projection version.",
      "receipt_projection_version"
    );
  if (typeof row.id !== "string" || !/^[\x21-\x7e]+$/.test(row.id))
    invalid("A native row requires its stored ASCII identity.");
  nonempty(anchorObservationId);
  if (table === "observations" && !record(row.fields))
    invalid("Observation fields must be a decoded object.");
  for (const key of table === "observations"
    ? ["fields", "provenance"]
    : table === "relationship_observations"
      ? ["metadata", "provenance"]
      : []) {
    if (row[key] !== null && !record(row[key]))
      invalid("Receipt JSON columns must already be decoded objects or explicit nulls.");
  }
  const projected = Object.fromEntries(included.map((key) => [key, row[key]]));
  if (table !== "entities" && record(row.provenance)) {
    const provenance = { ...row.provenance };
    if (Object.hasOwn(provenance, "native_transition_receipt")) {
      if (table !== "observations" || row.id !== anchorObservationId)
        invalid("Only the anchor may contain a native receipt.");
      delete provenance.native_transition_receipt;
    }
    projected.provenance = provenance;
  }
  if (table === "observations" && row.id === anchorObservationId) {
    if (row.canonical_hash !== null || !record(row.fields) || Object.keys(row.fields).length !== 0)
      invalid("The anchor requires empty fields and a null canonical hash.");
  }
  return projected;
}

export function nativeReceiptMember(
  table: NativeReceiptTable,
  row: Record<string, unknown>,
  anchorObservationId: string
): NativeReceiptMember {
  const projected = nativeReceiptProjection(table, row, anchorObservationId);
  return {
    table,
    id: row.id as string,
    payload_sha256: hash(["native-receipt-projection-v1", table, projected]),
  };
}

export function nativeReceiptMembership(
  rows: Array<{ table: NativeReceiptTable; row: Record<string, unknown> }>,
  anchorObservationId: string
): { members: NativeReceiptMember[]; sha256: string } {
  canonicalStoreRequest(rows);
  if (
    !Array.isArray(rows) ||
    rows.some(
      (entry) =>
        !record(entry) || Object.keys(entry).some((key) => key !== "table" && key !== "row")
    )
  )
    invalid("Receipt membership requires closed row entries.");
  nonempty(anchorObservationId);
  const members = rows.map(({ table, row }) =>
    nativeReceiptMember(table, row, anchorObservationId)
  );
  // Native table names and row IDs are ASCII, so this ordering is locale-independent.
  members.sort((a, b) =>
    a.table < b.table ? -1 : a.table > b.table ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  if (
    members.some(
      (member, i) =>
        i > 0 && member.table === members[i - 1].table && member.id === members[i - 1].id
    )
  )
    invalid("Receipt membership contains a duplicate row.");
  if (
    members.filter((member) => member.table === "observations" && member.id === anchorObservationId)
      .length !== 1
  )
    invalid("Receipt membership requires exactly one anchor observation.");
  return { members, sha256: hash(["native-membership-v1", members]) };
}

/** Arithmetic only: the caller must independently acquire/admit the complete registry group. */
export function nativeSchemaReducerHash(registryGroupSha256: string): string {
  if (typeof registryGroupSha256 !== "string" || !SHA256.test(registryGroupSha256))
    invalid("The registry group hash is invalid.");
  return hash(["native-schema-reducer-v1", registryGroupSha256]);
}
