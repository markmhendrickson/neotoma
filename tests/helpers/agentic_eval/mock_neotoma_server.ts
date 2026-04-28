/**
 * In-process HTTP server that mimics the subset of the Neotoma API the
 * harness hooks actually call. Captures every request body and returns
 * deterministic responses so downstream hook code paths (e.g. PART_OF
 * relationship creation after store) execute end-to-end.
 *
 * Per-cell isolation is achieved by namespacing requests under
 * `/cell/<cellId>/...`. The full Neotoma API is mounted under each
 * cellId so a single shared server can serve many concurrent cells
 * without state collisions.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

import type { CapturedRequest } from "./types.js";

interface CellState {
  sequence: number;
  requests: CapturedRequest[];
  /** Counter used to mint deterministic entity_ids per cell. */
  entityCounter: number;
}

export interface MockNeotomaServer {
  readonly port: number;
  readonly baseUrl: string;
  /** URL prefix for a given cell — pass to the harness adapter. */
  cellBaseUrl(cellId: string): string;
  takeCellRequests(cellId: string): CapturedRequest[];
  resetCell(cellId: string): void;
  stop(): Promise<void>;
}

/**
 * Endpoints the @neotoma/client + setProfileDebounced hit. The mock
 * returns minimally valid responses so any post-store logic in the
 * hooks (id pickling, PART_OF link creation) executes naturally.
 */
const KNOWN_ENDPOINTS = new Set([
  "/store",
  "/store_structured",
  "/create_relationship",
  "/retrieve_entity_by_identifier",
  "/entities/query",
  "/retrieve_related_entities",
  "/get_entity_snapshot",
  "/list_observations",
  "/timeline",
  "/correct",
  "/schemas",
  "/session/profile",
  "/healthz",
]);

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(status, {
    "content-type": "application/json",
    ...extraHeaders,
  });
  res.end(body == null ? "" : JSON.stringify(body));
}

function pickEntityType(body: unknown): string {
  if (!body || typeof body !== "object") return "unknown";
  const entities = (body as { entities?: Array<{ entity_type?: string }> }).entities;
  if (!entities?.length) return "unknown";
  return entities[0]?.entity_type ?? "unknown";
}

function buildStoreResponse(
  body: unknown,
  state: CellState
): Record<string, unknown> {
  const entities = Array.isArray((body as { entities?: unknown[] })?.entities)
    ? ((body as { entities: Array<Record<string, unknown>> }).entities)
    : [];
  return {
    source_id: `src_mock_${state.entityCounter++}`,
    entities: entities.map((entity, idx) => {
      const id = `ent_mock_${state.entityCounter++}`;
      return {
        observation_index: idx,
        entity_id: id,
        entity_type: entity.entity_type ?? "unknown",
        observation_id: `obs_mock_${state.entityCounter++}`,
        action: "created",
        canonical_name:
          (entity.canonical_name as string | undefined) ??
          (entity.title as string | undefined) ??
          (entity.turn_key as string | undefined) ??
          null,
        identity_basis: "mock",
        identity_rule: "mock",
        entity_snapshot_after: entity,
      };
    }),
    unknown_fields_count: 0,
    related_entities: [],
    related_relationships: [],
  };
}

function buildRetrieveByIdentifierResponse(): Record<string, unknown> {
  // Hooks treat a 404-shaped response as "no match" and continue.
  return { entity: null, observations: [] };
}

function buildRetrieveListResponse(): Record<string, unknown> {
  return { entities: [], total: 0, excluded_merged: true };
}

function buildCreateRelationshipResponse(
  body: unknown,
  state: CellState
): Record<string, unknown> {
  const b = (body as Record<string, unknown>) ?? {};
  const key = `${b.relationship_type}:${b.source_entity_id}:${b.target_entity_id}`;
  return {
    relationship_key: key,
    relationship_type: b.relationship_type,
    source_entity_id: b.source_entity_id,
    target_entity_id: b.target_entity_id,
    schema_version: "1.0",
    snapshot: {},
    computed_at: new Date(0).toISOString(),
    observation_count: 1,
    last_observation_at: new Date(0).toISOString(),
    id: `${key}#${state.entityCounter++}`,
    created_at: new Date(0).toISOString(),
  };
}

function buildSessionProfileResponse(body: unknown): Record<string, unknown> {
  const b = (body as Record<string, unknown>) ?? {};
  return {
    ok: true,
    profile: b.profile ?? "full",
    session_id: b.session_id ?? null,
    connection_id: b.connection_id ?? null,
    matched: 0,
  };
}

export async function startMockNeotomaServer(): Promise<MockNeotomaServer> {
  const cells = new Map<string, CellState>();

  function ensureCell(cellId: string): CellState {
    let state = cells.get(cellId);
    if (!state) {
      state = { sequence: 0, requests: [], entityCounter: 0 };
      cells.set(cellId, state);
    }
    return state;
  }

  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);
      // Expected: /cell/<cellId>/<rest...>
      if (segments[0] !== "cell" || segments.length < 2) {
        send(res, 404, { ok: false, error: "missing cell prefix" });
        return;
      }
      const cellId = segments[1];
      const restPath = "/" + segments.slice(2).join("/");
      const state = ensureCell(cellId);

      const body = await readBody(req).catch(() => null);
      state.requests.push({
        method: req.method ?? "GET",
        endpoint: restPath || "/",
        body,
        sequence: state.sequence++,
      });

      if (restPath === "/healthz") {
        send(res, 200, { ok: true });
        return;
      }
      if (restPath === "/store" || restPath === "/store_structured") {
        send(res, 200, buildStoreResponse(body, state));
        return;
      }
      if (restPath === "/create_relationship") {
        send(res, 200, buildCreateRelationshipResponse(body, state));
        return;
      }
      if (restPath === "/retrieve_entity_by_identifier") {
        send(res, 200, buildRetrieveByIdentifierResponse());
        return;
      }
      if (
        restPath === "/entities/query" ||
        restPath === "/retrieve_related_entities" ||
        restPath === "/list_observations" ||
        restPath === "/timeline"
      ) {
        send(res, 200, buildRetrieveListResponse());
        return;
      }
      if (restPath === "/get_entity_snapshot") {
        send(res, 200, { entity: null, snapshot: null });
        return;
      }
      if (restPath === "/correct") {
        send(res, 200, { ok: true });
        return;
      }
      if (restPath === "/schemas") {
        send(res, 200, { schemas: [] });
        return;
      }
      if (restPath === "/session/profile") {
        send(res, 200, buildSessionProfileResponse(body));
        return;
      }
      if (KNOWN_ENDPOINTS.has(restPath)) {
        send(res, 200, { ok: true });
        return;
      }
      // Unknown endpoint — still record the call for assertions, but
      // respond with 404 so the hook sees the failure and any defensive
      // code path (try/catch around the client call) runs.
      send(res, 404, { ok: false, error: `unknown endpoint ${restPath}` });
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    cellBaseUrl(cellId: string): string {
      return `${baseUrl}/cell/${cellId}`;
    },
    takeCellRequests(cellId: string): CapturedRequest[] {
      return cells.get(cellId)?.requests ?? [];
    },
    resetCell(cellId: string): void {
      cells.delete(cellId);
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
