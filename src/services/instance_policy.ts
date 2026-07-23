/**
 * Instance data-policy service (#1974 advisory + #1975 enforcement).
 *
 * An instance policy declares what a Neotoma instance is *for* and what it is
 * allowed to hold. It has two consumers, deliberately sharing one record:
 *
 * - **Advisory (#1974)** — {@link renderInstancePolicyInstructions} renders the
 *   policy into the client instructions served at connect time, so a
 *   cooperating agent can comply on its first write instead of discovering the
 *   rules by being rejected.
 * - **Enforcement (#1975)** — {@link evaluateStorePolicy} evaluates the policy
 *   on every write, so a non-cooperating agent is rejected regardless. A stale
 *   session, a misconfigured client, or another operator's agent never loaded
 *   the advisory text; enforcement is what makes the policy a control rather
 *   than a convention.
 *
 * Neither layer is sufficient alone. Declaration improves the happy path;
 * enforcement is the guarantee.
 *
 * ## Scope: instance-wide, not per-user
 *
 * A single policy row governs every write on the instance regardless of which
 * authenticated user issued it. This is a deliberate, documented exception to
 * the per-`user_id` scoping that ordinary user-owned entities follow
 * (`docs/subsystems/auth.md`): the predicate asks "may this instance hold
 * this?", a question about the instance's purpose, not about the caller's
 * identity. An instance shared by several operators enforcing silently
 * different rules per operator would defeat the point of a shared-instance
 * policy.
 *
 * Two consequences follow, and both are load-bearing:
 *
 * 1. The read path takes NO caller-supplied instance or user identifier, so it
 *    is not possible to construct a request that reads another instance's
 *    policy through this surface.
 * 2. `describe_instance_policy` returns the same policy to every authenticated
 *    caller on the instance. That is correct, not a tenant-isolation bug — the
 *    inverse bug (keying the policy by `user_id`) is what this module avoids.
 *
 * ## Schema-agnostic by construction
 *
 * The evaluator contains no `if (entityType === "…")` branch. Which types are
 * denied comes from the operator's configured lists; which types count as
 * person-data and which fields are sensitive come from schema declarations
 * (`person_data`, `sensitivity_class` — see `schema_registry.ts`). A new entity
 * type becomes governable by declaring itself, with no change to this file
 * (`docs/foundation/schema_agnostic_design_rules.md`).
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import {
  SENSITIVITY_CLASS_RANK,
  type SchemaDefinition,
  type SensitivityClass,
} from "./schema_registry.js";

/** Machine-readable denial reasons. Extensible: clients treat unknown values as hard denials. */
export type PolicyDenialReasonCode =
  | "entity_type_denied"
  | "pii_gate_missing_basis"
  | "field_sensitivity_exceeded"
  | "provenance_required";

/** How a configured policy behaves on a violating write. */
export type PolicyEnforcementMode = "advisory" | "enforced";

/** The instance-wide data policy record. Mirrors the `InstancePolicy` OpenAPI schema. */
export interface InstancePolicy {
  purpose?: string;
  in_scope_entity_types?: string[];
  out_of_scope_entity_types?: string[];
  sensitivity_rules?: string[];
  require_lawful_basis?: boolean;
  require_provenance?: boolean;
  max_sensitivity_class?: SensitivityClass | null;
  enforcement?: PolicyEnforcementMode;
  policy_id?: string;
  updated_at?: string;
  updated_by?: string;
}

/** A single per-entity denial. Mirrors the `StorePolicyDenial` OpenAPI schema. */
export interface StorePolicyDenial {
  entity_index: number;
  entity_type?: string;
  reason_code: PolicyDenialReasonCode;
  hint: string;
  policy_id?: string;
}

/** One candidate write, in the shape the evaluator needs. */
export interface PolicyCandidate {
  entity_type: string;
  fields: Record<string, unknown>;
}

