/**
 * Shared driver primitives.
 *
 * Both Claude and OpenAI drivers route through the same replay path so
 * that cassette-driven cells produce byte-identical post-turn Neotoma
 * state regardless of which provider recorded the cassette. This keeps
 * the assertion engine deterministic in CI.
 */

import { readCassette, type CassetteFile } from "../cassette.js";
import { createHostToolRegistry, type HostToolRegistry } from "../host_tools.js";
import type {
  DriverInvocation,
  DriverResult,
  ToolCall,
} from "../types.js";

/**
 * Map MCP tool name → HTTP endpoint we POST to on the isolated server.
 *
 * SINGLE SOURCE OF TRUTH: a tool listed here is both (a) executed against the
 * isolated server during replay (via NEOTOMA_TOOL_NAMES, derived below) and
 * (b) routed to this path. To make a new MCP tool cassette-executable, add ONE
 * entry here — do not maintain a separate name list.
 */
const TOOL_ENDPOINTS: Record<string, string> = {
  store: "/store",
  store_structured: "/store",
  // retrieve_entities maps to /entities/query (the MCP tool's operationId is
  // queryEntities); there is no /retrieve_entities route (#1717 fix — the prior
  // mapping would 404 in replay; no scenario had exercised it).
  retrieve_entities: "/entities/query",
  retrieve_entity_by_identifier: "/retrieve_entity_by_identifier",
  // Snapshot + provenance reads (#1717 eval-coverage backfill).
  retrieve_entity_snapshot: "/get_entity_snapshot",
  retrieve_field_provenance: "/get_field_provenance",
  create_relationship: "/create_relationship",
  correct: "/correct",
  get_session_identity: "/session",
  // Entity soft-delete lifecycle (#1705 eval-coverage backfill).
  delete_entity: "/delete_entity",
  restore_entity: "/restore_entity",
  // Entity merge (#1706 eval-coverage backfill). Endpoint is /entities/merge.
  merge_entities: "/entities/merge",
  // Entity split (#1707 eval-coverage backfill). Endpoint is /entities/split.
  split_entity: "/entities/split",
  // Relationship lifecycle tools (#1708 eval-coverage backfill).
  create_relationships: "/create_relationships",
  delete_relationship: "/delete_relationship",
  restore_relationship: "/restore_relationship",
  list_relationships: "/list_relationships",
  get_relationship_snapshot: "/relationships/snapshot",
  // Subscriptions (#1715 eval-coverage backfill).
  subscribe: "/subscribe",
  // Schema mutation (#1709 eval-coverage backfill).
  register_schema: "/register_schema",
  update_schema_incremental: "/update_schema_incremental",
  // Interpretation creation (#1714 eval-coverage backfill). Endpoint is
  // /interpretations/create.
  create_interpretation: "/interpretations/create",
  // Peer-sync (#1713 eval-coverage backfill). add_peer + list_peers share the
  // /peers collection (POST vs GET — list_peers is in GET_TOOLS below);
  // resolve_sync_conflict has a static /peers/resolve_sync_conflict path. The
  // per-peer tools (get_peer_status, remove_peer, sync_peer) take a :peer_id
  // path param and are NOT statically addressable via this map, so they're not
  // covered here (scope-noted in the scenario).
  add_peer: "/peers",
  list_peers: "/peers",
  resolve_sync_conflict: "/peers/resolve_sync_conflict",
  // Config-driven entity submission (#1720 eval-coverage backfill). Route is
  // POST /submit/{entity_type}; the {entity_type} placeholder is resolved from
  // the call input by resolvePathParams below.
  submit_entity: "/submit/{entity_type}",
  // Per-turn status line (#1719 eval-coverage backfill).
  neotoma_turn_summary: "/turn_summary",
  // Schema discovery reads (#1718 eval-coverage backfill). list_entity_types is
  // GET /schemas (see GET_TOOLS); describe_entity_type is GET /schemas/{entity_type}.
  list_entity_types: "/schemas",
  describe_entity_type: "/schemas/{entity_type}",
  // Situational reads (#1723 eval-coverage backfill). list_recent_changes is GET
  // /record_activity (see GET_TOOLS); list_observations is POST /list_observations.
  list_recent_changes: "/record_activity",
  list_observations: "/list_observations",
};

