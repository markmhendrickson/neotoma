/**
 * Tier 2 assertion engine.
 *
 * Predicates compile to small async functions that query the post-turn
 * Neotoma state via HTTP and report a structured pass/fail result. We
 * avoid pulling in `@neotoma/client` so that the harness can run against
 * any conforming Neotoma server (sandbox, dev, etc.) without the client
 * lockstep.
 */

import type {
  AssertionFailure,
  ExpectedAssertion,
  InstructionProfile,
  ToolCall,
} from "./types.js";
import type { HostToolInvocation, HostToolRegistry } from "./host_tools.js";

export interface AssertionContext {
  baseUrl: string;
  /** Captured by the runner from the isolated server's /stats. */
  stats: Record<string, unknown> | null;
  /** Host tool invocation log. */
  hostToolRegistry: HostToolRegistry;
  /** Effective profile for the cell (used by the instruction_profile predicate). */
  effectiveProfile: InstructionProfile;
  /** Final assistant reply text (used by reply_text.contains). */
  assistantText?: string;
  /**
   * Every MCP/tool call the agent issued this turn, in order (#1703). Carries
   * name, input, output, and error — the substrate for mcp_tool.invocations
   * and tool_result.matches.
   */
  toolCalls?: ToolCall[];
}

interface EntitiesQueryResponse {
  entities?: Array<Record<string, unknown>>;
  total?: number;
}

interface RelationshipsResponse {
  relationships?: Array<Record<string, unknown>>;
  total?: number;
}

interface ObservationsResponse {
  observations?: Array<Record<string, unknown>>;
  total?: number;
}

