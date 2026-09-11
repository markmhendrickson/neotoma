/**
 * Instruction-entity service (formerly the standing-rules service).
 *
 * Loads instruction-bearing entities for a user and returns them in rank
 * order so callers can inject them into agent context at session start.
 *
 * An "instruction entity" is a persistent agent instruction stored in
 * Neotoma. Which entity types count is configuration, not code: the set is
 * governed by `NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES` and each configured type
 * must have an entry in {@link INSTRUCTION_TYPE_MAP} describing where its
 * instruction text lives, what makes it active, and how it ranks. A type that
 * is configured but unmapped is skipped with a warning rather than guessed at
 * — silently projecting the wrong field would look identical to the bug this
 * module exists to fix (#2054).
 *
 * Ordering is rank descending (higher = more important), ties broken by
 * `title` ascending for deterministic output across mixed types.
 *
 * Projection is an explicit allowlist — `{ entity_id, entity_type, title,
 * text, scope? }`. It is deliberately not a blocklist: a field added to
 * either entity type later must not leak into a session payload by default.
 * In particular `agent_policy.body` (long-form provenance, the field most
 * likely to accumulate incidental personal data) is never injected. The
 * array is an *index* — an agent retrieves full detail by `entity_id`.
 *
 * This service is read-only and must never issue writes or side effects.
 */

import { config } from "../config.js";
import { db } from "../db.js";
import { logger } from "../utils/logger.js";

/** Log prefix for every diagnostic this module emits. */
const LOG_PREFIX = "[instruction_entities]";

/**
 * Minimal projection of an instruction entity injected at session start.
 *
 * `text` is the single instruction field, mapped from whichever per-type
 * field actually carries it (`standing_rule.rule_text`, `agent_policy.rule`).
 */
export interface InstructionEntity {
  entity_id: string;
  entity_type: string;
  title: string;
  text: string;
  scope?: string;
  /**
   * Shared numeric rank, higher = more important. Not part of the injected
   * payload's documented item schema, but carried here so the caller can
   * synthesise `priority` for the deprecated `standing_rules` alias.
   */
  rank: number;
  /** Owning agent identity, when the entity declares one. Never injected. */
  domain?: string;
  /** Whether this entity's type participates in scope filtering. Never injected. */
  scopeFiltered: boolean;
}

/**
 * Legacy projection of a `standing_rule` entity.
 *
 * @deprecated Use {@link InstructionEntity}. Retained for the deprecated
 * `serverInfo._neotoma.standing_rules` alias and any in-repo caller not yet
 * migrated; scheduled for removal one minor after the alias is dropped.
 */
export interface StandingRule {
  entity_id: string;
  title: string;
  rule_text: string;
  scope?: string;
  priority: number;
}

/**
 * Shared rank scale for `agent_policy.rule_kind`.
 *
 * Deliberately sparse and descending-meaningful so `standing_rule.priority`
 * values (passed through as authored) interleave sensibly with policy kinds
 * on one axis. A mandatory policy outranks a recommendation regardless of
 * which type it came from.
 */
export const RULE_KIND_RANK: Record<string, number> = {
  mandatory: 300,
  recommended: 200,
  operating_discipline: 100,
};

/** How to read one instruction-bearing entity type out of its snapshot. */
interface InstructionTypeMapping {
  /**
   * Snapshot keys carrying the instruction text, tried in order. The first
   * non-empty string wins; a row with none is skipped.
   */
  textFields: readonly string[];
  /** Whether this snapshot should be injected at all. */
  active: (snap: Record<string, unknown>) => boolean;
  /** Shared-scale rank, higher = more important. */
  rank: (snap: Record<string, unknown>) => number;
  /**
   * Whether this type participates in scope filtering.
   *
   * `standing_rule` opts out. Its `scope` has always been a free-form label
   * (`"my-project"`, a repo name) that the loader never filtered on, so
   * subjecting it to the configured `{global, swarm}` set would silently
   * stop injecting every narrowly-scoped rule on every existing instance —
   * a regression wearing a filter's clothes, and the opposite of the
   * "existing `standing_rule` behaviour unchanged under default config"
   * acceptance criterion. Scope filtering exists for `agent_policy`, where
   * `domain`-scoped entries are per-agent noise in unrelated sessions.
   */
  scopeFiltered: boolean;
}

/**
 * Coerce an authored `priority` onto the shared numeric scale.
 *
 * Prod rows are not uniformly numeric: some carry `"high"` / `"medium"` /
 * `"low"`. Mapping those onto numbers keeps a worded priority from silently
 * sorting as 0 (i.e. below everything).
 */
function coercePriority(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() !== "" && Number.isFinite(numeric)) return numeric;
    const worded: Record<string, number> = { high: 100, medium: 50, low: 10 };
    const mapped = worded[value.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  return 0;
}

