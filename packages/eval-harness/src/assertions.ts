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
