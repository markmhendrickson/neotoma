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
 * Thrown when the instance policy could not be read, so no write can be
 * evaluated against it.
 *
 * Deliberately a DIFFERENT error from {@link StorePolicyDeniedError}. Both stop
 * the write, but they mean opposite things to the agent on the other end:
 *
 *   - `ERR_STORE_POLICY_DENIED` — the policy was read, and it forbids this.
 *     Rewriting the payload is the correct response; retrying is not.
 *   - `ERR_STORE_POLICY_UNAVAILABLE` — the policy could not be read. Nothing is
 *     known about whether this write is permitted. Retrying IS appropriate;
 *     rewriting the payload is not, and an agent that "fixes" its data in
 *     response to this has been misled by the error.
 *
 * Collapsing the two would teach agents to treat infrastructure faults as
 * policy boundaries — quietly narrowing what they store because of an outage.
 * The write is refused either way; only the explanation differs.
 */
export class StorePolicyUnavailableError extends Error {
  readonly code = "ERR_STORE_POLICY_UNAVAILABLE" as const;
  /** Driver-level cause, for operator logs. Not a policy statement. */
  readonly cause_message?: string;

  constructor(causeMessage?: string) {
    super(
      "Instance policy could not be read, so this write could not be checked against it; " +
        "0 persisted. This is an infrastructure failure, NOT a policy decision — the write " +
        "may well be permitted. Retry; do not rewrite or narrow the payload in response."
    );
    this.name = "StorePolicyUnavailableError";
    this.cause_message = causeMessage;
  }

  /** Envelope shared by REST and MCP, mirroring StorePolicyDeniedError. */
  toErrorEnvelope(): {
    code: typeof StorePolicyUnavailableError.prototype.code;
    message: string;
    retryable: true;
    hint: string;
  } {
    return {
      code: this.code,
      message: this.message,
      retryable: true,
      hint:
        "The instance policy lookup failed, so policy state is unknown and the write was " +
        "refused rather than admitted unchecked. Retry the same payload. If this persists, " +
        "the instance operator needs to check database health — it is not something the " +
        "calling agent can resolve by changing what it stores.",
    };
  }
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