/**
 * Type registry: the single place that knows how each entity type is shaped.
 *
 * This is what makes `NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES` meaningful. If
 * adding a type still required editing a conditional in the loader body, the
 * config option would be theater — so the registry is a table, and a
 * configured type with no entry here is skipped with a warning naming the
 * registered types.
 *
 * `standing_rule`'s text/active mapping is deliberately wider than the
 * historical `rule_text`/`enabled` pair. Live snapshots commonly carry the
 * instruction under `instruction` or `content` and carry `status: "active"`
 * rather than `enabled: true`; a registry that only read `rule_text` would
 * preserve today's silent miss while claiming defaults were unchanged.
 */
export const INSTRUCTION_TYPE_MAP: Record<string, InstructionTypeMapping> = {
  standing_rule: {
    textFields: ["rule_text", "instruction", "content", "rule"],
    active: (snap) => {
      if (snap["enabled"] === false) return false;
      const status = snap["status"];
      if (typeof status === "string") {
        const s = status.trim().toLowerCase();
        if (s === "inactive" || s === "disabled" || s === "archived") return false;
      }
      return true;
    },
    rank: (snap) => coercePriority(snap["priority"]),
    scopeFiltered: false,
  },
  agent_policy: {
    textFields: ["rule"],
    active: (snap) => snap["status"] === "active",
    rank: (snap) =>
      typeof snap["rule_kind"] === "string" ? (RULE_KIND_RANK[snap["rule_kind"]] ?? 0) : 0,
    scopeFiltered: true,
  },
};

/** Options resolved by the caller for one session's load. */
export interface LoadInstructionEntitiesOptions {
  /**
   * Server-resolved agent identity from AAuth / request context, used for the
   * domain half of the scope union. MUST NOT be sourced from client-supplied
   * `clientInfo` or a harness hint: a client that could name its own domain
   * could pull another agent's private policies into its session.
   */
  agentIdentity?: string | null;
  /** Overrides for tests; production reads `config.mcp.*`. */
  entityTypes?: string[];
  scopes?: string[];
  maxEntities?: number;
}

export interface InstructionEntitiesResult {
  entities: InstructionEntity[];
  /**
   * True when at least one configured type's lookup failed. An empty array is
   * ambiguous on its own — "no instructions configured" and "the lookup
   * failed" are very different conditions, and conflating them is a silent
   * policy bypass (#2131). Callers surfacing these to an agent must report the
   * failure rather than presenting it as an empty policy.
   */
  lookup_failed: boolean;
  error?: string;
}

/**
 * Load every configured instruction-bearing entity type for `userId`.
 *
 * Fails soft throughout: a failure loading one type does not suppress the
 * others, and no failure blocks session initialisation.
 */