/**
 * Thrown when a write violates an `enforced` instance policy.
 *
 * Carries the full denial list so the caller can render the
 * `ERR_STORE_POLICY_DENIED` envelope without re-deriving anything. Whole-request
 * reject: nothing in the batch is persisted, and `denied` enumerates every
 * violating entity — not just the first — so one round trip surfaces every
 * problem.
 */
export class StorePolicyDeniedError extends Error {
  readonly code = "ERR_STORE_POLICY_DENIED" as const;
  readonly denied: StorePolicyDenial[];

  constructor(denied: StorePolicyDenial[]) {
    super(
      `${denied.length} ${denied.length === 1 ? "entity" : "entities"} rejected by instance policy; 0 persisted`
    );
    this.name = "StorePolicyDeniedError";
    this.denied = denied;
  }
}

/** Defaults applied when a `person_data` schema omits the field names. */
const DEFAULT_LAWFUL_BASIS_FIELD = "lawful_basis";
const DEFAULT_PROVENANCE_FIELD = "data_source";

/**
 * Hint templates. Every hint names the next tool call or the exact field to fix
 * — a hint that merely restates the reason code in prose is not actionable
 * enough to be worth returning.
 *
 * PII-safety: interpolated values are schema-declared field *names*, the entity
 * type, and configured policy values. No fragment of the submitted payload is
 * ever interpolated, so a rejected write cannot echo its own PII back through
 * the error envelope (guardrails MUST NOT 11).
 */
function hintForEntityTypeDenied(entityType: string): string {
  return (
    `This instance's policy denies entity_type '${entityType}'. ` +
    `Call describe_instance_policy to see the allow/deny list before retrying.`
  );
}

function hintForMissingBasis(fieldName: string): string {
  return (
    `Person-data entities on this instance require a lawful-basis/purpose tag ` +
    `('${fieldName}'). Add it and retry, or confirm with the instance operator ` +
    `which basis applies.`
  );
}

function hintForSensitivityExceeded(
  fieldName: string,
  fieldClass: SensitivityClass,
  maxClass: SensitivityClass
): string {
  return (
    `Field '${fieldName}' is classified '${fieldClass}', which exceeds this ` +
    `instance's configured maximum sensitivity class ('${maxClass}'). Remove the ` +
    `field, or store it on an instance whose policy permits that class.`
  );
}

function hintForProvenanceRequired(fieldName: string): string {
  return (
    `Person-data on this instance requires attribution/consent metadata ` +
    `('${fieldName}'). Include it in the entity payload and retry.`
  );
}

/**
 * Treat a value as "absent" when it is null/undefined, an empty or
 * whitespace-only string, or an empty array.
 *
 * Present-but-blank counts as missing on purpose: a policy that accepts
 * `lawful_basis: ""` as satisfied would be trivially defeated by the most
 * common falsy-value bug, so the gate fails closed.
 */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Read the instance-wide policy, or `null` when none is configured.
 *
 * Takes no caller-supplied identifier by design (see module docblock). Returns
 * `null` — never throws — on any query failure: a policy lookup that errors
 * must not take down the connect handshake or every write on the instance.
 *
 * Note the failure mode this chooses. A read error yields `null`, which means
 * "no policy", which means writes are NOT denied. That is fail-open, and it is
 * the deliberate trade for v1: an instance whose DB is briefly unhealthy keeps
 * accepting writes rather than hard-failing every one of them. Callers that
 * need fail-closed semantics should surface a health check rather than
 * inferring policy state from a silent null.
 */
