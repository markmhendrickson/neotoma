/**
 * Relationship-type registry (#1972 / G25).
 *
 * ── WHY A SEPARATE TABLE AND A SIBLING PRIMITIVE ──────────────────────────
 *
 * `relationship_type` was a CLOSED vocabulary with exactly one enforcement
 * point — `validTypes` in `../relationships.ts` — and fifteen further copies
 * (Zod enum, three OpenAPI action blocks, ten `openapi.yaml` blocks and their
 * generated TS unions, the inspector constants, two CLI casts, the runtime
 * tool-description YAML, the frontend primitive guides, the subsystem doc, the
 * audit skill and its Cursor twin, and the generated locale site pages). Any
 * of the fifteen could be wrong without a single test failing, and one of them
 * — `docs/developer/mcp/tool_descriptions.yaml`, loaded into the live MCP tool
 * descriptions at `server.ts` boot — WAS wrong in the field: it advertised 8
 * types while the schema advertised 28.
 *
 * This module makes the vocabulary a runtime registry so there is one source
 * and nothing left to copy.
 *
 * It is deliberately NOT a mode flag on `schema_registry`. That table's
 * uniqueness semantics are `(entity_type, scope, user_id, active)` and every
 * one of its consumers — `loadActiveSchema`, `loadGlobalSchema`,
 * `loadUserSpecificSchema`, `listActiveSchemas`, `listEntityTypes`,
 * `describeEntityType`, `analyzeSchemaCandidates`, the `neotoma://entity_types`
 * resource, `autoLinkReferenceFields`, and both seeders — reads it with
 * `.single()` or an unfiltered `.eq("active", true)` and assumes every row is
 * an entity type carrying a `schema_definition.fields` object. Putting
 * relationship-type rows in that table would require auditing all of them, and
 * any missed call site would silently treat `LEASE` as an entity type. The
 * PATTERN is reused (registry row, scope, seed at boot, resolve user-then-
 * global, list for discovery); the table is not.
 *
 * ── APPEND-ONLY, AND WHY ──────────────────────────────────────────────────
 *
 * `schema_registry.register()` INSERTs a row and then UPDATEs prior rows'
 * `active` flag in place (three sites). This registry does not copy that.
 * Every registration, re-registration and deregistration is an INSERT carrying
 * `registry_version`, `created_at` and `created_by`; `state` is a value on the
 * row, never a mutated column. Resolution reads the LATEST row per
 * `(relationship_type, scope, user_id)` and takes its `state`.
 *
 * That is the same "latest observation of a field wins" rule the substrate
 * already applies to relationships themselves one table over
 * (`relationship_observations` → `relationship_snapshots`), it is safe under
 * either reading of redline R1 (whose stated scope is observations and
 * entities, and so does not obviously cover registry rows either way), and it
 * preserves the history of what was registered when — which an as-of read of
 * the registry needs and which an in-place UPDATE destroys.
 *
 * ── FOUR DEFECTS OF `schema_registry` DELIBERATELY NOT INHERITED ──────────
 *
 *   1. No UNIQUE constraint — single-active enforced only in application code
 *      and not atomically, which makes `schema_registry_bootstrap`'s
 *      `isDuplicateRegistrationError` dead code on SQLite. We add one.
 *   2. No index at all — every read is a full table scan. Since this registry
 *      is read on the relationship WRITE path, indexing is not optional.
 *   3. Registration is not transactional — the INSERT and the deactivating
 *      UPDATE are separate statements and a deactivation failure is swallowed
 *      to a warning while `register()` still returns success. Append-only
 *      removes the second statement entirely, so there is nothing to tear.
 *   4. `activate()` / `deactivate()` filter on `(entity_type, schema_version)`
 *      with no scope predicate, so a global and a user row sharing a version
 *      cross-activate. Every query here carries its scope predicate.
 */

import { db } from "../../db.js";
import { logger } from "../../utils/logger.js";

export const RELATIONSHIP_TYPE_REGISTRY_TABLE = "relationship_type_registry";

/** Scope of a registration. `user` is the SAFE default — see `register`. */
export type RelationshipTypeScope = "global" | "user";

/** Lifecycle state of a registration row. Append-only: never updated in place. */
export type RelationshipTypeState = "active" | "deactivated";