async function fetchEntities(
  ctx: AssertionContext,
  entityType?: string,
  where?: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const body: Record<string, unknown> = {
    limit: 200,
  };
  if (entityType) body.entity_type = entityType;
  if (where) body.filters = where;
  try {
    const res = await fetch(`${ctx.baseUrl}/entities/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EntitiesQueryResponse;
    return json.entities ?? [];
  } catch {
    return [];
  }
}

async function fetchRelationships(
  ctx: AssertionContext,
  relType: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const url = new URL(`${ctx.baseUrl}/relationships`);
    url.searchParams.set("relationship_type", relType);
    url.searchParams.set("limit", "200");
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) return [];
    const json = (await res.json()) as RelationshipsResponse;
    return json.relationships ?? [];
  } catch {
    return [];
  }
}

async function fetchObservations(
  ctx: AssertionContext,
  field: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const url = new URL(`${ctx.baseUrl}/observations`);
    url.searchParams.set("limit", "200");
    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) return [];
    const json = (await res.json()) as ObservationsResponse;
    const all = json.observations ?? [];
    return all.filter((o) => {
      const data = (o.data ?? o) as Record<string, unknown>;
      return Object.prototype.hasOwnProperty.call(data, field);
    });
  } catch {
    return [];
  }
}

function whereMatches(
  entity: Record<string, unknown>,
  where: Record<string, unknown> | undefined
): boolean {
  if (!where) return true;
  const data = (entity.snapshot ?? entity) as Record<string, unknown>;
  for (const [k, v] of Object.entries(where)) {
    if (data[k] !== v) return false;
  }
  return true;
}

function compareNumber(actual: number, op: ExpectedAssertion["op"], expected: number): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "gte":
      return actual >= expected;
    case "lte":
      return actual <= expected;
    default:
      return actual === expected;
  }
}

function countStoreStructuredCalls(stats: Record<string, unknown> | null): number {
  if (!stats) return 0;
  // The Neotoma /stats endpoint exposes various counters; we accept either
  // a top-level `store_structured_calls` or a nested `instruction_profile.calls.store_structured`.
  const direct = stats.store_structured_calls;
  if (typeof direct === "number") return direct;
  const ip = stats.instruction_profile as Record<string, unknown> | undefined;
  if (ip && typeof ip === "object") {
    const calls = (ip as { calls?: Record<string, unknown> }).calls;
    if (calls && typeof calls === "object") {
      const c = calls as Record<string, unknown>;
      const legacy = c.store_structured;
      const canonical = c.store;
      const n =
        (typeof legacy === "number" ? legacy : 0) + (typeof canonical === "number" ? canonical : 0);
      if (n > 0) return n;
    }
  }
  // Fallback: many Neotoma builds don't surface the call counter on /stats.
  // If the server reports any entity rows the agent created, treat that as
  // proof of at least one structured-store call. This avoids false negatives
  // on builds without the counter, while still failing closed when no
  // entities were created at all.
  const entitiesByType = stats.entities_by_type as Record<string, number> | undefined;
  if (entitiesByType && typeof entitiesByType === "object") {
    const total = Object.values(entitiesByType).reduce(
      (acc, v) => acc + (typeof v === "number" ? v : 0),
      0,
    );
    return total > 0 ? 1 : 0;
  }
  const totalEntities = stats.total_entities;
  if (typeof totalEntities === "number") {
    return totalEntities > 0 ? 1 : 0;
  }
  return -1;
}

function instructionProfileServed(
  stats: Record<string, unknown> | null,
  profile: InstructionProfile | undefined
): { served: boolean; counters: Record<string, number> } {
  if (!stats) return { served: false, counters: {} };
  const ip = stats.instruction_profile as Record<string, unknown> | undefined;
  const served = (ip?.served ?? ip?.profiles_served) as Record<string, number> | undefined;
  if (!served) return { served: false, counters: {} };
  if (!profile || profile === "auto") {
    const total = Object.values(served).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
    return { served: total > 0, counters: served };
  }
  const count = served[profile] ?? 0;
  return { served: count > 0, counters: served };
}

function countHostToolInvocations(
  invocations: HostToolInvocation[],
  toolName: string | undefined
): number {
  if (!toolName) return invocations.length;
  return invocations.filter((i) => i.name === toolName).length;
}

// ── #1703 helpers ────────────────────────────────────────────────────────────

/** Deep structural subset match: every key in `subset` exists in `value` with a
 * deep-equal value. Arrays match element-wise as subsets by index. */
function isSubset(value: unknown, subset: unknown): boolean {
  if (subset === null || typeof subset !== "object") {
    return deepEqual(value, subset);
  }
  if (Array.isArray(subset)) {
    if (!Array.isArray(value)) return false;
    return subset.every((s, i) => isSubset(value[i], s));
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  for (const [k, s] of Object.entries(subset as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) return false;
    if (!isSubset(v[k], s)) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ae = Object.entries(a as Record<string, unknown>);
  const be = Object.entries(b as Record<string, unknown>);
  if (ae.length !== be.length) return false;
  return ae.every(([k, av]) => deepEqual(av, (b as Record<string, unknown>)[k]));
}

/** Resolve a dotted path (e.g. "error.code") against a nested object. Returns
 * { found, value }; found=false distinguishes a missing key from a null value. */
function getPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return { found: false, value: undefined };
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[p];
  }
  return { found: true, value: cur };
}

/** Tool calls matching a name (or all when name omitted). */
function toolCallsNamed(calls: ToolCall[], name: string | undefined): ToolCall[] {
  if (!name) return calls;
  return calls.filter((c) => c.name === name);
}

/** Pick one tool call by `which` (default last). */
function pickToolCall(calls: ToolCall[], which: "first" | "last" | number | undefined): ToolCall | undefined {
  if (calls.length === 0) return undefined;
  if (which === "first") return calls[0];
  if (typeof which === "number") return calls[which];
  return calls[calls.length - 1]; // "last" / default
}

/** Fetch a single entity snapshot, resolving by id or by entity_type+where. */
async function fetchSnapshot(
  ctx: AssertionContext,
  entityId: string | undefined,
  entityType: string | undefined,
  where: Record<string, unknown> | undefined
): Promise<Record<string, unknown> | null> {
  let id = entityId;
  if (!id) {
    const matches = (await fetchEntities(ctx, entityType, where)).filter((e) =>
      whereMatches(e, where)
    );
    if (matches.length === 0) return null;
    id = (matches[0].entity_id ?? matches[0].id) as string | undefined;
    // If the listing already carries the snapshot, use it directly.
    const snap = matches[0].snapshot as Record<string, unknown> | undefined;
    if (snap && typeof snap === "object") return snap;
  }
  if (!id) return null;
  try {
    const res = await fetch(`${ctx.baseUrl}/entities/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const snap = (json.snapshot ?? json) as Record<string, unknown>;
    return snap;
  } catch {
    return null;
  }
}

export async function evaluatePredicate(
  predicate: ExpectedAssertion,
  ctx: AssertionContext
): Promise<AssertionFailure | null> {
  switch (predicate.type) {
    case "store_structured.calls": {
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "gte";
      const actual = countStoreStructuredCalls(ctx.stats);
      if (actual < 0) {
        return {
          predicate,
          message: `Cannot read unified store call counts from /stats payload (server may not expose the counter).`,
          expected: { op, value: expected },
          actual: ctx.stats,
        };
      }
      if (compareNumber(actual, op, expected)) return null;
      return {
        predicate,
        message: `Expected store_structured.calls (unified MCP/HTTP store) ${op} ${expected}, got ${actual}.`,
        expected: { op, value: expected },
        actual,
      };
    }
    case "entity.exists": {
      const types = predicate.entity_type_any_of && predicate.entity_type_any_of.length > 0
        ? predicate.entity_type_any_of
        : predicate.entity_type
          ? [predicate.entity_type]
          : [undefined as unknown as string];
      const lists = await Promise.all(types.map((t) => fetchEntities(ctx, t, predicate.where)));
      const all = lists.flat();
      const matches = all.filter((e) => whereMatches(e, predicate.where));
      if (matches.length > 0) return null;
      const typeLabel = types.length > 1 ? `any of ${JSON.stringify(types)}` : `"${types[0]}"`;
      return {
        predicate,
        message: `Expected at least one entity of type ${typeLabel}${
          predicate.where ? ` matching ${JSON.stringify(predicate.where)}` : ""
        }, found ${all.length}.`,
        expected: predicate,
        actual: all.map((e) => ({
          entity_type: e.entity_type,
          canonical_name: e.canonical_name,
        })),
      };
    }
    case "entity.count": {
      const entities = await fetchEntities(ctx, predicate.entity_type, predicate.where);
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "eq";
      if (compareNumber(entities.length, op, expected)) return null;
      return {
        predicate,
        message: `Expected entity.count of "${predicate.entity_type}" ${op} ${expected}, got ${entities.length}.`,
        expected: { op, value: expected },
        actual: entities.length,
      };
    }
    case "observation.with_field": {
      const field = predicate.field ?? "";
      const obs = await fetchObservations(ctx, field);
      if (obs.length > 0) return null;
      return {
        predicate,
        message: `Expected at least one observation carrying field "${field}", got 0.`,
        expected: { field },
        actual: 0,
      };
    }
    case "relationship.exists": {
      const types = predicate.relationship_type_any_of && predicate.relationship_type_any_of.length > 0
        ? predicate.relationship_type_any_of
        : predicate.relationship_type
          ? [predicate.relationship_type]
          : [];
      const lists = await Promise.all(types.map((t) => fetchRelationships(ctx, t)));
      const rels = lists.flat();
      if (rels.length > 0) return null;
      const label = types.length > 1 ? `any of ${JSON.stringify(types)}` : types[0] ?? "(unspecified)";
      return {
        predicate,
        message: `Expected at least one ${label} relationship, got 0.`,
        expected: predicate,
        actual: rels,
      };
    }
    case "turn_compliance.backfilled": {
      const expectedBackfill = predicate.value === true;
      // Backfill manifests as a `conversation_turn` row with status="backfilled_by_hook"
      // OR a dedicated `turn_compliance` entity (depends on the harness).
      const turns = await fetchEntities(ctx, "conversation_turn");
      const compliance = await fetchEntities(ctx, "turn_compliance");
      const candidates = [...turns, ...compliance];
      const backfilled = candidates.find((e) => {
        const data = (e.snapshot ?? e) as Record<string, unknown>;
        return data.status === "backfilled_by_hook";
      });
      if (expectedBackfill) {
        if (backfilled) return null;
        return {
          predicate,
          message: `Expected turn_compliance.backfilled=true, got no backfilled-by-hook entity.`,
          expected: true,
          actual: false,
        };
      }
      if (!backfilled) return null;
      return {
        predicate,
        message: `Expected turn_compliance.backfilled=false, but the stop hook backfilled compliance.`,
        expected: false,
        actual: backfilled,
      };
    }
    case "instruction_profile.served": {
      const { served, counters } = instructionProfileServed(ctx.stats, predicate.profile);
      if (served) return null;
      return {
        predicate,
        message: `Expected instruction_profile "${predicate.profile ?? "any"}" to have been served at least once, got counters ${JSON.stringify(counters)}.`,
        expected: predicate,
        actual: counters,
      };
    }
    case "host_tool.invocations": {
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "eq";
      const actual = countHostToolInvocations(
        ctx.hostToolRegistry.invocations,
        predicate.tool_name
      );
      if (compareNumber(actual, op, expected)) return null;
      return {
        predicate,
        message: `Expected host_tool[${predicate.tool_name ?? "*"}] invocations ${op} ${expected}, got ${actual}.`,
        expected: { op, value: expected, tool_name: predicate.tool_name },
        actual,
      };
    }
    case "reply_text.contains": {
      const text = ctx.assistantText ?? "";
      if (predicate.pattern) {
        const re = new RegExp(predicate.pattern, "i");
        if (re.test(text)) return null;
        return {
          predicate,
          message: `Expected assistant reply to match pattern /${predicate.pattern}/i, but it did not.`,
          expected: predicate.pattern,
          actual: text.slice(0, 200),
        };
      }
      const needle = predicate.substring ?? (typeof predicate.value === "string" ? predicate.value : "");
      if (!needle) {
        return {
          predicate,
          message: `reply_text.contains requires either "substring", "pattern", or a string "value".`,
          expected: predicate,
          actual: null,
        };
      }
      if (text.toLowerCase().includes(needle.toLowerCase())) return null;
      return {
        predicate,
        message: `Expected assistant reply to contain "${needle}" (case-insensitive), but it did not.`,
        expected: needle,
        actual: text.slice(0, 200),
      };
    }
    case "relationship.count": {
      const types = predicate.relationship_type_any_of && predicate.relationship_type_any_of.length > 0
        ? predicate.relationship_type_any_of
        : predicate.relationship_type
          ? [predicate.relationship_type]
          : [];
      const lists = await Promise.all(types.map((t) => fetchRelationships(ctx, t)));
      const rels = lists.flat();
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "eq";
      if (compareNumber(rels.length, op, expected)) return null;
      const label = types.length > 1 ? `any of ${JSON.stringify(types)}` : types[0] ?? "(unspecified)";
      return {
        predicate,
        message: `Expected relationship.count of "${label}" ${op} ${expected}, got ${rels.length}.`,
        expected: { op, value: expected },
        actual: rels.length,
      };
    }
    // ── #1703 eval-coverage primitives ──
    case "mcp_tool.invocations": {
      const calls = ctx.toolCalls ?? [];
      let matching = toolCallsNamed(calls, predicate.tool_name);
      if (predicate.arg_subset) {
        matching = matching.filter((c) => isSubset(c.input, predicate.arg_subset));
      }
      const actual = matching.length;
      const expected = typeof predicate.value === "number" ? predicate.value : 1;
      const op = predicate.op ?? "gte";
      if (compareNumber(actual, op, expected)) return null;
      return {
        predicate,
        message: `Expected mcp_tool[${predicate.tool_name ?? "*"}]${
          predicate.arg_subset ? ` with args ⊇ ${JSON.stringify(predicate.arg_subset)}` : ""
        } invocations ${op} ${expected}, got ${actual}.`,
        expected: { op, value: expected, tool_name: predicate.tool_name, arg_subset: predicate.arg_subset },
        actual: calls.map((c) => ({ name: c.name, input: c.input })),
      };
    }
    case "tool_result.matches": {
      const calls = toolCallsNamed(ctx.toolCalls ?? [], predicate.tool_name);
      const call = pickToolCall(calls, predicate.which);
      if (!call) {
        return {
          predicate,
          message: `tool_result.matches: no invocation of "${predicate.tool_name ?? "(any)"}" was captured.`,
          expected: predicate,
          actual: (ctx.toolCalls ?? []).map((c) => c.name),
        };
      }
      // The result is the tool's output; failed calls expose {error:{...}} so
      // error-surface assertions work. Prefer output, fall back to a synthesized
      // error envelope when the call recorded an error string.
      const result: unknown =
        call.output !== undefined
          ? call.output
          : call.error !== undefined
            ? { error: { message: call.error } }
            : undefined;
      // (a) result_key present/absent check (dotted path).
      if (predicate.result_key) {
        const { found } = getPath(result, predicate.result_key);
        const wantPresent = predicate.present !== false;
        if (found === wantPresent) {
          // key check satisfied; fall through to result_subset if also given.
        } else {
          return {
            predicate,
            message: `Expected tool_result["${predicate.tool_name}"].${predicate.result_key} to be ${
              wantPresent ? "present" : "absent"
            }, but it was ${found ? "present" : "absent"}.`,
            expected: { result_key: predicate.result_key, present: wantPresent },
            actual: result,
          };
        }
      }
      // (b) result_subset structural match.
      if (predicate.result_subset) {
        if (!isSubset(result, predicate.result_subset)) {
          return {
            predicate,
            message: `Expected tool_result["${predicate.tool_name}"] to match subset ${JSON.stringify(
              predicate.result_subset
            )}, but it did not.`,
            expected: { result_subset: predicate.result_subset },
            actual: result,
          };
        }
      }
      return null;
    }
    case "snapshot.field_present":
    case "snapshot.field_absent": {
      const field = predicate.field ?? "";
      if (!field) {
        return {
          predicate,
          message: `${predicate.type} requires a "field" to check.`,
          expected: predicate,
          actual: null,
        };
      }
      const snap = await fetchSnapshot(ctx, predicate.entity_id, predicate.entity_type, predicate.where);
      if (!snap) {
        return {
          predicate,
          message: `${predicate.type}: could not resolve an entity snapshot (id=${
            predicate.entity_id ?? "—"
          }, type=${predicate.entity_type ?? "—"}, where=${JSON.stringify(predicate.where ?? {})}).`,
          expected: predicate,
          actual: null,
        };
      }
      const { found } = getPath(snap, field);
      const wantPresent = predicate.type === "snapshot.field_present";
      if (found === wantPresent) return null;
      return {
        predicate,
        message: `Expected snapshot field "${field}" to be ${
          wantPresent ? "present" : "absent"
        }, but it was ${found ? "present" : "absent"}.`,
        expected: predicate,
        actual: Object.keys(snap),
      };
    }
  }
}

export async function evaluateExpectations(
  expectations: ExpectedAssertion[],
  ctx: AssertionContext
): Promise<AssertionFailure[]> {
  const failures: AssertionFailure[] = [];
  for (const predicate of expectations) {
    const fail = await evaluatePredicate(predicate, ctx);
    if (fail) failures.push(fail);
  }
  return failures;
}
