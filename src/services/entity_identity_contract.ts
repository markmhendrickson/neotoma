/** Accepted exact identity bytes. No display formatting or ambient policy reads. */
import { createHash } from "node:crypto";
import type { CanonicalNameRule, SchemaDefinition } from "./schema_registry.js";

export interface ExactIdentityContract {
  version: "2";
  mode: "exact_utf8";
  namespace: string;
  canonical_name_fields: CanonicalNameRule[];
}

/** Stored in the existing registry; callers cannot supply this admission receipt. */
export interface AcceptedIdentityBinding {
  version: "1";
  anchor_schema_id: string;
  contract_id: string;
  entity_type: string;
  scope: "global" | "user";
  user_id: string | null;
  tenant_scoped_entity_ids: boolean;
  contract: ExactIdentityContract;
}

export class EntityIdentityContractError extends Error {
  readonly code = "VALIDATION_INVALID_FORMAT";
  readonly hint =
    "Use the immutable identity declaration of a fresh schema namespace; do not migrate existing identities by editing a schema.";
  toErrorEnvelope() {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

function refuse(message: string): never {
  throw new EntityIdentityContractError(message);
}

/** Buffer.from replaces unpaired surrogates; identity encoding must refuse them. */
export function assertIdentityUtf8(value: unknown): asserts value is string {
  if (typeof value !== "string") refuse("Exact identity components must be strings.");
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) refuse("Exact identity contains invalid Unicode.");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      refuse("Exact identity contains invalid Unicode.");
    }
  }
}

function text(value: unknown): string {
  assertIdentityUtf8(value);
  if (!value.length) refuse("Exact identity declaration contains an empty string.");
  return value;
}

/** Fixed key order plus strict grammar makes the accepted declaration byte stable. */
export function canonicalExactIdentityContract(
  value: unknown,
  fields: SchemaDefinition["fields"]
): ExactIdentityContract {
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    refuse("Exact identity requires a declared fields object.");
  if (!value || typeof value !== "object" || Array.isArray(value))
    refuse("identity_contract must be an object.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !== "canonical_name_fields,mode,namespace,version" ||
    input.version !== "2" ||
    input.mode !== "exact_utf8"
  )
    refuse("Unsupported exact identity declaration.");
  const namespace = text(input.namespace);
  const source = input.canonical_name_fields;
  if (!Array.isArray(source) || !source.length)
    refuse("Exact identity requires declared canonical_name_fields.");
  const checkField = (name: unknown) => {
    const field = text(name);
    if (!field.trim()) refuse("Exact identity requires nonempty field names.");
    if (!fields[field] || fields[field].type !== "string")
      refuse("Exact identity components must reference declared string fields.");
    if (fields[field].converters?.length)
      refuse("Exact identity fields cannot use value converters.");
    return field;
  };
  const rules = source.map((rule): CanonicalNameRule => {
    if (typeof rule === "string") return checkField(rule);
    if (
      !rule ||
      typeof rule !== "object" ||
      Object.keys(rule).join(",") !== "composite" ||
      !Array.isArray(rule.composite) ||
      !rule.composite.length
    )
      refuse("Invalid exact identity composite rule.");
    const composite = rule.composite.map(checkField);
    if (new Set(composite).size !== composite.length)
      refuse("Exact identity composite fields cannot repeat.");
    return { composite };
  });
  return { version: "2", mode: "exact_utf8", namespace, canonical_name_fields: rules };
}

/** Every component, including field names, is separately UTF-8 length framed. */
function frame(parts: string[]): Buffer {
  return Buffer.concat(
    parts.flatMap((part) => {
      assertIdentityUtf8(part);
      const bytes = Buffer.from(part, "utf8");
      return [Buffer.from(`${bytes.length}:`, "ascii"), bytes];
    })
  );
}

export function createAcceptedIdentityBinding(params: {
  anchorSchemaId: string;
  entityType: string;
  scope: "global" | "user";
  userId: string | null;
  tenantScopedEntityIds: boolean;
  contract: ExactIdentityContract;
}): AcceptedIdentityBinding {
  if (params.scope === "user" && !params.userId)
    refuse("User-scoped exact identity admission requires an owner.");
  if (typeof params.tenantScopedEntityIds !== "boolean")
    refuse("Exact identity admission requires an explicit owner policy.");
  const descriptor = frame([
    "neotoma:identity-contract:2",
    params.entityType,
    params.scope,
    params.userId ?? "",
    params.tenantScopedEntityIds ? "tenant" : "global",
    JSON.stringify(params.contract),
  ]);
  return {
    version: "1",
    anchor_schema_id: params.anchorSchemaId,
    contract_id: createHash("sha256").update(descriptor).digest("hex"),
    entity_type: params.entityType,
    scope: params.scope,
    user_id: params.userId,
    tenant_scoped_entity_ids: params.tenantScopedEntityIds,
    contract: params.contract,
  };
}

export function assertAcceptedIdentityDefinition(
  binding: AcceptedIdentityBinding,
  definition: SchemaDefinition
): void {
  const contract = canonicalExactIdentityContract(definition.identity_contract, definition.fields);
  if (
    JSON.stringify(contract) !== JSON.stringify(binding.contract) ||
    JSON.stringify(definition.canonical_name_fields) !==
      JSON.stringify(contract.canonical_name_fields) ||
    definition.identity_opt_out !== undefined
  )
    refuse("The accepted exact identity declaration is immutable.");
  const expected = createAcceptedIdentityBinding({
    anchorSchemaId: binding.anchor_schema_id,
    entityType: binding.entity_type,
    scope: binding.scope,
    userId: binding.user_id,
    tenantScopedEntityIds: binding.tenant_scoped_entity_ids,
    contract,
  });
  if (JSON.stringify(expected) !== JSON.stringify(binding))
    refuse("The accepted exact identity binding is unavailable or invalid.");
}

export function deriveExactEntityIdentity(
  binding: AcceptedIdentityBinding,
  fields: Record<string, unknown>,
  owner: string
): { entityId: string; components: Array<[string, string]>; ruleIndex: number } {
  if (!owner || (binding.scope === "user" && binding.user_id !== owner))
    refuse("Exact identity requires the admitted owner scope.");
  const declared = binding.contract.canonical_name_fields;
  // Preserve the existing declaration grammar: a flat string[] is ONE composite.
  const rules = declared.every((rule) => typeof rule === "string")
    ? [declared as string[]]
    : declared.map((rule) => (typeof rule === "string" ? [rule] : rule.composite));
  for (const [ruleIndex, names] of rules.entries()) {
    if (names.some((name) => fields[name] === undefined || fields[name] === null)) continue;
    const components = names.map((name): [string, string] => {
      const value = fields[name];
      assertIdentityUtf8(value);
      if (!value.length) refuse("Exact identity requires non-empty declared identifiers.");
      return [name, value];
    });
    const bytes = frame([
      "neotoma:entity:2",
      binding.contract_id,
      binding.contract.namespace,
      binding.entity_type,
      binding.tenant_scoped_entity_ids ? "tenant" : "global",
      binding.tenant_scoped_entity_ids ? owner : "",
      String(ruleIndex),
      ...components.flat(),
    ]);
    return {
      entityId: `ent_${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`,
      components,
      ruleIndex,
    };
  }
  refuse(
    "Exact identity requires a complete declared identifier; display fallback is unavailable."
  );
}