/**
 * Advisory metadata carried on a registration.
 *
 * ADVISORY MEANS ADVISORY. `source_entity_types` / `target_entity_types` are
 * NOT enforced at write time — this mirrors how entity schemas treat unknown
 * fields, and it is stated in the tool description too, because the first
 * consumer will otherwise assume it is a type check.
 *
 * `acyclic` is the ONE exception and IS enforced: see `../relationships.ts`
 * and the cycle-check note in `server.ts`.
 */
export interface RelationshipTypeDefinition {
  description?: string;
  /** Advisory only. Entity types this edge is expected to originate from. */
  source_entity_types?: string[];
  /** Advisory only. Entity types this edge is expected to point at. */
  target_entity_types?: string[];
  /** Advisory only. Name of the inverse edge, if the vocabulary has one. */
  inverse?: string;
  /** Advisory only. Whether the edge reads the same in both directions. */
  symmetric?: boolean;
  /**
   * ENFORCED. When true, `create_relationship` refuses an edge of this type
   * that would close a loop among edges OF THIS TYPE, within this tenant.
   *
   * Opt-in by design. The pre-existing check in `server.ts` was type-blind
   * (one graph from every edge of every type), tenant-blind (no `user_id`
   * filter, so one tenant's edges could refuse another's write) and unbounded
   * (whole-table load plus an unbounded DFS on every single write). It would
   * have refused legitimate `FOLLOWS` chains and `ownership_grant` fan-ins
   * regardless of the vocabulary. Types that ARE hierarchies — `DEPENDS_ON`,
   * `PART_OF` — carry the flag and keep the protection; everything else does
   * not, because a check applied to a type whose semantics permit cycles is
   * not a protection, it is a refusal.
   */
  acyclic?: boolean;
}

export interface RelationshipTypeRegistration extends RelationshipTypeDefinition {
  relationship_type: string;
  scope: RelationshipTypeScope;
  state: RelationshipTypeState;
  registry_version: string;
  registered_at: string;
  /**
   * The user_id of the registering principal — recorded on GLOBAL rows too.
   *
   * `schema_registry` stores `user_id: null` for global rows, so a global
   * registration records nothing about who made it: the widest-blast-radius
   * branch is also the unattributed one. There is no reason to repeat that.
   */
  created_by: string | null;
  /** Owning tenant. Null for global rows; `created_by` still carries identity. */
  user_id: string | null;
}

interface RegistryRow {
  id: string;
  relationship_type: string;
  registry_version: string;
  definition: string | RelationshipTypeDefinition;
  state: string;
  created_at: string | null;
  created_by: string | null;
  user_id: string | null;
  scope: string | null;
  metadata: string | Record<string, unknown> | null;
}

/**
 * Naming rule. Casing-agnostic by necessity: the seeded 28 ALREADY mix cases
 * (`PART_OF` and `part_of` are both members, as are `DEPENDS_ON` and
 * `depends_on`), so any rule here must admit both. Enforced in the service
 * rather than as a table CHECK so it can produce a structured error, exactly
 * as entity-type naming is handled in `entity_type_guard.ts`.
 */
const RELATIONSHIP_TYPE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export class RelationshipTypeRegistrationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly hint: string;

  constructor(params: { message: string; code: string; hint: string; statusCode?: number }) {
    super(params.message);
    this.name = "RelationshipTypeRegistrationError";
    this.code = params.code;
    this.hint = params.hint;
    this.statusCode = params.statusCode ?? 400;
  }
}

function parseDefinition(raw: RegistryRow["definition"]): RelationshipTypeDefinition {
  if (!raw) return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as RelationshipTypeDefinition;
  } catch {
    return {};
  }
}

function toRegistration(row: RegistryRow): RelationshipTypeRegistration {
  const definition = parseDefinition(row.definition);
  return {
    ...definition,
    relationship_type: row.relationship_type,
    scope: (row.scope as RelationshipTypeScope) ?? "global",
    state: (row.state as RelationshipTypeState) ?? "active",
    registry_version: row.registry_version,
    registered_at: row.created_at ?? "",
    created_by: row.created_by ?? null,
    user_id: row.user_id ?? null,
  };
}