export async function getInstancePolicy(): Promise<InstancePolicy | null> {
  try {
    const { data, error } = await db
      .from("entities")
      .select("id, entity_snapshots!inner(snapshot)")
      .eq("entity_type", "instance_policy")
      .is("merged_to_entity_id", null);

    if (error) {
      logger.warn(`[instance_policy] query failed: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;

    const rows = data as Array<{
      id: string;
      entity_snapshots:
        | { snapshot: Record<string, unknown> }
        | Array<{ snapshot: Record<string, unknown> }>;
    }>;

    // Deterministic pick: an instance should hold exactly one policy, but if a
    // second is somehow present we must not let row order decide which one
    // enforces. Sort by id and take the first, and say so loudly.
    if (rows.length > 1) {
      logger.warn(
        `[instance_policy] ${rows.length} instance_policy entities found; ` +
          `using the lowest entity_id deterministically. An instance should have exactly one.`
      );
    }
    const chosen = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];

    const snapshotRaw = Array.isArray(chosen.entity_snapshots)
      ? chosen.entity_snapshots[0]?.snapshot
      : chosen.entity_snapshots?.snapshot;
    if (!snapshotRaw || typeof snapshotRaw !== "object") return null;

    return normalizeInstancePolicy(snapshotRaw as Record<string, unknown>);
  } catch (err) {
    logger.warn(`[instance_policy] unexpected read failure: ${(err as Error).message}`);
    return null;
  }
}

/** Coerce a stored snapshot into the typed policy shape, dropping unknown values. */
function normalizeInstancePolicy(snapshot: Record<string, unknown>): InstancePolicy {
  const stringArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

  const maxClass =
    typeof snapshot.max_sensitivity_class === "string" &&
    snapshot.max_sensitivity_class in SENSITIVITY_CLASS_RANK
      ? (snapshot.max_sensitivity_class as SensitivityClass)
      : null;

  return {
    purpose: typeof snapshot.purpose === "string" ? snapshot.purpose : undefined,
    in_scope_entity_types: stringArray(snapshot.in_scope_entity_types),
    out_of_scope_entity_types: stringArray(snapshot.out_of_scope_entity_types),
    sensitivity_rules: stringArray(snapshot.sensitivity_rules),
    require_lawful_basis: snapshot.require_lawful_basis === true,
    require_provenance: snapshot.require_provenance === true,
    max_sensitivity_class: maxClass,
    // Default advisory: adding a policy record must not itself start rejecting
    // writes that previously succeeded. Rejection is an explicit opt-in.
    enforcement: snapshot.enforcement === "enforced" ? "enforced" : "advisory",
    policy_id: typeof snapshot.policy_id === "string" ? snapshot.policy_id : undefined,
    updated_at: typeof snapshot.updated_at === "string" ? snapshot.updated_at : undefined,
    updated_by: typeof snapshot.updated_by === "string" ? snapshot.updated_by : undefined,
  };
}

/**
 * Evaluate one candidate write against the policy, returning its denial or
 * `null` if it passes.
 *
 * `schema` may be null for an unregistered type: the entity-type lists still
 * apply (they are operator-configured strings, not schema-derived), but the
 * person-data and sensitivity gates cannot fire without declarations to read.
 * That is the correct fail-open for those two gates specifically — they are
 * defined in terms of schema classifications, and an unclassified type has
 * made no claim to gate on.
 */
function evaluateOne(
  candidate: PolicyCandidate,
  index: number,
  policy: InstancePolicy,
  schema: SchemaDefinition | null
): StorePolicyDenial | null {
  const { entity_type: entityType, fields } = candidate;
  const policyId = policy.policy_id;

  // 1. Entity-type deny-list, evaluated first so an explicit denial always wins
  //    over an allow-list that also happens to name the type.
  if (policy.out_of_scope_entity_types?.includes(entityType)) {
    return {
      entity_index: index,
      entity_type: entityType,
      reason_code: "entity_type_denied",
      hint: hintForEntityTypeDenied(entityType),
      policy_id: policyId,
    };
  }

  // 2. Entity-type allow-list. An EMPTY list means "no allow-list configured",
  //    not "deny everything" — an operator who saves a policy without filling
  //    this in must not silently brick every write on the instance.
  const allowList = policy.in_scope_entity_types;
  if (allowList && allowList.length > 0 && !allowList.includes(entityType)) {
    return {
      entity_index: index,
      entity_type: entityType,
      reason_code: "entity_type_denied",
      hint: hintForEntityTypeDenied(entityType),
      policy_id: policyId,
    };
  }

  const isPersonData = schema?.person_data === true;

  // 3. Lawful-basis gate — person-data types only.
  if (policy.require_lawful_basis && isPersonData) {
    const basisField = schema?.lawful_basis_field ?? DEFAULT_LAWFUL_BASIS_FIELD;
    if (isBlank(fields[basisField])) {
      return {
        entity_index: index,
        entity_type: entityType,
        reason_code: "pii_gate_missing_basis",
        hint: hintForMissingBasis(basisField),
        policy_id: policyId,
      };
    }
  }

  // 4. Provenance gate — person-data types only.
  if (policy.require_provenance && isPersonData) {
    const provField = schema?.provenance_field ?? DEFAULT_PROVENANCE_FIELD;
    if (isBlank(fields[provField])) {
      return {
        entity_index: index,
        entity_type: entityType,
        reason_code: "provenance_required",
        hint: hintForProvenanceRequired(provField),
        policy_id: policyId,
      };
    }
  }

  // 5. Field sensitivity threshold. Applies to ANY type, person-data or not:
  //    sensitivity is declared per field, so a non-person type can still carry
  //    a restricted field.
  const maxClass = policy.max_sensitivity_class;
  if (maxClass && schema?.fields) {
    const maxRank = SENSITIVITY_CLASS_RANK[maxClass];
    // Sort field names so a multi-violation entity always reports the same
    // field first (determinism — guardrails MUST NOT 9).
    for (const fieldName of Object.keys(fields).sort()) {
      if (isBlank(fields[fieldName])) continue;
      const declared = schema.fields[fieldName]?.sensitivity_class;
      if (!declared) continue;
      if (SENSITIVITY_CLASS_RANK[declared] > maxRank) {
        return {
          entity_index: index,
          entity_type: entityType,
          reason_code: "field_sensitivity_exceeded",
          hint: hintForSensitivityExceeded(fieldName, declared, maxClass),
          policy_id: policyId,
        };
      }
    }
  }

  return null;
}

/** How the caller should resolve a set of schemas for the candidate types. */
export type SchemaResolver = (entityType: string) => Promise<SchemaDefinition | null>;

/**
 * Evaluate a batch of candidate writes against the instance policy.
 *
 * Returns the denial list — EMPTY when the batch is clean. Callers in an
 * `enforced` posture should throw {@link StorePolicyDeniedError} with the
 * result; callers in `advisory` posture may log or warn instead.
 *
 * ## Why this must be called before any row is written
 *
 * A store call is NOT wrapped in a database transaction today — it is a
 * sequence of independent writes (source row → observations → snapshots), so
 * there is no rollback to lean on. Denying mid-batch would therefore leave the
 * earlier entities of the batch persisted, which for a data-protection control
 * is the worst possible failure: the error says "rejected" while the data sits
 * in the database.
 *
 * The existing codebase solves this the same way for constraint violations
 * (`src/actions.ts`, "Run before any observation writes so a reject policy
 * aborts the whole batch cleanly"). This function follows that pattern rather
 * than claiming an atomicity the storage layer does not provide.
 */
export async function evaluateStorePolicy(
  candidates: PolicyCandidate[],
  resolveSchema: SchemaResolver,
  policyOverride?: InstancePolicy | null
): Promise<StorePolicyDenial[]> {
  const policy = policyOverride !== undefined ? policyOverride : await getInstancePolicy();
  if (!policy) return [];
  if (policy.enforcement !== "enforced") return [];
  if (candidates.length === 0) return [];

  // Resolve each distinct type once — a batch commonly repeats a type.
  const distinctTypes = [...new Set(candidates.map((c) => c.entity_type))];
  const schemas = new Map<string, SchemaDefinition | null>();
  await Promise.all(
    distinctTypes.map(async (t) => {
      try {
        schemas.set(t, await resolveSchema(t));
      } catch {
        // An unresolvable schema disables only the declaration-driven gates for
        // that type; the operator's entity-type lists still apply.
        schemas.set(t, null);
      }
    })
  );

  const denied: StorePolicyDenial[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const denial = evaluateOne(
      candidates[i],
      i,
      policy,
      schemas.get(candidates[i].entity_type) ?? null
    );
    // Every violating entity is collected, not just the first, so one round
    // trip tells the caller everything that is wrong with the batch.
    if (denial) denied.push(denial);
  }
  return denied;
}

/**
 * Convenience wrapper: evaluate and throw on any denial.
 *
 * This is the form every write path should call, so that "enforce the policy"
 * is a single line at each call site and cannot drift between them.
 */
export async function assertStorePolicyAllows(
  candidates: PolicyCandidate[],
  resolveSchema: SchemaResolver,
  policyOverride?: InstancePolicy | null
): Promise<void> {
  const denied = await evaluateStorePolicy(candidates, resolveSchema, policyOverride);
  if (denied.length > 0) throw new StorePolicyDeniedError(denied);
}

/**
 * Render the policy as a delimited client-instructions section (#1974).
 *
 * Returns an empty string when no policy is configured, so composing it onto
 * the global instructions is a no-op for instances that have not opted in —
 * an instance with no policy serves byte-identical instructions to before this
 * feature existed.
 *
 * The section is clearly delimited so a cooperating agent can tell "how to use
 * this server" (global protocol instructions) from "what this server is for"
 * (this instance's data policy).
 */
export function renderInstancePolicyInstructions(policy: InstancePolicy | null): string {
  if (!policy) return "";

  const lines: string[] = [];
  lines.push("## Instance Data Policy");
  lines.push("");

  if (policy.purpose && policy.purpose.trim().length > 0) {
    lines.push(`Purpose of this instance: ${policy.purpose.trim()}`);
    lines.push("");
  }

  if (policy.in_scope_entity_types && policy.in_scope_entity_types.length > 0) {
    lines.push(
      `ONLY these entity types may be stored here: ${policy.in_scope_entity_types.join(", ")}.`
    );
  }
  if (policy.out_of_scope_entity_types && policy.out_of_scope_entity_types.length > 0) {
    lines.push(
      `These entity types are OUT OF SCOPE and must not be stored here: ${policy.out_of_scope_entity_types.join(", ")}.`
    );
  }
  if (policy.require_lawful_basis) {
    lines.push(
      "Person-data entities require a lawful-basis/purpose tag. Writes without one are rejected."
    );
  }
  if (policy.require_provenance) {
    lines.push(
      "Person-data entities require attribution/consent metadata. Writes without it are rejected."
    );
  }
  if (policy.max_sensitivity_class) {
    lines.push(
      `Fields classified above '${policy.max_sensitivity_class}' sensitivity must not be stored here.`
    );
  }
  for (const rule of policy.sensitivity_rules ?? []) {
    if (rule.trim().length > 0) lines.push(`- ${rule.trim()}`);
  }

  lines.push("");
  // State the posture honestly. An agent that believes advisory text is enforced
  // will under-check its own writes; one that believes enforced text is advisory
  // will waste round trips discovering rejections.
  if (policy.enforcement === "enforced") {
    lines.push(
      "These rules are ENFORCED server-side: a violating `store` or `correct` is rejected " +
        "with `ERR_STORE_POLICY_DENIED` and nothing in the request is persisted."
    );
  } else {
    lines.push(
      "These rules are ADVISORY on this instance: violating writes are currently accepted, " +
        "but you are expected to comply. Do not store out-of-scope data here."
    );
  }
  lines.push("Call `describe_instance_policy` to read this policy programmatically.");

  return lines.join("\n");
}