export async function getInstructionEntitiesResult(
  userId: string,
  options: LoadInstructionEntitiesOptions = {}
): Promise<InstructionEntitiesResult> {
  const entityTypes = options.entityTypes ?? config.mcp.instructionEntityTypes;
  const scopes = options.scopes ?? config.mcp.instructionScopes;
  const maxEntities = options.maxEntities ?? config.mcp.instructionMaxEntities;
  const agentIdentity = options.agentIdentity ?? null;

  if (entityTypes.length === 0) {
    logger.info(
      `${LOG_PREFIX} injection disabled: NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES is empty ` +
        `(re-enable by setting it to e.g. "standing_rule,agent_policy")`
    );
    return { entities: [], lookup_failed: false };
  }

  const collected: InstructionEntity[] = [];
  let lookupFailed = false;
  let firstError: string | undefined;

  for (const entityType of entityTypes) {
    const mapping = INSTRUCTION_TYPE_MAP[entityType];
    if (!mapping) {
      // Config genuinely governs behaviour, so an unmapped name is an
      // operator-visible mistake rather than something to silently guess at.
      logger.warn(
        `${LOG_PREFIX} no field mapping for entity type "${entityType}"; skipping. ` +
          `Registered types: ${Object.keys(INSTRUCTION_TYPE_MAP).join(", ")}. ` +
          `Add a registry entry or remove it from NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES.`
      );
      continue;
    }

    // Per-type try/catch: one type failing must not cost the others. A
    // broken `agent_policy` read should not also suppress standing rules.
    try {
      const typed = await loadOneType(userId, entityType, mapping);
      if (typed.lookup_failed) {
        lookupFailed = true;
        firstError ??= typed.error;
      }
      collected.push(...typed.entities);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${LOG_PREFIX} unexpected error loading "${entityType}": ${msg}`);
      lookupFailed = true;
      firstError ??= msg;
    }
  }

  // Scope filter is a UNION, never an intersection. A per-agent policy
  // carries its own narrow `scope` (e.g. `copy`) alongside a `domain`
  // naming its owning agent; intersecting would drop that agent's own
  // policy from that agent's own session — exactly backwards. With no
  // resolved agent identity, the domain half is skipped entirely rather
  // than matched loosely, so per-agent rules never leak into a session
  // that cannot claim an identity.
  //
  // An entity with no `scope` at all is included: scope is optional, and
  // treating "absent" as "out of scope" would drop unscoped entries that
  // are in every sense global. Types that opt out of scope filtering
  // entirely (see `scopeFiltered`) pass through untouched.
  const scopeSet = new Set(scopes);
  const inScope = collected.filter((entity) => {
    if (!entity.scopeFiltered) return true;
    if (entity.scope === undefined) return true;
    if (scopeSet.has(entity.scope)) return true;
    if (agentIdentity && entity.domain !== undefined && entity.domain === agentIdentity) {
      return true;
    }
    return false;
  });

  // Sort before capping, always: the cap must drop the least important
  // entities, not an arbitrary query-order slice.
  inScope.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.title.localeCompare(b.title);
  });

  let entities = inScope;
  if (inScope.length > maxEntities) {
    const dropped = inScope.slice(maxEntities);
    entities = inScope.slice(0, maxEntities);
    // Loud by design. Silently truncating a mandatory policy would be
    // indistinguishable from the bug #2054 exists to fix, so this names the
    // count, the dropped ids and the knob — and never the instruction text.
    logger.warn(
      `${LOG_PREFIX} cap reached: injected ${entities.length}, dropped ${dropped.length} ` +
        `entities: ${dropped.map((e) => e.entity_id).join(", ")}. ` +
        `Raise NEOTOMA_MCP_INSTRUCTION_MAX_ENTITIES or narrow ` +
        `NEOTOMA_MCP_INSTRUCTION_ENTITY_TYPES / NEOTOMA_MCP_INSTRUCTION_SCOPES.`
    );
  }

  return {
    entities,
    lookup_failed: lookupFailed,
    ...(firstError !== undefined ? { error: firstError } : {}),
  };
}

/**
 * Load and project one entity type.
 *
 * Every query filters by `user_id` — the tenant-isolation invariant this
 * module has carried since it was written — and excludes merged-away rows.
 */
async function loadOneType(
  userId: string,
  entityType: string,
  mapping: InstructionTypeMapping
): Promise<InstructionEntitiesResult> {
  // Read the reduced field values straight off entity_snapshots. This used
  // to join from `entities` with the PostgREST embedded-resource hint
  // `entity_snapshots!inner(snapshot)`, which only the Supabase backend
  // understands: libSQL forwards it into SQL and fails with
  // `unrecognized token: "!"`. Because this path swallows errors to avoid
  // blocking session init, that failure was silent and every session on a
  // libSQL instance received zero standing rules while storage and
  // retrieval both reported success (#2131).
  //
  // entity_snapshots already carries entity_id, canonical_name, user_id and
  // entity_type, so no join is needed for what we return.
  const { data, error } = await db
    .from("entity_snapshots")
    .select("entity_id, canonical_name, snapshot")
    .eq("user_id", userId)
    .eq("entity_type", entityType);

  if (error) {
    // error, not warn: a failed lookup means no rule of this type reaches
    // the session, which is a policy bypass rather than a degraded read.
    logger.error(
      `${LOG_PREFIX} LOOKUP FAILED for "${entityType}" — no entities of this type will be ` +
        `injected this session (this is NOT the same as having none configured): ${error.message}`
    );
    return { entities: [], lookup_failed: true, error: error.message };
  }

  if (!data || (data as unknown[]).length === 0) {
    return { entities: [], lookup_failed: false };
  }

  // entity_snapshots carries no merge pointer, so exclude merged-away rows
  // with a second bounded lookup rather than dropping the filter. A failure
  // here must not suppress instructions: fall back to injecting everything
  // found, since a stale merged rule is a lesser harm than no rules at all.
  let mergedAway = new Set<string>();
  const { data: mergedRows, error: mergedErr } = await db
    .from("entities")
    .select("id, merged_to_entity_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType);
  if (mergedErr) {
    logger.warn(
      `${LOG_PREFIX} merge-filter lookup failed for "${entityType}" (${mergedErr.message}); injecting unfiltered`
    );
  } else if (mergedRows) {
    mergedAway = new Set(
      (mergedRows as Array<{ id: string; merged_to_entity_id: string | null }>)
        .filter((r) => r.merged_to_entity_id != null)
        .map((r) => r.id)
    );
  }

  const entities: InstructionEntity[] = [];
  // Rows dropped because no mapped field carried instruction text. Counted
  // rather than ignored: a row-shape rejection is as much a silent policy
  // bypass as a failed query, and until now it was the one drop path here
  // that logged nothing and left `lookup_failed` false — so an instance
  // whose stored snapshots use different field names looked identical to an
  // instance with no rules at all. That is the failure mode behind #2054's
  // reported empty payload.
  const droppedNoText: string[] = [];

  for (const row of data as Array<{
    entity_id: string;
    canonical_name: string;
    snapshot: Record<string, unknown> | string | null;
  }>) {
    // Backends differ on whether a JSON column arrives parsed or as text.
    let snap: Record<string, unknown> = {};
    if (typeof row.snapshot === "string") {
      try {
        snap = JSON.parse(row.snapshot) as Record<string, unknown>;
      } catch {
        continue;
      }
    } else if (row.snapshot && typeof row.snapshot === "object") {
      snap = row.snapshot;
    }

    if (mergedAway.has(row.entity_id)) continue;
    if (!mapping.active(snap)) continue;

    let text: string | null = null;
    for (const field of mapping.textFields) {
      const value = snap[field];
      if (typeof value === "string" && value.trim() !== "") {
        text = value;
        break;
      }
    }
    // No usable instruction text: nothing to inject.
    if (text === null) {
      droppedNoText.push(row.entity_id);
      continue;
    }

    const title = typeof snap["title"] === "string" ? snap["title"] : row.canonical_name;

    entities.push({
      entity_id: row.entity_id,
      entity_type: entityType,
      title,
      text,
      ...(typeof snap["scope"] === "string" ? { scope: snap["scope"] } : {}),
      rank: mapping.rank(snap),
      ...(typeof snap["domain"] === "string" ? { domain: snap["domain"] } : {}),
      scopeFiltered: mapping.scopeFiltered,
    });
  }

  if (droppedNoText.length > 0) {
    logger.warn(
      `${LOG_PREFIX} skipped ${droppedNoText.length} "${entityType}" row(s) carrying no ` +
        `instruction text in any mapped field (${mapping.textFields.join(", ")}): ` +
        `${droppedNoText.join(", ")}. If this instance stores the text under a different ` +
        `field, add it to this type's registry entry in src/services/standing_rules.ts.`
    );
  }

  return { entities, lookup_failed: false };
}