/**
 * Reduce an append-only row set to the effective registration per
 * `(relationship_type, scope, user_id)`: the LATEST row by `created_at`, then
 * by `registry_version` as a deterministic tiebreak when two rows share a
 * timestamp (SQLite's ISO strings are second-or-better but not unique under a
 * fast loop). Mirrors `filterDeletedRelationships`' latest-wins reduction.
 */
function latestPerKey(rows: RegistryRow[]): RegistryRow[] {
  const winners = new Map<string, RegistryRow>();
  for (const row of rows) {
    const key = `${row.relationship_type} ${row.scope ?? "global"} ${row.user_id ?? ""}`;
    const incumbent = winners.get(key);
    if (!incumbent) {
      winners.set(key, row);
      continue;
    }
    const a = row.created_at ?? "";
    const b = incumbent.created_at ?? "";
    if (a > b || (a === b && row.registry_version > incumbent.registry_version)) {
      winners.set(key, row);
    }
  }
  return [...winners.values()];
}

export class RelationshipTypeRegistryService {
  /**
   * Register (or re-register, or deregister) a relationship type.
   *
   * Always an INSERT — see the append-only note in the module docs. A
   * re-registration of the same `(type, scope, user_id)` supersedes the prior
   * row by being newer; nothing is updated and nothing is deleted.
   *
   * `scope` defaults to `"user"`, INVERTING `register_schema`'s default of
   * global. That default is the whole point: `register_schema`'s `user_specific`
   * defaults to `false`, so its default branch is simultaneously the widest
   * blast radius AND the branch that records no identity. Failing closed on the
   * field carrying the safety meaning is both the safer choice and the correct
   * one; a caller that wants a global vocabulary says so, and needs the
   * capability for it.
   */
  async register(
    params: {
      relationship_type: string;
      scope?: RelationshipTypeScope;
      state?: RelationshipTypeState;
      user_id?: string | null;
      created_by?: string | null;
      registry_version?: string;
      metadata?: Record<string, unknown>;
      /**
       * Skip the case-collision guard. Used ONLY by the built-in seeder, whose
       * vocabulary contains the grandfathered `PART_OF`/`part_of` and
       * `DEPENDS_ON`/`depends_on` pairs by design. Without this the seeder
       * refuses its own second member of each pair, silently dropping two of
       * the 28 built-in types.
       */
      allow_case_variant?: boolean;
    } & RelationshipTypeDefinition
  ): Promise<RelationshipTypeRegistration> {
    const relationshipType = params.relationship_type?.trim();
    const scope: RelationshipTypeScope = params.scope ?? "user";

    if (!relationshipType || !RELATIONSHIP_TYPE_NAME_PATTERN.test(relationshipType)) {
      throw new RelationshipTypeRegistrationError({
        code: "invalid_relationship_type_name",
        message:
          `Invalid relationship type name: ${JSON.stringify(params.relationship_type)}. ` +
          `Must match ${RELATIONSHIP_TYPE_NAME_PATTERN} (letter first, then letters, ` +
          `digits or underscores, 1-64 characters).`,
        hint:
          "Relationship type names are casing-agnostic (both SCREAMING_SNAKE and " +
          "lower_snake are in use) but must be a single identifier-shaped token.",
      });
    }

    if (scope === "user" && !params.user_id && !params.created_by) {
      throw new RelationshipTypeRegistrationError({
        code: "missing_user_scope",
        message: "A user-scoped relationship type registration requires a user_id.",
        hint: 'Pass scope: "global" to register instance-wide, or authenticate the request.',
      });
    }

    // Reject a NEW name that differs from an existing ACTIVE type only by case.
    // The already-seeded PART_OF/part_of and DEPENDS_ON/depends_on pairs are
    // grandfathered by construction: this check only fires when the incoming
    // name is not itself already registered.
    const effective = await this.resolveAll(params.user_id ?? params.created_by ?? undefined);
    const exact = effective.find((r) => r.relationship_type === relationshipType);
    if (!exact && !params.allow_case_variant) {
      const caseClash = effective.find(
        (r) =>
          r.state === "active" &&
          r.relationship_type.toLowerCase() === relationshipType.toLowerCase()
      );
      if (caseClash) {
        throw new RelationshipTypeRegistrationError({
          code: "relationship_type_case_collision",
          message:
            `Relationship type "${relationshipType}" differs from the already-registered ` +
            `"${caseClash.relationship_type}" only by case.`,
          hint:
            `Use "${caseClash.relationship_type}", or choose a name that is distinct ` +
            `beyond casing. (The pre-existing PART_OF/part_of and DEPENDS_ON/depends_on ` +
            `pairs are grandfathered; new near-duplicates are not.)`,
        });
      }
    }

    const definition: RelationshipTypeDefinition = {
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.source_entity_types ? { source_entity_types: params.source_entity_types } : {}),
      ...(params.target_entity_types ? { target_entity_types: params.target_entity_types } : {}),
      ...(params.inverse !== undefined ? { inverse: params.inverse } : {}),
      ...(params.symmetric !== undefined ? { symmetric: params.symmetric } : {}),
      ...(params.acyclic !== undefined ? { acyclic: params.acyclic } : {}),
    };

