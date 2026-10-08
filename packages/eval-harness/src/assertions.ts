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
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
  /**
   * Data directory of the isolated Neotoma server for this cell. Lets
   * `raw_storage.file_count` observe the bytes actually written to disk,
   * independent of any database row.
   */
  dataDir?: string;
  /**
   * Bearer token the isolated server accepts. Used by `tools_list.*` to read
   * the live MCP `tools/list`, the surface a host's permission screen uses.
   */
  mcpToken?: string;
}

type ListedTool = Record<string, unknown> & { name?: string };

const MCP_STATELESS_VERSION = "2026-07-28";
const toolsListCache = new WeakMap<AssertionContext, Promise<ListedTool[] | string>>();

/**
 * Read the live `tools/list` over HTTP with the stateless MCP request shape
 * (no session handshake). Returns the tools, or an error string so the
 * predicate can fail with the reason instead of reading an empty list as data.
 */
function fetchToolsList(ctx: AssertionContext): Promise<ListedTool[] | string> {
  const cached = toolsListCache.get(ctx);
  if (cached) return cached;
  const pending = (async (): Promise<ListedTool[] | string> => {
    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": MCP_STATELESS_VERSION,
          "mcp-method": "tools/list",
          ...(ctx.mcpToken ? { authorization: `Bearer ${ctx.mcpToken}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": MCP_STATELESS_VERSION,
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": { name: "neotoma-eval-harness", version: "0.0.0" },
            },
          },
        }),
      });
      const text = await res.text();
      if (!res.ok) return `tools/list returned HTTP ${res.status}: ${text.slice(0, 300)}`;
      const payload = (res.headers.get("content-type") ?? "").includes("text/event-stream")
        ? text
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .filter(Boolean)
            .at(-1) ?? ""
        : text;
      const body = JSON.parse(payload) as { result?: { tools?: ListedTool[] }; error?: unknown };
      if (!body.result?.tools) {
        return `tools/list returned no tools: ${JSON.stringify(body.error ?? body).slice(0, 300)}`;
      }
      return body.result.tools;
    } catch (err) {
      return `tools/list failed: ${(err as Error).message}`;
    }
  })();
  toolsListCache.set(ctx, pending);
  return pending;
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


/** Raw-storage subdirectories under NEOTOMA_DATA_DIR (see config.rawStorageDir). */
const RAW_STORAGE_SUBDIRS = ["sources", "sources_prod"];

function countFilesRecursive(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) count += countFilesRecursive(full);
    else if (st.isFile()) count += 1;
  }
  return count;
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
    // Determinism: when more than one entity matches, pick the first by a
    // STABLE ordering (entity_id ascending) so the assertion is reproducible
    // regardless of server return order. (docs/architecture/determinism.md)
    matches.sort((a, b) =>
      String(a.entity_id ?? a.id ?? "").localeCompare(String(b.entity_id ?? b.id ?? ""))
    );
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
      // Re-filter client-side with whereMatches: the isolated server's
      // /entities/query does not honor the `filters` body param, so a `where`
      // clause must be applied here (mirroring entity.exists). Without this,
      // entity.count(where: {...}) silently counts ALL entities of the type.
      const fetched = await fetchEntities(ctx, predicate.entity_type, predicate.where);
      const entities = predicate.where
        ? fetched.filter((e) => whereMatches(e, predicate.where))
        : fetched;
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
        // Distinguish "tool never called" from "called, but `which` index is
        // out of range" — the latter is a scenario-authoring bug with a
        // concrete fix (docs/subsystems/errors.md — actionable hints).
        const outOfRange =
          typeof predicate.which === "number" && calls.length > 0;
        const message = outOfRange
          ? `tool_result.matches: "${predicate.tool_name ?? "(any)"}" was invoked ${calls.length} time(s), but which=${predicate.which} is out of range (valid 0..${calls.length - 1}).`
          : `tool_result.matches: no invocation of "${predicate.tool_name ?? "(any)"}" was captured.`;
        return {
          predicate,
          message,
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
      // result_key and result_subset are ANDed when both are supplied: the
      // key check must pass AND the subset must match. Either may be omitted.
      // (a) result_key present/absent check (dotted path).
      if (predicate.result_key) {
        const { found } = getPath(result, predicate.result_key);
        const wantPresent = predicate.present !== false;
        if (found === wantPresent) {
          // key check satisfied; fall through to the result_subset check below.
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
    // ── store plan-mode (#2493) state-delta primitives ──
    case "stats.counter": {
      const field = predicate.field ?? "";
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "eq";
      if (!field) {
        return {
          predicate,
          message: `stats.counter requires a "field" naming a numeric key of the post-turn /stats payload.`,
          expected: predicate,
          actual: null,
        };
      }
      const raw = ctx.stats ? getPath(ctx.stats, field) : { found: false, value: undefined };
      // Fail closed: a missing or non-numeric counter is never read as zero,
      // otherwise "== 0" would pass on an unreadable /stats payload.
      if (!raw.found || typeof raw.value !== "number") {
        return {
          predicate,
          message: `stats.counter: /stats has no numeric field "${field}" (got ${
            raw.found ? typeof raw.value : "absent"
          }); cannot assert it ${op} ${expected}.`,
          expected: { field, op, value: expected },
          actual: ctx.stats ? Object.keys(ctx.stats) : null,
        };
      }
      if (compareNumber(raw.value, op, expected)) return null;
      return {
        predicate,
        message: `Expected /stats "${field}" ${op} ${expected}, got ${raw.value}.`,
        expected: { field, op, value: expected },
        actual: raw.value,
      };
    }
    case "raw_storage.file_count": {
      const expected = typeof predicate.value === "number" ? predicate.value : 0;
      const op = predicate.op ?? "eq";
      if (!ctx.dataDir) {
        return {
          predicate,
          message: `raw_storage.file_count needs the isolated server's data dir, which this run did not provide.`,
          expected: { op, value: expected },
          actual: null,
        };
      }
      const present = RAW_STORAGE_SUBDIRS.map((d) => join(ctx.dataDir as string, d)).filter(
        (d) => existsSync(d)
      );
      // A directory that was never created holds zero files; that is the
      // correct reading for a run that wrote nothing to raw storage.
      const actual = present.reduce((acc, d) => acc + countFilesRecursive(d), 0);
      if (compareNumber(actual, op, expected)) return null;
      return {
        predicate,
        message: `Expected raw-storage file count ${op} ${expected}, got ${actual}.`,
        expected: { op, value: expected },
        actual,
      };
    }
    case "tools_list.tool": {
      const tools = await fetchToolsList(ctx);
      if (typeof tools === "string") {
        return { predicate, message: tools, expected: predicate, actual: null };
      }
      const tool = tools.find((candidate) => candidate.name === predicate.tool_name);
      if (!tool) {
        return {
          predicate,
          message: `tools_list.tool: "${predicate.tool_name ?? "(none)"}" is not in tools/list.`,
          expected: predicate,
          actual: tools.map((candidate) => candidate.name),
        };
      }
      if (predicate.tool_subset && !isSubset(tool, predicate.tool_subset)) {
        return {
          predicate,
          message: `Expected tools/list entry "${predicate.tool_name}" to match ${JSON.stringify(
            predicate.tool_subset
          )}.`,
          expected: predicate.tool_subset,
          actual: { title: tool.title, annotations: tool.annotations, _meta: tool._meta },
        };
      }
      const present = (predicate.absent_paths ?? []).filter((p) => getPath(tool, p).found);
      if (present.length > 0) {
        return {
          predicate,
          message: `Expected tools/list entry "${predicate.tool_name}" to omit ${present.join(", ")}.`,
          expected: { absent_paths: predicate.absent_paths },
          actual: { annotations: tool.annotations },
        };
      }
      return null;
    }
    case "tools_list.all_titled": {
      const tools = await fetchToolsList(ctx);
      if (typeof tools === "string") {
        return { predicate, message: tools, expected: predicate, actual: null };
      }
      const expectedCount = typeof predicate.value === "number" ? predicate.value : 1;
      const countOp = predicate.op ?? "gte";
      const untitled = tools
        .filter((tool) => {
          const title = typeof tool.title === "string" ? tool.title.trim() : "";
          const annotations = (tool.annotations ?? {}) as Record<string, unknown>;
          return !title || annotations.title !== tool.title;
        })
        .map((tool) => tool.name);
      const countOk = compareNumber(tools.length, countOp, expectedCount);
      if (countOk && untitled.length === 0) return null;
      return {
        predicate,
        message: !countOk
          ? `Expected tools/list tool count ${countOp} ${expectedCount}, got ${tools.length}.`
          : `Tools without a title mirrored into annotations.title: ${untitled.join(", ")}.`,
        expected: { op: countOp, value: expectedCount, title_equals_annotations_title: true },
        actual: { count: tools.length, untitled },
      };
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
