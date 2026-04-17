/**
 * Core operations module.
 *
 * Provides a stable, typed API surface for calling Neotoma's core actions
 * (store, retrieve, create_relationship, etc.) without going through the
 * MCP JSON-RPC protocol. This is the foundation used by:
 *   - `@neotoma/client` (local transport)
 *   - hook plugins for Claude Code, Cursor, OpenCode, Codex
 *   - Claude Agent SDK adapter
 *
 * Design:
 *   - Wraps the existing `NeotomaServer.executeToolForCli` dispatcher so we
 *     reuse every business rule, idempotency check, schema validation, and
 *     provenance construction already implemented there.
 *   - Parses the MCP-standard `{ content: [{ type, text }] }` response into
 *     typed return values.
 *   - Exposes a `createOperations({ userId })` factory so each caller gets
 *     a bound instance with its authenticated user.
 *
 * See `docs/developer/mcp/instructions.md` for the semantic contract that
 * agents follow when storing and retrieving through these operations.
 */

import { NeotomaServer } from "../server.js";

export interface CreateOperationsOptions {
  userId: string;
  /** Optional pre-constructed server instance. If omitted, a new one is created lazily. */
  server?: NeotomaServer;
}

export interface StoreEntityInput {
  entity_type: string;
  [key: string]: unknown;
}

export interface StoreRelationshipInput {
  relationship_type: string;
  source_index?: number;
  target_index?: number;
  source_entity_id?: string;
  target_entity_id?: string;
}

export interface StoreInput {
  entities?: StoreEntityInput[];
  relationships?: StoreRelationshipInput[];
  idempotency_key?: string;
  file_path?: string;
  file_content?: string;
  mime_type?: string;
  file_idempotency_key?: string;
  original_filename?: string;
}

export interface StoredEntityRef {
  entity_id: string;
  entity_type: string;
  action?: "created" | "updated" | string;
  [key: string]: unknown;
}

export interface StoreResult {
  structured?: {
    entities: StoredEntityRef[];
    relationships?: unknown[];
  };
  unstructured?: {
    asset_entity_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RetrieveEntitiesInput {
  entity_type?: string;
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  [key: string]: unknown;
}

export interface RetrieveEntityByIdentifierInput {
  identifier: string;
  entity_type?: string;
}

export interface CreateRelationshipInput {
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
}

export interface Operations {
  /** Store structured and/or unstructured data. See docs/developer/mcp/instructions.md. */
  store(input: StoreInput): Promise<StoreResult>;

  /** Alias for store() preserving the MCP `store_structured` action name. */
  storeStructured(input: StoreInput): Promise<StoreResult>;

  /** Alias for store() preserving the MCP `store_unstructured` action name. */
  storeUnstructured(input: StoreInput): Promise<StoreResult>;

  /** List entities by type or time window. */
  retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown>;

  /** Look up a single entity by identifier (name, email, canonical_name, etc.). */
  retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown>;

  /** Snapshot of a single entity. */
  retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown>;

  /** List observations for provenance / history. */
  listObservations(input: { entity_id: string; limit?: number }): Promise<unknown>;

  /** List timeline events for a time window. */
  listTimelineEvents(input: {
    since?: string;
    until?: string;
    limit?: number;
  }): Promise<unknown>;

  /** Retrieve related entities (graph expansion). */
  retrieveRelatedEntities(input: {
    entity_id: string;
    relationship_type?: string;
    direction?: "outgoing" | "incoming" | "both";
    limit?: number;
  }): Promise<unknown>;

  /** Create a relationship between two existing entities. */
  createRelationship(input: CreateRelationshipInput): Promise<unknown>;

  /** Correct an observation (creates a new observation that supersedes the prior). */
  correct(input: { entity_id: string; corrections: Record<string, unknown> }): Promise<unknown>;

  /** List registered entity types (schema-level discovery). */
  listEntityTypes(input?: { search?: string }): Promise<unknown>;

  /** Per-type entity counts. */
  getEntityTypeCounts(input?: Record<string, unknown>): Promise<unknown>;

  /** Raw escape hatch — invoke any MCP tool by name. */
  executeTool(name: string, args: unknown): Promise<unknown>;

  /** Dispose the internal server instance if this factory created one. */
  dispose(): Promise<void>;
}

function parseToolResult(raw: { content: Array<{ type: string; text: string }> }): unknown {
  const first = raw.content?.[0];
  if (!first || first.type !== "text") {
    return raw;
  }
  const text = first.text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Create a bound operations client for a given user.
 *
 * The caller is responsible for providing `userId` — this mirrors the
 * existing `executeToolForCli` contract and lets the same process serve
 * multiple users (e.g. API server mode). For single-user local mode use
 * the local dev user id from `services/local_auth.ts`.
 */
export function createOperations(options: CreateOperationsOptions): Operations {
  const ownsServer = !options.server;
  const server = options.server ?? new NeotomaServer();
  const userId = options.userId;

  async function call<T = unknown>(name: string, args: unknown = {}): Promise<T> {
    const raw = await server.executeToolForCli(name, args, userId);
    return parseToolResult(raw) as T;
  }

  const ops: Operations = {
    async store(input) {
      return call<StoreResult>("store", input);
    },
    async storeStructured(input) {
      return call<StoreResult>("store_structured", input);
    },
    async storeUnstructured(input) {
      return call<StoreResult>("store_unstructured", input);
    },
    async retrieveEntities(input) {
      return call("retrieve_entities", input);
    },
    async retrieveEntityByIdentifier(input) {
      return call("retrieve_entity_by_identifier", input);
    },
    async retrieveEntitySnapshot(input) {
      return call("retrieve_entity_snapshot", input);
    },
    async listObservations(input) {
      return call("list_observations", input);
    },
    async listTimelineEvents(input) {
      return call("list_timeline_events", input);
    },
    async retrieveRelatedEntities(input) {
      return call("retrieve_related_entities", input);
    },
    async createRelationship(input) {
      return call("create_relationship", input);
    },
    async correct(input) {
      return call("correct", input);
    },
    async listEntityTypes(input = {}) {
      return call("list_entity_types", input);
    },
    async getEntityTypeCounts(input = {}) {
      return call("get_entity_type_counts", input);
    },
    async executeTool(name, args) {
      return call(name, args);
    },
    async dispose() {
      if (ownsServer) {
        // NeotomaServer currently has no explicit shutdown hook beyond stdio lifecycle;
        // the server instance will be garbage collected. This method exists to give the
        // client library a stable lifecycle point to hook into as that changes.
      }
    },
  };

  return ops;
}

export type { NeotomaServer };