    const createdAt = new Date().toISOString();
    const registryVersion = params.registry_version ?? createdAt;
    const userId = scope === "user" ? (params.user_id ?? params.created_by ?? null) : null;

    const row = {
      id: `reltype_${relationshipType}_${scope}_${userId ?? "global"}_${registryVersion}`,
      relationship_type: relationshipType,
      registry_version: registryVersion,
      definition: JSON.stringify(definition),
      state: params.state ?? "active",
      created_at: createdAt,
      // Recorded on global rows too — see the field docs on `created_by`.
      created_by: params.created_by ?? params.user_id ?? null,
      user_id: userId,
      scope,
      metadata: JSON.stringify(params.metadata ?? {}),
    };

    const { error } = await db.from(RELATIONSHIP_TYPE_REGISTRY_TABLE).insert(row);
    if (error) {
      throw new RelationshipTypeRegistrationError({
        code: "relationship_type_registration_failed",
        message: `Failed to register relationship type "${relationshipType}": ${error.message}`,
        hint: "Retry; if this persists the registry table may be unavailable.",
        statusCode: 500,
      });
    }

    invalidateRelationshipTypeCache();
    return toRegistration(row as unknown as RegistryRow);
  }

  /** Deregister a type. An APPEND (`state: "deactivated"`), never a delete. */
  async deregister(params: {
    relationship_type: string;
    scope?: RelationshipTypeScope;
    user_id?: string | null;
    created_by?: string | null;
  }): Promise<RelationshipTypeRegistration> {
    return this.register({ ...params, state: "deactivated" });
  }

  /**
   * Every effective registration visible to `userId`, active or not.
   *
   * Scope predicate mirrors `SchemaRegistryService.listActiveSchemas`: global
   * rows always, plus this user's own rows. A type registered by user A is not
   * resolvable by user B; a global type is resolvable by both.
   */
  private async resolveAll(userId?: string): Promise<RelationshipTypeRegistration[]> {
    const base = db
      .from(RELATIONSHIP_TYPE_REGISTRY_TABLE)
      .select(
        "id, relationship_type, registry_version, definition, state, created_at, created_by, user_id, scope, metadata"
      );
    const query = userId
      ? base.or(`scope.eq.global,and(scope.eq.user,user_id.eq.${userId})`)
      : base.eq("scope", "global");

    const { data, error } = await query;
    if (error) {
      throw new RelationshipTypeRegistrationError({
        code: "relationship_type_registry_unavailable",
        message: `Failed to read the relationship type registry: ${error.message}`,
        hint: "Retry; if this persists the registry table may be unavailable.",
        statusCode: 500,
      });
    }

    const rows = latestPerKey((data ?? []) as RegistryRow[]);

    // A user-scoped row shadows a global row of the same name, mirroring
    // loadActiveSchema's user-then-global fallthrough.
    const byName = new Map<string, RelationshipTypeRegistration>();
    for (const row of rows) {
      const reg = toRegistration(row);
      const incumbent = byName.get(reg.relationship_type);
      if (!incumbent || (reg.scope === "user" && incumbent.scope === "global")) {
        byName.set(reg.relationship_type, reg);
      }
    }
    return [...byName.values()];
  }

  /**
   * The registry CENSUS — types that are PERMITTED, not types that have edges.
   *
   * That distinction is the whole point of the read-back, and the pre-existing
   * enumeration in `server.ts` gets it backwards: it does
   * `SELECT relationship_type FROM relationship_snapshots` and dedupes, so it
   * reports types that HAVE been written. A registered-but-unwritten type is
   * invisible there — exactly backwards for a consumer discovering what it may
   * write BEFORE writing it. A registered type with zero edges appears here.
   */
  async list(params?: {
    user_id?: string;
    keyword?: string;
    scope?: RelationshipTypeScope;
    include_deactivated?: boolean;
  }): Promise<RelationshipTypeRegistration[]> {
    let all = await this.resolveAll(params?.user_id);
    if (!params?.include_deactivated) {
      all = all.filter((r) => r.state === "active");
    }
    if (params?.scope) {
      all = all.filter((r) => r.scope === params.scope);
    }
    if (params?.keyword) {
      const needle = params.keyword.toLowerCase();
      all = all.filter(
        (r) =>
          r.relationship_type.toLowerCase().includes(needle) ||
          (r.description ?? "").toLowerCase().includes(needle)
      );
    }
    return all.sort((a, b) => a.relationship_type.localeCompare(b.relationship_type));
  }

  /** The set of type names a write by `userId` may currently use. */
  async activeTypeNames(userId?: string): Promise<Set<string>> {
    const rows = await this.list({ user_id: userId });
    return new Set(rows.map((r) => r.relationship_type));
  }

  /** Effective registration for one type, or null. */
  async get(
    relationshipType: string,
    userId?: string
  ): Promise<RelationshipTypeRegistration | null> {
    const rows = await this.resolveAll(userId);
    const found = rows.find((r) => r.relationship_type === relationshipType);
    return found && found.state === "active" ? found : null;
  }
}