/**
 * Reshape instruction entities into the deprecated `standing_rules` payload.
 *
 * Emitted alongside the canonical `instruction_entities` for one minor
 * release so consumers reading `serverInfo._neotoma.standing_rules` keep
 * working through the rename. `priority` is the shared rank, which for a
 * `standing_rule` is its authored priority and for other types is the rank
 * that placed it in the ordering — so a legacy consumer sorting by
 * `priority` descending reproduces the canonical order.
 *
 * @deprecated Drop with the alias at the next minor.
 */
export function toLegacyStandingRules(entities: InstructionEntity[]): StandingRule[] {
  return entities.map((entity) => ({
    entity_id: entity.entity_id,
    title: entity.title,
    rule_text: entity.text,
    ...(entity.scope !== undefined ? { scope: entity.scope } : {}),
    priority: entity.rank,
  }));
}

/**
 * Instruction entities in the legacy standing-rule shape, plus whether the
 * lookup itself succeeded.
 *
 * @deprecated Use {@link getInstructionEntitiesResult}. Retained so existing
 * callers keep compiling through the deprecation window.
 */
export async function getActiveStandingRulesResult(
  userId: string,
  options: LoadInstructionEntitiesOptions = {}
): Promise<{ rules: StandingRule[]; lookup_failed: boolean; error?: string }> {
  const result = await getInstructionEntitiesResult(userId, options);
  return {
    rules: toLegacyStandingRules(result.entities),
    lookup_failed: result.lookup_failed,
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}

/**
 * Return instruction entities for `userId` in the legacy standing-rule shape.
 *
 * Returns an empty array on any error so session initialisation is never
 * blocked by a lookup failure.
 *
 * IMPORTANT: an empty array is ambiguous on its own — it means either "this
 * user has no instructions" or "the lookup failed". Those are very different
 * conditions: the first is normal, the second is a silent policy bypass, and
 * conflating them is exactly why #2131 went unnoticed. Callers that surface
 * these to an agent should use {@link getInstructionEntitiesResult} and
 * report the failure rather than presenting it as an empty policy.
 *
 * @deprecated Use {@link getInstructionEntitiesResult}.
 */
export async function getActiveStandingRules(
  userId: string,
  options: LoadInstructionEntitiesOptions = {}
): Promise<StandingRule[]> {
  return (await getActiveStandingRulesResult(userId, options)).rules;
}