/**
 * MCP tool names that, when emitted by the agent in a cassette, are re-applied
 * against the isolated Neotoma server during replay so post-turn graph state is
 * reproduced. Derived from TOOL_ENDPOINTS so the two can never drift.
 */
export const NEOTOMA_TOOL_NAMES = new Set<string>(Object.keys(TOOL_ENDPOINTS));

/**
 * Tools whose HTTP route is a GET (no request body). Everything else POSTs the
 * tool input as JSON. Keep this in sync with the route methods in
 * src/shared/contract_mappings.ts.
 */
const GET_TOOLS = new Set<string>([
  "get_session_identity",
  "list_peers",
  // Read tools whose HTTP route is a GET (#1718, #1723 eval-coverage backfill).
  "list_entity_types",
  "describe_entity_type",
  "list_recent_changes",
]);

/**
 * Substitute `{field}` placeholders in a TOOL_ENDPOINTS path with values pulled
 * from the call input. Lets path-parameterized routes (e.g. submit_entity at
 * POST /submit/{entity_type}) be replayed without baking a concrete value into
 * the static path map. Missing placeholder values are left as-is so the route
 * 404s loudly rather than hitting the wrong endpoint.
 */
function resolvePathParams(path: string, input: unknown): string {
  if (!path.includes("{")) return path;
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return path.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = obj[key];
    return typeof v === "string" || typeof v === "number" ? encodeURIComponent(String(v)) : whole;
  });
}

async function postNeotomaTool(
  baseUrl: string,
  toolName: string,
  input: unknown,
  token: string
): Promise<{ output?: unknown; error?: string }> {
  const rawPath = TOOL_ENDPOINTS[toolName];
  if (!rawPath) return { error: `unknown Neotoma tool ${toolName}` };
  const path = resolvePathParams(rawPath, input);
  const isGet = GET_TOOLS.has(toolName);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: isGet ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: isGet ? undefined : JSON.stringify(input ?? {}),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave as text
    }
    if (!res.ok) {
      return { error: `${toolName} returned status ${res.status}: ${text.slice(0, 400)}` };
    }
    return { output: parsed };
  } catch (err) {
    return { error: `${toolName} failed: ${(err as Error).message}` };
  }
}

export async function replayCassetteAgainstServer(
  invocation: DriverInvocation,
  cassette: CassetteFile,
  registry: HostToolRegistry
): Promise<DriverResult> {
  const start = Date.now();
  const replayedCalls: ToolCall[] = [];
  for (const call of cassette.tool_calls) {
    let result: { output?: unknown; error?: string };
    if (NEOTOMA_TOOL_NAMES.has(call.name)) {
      result = await postNeotomaTool(
        invocation.neotomaBaseUrl,
        call.name,
        call.input,
        invocation.neotomaToken
      );
    } else {
      // Host tools are deterministic stubs by definition.
      result = await registry.invoke(call.name, call.input);
    }
    replayedCalls.push({
      name: call.name,
      input: call.input,
      output: result.output ?? call.output,
      error: result.error ?? call.error,
      sequence: replayedCalls.length,
    });
  }
  return {
    assistantText: cassette.assistant_text,
    toolCalls: replayedCalls,
    elapsedMs: Date.now() - start,
    estimatedCostUsd: 0,
    totalTokens: cassette.meta.total_tokens,
  };
}

export function loadCassetteOrThrow(invocation: DriverInvocation): CassetteFile {
  const result = readCassette(invocation.cassettePath);
  if (!result) {
    throw new Error(
      `replay mode requires a cassette but ${invocation.cassettePath} does not exist. Run with --mode=record (and the appropriate API key) to capture one.`
    );
  }
  return result.cassette;
}

export function makeRegistryFor(invocation: DriverInvocation): HostToolRegistry {
  return createHostToolRegistry(invocation.scenario.host_tools);
}