  /**
   * The `ERR_STORE_POLICY_DENIED` envelope, shared by every surface.
   *
   * REST nests this under `{ error: … }` (see `/store` and `/correct` in
   * src/actions.ts); MCP passes it as the `data` field of an `McpError`. Both
   * read it from here so the two transports cannot drift — the failure mode the
   * cross-surface parity policy exists to catch.
   */
  toErrorEnvelope(): {
    code: typeof StorePolicyDeniedError.prototype.code;
    message: string;
    denied: StorePolicyDenial[];
  } {
    return {
      code: this.code,
      message: this.message,
      denied: this.denied,
    };
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
 * Outcome of a policy read, keeping "no policy configured" distinct from
 * "could not read the policy".
 *
 * Those two conditions look identical through a bare `null` and mean opposite
 * things for a data-protection control: the first is a normal instance with no
 * declared boundary, the second is an instance whose boundary is unknown. #2131
 * is what happens when a lookup failure is served as an empty result — a broken
 * query masqueraded as "nothing configured" on every libSQL instance for weeks,
 * and nothing upstream could tell.
 */
export interface InstancePolicyResult {
  policy: InstancePolicy | null;
  /** True when the lookup itself failed. `policy` is then meaningless, not empty. */
  lookup_failed: boolean;
  /** Driver message for the failed lookup, for logs and operator-facing notes. */
  error?: string;
}

/**
 * Read the instance-wide policy and report whether the read succeeded.
 *
 * Takes no caller-supplied identifier by design (see module docblock).
 *
 * The query is deliberately backend-portable. It previously selected
 * `entity_snapshots!inner(snapshot)`, a PostgREST embedded-resource hint that
 * only Supabase understands: libSQL forwards it into SQL and fails with
 * `unrecognized token: "!"`. Combined with the old fail-open `null`, that meant
 * an `enforced` policy silently never loaded outside the unit-test harness —
 * the enforcement guarantee of #1975 did not function on the local backend at
 * all. `entity_snapshots` already carries `entity_type`, so the join is
 * unnecessary; merged-away rows are excluded by a second bounded lookup.
 */
export async function getInstancePolicyResult(): Promise<InstancePolicyResult> {
  try {
    const { data, error } = await db
      .from("entity_snapshots")
      .select("entity_id, snapshot")
      .eq("entity_type", "instance_policy");

    if (error) {
      // error, not warn: an unreadable policy on an enforcing instance is a
      // control failure, not a degraded read.
      logger.error(
        `[instance_policy] LOOKUP FAILED — policy state is unknown for this request ` +
          `(this is NOT the same as having no policy configured): ${error.message}`
      );
      return { policy: null, lookup_failed: true, error: error.message };
    }
    if (!data || data.length === 0) return { policy: null, lookup_failed: false };

    const rows = data as Array<{
      entity_id: string;
      snapshot: Record<string, unknown> | string | null;
    }>;

    // entity_snapshots carries no merge pointer, so exclude merged-away
    // policies with a second bounded lookup. A failure here must not silently
    // widen the policy: treat it as an unreadable policy rather than guessing.
    const { data: mergedRows, error: mergedErr } = await db
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("entity_type", "instance_policy");

    if (mergedErr) {
      logger.error(
        `[instance_policy] merge-filter lookup failed; policy state is unknown: ${mergedErr.message}`
      );
      return { policy: null, lookup_failed: true, error: mergedErr.message };
    }

    const mergedAway = new Set(
      ((mergedRows as Array<{ id: string; merged_to_entity_id: string | null }> | null) ?? [])
        .filter((r) => r.merged_to_entity_id != null)
        .map((r) => r.id)
    );

    const live = rows.filter((r) => !mergedAway.has(r.entity_id));
    if (live.length === 0) return { policy: null, lookup_failed: false };

    // Deterministic pick: an instance should hold exactly one policy, but if a
    // second is somehow present we must not let row order decide which one
    // enforces. Sort by id and take the first, and say so loudly.
    if (live.length > 1) {
      logger.warn(
        `[instance_policy] ${live.length} instance_policy entities found; ` +
          `using the lowest entity_id deterministically. An instance should have exactly one.`
      );
    }
    const chosen = [...live].sort((a, b) =>
      a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0
    )[0];

    // Backends differ on whether a JSON column arrives parsed or as text.
    let snapshotRaw: unknown = chosen.snapshot;
    if (typeof snapshotRaw === "string") {
      try {
        snapshotRaw = JSON.parse(snapshotRaw);
      } catch (parseErr) {
        // A stored policy we cannot parse is unreadable, not absent.
        const msg = (parseErr as Error).message;
        logger.error(`[instance_policy] stored policy snapshot is unparseable: ${msg}`);
        return { policy: null, lookup_failed: true, error: msg };
      }
    }
    if (!snapshotRaw || typeof snapshotRaw !== "object") {
      return { policy: null, lookup_failed: false };
    }

    return {
      policy: normalizeInstancePolicy(snapshotRaw as Record<string, unknown>),
      lookup_failed: false,
    };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`[instance_policy] LOOKUP FAILED (thrown) — policy state is unknown: ${msg}`);
    // A thrown driver error is a failed lookup, not an empty one — the same
    // ambiguity as the `{ error }` shape above, reached a different way.
    return { policy: null, lookup_failed: true, error: msg };
  }
}

/**
 * Read the instance-wide policy, or `null` when none is configured.
 *
 * Convenience wrapper over {@link getInstancePolicyResult} for read-only
 * surfaces (instructions rendering, `describe_instance_policy`) where showing
 * no policy on a failed read is acceptable.
 *
 * Do NOT use this on the write-enforcement path: it collapses "no policy" and
 * "unreadable policy" back into one value, which is precisely the distinction
 * enforcement depends on.
 */
export async function getInstancePolicy(): Promise<InstancePolicy | null> {
  return (await getInstancePolicyResult()).policy;
}

/**
 * Entity id of the configured policy, or `null` when none exists.
 *
 * Exists for the authoring path. `instance_policy` sets
 * `name_collision_policy: "reject"`, so re-storing a policy with an existing
 * `policy_id` fails by design — two operators must not silently merge their
 * rules into one incoherent policy. That protects the record but leaves
 * editing with no obvious route: the second edit has to become a `correct`
 * against the existing entity, which requires knowing its id.
 *
 * Without this, an operator's only recourse was to guess the id or discover
 * the collision by hitting it (the #2011 ux finding).
 */
export async function getInstancePolicyEntityId(): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("entity_snapshots")
      .select("entity_id")
      .eq("entity_type", "instance_policy");

    if (error || !data || data.length === 0) return null;

    const { data: mergedRows } = await db
      .from("entities")
      .select("id, merged_to_entity_id")
      .eq("entity_type", "instance_policy");

    const mergedAway = new Set(
      ((mergedRows as Array<{ id: string; merged_to_entity_id: string | null }> | null) ?? [])
        .filter((r) => r.merged_to_entity_id != null)
        .map((r) => r.id)
    );

    const live = (data as Array<{ entity_id: string }>)
      .map((r) => r.entity_id)
      .filter((id) => !mergedAway.has(id))
      .sort();

    // Same deterministic pick as getInstancePolicyResult, so the id returned
    // here always addresses the policy that actually enforces.
    return live[0] ?? null;
  } catch {
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
  // Fail closed on an unreadable policy. An override (test harness, or a caller
  // that already resolved the policy) bypasses the read entirely.
  let policy: InstancePolicy | null;
  if (policyOverride !== undefined) {
    policy = policyOverride;
  } else {
    const result = await getInstancePolicyResult();
    if (result.lookup_failed) {
      // Refusing the write is the safe direction: admitting it would let an
      // outage silently suspend every boundary the instance declares. The
      // error type says "infrastructure", not "policy", so the agent retries
      // rather than narrowing what it stores.
      throw new StorePolicyUnavailableError(result.error);
    }
    policy = result.policy;
  }
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
  // Say what actually happens under THIS posture. Hardcoding "are rejected"
  // under an advisory policy contradicts the posture footer a few lines below,
  // and an agent that believes a write will be rejected when it will not is
  // being told the opposite of the truth about this instance (ux/pm, #2011).
  const consequence =
    policy.enforcement === "enforced"
      ? "Writes without one are rejected."
      : "Writes without one are accepted but violate this instance's policy — supply it.";
  if (policy.require_lawful_basis) {
    lines.push(`Person-data entities require a lawful-basis/purpose tag. ${consequence}`);
  }
  if (policy.require_provenance) {
    lines.push(`Person-data entities require attribution/consent metadata. ${consequence}`);
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