/**
 * ── CACHING ───────────────────────────────────────────────────────────────
 *
 * Deliberately a SHORT-TTL cache, not a process-lifetime one, and not absent.
 *
 * Absent would mean one indexed SELECT per edge write. That is correct but it
 * turns a set-membership test into I/O on the hottest write path, and `store`
 * writes edges in a loop.
 *
 * A process-lifetime cache invalidated on registration — the shape
 * `services/bundles/loader.ts` uses — is correct only WITHIN one process. On a
 * multi-machine deployment a registration on machine A is invisible to machine
 * B forever, and there is no cross-process invalidation mechanism anywhere in
 * this tree to borrow. That failure mode is silent and unbounded.
 *
 * A short TTL bounds the staleness instead: a type registered on machine A is
 * usable on machine B within `CACHE_TTL_MS`. The cost is that a DEREGISTRATION
 * is up to that long in taking effect, which is the cost `agent_grants.ts`
 * already accepts for the same reason at the same TTL. Local registrations
 * invalidate immediately, so the common single-process case is exact.
 */
const CACHE_TTL_MS = 5_000;

let cachedNames: { key: string; names: Set<string>; expiresAt: number } | null = null;

export function invalidateRelationshipTypeCache(): void {
  cachedNames = null;
}

export const relationshipTypeRegistry = new RelationshipTypeRegistryService();

/** Cached membership read used by the single enforcement point. */
export async function getActiveRelationshipTypeNames(userId?: string): Promise<Set<string>> {
  const key = userId ?? "";
  const now = Date.now();
  if (cachedNames && cachedNames.key === key && cachedNames.expiresAt > now) {
    return cachedNames.names;
  }
  try {
    const names = await relationshipTypeRegistry.activeTypeNames(userId);
    cachedNames = { key, names, expiresAt: now + CACHE_TTL_MS };
    return names;
  } catch (err) {
    // A registry read failure must not take down every relationship write. Fall
    // back to the last known good set if we have one; otherwise rethrow, since
    // silently accepting ANY type would be worse than refusing.
    if (cachedNames && cachedNames.key === key) {
      logger.warn(
        `[RelationshipTypeRegistry] read failed, serving stale membership set: ` +
          `${(err as Error).message}`
      );
      return cachedNames.names;
    }
    throw err;
  }
}

/** Whether a type is registered as acyclic for this caller. */
export async function isRelationshipTypeAcyclic(
  relationshipType: string,
  userId?: string
): Promise<boolean> {
  const registration = await relationshipTypeRegistry.get(relationshipType, userId);
  return registration?.acyclic === true;
}
