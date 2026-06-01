/**
 * Shared types for the Neotoma client.
 *
 * These mirror the shapes expected by both the MCP action catalog and the
 * REST API (see `docs/specs/MCP_SPEC.md` and `openapi.yaml`). They are
 * intentionally loose where the underlying API accepts arbitrary fields —
 * Neotoma's schema is descriptive, not prescriptive, so callers can add
 * snake_case keys that match the facts in the source data.
 */

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
  metadata?: Record<string, unknown>;
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
  /**
   * Stored entities, returned at the **top level** by the live `/store`
   * endpoint (`StoreStructuredResponse` in `openapi.yaml`) and by both
   * `HttpTransport` and `LocalTransport`. This is the canonical location to
   * read created/updated entity_ids from.
   */
  entities?: StoredEntityRef[];
  /** True when the request committed successfully. */
  success?: boolean;
  /**
   * True when the response is an idempotency replay (no new observations or
   * entities were written for this request).
   */
  replayed?: boolean;
  source_id?: string;
  relationships?: unknown[];
  /**
   * @deprecated Legacy nested shape. The live transport returns `entities` at
   * the top level (see above); this wrapper does not appear on real responses.
   * Retained only so helpers can tolerate pre-v0.x clients that nested the
   * payload. New code should read {@link StoreResult.entities}.
   */
  structured?: {
    entities: StoredEntityRef[];
    relationships?: unknown[];
  };
  unstructured?: {
    asset_entity_id?: string;
    source_id?: string;
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
  source_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateRelationshipsInput {
  relationships: CreateRelationshipInput[];
  source_id?: string;
}

export interface ListObservationsInput {
  entity_id: string;
  limit?: number;
  offset?: number;
}

export interface ListTimelineEventsInput {
  since?: string;
  until?: string;
  limit?: number;
}

export interface RetrieveRelatedEntitiesInput {
  entity_id: string;
  relationship_types?: string[];
  direction?: "inbound" | "outbound" | "both";
  max_hops?: number;
  include_entities?: boolean;
}

/**
 * The transport-level interface every client implementation satisfies.
 *
 * Both the HTTP transport (talks to the REST API) and the local transport
 * (in-process via `neotoma/core`) implement this same shape so hook
 * plugins can be written once and switched between transports by config.
 */
export interface NeotomaTransport {
  store(input: StoreInput): Promise<StoreResult>;
  retrieveEntities(input: RetrieveEntitiesInput): Promise<unknown>;
  retrieveEntityByIdentifier(input: RetrieveEntityByIdentifierInput): Promise<unknown>;
  retrieveEntitySnapshot(input: { entity_id: string }): Promise<unknown>;
  listObservations(input: ListObservationsInput): Promise<unknown>;
  listTimelineEvents(input: ListTimelineEventsInput): Promise<unknown>;
  retrieveRelatedEntities(input: RetrieveRelatedEntitiesInput): Promise<unknown>;
  createRelationship(input: CreateRelationshipInput): Promise<unknown>;
  createRelationships(input: CreateRelationshipsInput): Promise<unknown>;
  correct(input: { entity_id: string; corrections: Record<string, unknown> }): Promise<unknown>;
  listEntityTypes(input?: { search?: string }): Promise<unknown>;
  getEntityTypeCounts(input?: Record<string, unknown>): Promise<unknown>;
  executeTool(name: string, args: unknown): Promise<unknown>;
  dispose(): Promise<void>;
}

export class NeotomaClientError extends Error {
  public readonly status?: number;
  public readonly body?: unknown;

  constructor(message: string, options?: { status?: number; body?: unknown; cause?: unknown }) {
    super(message);
    this.name = "NeotomaClientError";
    this.status = options?.status;
    this.body = options?.body;
    if (options?.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
