import { getOpenApiInputSchemaOrThrow } from "./shared/openapi_schema.js";

export type ToolInputSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

const RELATIONSHIP_TYPE_ENUM = [
  "PART_OF",
  "CORRECTS",
  "REFERS_TO",
  "SETTLES",
  "DUPLICATE_OF",
  "DEPENDS_ON",
  "SUPERSEDES",
  "EMBEDS",
];

/**
 * Build the complete list of Neotoma MCP tool definitions.
 *
 * @param descriptionOverrides - Optional map of tool name -> description that
 *   takes precedence over the hardcoded defaults (used by the MCP server to
 *   allow runtime description customization).
 * @param timelineWidgetResourceUri - Optional resource URI for the timeline
 *   widget, attached as _meta on list_timeline_events.
 * @param turnSummaryWidgetResourceUri - Optional resource URI for the turn
 *   summary widget, attached as _meta on neotoma_turn_summary.
 */
export function buildToolDefinitions(
  descriptionOverrides?: Map<string, string>,
  timelineWidgetResourceUri?: string,
  turnSummaryWidgetResourceUri?: string
): ToolDefinition[] {
  const desc = (name: string, fallback: string): string =>
    descriptionOverrides?.get(name) ?? fallback;

  const storeBaseSchema = getOpenApiInputSchemaOrThrow("store");
  const storeBaseProperties = ((storeBaseSchema as any).properties ?? {}) as Record<
    string,
    unknown
  >;

  const tools: ToolDefinition[] = [
    {
      name: "retrieve_file_url",
      description: desc("retrieve_file_url", "Retrieve a signed URL for accessing a file"),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_file_url"),
    },
    {
      name: "retrieve_entity_snapshot",
      description: desc(
        "retrieve_entity_snapshot",
        "Retrieve the current snapshot of an entity with provenance information. Supports point-in-time / as-of reconstruction ('what did we know at time T') via 'at' (event-time cutoff: filters on observed_at) and 'at_ingested' (ingestion-time cutoff: filters on created_at, prevents look-ahead from backfilled observations). When both are supplied, both bounds are applied."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_entity_snapshot"),
    },
    {
      name: "list_observations",
      description: desc("list_observations", "List all observations for a given entity"),
      inputSchema: getOpenApiInputSchemaOrThrow("list_observations"),
    },
    {
      name: "retrieve_field_provenance",
      description: desc(
        "retrieve_field_provenance",
        "Retrieve the provenance chain for a specific field in an entity snapshot"
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_field_provenance"),
    },
    {
      name: "create_relationship",
      description: desc("create_relationship", "Create a typed relationship between two entities"),
      inputSchema: getOpenApiInputSchemaOrThrow("create_relationship"),
    },
    {
      name: "create_relationships",
      description: desc(
        "create_relationships",
        "Create multiple typed relationships between existing entities in one batch"
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("create_relationships"),
    },
    {
      name: "list_relationships",
      description: desc(
        "list_relationships",
        "List relationships for an entity, or discover the relationship type(s) between two specific entities. Filter by entity_id (with direction), or by source_entity_id and/or target_entity_id, and optionally relationship_type. To discover the type before delete_relationship, pass both source_entity_id and target_entity_id: each returned relationship carries its relationship_type. Soft-deleted relationships are excluded by default, so a deleted edge will not be re-offered for deletion; pass include_deleted: true to include them for audit. Paginated via limit/offset."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_relationships"),
    },
    {
      name: "query_contacts_at_company",
      description: desc(
        "query_contacts_at_company",
        "Answer \"who do we have connected at company X\": resolve company_name to the canonical company entity (exact-normalized match first, then a conservative fuzzy pass — the same resolution order used when a contact's organization field auto-links to a company at store time) and return every contact linked to it via a live works_at edge. Read-only: never creates a company entity — when no company matches, returns company: null and an empty contacts list. Optional owner_user_id scopes the search to a specific partner's network (must equal the authenticated user's id today; no cross-tenant admission yet); omit to search the authenticated user's own graph."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("query_contacts_at_company"),
    },
    {
      name: "find_paths",
      description: desc(
        "find_paths",
        'Answer "how does our network reach X?" in ONE call. Resolves target_name to a company (or fund) entity read-only — exact-normalized match first, then a conservative fuzzy pass — then runs a bounded breadth-first traversal and returns the PATHS that reach it. Unlike query_contacts_at_company (direct works_at employees only), each result is the full ordered chain of entities and edges traversed, e.g. "Ana -knows-> Bruno -works_at-> Acme", which is what makes a warm intro actionable. Traversal is undirected but records whether each edge was followed along or against its stored direction. Bounded on every dimension (max 5 hops, 500-node frontier, 2000 nodes expanded, 200 paths) with a visited set for cycle protection; when a bound fires, stats.truncated is true and stats.truncation_reasons names it, so an incomplete answer is never presented as complete. Read-only: never creates entities or edges. NOTE: target_kind "fund" traverses invested_in/funded_by edges, which no writer currently populates — a fund query may return zero paths on real data, and the response says so in notes.'
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("find_paths"),
    },
    {
      name: "shortest_path",
      description: desc(
        "shortest_path",
        'Find the shortest path (by hop count) between two known entity ids. Uses the same bounded breadth-first traversal as find_paths and stops at the first arrival, which BFS guarantees is shortest. Returns the full ordered chain of nodes and edges. Traversal is undirected by default and each node is expanded at most once (cycle protection); depth is clamped to 5 hops. Returns found:false rather than an error when the destination is unreachable within bounds — check stats.truncated to tell "genuinely unreachable" from "a bound cut the search short". Read-only.'
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("shortest_path"),
    },
    {
      name: "get_relationship_snapshot",
      description: desc(
        "get_relationship_snapshot",
        "Get the current snapshot of a specific relationship with provenance"
      ),
      inputSchema: {
        type: "object",
        properties: {
          relationship_type: {
            type: "string",
            enum: RELATIONSHIP_TYPE_ENUM,
            description: "Type of relationship",
          },
          source_entity_id: {
            type: "string",
            description: "Source entity ID",
          },
          target_entity_id: {
            type: "string",
            description: "Target entity ID",
          },
        },
        required: ["relationship_type", "source_entity_id", "target_entity_id"],
      },
    },
    {
      name: "retrieve_entities",
      description: desc(
        "retrieve_entities",
        "Query entities with filters (type, pagination). Returns entities with their snapshots."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "Optional single entity type filter (for example: post, task, contact). Combined as a union with `entity_types` when both are supplied.",
          },
          entity_types: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional multi-type filter. When non-empty, results are restricted to entities whose type is in this list (IN filter), OR-combined with `entity_type`. An empty array is treated as no filter.",
          },
          search: {
            type: "string",
            description:
              "Canonical free-text query for lexical/semantic retrieval. Cannot be combined with published filters or non-default sorting.",
          },
          search_query: {
            type: "string",
            description: "Compatibility alias for `search`.",
          },
          query: {
            type: "string",
            description: "Compatibility alias for `search`.",
          },
          similarity_threshold: {
            type: "number",
            description:
              "Semantic distance threshold when `search` is used. Lower is stricter (typical 1.0-1.05).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            description: "Maximum number of entities to return (default 100).",
          },
          offset: {
            type: "integer",
            minimum: 0,
            description: "Pagination offset (default 0).",
          },
          sort_by: {
            type: "string",
            description:
              "Sort field. Non-default values cannot be combined with `search`. " +
              "Predefined values: `entity_id`, `canonical_name`, `observation_count`, " +
              "`last_observation_at`, `submitted_at` (orders by `snapshot.created_at`). " +
              "In addition, `snapshot.<field>` is supported for any snapshot field " +
              "(e.g. `snapshot.period_end` for time-series entity types such as `usage_digest`). " +
              "The field value is sorted lexicographically as a string, so ISO-8601 date strings " +
              "must use a consistent format so that lexicographic order matches temporal order.",
          },
          sort_order: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort direction. `desc` cannot be combined with `search`.",
          },
          published: {
            type: "boolean",
            description: "Filter by snapshot.published. Cannot be combined with `search`.",
          },
          published_after: {
            type: "string",
            description:
              "Inclusive lower bound for snapshot.published_date (ISO date/datetime). Cannot be combined with `search`.",
          },
          published_before: {
            type: "string",
            description:
              "Inclusive upper bound for snapshot.published_date (ISO date/datetime). Cannot be combined with `search`.",
          },
          include_snapshots: {
            type: "boolean",
            description:
              "When false, omit snapshot/provenance/raw_fragments payloads for lightweight responses.",
          },
          include_merged: {
            type: "boolean",
            description: "Whether to include merged entities (default false).",
          },
          user_id: {
            type: "string",
            description: "Optional explicit user ID (normally inferred from auth context).",
          },
          updated_since: {
            type: "string",
            description:
              "ISO 8601 timestamp. Return only entities whose updated_at is greater than or equal to this value.",
          },
          created_since: {
            type: "string",
            description:
              "ISO 8601 timestamp. Return only entities whose created_at is greater than or equal to this value.",
          },
          exclude_bookkeeping: {
            type: "boolean",
            description:
              "When true, omit chat bookkeeping types (`conversation`, `conversation_message`, etc.) from results. Default false. Has no effect when `entity_type` already filters to a bookkeeping type.",
            default: false,
          },
          snapshot_filters: {
            type: "object",
            description:
              "Filter entities by snapshot field values. Each key is a snake_case snapshot field name " +
              "(e.g. `status`, `priority`); the value specifies operator and comparison value. Filters " +
              "are applied server-side via `snapshot->>{field}` JSONB extraction, so only entities whose " +
              "snapshot contains a matching value are returned. Example: " +
              '`{ "status": { "op": "eq", "value": "active" } }` returns only entities with ' +
              '`snapshot.status === "active"`. Supported ops: `eq`, `in`, `gt`, `lt`, `gte`, `lte`, `contains`.',
            additionalProperties: {
              type: "object",
              required: ["op"],
              properties: {
                op: {
                  type: "string",
                  enum: ["eq", "in", "gt", "lt", "gte", "lte", "contains"],
                },
                value: {},
              },
            },
          },
        },
        required: [],
      },
    },
    {
      name: "list_timeline_events",
      description:
        "Query timeline events with filters (type, date range, source). Returns chronological events derived from date fields in sources.",
      inputSchema: getOpenApiInputSchemaOrThrow("list_timeline_events"),
      annotations: { readOnlyHint: true },
      ...(timelineWidgetResourceUri
        ? {
            _meta: {
              ui: { resourceUri: timelineWidgetResourceUri },
              "openai/outputTemplate": timelineWidgetResourceUri,
            },
          }
        : {}),
    },
    {
      name: "retrieve_entity_by_identifier",
      description: desc(
        "retrieve_entity_by_identifier",
        "Retrieve entity by identifier (name, email, etc.) across entity types or specific type. Set include_observations=true to hydrate each match with recent observations in the same call (useful for collapsing resolve/snapshot/list sequences)."
      ),
      inputSchema: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description:
              "Identifier to search for (name, email, tax_id, etc.) - will be normalized",
          },
          entity_type: {
            type: "string",
            description:
              "Optional: Limit search to specific entity type (e.g., 'company', 'person')",
          },
          by: {
            type: "string",
            description:
              "Restrict snapshot-field matching to a single field (e.g. 'email', 'domain', 'company'). When omitted, checks a default identity-bearing set (name, full_name, title, email, domain, company).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            description: "Max matching entities (default 100).",
          },
          include_observations: {
            type: "boolean",
            description:
              "When true, include recent observations per matched entity (ordered by observed_at desc).",
            default: false,
          },
          observations_limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description:
              "Max observations per entity when include_observations is true (default 20, max 200).",
            default: 20,
          },
        },
        required: ["identifier"],
      },
    },
    {
      name: "identify_entity_by_signals",
      description: desc(
        "identify_entity_by_signals",
        "Resolve an entity from a multi-signal bundle (name, email, company, domain, phone, and open-ended string props). Returns best_match with identity_score, resolution_band (high/medium/low/unresolved), ranked candidates, and matched_signals. Use when you have partial or combined identity information and want a single-call resolution with confidence scoring."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("identify_entity_by_signals"),
    },
    {
      name: "retrieve_related_entities",
      description: desc(
        "retrieve_related_entities",
        "Retrieve entities connected to a given entity via relationships. Supports n-hop traversal."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description: "Starting entity ID",
          },
          relationship_types: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by relationship types (e.g., ['PART_OF', 'REFERS_TO']). If empty, includes all types.",
          },
          direction: {
            type: "string",
            enum: ["inbound", "outbound", "both"],
            description: "Direction of relationships to traverse",
            default: "both",
          },
          max_hops: {
            type: "number",
            description: "Maximum number of relationship hops (1 = direct, 2 = 2-hop, etc.)",
            default: 1,
          },
          include_entities: {
            type: "boolean",
            description: "Whether to include full entity snapshots in response",
            default: true,
          },
        },
        required: ["entity_id"],
      },
    },
    {
      name: "retrieve_graph_neighborhood",
      description: desc(
        "retrieve_graph_neighborhood",
        "Retrieve complete graph neighborhood around a node (entity or source): related entities, relationships, sources, and events."
      ),
      inputSchema: {
        type: "object",
        properties: {
          node_id: {
            type: "string",
            description: "Node ID (entity_id or source_id) to get neighborhood for",
          },
          node_type: {
            type: "string",
            enum: ["entity", "source"],
            description: "Type of node ('entity' for entities, 'source' for sources)",
            default: "entity",
          },
          include_relationships: {
            type: "boolean",
            description: "Include relationships in response",
            default: true,
          },
          include_sources: {
            type: "boolean",
            description: "Include related sources in response",
            default: true,
          },
          include_events: {
            type: "boolean",
            description: "Include timeline events in response",
            default: true,
          },
          include_observations: {
            type: "boolean",
            description: "Include observations (for entities only)",
            default: false,
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Maximum number of relationships to return. Default 100, max 500.",
            default: 100,
          },
          offset: {
            type: "integer",
            minimum: 0,
            description: "Number of relationships to skip (for pagination). Default 0.",
            default: 0,
          },
        },
        required: ["node_id"],
      },
    },
    {
      name: "store",
      description: desc(
        "store",
        "Save, create, or record entities and files into Neotoma. Use this tool to store any structured data — tasks, notes, contacts, transactions, events, plans, issues, receipts, decisions, or any other entity type. Also handles file uploads (base64 or path). Alias names: store, save, create entity, add record, ingest, persist. For files: provide EITHER file_content (base64-encoded) + mime_type OR file_path. For structured data: provide entities array. File inputs are stored raw with content-addressed SHA-256 deduplication per user. Agents should parse and extract entities before storing when they need structured data from a file; include an explicit interpretation block only when those entities are source-derived and should create a Source -> Interpretation -> Observation provenance link. Ordinary structured/chat-native stores omit interpretation and keep observations.interpretation_id null. IMPORTANT FOR STRUCTURED DATA: When storing structured entities with an unregistered entity_type, the system automatically infers and creates a user-specific schema from the data structure. Agents must include ALL fields from the source data, not just fields that match the entity schema. Schema fields are stored in observations (validated), while non-schema fields are automatically stored in raw_fragments."
      ),
      inputSchema: {
        ...storeBaseSchema,
        type: "object",
        properties: {
          ...storeBaseProperties,
          file_content: {
            type: "string",
            description:
              "Base64-encoded file content. Use file_path for local files instead of base64 encoding.",
          },
          file_path: {
            type: "string",
            description:
              "Local file path (alternative to file_content). If provided, file will be read from filesystem. MIME type will be auto-detected from extension if not provided. Works in local environments (Cursor, Claude Code) where MCP server has filesystem access. Does NOT work in web-based environments (claude.ai, chatgpt.com) - use file_content for those.",
          },
          mime_type: {
            type: "string",
            description:
              "MIME type (e.g., 'application/pdf', 'text/csv') - required with file_content, optional with file_path (auto-detected from extension)",
          },
          original_filename: {
            type: "string",
            description:
              "Original filename or source label (optional). For unstructured: auto-detected from file_path if not provided. For structured (entities): omit when data is agent-provided (no file origin); the source will have no filename. Pass only when mirroring a real file name or when a display label is desired.",
          },
          source_storage: {
            type: "string",
            enum: ["inline", "reference"],
            description:
              "Storage mode for file ingestion. Default 'inline' copies bytes into the database (portable, durable). 'reference' stores only a path + metadata row without copying bytes — zero DB bloat, but host-local and depends on the file staying in place. Requires file_path (not file_content). Derivations (observations/entities) are still materialized at ingest. Use 'reference' for large local files you control; use 'inline' for anything that must be shared or portable.",
          },
        },
      },
    },
    {
      name: "parse_file",
      description: desc(
        "parse_file",
        "Parse local or base64-encoded files into agent-readable text and page images without storing anything. Use for PDFs or other files you need to inspect before structured storing."
      ),
      inputSchema: {
        type: "object",
        properties: {
          file_content: {
            type: "string",
            description: "Base64-encoded file content.",
          },
          file_path: {
            type: "string",
            description: "Local file path. Preferred in local environments.",
          },
          mime_type: {
            type: "string",
            description: "Optional MIME type. Auto-detected from file_path when omitted.",
          },
          original_filename: {
            type: "string",
            description: "Optional filename hint for MIME detection and PDF parsing.",
          },
        },
        required: [],
      },
    },
    {
      name: "correct",
      description:
        "Create high-priority correction observation to override AI-extracted fields. Corrections always win in snapshot computation.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
          entity_id: {
            type: "string",
            description: "Entity ID to correct",
          },
          entity_type: {
            type: "string",
            description: "Entity type",
          },
          field: {
            type: "string",
            description: "Field name to correct",
          },
          value: {
            description: "Corrected value",
          },
          idempotency_key: {
            type: "string",
            description: "Required. Client-provided idempotency key for replay-safe corrections.",
          },
        },
        required: ["entity_id", "entity_type", "field", "value", "idempotency_key"],
      },
    },
    {
      name: "merge_entities",
      description: desc(
        "merge_entities",
        "Merge duplicate entities. Rewrites observations from source entity to target entity and marks source as merged."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("merge_entities"),
    },
    {
      name: "split_entity",
      description: desc(
        "split_entity",
        "Inverse of merge_entities (R5). Re-point a predicate-selected subset of an entity's observations onto a new or pre-existing entity to repair over-merges. Schema-agnostic predicate; observation content is never modified. Idempotent via (user_id, idempotency_key)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("split_entity"),
    },
    {
      name: "list_potential_duplicates",
      description: desc(
        "list_potential_duplicates",
        "List candidate duplicate entity pairs for an entity_type. Read-only; never auto-merges. Hand off confirmed pairs to merge_entities."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type to scan for duplicates (e.g. contact, company).",
          },
          threshold: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
              "Similarity threshold in (0, 1]. Defaults to the schema's duplicate_detection_threshold or 0.85.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Maximum number of candidate pairs to return. Defaults to 50.",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: ["entity_type"],
      },
    },
    {
      name: "delete_entity",
      description: desc(
        "delete_entity",
        "Delete an entity. Creates a deletion observation so the entity is excluded from snapshots and queries. Immutable and reversible for audit; use for user-initiated or GDPR-style removal from active use."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description: "Entity ID to delete",
          },
          entity_type: {
            type: "string",
            description: "Entity type (e.g. company, person)",
          },
          reason: {
            type: "string",
            description: "Optional reason for deletion (audit)",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: ["entity_id", "entity_type"],
      },
    },
    {
      name: "delete_relationship",
      description: desc(
        "delete_relationship",
        "Delete a relationship. Requires the exact relationship_type between the two entities; if unknown, call list_relationships with source_entity_id and target_entity_id first to discover it. Creates a deletion observation so the relationship is excluded from snapshots and queries. Immutable and reversible for audit. Returns 404 with a discovery hint when no live relationship matches the supplied triple."
      ),
      inputSchema: {
        type: "object",
        properties: {
          relationship_type: {
            type: "string",
            description: "Relationship type (e.g. PART_OF, REFERS_TO, EMBEDS)",
            enum: RELATIONSHIP_TYPE_ENUM,
          },
          source_entity_id: {
            type: "string",
            description: "Source entity ID",
          },
          target_entity_id: {
            type: "string",
            description: "Target entity ID",
          },
          reason: {
            type: "string",
            description: "Optional reason for deletion (audit)",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: ["relationship_type", "source_entity_id", "target_entity_id"],
      },
    },
    {
      name: "restore_entity",
      description: desc(
        "restore_entity",
        "Restore a deleted entity. Creates a restoration observation (priority 1001) that overrides the deletion. Entity becomes visible in snapshots and queries again. Immutable restoration for audit."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description: "Entity ID to restore",
          },
          entity_type: {
            type: "string",
            description: "Entity type (e.g. company, person)",
          },
          reason: {
            type: "string",
            description: "Optional reason for restoration (audit)",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: ["entity_id", "entity_type"],
      },
    },
    {
      name: "restore_relationship",
      description: desc(
        "restore_relationship",
        "Restore a deleted relationship. Creates a restoration observation (priority 1001) that overrides the deletion. Relationship becomes visible in snapshots and queries again. Immutable restoration for audit."
      ),
      inputSchema: {
        type: "object",
        properties: {
          relationship_type: {
            type: "string",
            description: "Relationship type (e.g. PART_OF, REFERS_TO, EMBEDS)",
            enum: RELATIONSHIP_TYPE_ENUM,
          },
          source_entity_id: {
            type: "string",
            description: "Source entity ID",
          },
          target_entity_id: {
            type: "string",
            description: "Target entity ID",
          },
          reason: {
            type: "string",
            description: "Optional reason for restoration (audit)",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: ["relationship_type", "source_entity_id", "target_entity_id"],
      },
    },
    {
      name: "get_entity_type_counts",
      description: desc(
        "get_entity_type_counts",
        "Return canonical entity counts by entity_type for the authenticated user, sorted by count descending. Use this when you need row counts by type; do not infer counts from list_entity_types field_count."
      ),
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        required: [],
      },
    },
    {
      name: "list_entity_types",
      description: desc(
        "list_entity_types",
        "List all available entity types with their schema information. Optionally filter by keyword to find entity types relevant to your data. Uses hybrid search: keyword matching first (deterministic), then vector semantic search (semantic similarity). Use this action before storing structured data to determine the correct entity_type."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_entity_types"),
    },
    {
      name: "describe_entity_type",
      description: desc(
        "describe_entity_type",
        "Return the full schema for one entity_type: field names, types, descriptions, and which fields are required. Call this before store when you know the entity_type but not its declared fields, so the first store lands with no unknown_fields and no required_fields_missing warnings. Read-only."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("describe_entity_type"),
    },
    {
      name: "analyze_schema_candidates",
      description: desc(
        "analyze_schema_candidates",
        "Analyze raw_fragments to identify fields that should be promoted to schema fields. Returns recommendations with confidence scores based on frequency and type consistency."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type to analyze (optional, analyzes all if not provided)",
          },
          user_id: {
            type: "string",
            description: "User ID for user-specific analysis (optional)",
          },
          min_frequency: {
            type: "number",
            description: "Minimum frequency threshold (default: 5)",
            default: 5,
          },
          min_confidence: {
            type: "number",
            description: "Minimum confidence score 0-1 (default: 0.8)",
            default: 0.8,
          },
        },
        required: [],
      },
    },
    {
      name: "audit_undeclared_fragments",
      description: desc(
        "audit_undeclared_fragments",
        "Audit accumulated undeclared raw_fragments awaiting schema declaration. Values stored for fields not on an entity type's active schema are preserved on observations but excluded from the snapshot until the field is declared. This read-only report lists, per entity_type, the fragment_keys not declared on the active schema, how many distinct entities carry each, and total occurrences — surfacing the stored-but-invisible backlog so it can be triaged into analyze_schema_candidates / register_schema / update_schema_incremental. Pair with the unknown_fields / required_fields_missing repair workflow described in the MCP instructions."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("audit_undeclared_fragments"),
    },
    {
      name: "get_schema_recommendations",
      description:
        "Get schema update recommendations for an entity type from raw_fragments analysis, agent suggestions, or inference.",
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type to get recommendations for",
          },
          user_id: {
            type: "string",
            description: "User ID for user-specific recommendations (optional)",
          },
          source: {
            type: "string",
            enum: ["raw_fragments", "agent", "inference", "all"],
            description: "Recommendation source (default: all)",
          },
          status: {
            type: "string",
            enum: ["pending", "approved", "rejected"],
            description: "Filter by recommendation status (default: pending)",
          },
        },
        required: ["entity_type"],
      },
    },
    {
      name: "update_schema_incremental",
      description: desc(
        "update_schema_incremental",
        "Incrementally update a schema by adding or removing fields. Adding fields creates a minor version bump; removing fields creates a major version bump. Removed fields are excluded from future snapshots via schema-projection filtering, but all observation data is preserved and can be restored by re-adding the field. Optionally migrates existing raw_fragments to observations for historical data backfill."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type to update",
          },
          fields_to_add: {
            type: "array",
            description: "Fields to add to schema",
            items: {
              type: "object",
              properties: {
                field_name: { type: "string" },
                field_type: {
                  type: "string",
                  enum: ["string", "number", "date", "boolean", "array", "object"],
                },
                required: { type: "boolean", default: false },
                reducer_strategy: {
                  type: "string",
                  enum: ["last_write", "highest_priority", "most_specific", "merge_array"],
                },
              },
              required: ["field_name", "field_type"],
            },
          },
          fields_to_remove: {
            type: "array",
            description:
              "Field names to remove from schema (triggers major version bump). Observation data is preserved; fields can be restored by re-adding them later.",
            items: { type: "string" },
          },
          schema_version: {
            type: "string",
            description: "New schema version (auto-increments if not provided)",
          },
          user_specific: {
            type: "boolean",
            description: "Create user-specific schema variant (default: false)",
            default: false,
          },
          user_id: {
            type: "string",
            description: "User ID for user-specific schema (required if user_specific=true)",
          },
          activate: {
            type: "boolean",
            description:
              "Activate schema immediately so it applies to new data (default: true). If false, schema is registered but not active.",
            default: true,
          },
          migrate_existing: {
            type: "boolean",
            description:
              "Migrate existing raw_fragments to observations for historical data backfill (default: false). Note: New data automatically uses updated schema after activation, migration is only for old data.",
            default: false,
          },
        },
        required: ["entity_type"],
      },
    },
    {
      name: "register_schema",
      description: desc(
        "register_schema",
        "Register a new schema or schema version (global or user-specific). This is also where you configure per-field CONFLICT RESOLUTION via reducer_config: pick a merge strategy per field (last_write [default], highest_priority, most_specific, merge_array) plus tie-breakers (observed_at, source_priority). To make an observation's source_priority actually take effect, set that field's strategy to highest_priority here — under the default last_write, source_priority is recorded but ignored."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: { type: "string" },
          schema_definition: {
            type: "object",
            description: "Schema definition with fields object",
          },
          reducer_config: {
            type: "object",
            description:
              "Per-field conflict-resolution config. merge_policies maps each field to a strategy: last_write (default — latest observed_at wins), highest_priority (the observation with the largest source_priority wins), most_specific, or merge_array; with an optional tie_breaker (observed_at | source_priority). Set highest_priority to honor source_priority — without it, source_priority is stored but ignored.",
          },
          schema_version: { type: "string", default: "1.0" },
          user_specific: { type: "boolean", default: false },
          user_id: {
            type: "string",
            description: "User ID for user-specific schema (required if user_specific=true)",
          },
          activate: { type: "boolean", default: false },
        },
        required: ["entity_type", "schema_definition", "reducer_config"],
      },
    },
    {
      name: "create_interpretation",
      description: desc(
        "create_interpretation",
        "Create an interpretation row for an existing source from agent-extracted flat entities. Observations produced by this tool are linked to both source_id and interpretation_id. Use **`store`** with an interpretation block when the source-derived extraction can be batched in one store call."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("create_interpretation"),
    },
    {
      name: "list_interpretations",
      description: desc(
        "list_interpretations",
        "List interpretation runs for the authenticated user, optionally filtered by source_id."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_interpretations"),
    },
    {
      name: "get_authenticated_user",
      description:
        "Get the authenticated user ID for the current MCP session. Returns the user_id that is automatically used for all authenticated actions.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_session_identity",
      description:
        "Resolve the current session's attribution: trust tier, AAuth / clientInfo fields, active anonymous-write policy, and whether the session is eligible for trusted writes. Safe to call as a preflight health check; does not write any rows.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "health_check_snapshots",
      description: desc(
        "health_check_snapshots",
        "Check for stale entity snapshots (snapshots with observation_count=0 but observations exist). Returns health status and count of stale snapshots."
      ),
      inputSchema: {
        type: "object",
        properties: {
          auto_fix: {
            type: "boolean",
            description: "If true, automatically recompute stale snapshots (default: false)",
            default: false,
          },
        },
        required: [],
      },
    },
    {
      name: "list_recent_changes",
      description: desc(
        "list_recent_changes",
        "List the most recently changed records across core Neotoma tables (entities, sources, observations, interpretations, relationships, timeline_events) for the authenticated user. Returns items ordered by latest activity_at."
      ),
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Maximum number of items to return (default 50, max 200).",
          },
          offset: {
            type: "integer",
            minimum: 0,
            description: "Pagination offset (default 0).",
          },
        },
        required: [],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "submit_entity",
      description: desc(
        "submit_entity",
        "Generic config-driven entity submission. Requires an active submission_config row for the target entity_type (operator-seeded; repo does not seed default submission_config rows). Creates the primary entity and, when configured, a linked conversation + initial message and optional guest_access_token. Does not run the GitHub-first issue mirror — use submit_issue for issues with GitHub discoverability."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description:
              "Target entity type (must match an active submission_config target_entity_type).",
          },
          fields: {
            type: "object",
            additionalProperties: true,
            description:
              "Payload merged into the primary entity row (schema-required fields must be present).",
          },
          initial_message: {
            type: "string",
            description:
              "When conversation threading is enabled, overrides the first message body (defaults to fields.body or fields.content when omitted).",
          },
        },
        required: ["entity_type", "fields"],
      },
    },
    {
      name: "add_entity_message",
      description: desc(
        "add_entity_message",
        "Append a conversation_message to the thread linked to a submitted entity (RESolves conversation via REFERS_TO from the root entity, or creates one)."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string", description: "Root submitted entity id." },
          message: { type: "string", description: "Message body (markdown)." },
        },
        required: ["entity_id", "message"],
      },
    },
    {
      name: "get_entity_submission_status",
      description: desc(
        "get_entity_submission_status",
        "Return retrieve_entity_snapshot (JSON) for a submitted entity. Pass guest_access_token when using submit-time token read-back."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: { type: "string" },
          guest_access_token: { type: "string", description: "Optional token from submit_entity." },
        },
        required: ["entity_id"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "list_entity_submissions",
      description: desc(
        "list_entity_submissions",
        "List entities of a given type for the authenticated user (retrieve_entities wrapper)."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          offset: { type: "integer", minimum: 0 },
        },
        required: ["entity_type"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "sync_entity_submissions",
      description: desc(
        "sync_entity_submissions",
        "Sync external mirrors for submissions. entity_type issue delegates to GitHub issue sync; other types return a no-op payload until additional providers exist."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: { type: "string", description: "Defaults to issue when omitted." },
        },
        required: [],
      },
    },
    {
      name: "submit_issue",
      description: desc(
        "submit_issue",
        "Submit an issue to the operator's Neotoma instance (canonical store). " +
          "For public issues, optionally publishes to GitHub first for discoverability. " +
          "For private issues, stays within Neotoma only (never touches GitHub). " +
          "Creates a local `issue` entity + associated conversation for tracking. " +
          "Submits to the operator Neotoma instance (default base URL when unset: https://neotoma.markmhendrickson.com). Override with NEOTOMA_ISSUES_TARGET_URL or issues.target_url in config. " +
          "When a non-empty target URL is configured, the tool fails (MCP error) if that remote store is unreachable or rejects the request; a local row with sync_pending may still be written first. " +
          "When the operator accepts the issue, the response includes guest_access_token for token-scoped get_issue_status / add_issue_message read-back when the local snapshot does not already carry the token. " +
          "When `pushed_to_github` is false for a public issue, read `github_mirror_guidance` for recommended auth + manual GitHub create + entity update steps. " +
          "To file issues about a repo other than the one Neotoma is globally configured for, pass `target_repo` in `owner/repo` format. This overrides the GitHub mirror destination only — the Neotoma authoring home remains unchanged. " +
          "Reporter environment is REQUIRED: callers MUST provide at least one of `reporter_git_sha` or `reporter_app_version` (the SHA you reproduced against and/or the CLI/app version). Submissions missing both are rejected with `error_code: ERR_REPORTER_ENVIRONMENT_REQUIRED`. " +
          "No prior identity is required to submit: a remote caller with no Bearer token, no AAuth signature and no guest access token may open an issue whenever the operator instance's `issue` guest access policy permits guest writes. The `guest_access_token` is an OUTPUT of a successful submit, not a precondition for it, so first contact needs no credential. Anonymity covers submission ONLY — use the returned token for `add_issue_message` / `get_issue_status`. An operator can close the inbox with `NEOTOMA_ACCESS_POLICY_ISSUE=closed`, after which unauthenticated submits are rejected with `AUTH_REQUIRED`."
      ),
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Issue title." },
          body: { type: "string", description: "Issue body in markdown." },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply (e.g. bug, doc_gap, enhancement).",
          },
          visibility: {
            type: "string",
            enum: ["public", "private"],
            description:
              "Use 'private' for PII-sensitive issues (Neotoma only, no GitHub mirror). Default: 'public'.",
          },
          reporter_git_sha: {
            type: "string",
            description:
              "Required (this OR reporter_app_version). Reporter git SHA (`git rev-parse HEAD`).",
          },
          reporter_git_ref: {
            type: "string",
            description: "Optional reporter git ref / branch name.",
          },
          reporter_channel: {
            type: "string",
            description: "Optional reporter channel (e.g. ci, local).",
          },
          reporter_app_version: {
            type: "string",
            description:
              "Required (this OR reporter_git_sha). Reporter app / CLI version (semver).",
          },
          reporter_ci_run_id: { type: "string", description: "Optional CI or workflow run id." },
          reporter_patch_source_id: {
            type: "string",
            description: "Optional source id for reporter patch artifact.",
          },
          target_repo: {
            type: "string",
            description:
              "Optional GitHub mirror destination override (`owner/repo`). " +
              "Use when filing issues about a repo other than the one Neotoma is globally configured for " +
              "(e.g. `markmhendrickson/ateles`). Overrides only the GitHub mirror — Neotoma authoring home is unchanged.",
          },
          conversation_turn_id: {
            type: "string",
            description:
              "Entity ID of the conversation turn (conversation_message entity) where this issue was observed. When provided, a REFERS_TO relationship is created from the filed issue to the conversation turn so the origin is traceable.",
          },
        },
        required: ["title", "body"],
        // Keep the top-level schema to a plain object for Codex/OpenAI
        // function-tool compatibility. The server still enforces that callers
        // provide at least one of reporter_git_sha or reporter_app_version.
      },
    },
    {
      name: "add_issue_message",
      description: desc(
        "add_issue_message",
        "Add a message to an existing issue thread. Pass Neotoma `issue` entity_id (from submit_issue, get_issue_status, or Inspector). Submits to the configured operator Neotoma instance first, creates a conversation_message locally, and may push a GitHub comment when the issue has a GitHub mirror. " +
          "Remote auth: when the local row mirrors a remote operator issue, the operator instance requires either (a) a guest_access_token — pass the token returned by submit_issue, or read it from the local issue entity snapshot — or (b) an agent_grant configured by the operator for your agent identity. " +
          "If the issue snapshot already stores guest_access_token you may omit it here; the server reads it automatically. " +
          "If add_issue_message returns AUTH_REQUIRED, it means neither path is satisfied: check that guest_access_token from submit_issue was preserved on the local entity, or ask the operator to configure an agent_grant via Inspector → Agents → Grants. " +
          "If the remote Neotoma append fails after local and/or GitHub side effects are recorded, the response includes `remote_submission_error` instead of throwing so callers do not create duplicate fallback comments. " +
          "On public issue threads, pass at least one of `reporter_git_sha` / `reporter_app_version` so each message records the environment it was authored against. Missing both emits a server-side warning; the message still persists."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description:
              "Neotoma `issue` entity_id. Use the id returned by submit_issue or Inspector.",
          },
          issue_number: {
            type: "integer",
            minimum: 1,
            description:
              "GitHub issue number in the configured repo; use entity_id for private/local issues.",
          },
          body: { type: "string", description: "Message body in markdown." },
          guest_access_token: {
            type: "string",
            description:
              "Optional guest-scoped token for operator Neotoma read-through / remote append when mirroring a remote issue. If omitted, the issue entity's stored guest_access_token is used when present.",
          },
          reporter_git_sha: {
            type: "string",
            description:
              "Reporter git SHA (`git rev-parse HEAD`) the message author is testing against. Soft requirement on public issue threads.",
          },
          reporter_git_ref: {
            type: "string",
            description: "Optional reporter git ref / branch name.",
          },
          reporter_channel: {
            type: "string",
            description: "Optional reporter channel (e.g. ci, local).",
          },
          reporter_app_version: {
            type: "string",
            description:
              "Reporter app / CLI version (semver) the message author is testing. Soft requirement on public issue threads.",
          },
        },
        required: ["body"],
        // Keep the top-level schema to a plain object for Codex/OpenAI
        // function-tool compatibility. The server still enforces that callers
        // provide entity_id or issue_number.
      },
    },
    {
      name: "get_issue_status",
      description: desc(
        "get_issue_status",
        "Get the current status of an issue including its conversation messages. Pass Neotoma `issue` entity_id (from submit_issue or Inspector). " +
          "When the local row mirrors an operator issue (remote_entity_id + issues.target_url), fetches the latest status and thread from that target instance first. " +
          "Pass guest_access_token when the mirror requires a guest token and it is not stored on the local issue snapshot. " +
          "When the issue has a GitHub mirror, implicitly syncs from GitHub if local data is stale (>5min). Pass skip_sync=true to skip only the GitHub refresh."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description:
              "Neotoma `issue` entity_id. Use the id returned by submit_issue or Inspector.",
          },
          issue_number: {
            type: "integer",
            minimum: 1,
            description:
              "GitHub issue number in the configured repo; use entity_id for private/local issues.",
          },
          skip_sync: {
            type: "boolean",
            description:
              "Skip implicit sync from GitHub when the issue has github_number (does not skip operator read-through for mirrored issues).",
          },
          guest_access_token: {
            type: "string",
            description:
              "Optional guest-scoped token for operator read-through when the local issue mirrors remote_entity_id on issues.target_url. If omitted, guest_access_token on the issue snapshot is used when present.",
          },
        },
        required: [],
        // Keep the top-level schema to a plain object for Codex/OpenAI
        // function-tool compatibility. The server still enforces that callers
        // provide entity_id or issue_number.
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "sync_issues",
      description: desc(
        "sync_issues",
        "Bidirectional sync between local Neotoma and the configured GitHub repo. " +
          "Push leg (default on): local public issues with no github_number are sanitized " +
          "(PII stripped) and created on GitHub, then updated locally with the returned number/url. " +
          "Pull leg: GitHub issues and their messages are pulled into local entities. " +
          "Supports filtering by state, labels, and since date."
      ),
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by issue state. Default: 'all'.",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Filter by labels.",
          },
          since: {
            type: "string",
            description: "Only sync issues updated after this ISO date.",
          },
          push: {
            type: "boolean",
            description: "When false, skip the push leg (local public → GitHub). Default: true.",
          },
        },
      },
    },
    {
      name: "subscribe",
      description: desc(
        "subscribe",
        "Create a substrate event subscription (webhook or SSE). Requires at least one of entity_types, entity_ids, or event_types. Webhook delivery requires webhook_url (HTTPS in production)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("subscribe"),
    },
    {
      name: "unsubscribe",
      description: desc(
        "unsubscribe",
        "Deactivate a subscription by subscription_id (soft delete via correction)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("unsubscribe"),
    },
    {
      name: "list_subscriptions",
      description: desc(
        "list_subscriptions",
        "List active substrate event subscriptions for the current user (webhook secrets omitted)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_subscriptions"),
    },
    {
      name: "get_subscription_status",
      description: desc(
        "get_subscription_status",
        "Get current snapshot for one subscription by subscription_id (webhook secret omitted)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("get_subscription_status"),
    },
    {
      name: "add_peer",
      description: desc(
        "add_peer",
        "Register a Neotoma peer for cross-instance sync (Phase 5). Stores a peer_config entity; returns shared_secret when auth_method is shared_secret and none was supplied."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("add_peer"),
    },
    {
      name: "remove_peer",
      description: desc(
        "remove_peer",
        "Deactivate a peer_config row by peer_id (soft delete via correction)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("remove_peer"),
    },
    {
      name: "list_peers",
      description: desc(
        "list_peers",
        "List configured Neotoma peers for the current user (shared_secret redacted)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_peers"),
    },
    {
      name: "get_peer_status",
      description: desc(
        "get_peer_status",
        "Return one peer_config snapshot by peer_id (secret redacted)."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("get_peer_status"),
    },
    {
      name: "sync_peer",
      description: desc(
        "sync_peer",
        "Run bounded peer sync: push eligible local observations to the peer and pull eligible remote snapshots for bilateral catch-up."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("sync_peer"),
    },
    {
      name: "resolve_sync_conflict",
      description: desc(
        "resolve_sync_conflict",
        "Resolve a sync conflict using prefer_local, prefer_remote, last_write_wins, source_priority, or manual. prefer_remote requires sender_peer_url."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("resolve_sync_conflict"),
    },
    {
      name: "neotoma_turn_summary",
      description: desc(
        "neotoma_turn_summary",
        "Compute the per-turn Neotoma status line (msg N/M, stored K, retrieved L) plus an optional ui:// widget URI for ext-apps clients. Call at the end of every turn after the closing assistant store completes. Pass the assistant message's conversation_id and turn_key; the server resolves stored/retrieved/issue entities, turn ordinal, and total message count. Agents emit the returned status_line in the user-visible reply; ext-apps clients additionally render widget_uri inline when present."
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("neotoma_turn_summary"),
      ...(turnSummaryWidgetResourceUri
        ? {
            _meta: {
              ui: { resourceUri: turnSummaryWidgetResourceUri },
              "openai/outputTemplate": turnSummaryWidgetResourceUri,
            },
          }
        : {}),
    },
    {
      name: "npm_check_update",
      description: desc(
        "npm_check_update",
        "Check if a newer npm version is available. Returns updateAvailable, message, and suggestedCommand. Call at session start to encourage user to upgrade."
      ),
      inputSchema: {
        type: "object",
        properties: {
          packageName: {
            type: "string",
            description: "npm package name (e.g. neotoma)",
          },
          currentVersion: {
            type: "string",
            description: "Current version reported by the client",
          },
          distTag: {
            type: "string",
            description: "Dist tag to check (default: latest)",
            default: "latest",
          },
          include_release_notes: {
            type: "boolean",
            description:
              "When true, fetches npm version metadata and optional GitHub release body (best-effort); adds release_url and excerpts. Default false to limit registry/GitHub load.",
            default: false,
          },
          include_capability_delta: {
            type: "boolean",
            description:
              "When true, adds new_tools, removed_tools, and capability_delta_recommendation to the response — a machine-readable list of MCP tools that were added or removed between currentVersion and the latest release. Sourced from the committed capability manifest (generated, not hand-maintained). Default false.",
            default: false,
          },
        },
        required: ["packageName", "currentVersion"],
      },
    },
    {
      name: "publish_rendered_page",
      description: desc(
        "publish_rendered_page",
        "Turn a rendered_page into a ready-to-share guest URL in one call. Pass an existing rendered_page entity_id, OR inline { title, html_body, custom_css } to create one first. Mints a guest_access_token scoped to that page and returns the absolute `…/entities/<id>/html?access_token=<token>` URL plus ttl_seconds — the link works for non-authenticated viewers. html_body is injected verbatim into a server template; do NOT include <html>/<head>/<body> wrappers. Note: each call mints a fresh token (raw tokens are not stored, only hashed), so repeated calls return new working URLs rather than a single stable one."
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_id: {
            type: "string",
            description:
              "Existing rendered_page entity id to publish. Omit to create a new page from the inline fields below.",
          },
          title: {
            type: "string",
            description:
              "Page title (used when creating a new rendered_page). Rendered into <title> and the <h1> if no html_body header overrides.",
          },
          html_body: {
            type: "string",
            description:
              "Page body HTML, injected verbatim into the server template. Do NOT include <html>/<head>/<body> wrappers. Used when creating a new rendered_page.",
          },
          custom_css: {
            type: "string",
            description:
              "Optional CSS injected as an inline <style> in <head> (used when creating a new rendered_page).",
          },
          meta_description: {
            type: "string",
            description:
              "Optional <meta name=description> value, escaped on render (used when creating a new rendered_page).",
          },
          idempotency_key: {
            type: "string",
            description:
              "Optional idempotency key for the inline-create path (mutating op). Same key + same content reuses the same rendered_page instead of creating a duplicate. Ignored when entity_id is supplied.",
          },
          user_id: {
            type: "string",
            description: "Optional. Inferred from authentication if omitted.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "manage_bundles",
      description: desc(
        "manage_bundles",
        "Inspect and manage Neotoma bundles (the deliverable unit shipping schemas, record-type docs, and skills). action=list returns all bundles with type/version/enabled/always_active/provides count; action=info (with bundle) returns full manifest detail; action=install/enable/disable (with bundle) toggle persisted enable state. Default-install bundles (core, infrastructure, core_workflows) are always active and cannot be disabled. Disabling a schema bundle stops its types from auto-creating under guided/locked while preserving existing data. Returns structured JSON."
      ),
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "info", "install", "enable", "disable"],
            description: "The bundle management action to perform.",
          },
          bundle: {
            type: "string",
            description:
              "Bundle name. Required for info, install, enable, and disable; ignored for list.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  ];

  return tools;
}

/** All tool names that Neotoma registers. */
export const NEOTOMA_TOOL_NAMES = [
  "retrieve_file_url",
  "retrieve_entity_snapshot",
  "list_observations",
  "retrieve_field_provenance",
  "create_relationship",
  "create_relationships",
  "list_relationships",
  "query_contacts_at_company",
  "find_paths",
  "shortest_path",
  "get_relationship_snapshot",
  "retrieve_entities",
  "list_timeline_events",
  "retrieve_entity_by_identifier",
  "identify_entity_by_signals",
  "retrieve_related_entities",
  "retrieve_graph_neighborhood",
  "store",
  "parse_file",
  "correct",
  "merge_entities",
  "split_entity",
  "list_potential_duplicates",
  "delete_entity",
  "delete_relationship",
  "restore_entity",
  "restore_relationship",
  "get_entity_type_counts",
  "list_entity_types",
  "describe_entity_type",
  "analyze_schema_candidates",
  "audit_undeclared_fragments",
  "get_schema_recommendations",
  "update_schema_incremental",
  "register_schema",
  "create_interpretation",
  "list_interpretations",
  "get_authenticated_user",
  "get_session_identity",
  "health_check_snapshots",
  "list_recent_changes",
  "submit_issue",
  "add_issue_message",
  "get_issue_status",
  "sync_issues",
  "submit_entity",
  "add_entity_message",
  "get_entity_submission_status",
  "list_entity_submissions",
  "sync_entity_submissions",
  "subscribe",
  "unsubscribe",
  "list_subscriptions",
  "get_subscription_status",
  "add_peer",
  "remove_peer",
  "list_peers",
  "get_peer_status",
  "sync_peer",
  "resolve_sync_conflict",
  "npm_check_update",
  "neotoma_turn_summary",
  "publish_rendered_page",
  "manage_bundles",
] as const;

export type NeotomaToolName = (typeof NEOTOMA_TOOL_NAMES)[number];
