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
 */
export function buildToolDefinitions(
  descriptionOverrides?: Map<string, string>,
  timelineWidgetResourceUri?: string,
): ToolDefinition[] {
  const desc = (name: string, fallback: string): string =>
    descriptionOverrides?.get(name) ?? fallback;

  const storeBaseSchema = getOpenApiInputSchemaOrThrow("store");
  const storeBaseProperties = ((storeBaseSchema as any).properties ?? {}) as Record<string, unknown>;

  const tools: ToolDefinition[] = [
    {
      name: "retrieve_file_url",
      description: desc(
        "retrieve_file_url",
        "Retrieve a signed URL for accessing a file",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_file_url"),
    },
    {
      name: "retrieve_entity_snapshot",
      description: desc(
        "retrieve_entity_snapshot",
        "Retrieve the current snapshot of an entity with provenance information. Supports historical snapshots via 'at' parameter.",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_entity_snapshot"),
    },
    {
      name: "list_observations",
      description: desc(
        "list_observations",
        "List all observations for a given entity",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_observations"),
    },
    {
      name: "retrieve_field_provenance",
      description: desc(
        "retrieve_field_provenance",
        "Retrieve the provenance chain for a specific field in an entity snapshot",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("retrieve_field_provenance"),
    },
    {
      name: "create_relationship",
      description: desc(
        "create_relationship",
        "Create a typed relationship between two entities",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("create_relationship"),
    },
    {
      name: "create_relationships",
      description: desc(
        "create_relationships",
        "Create multiple typed relationships between existing entities in one batch",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("create_relationships"),
    },
    {
      name: "list_relationships",
      description: desc(
        "list_relationships",
        "List relationships for an entity",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_relationships"),
    },
    {
      name: "get_relationship_snapshot",
      description: desc(
        "get_relationship_snapshot",
        "Get the current snapshot of a specific relationship with provenance",
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
        "Query entities with filters (type, pagination). Returns entities with their snapshots.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Optional entity type filter (for example: post, task, contact).",
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
            enum: ["entity_id", "canonical_name", "observation_count", "last_observation_at"],
            description: "Sort field. Non-default values cannot be combined with `search`.",
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
        "Retrieve entity by identifier (name, email, etc.) across entity types or specific type. Set include_observations=true to hydrate each match with recent observations in the same call (useful for collapsing resolve/snapshot/list sequences).",
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
      name: "retrieve_related_entities",
      description: desc(
        "retrieve_related_entities",
        "Retrieve entities connected to a given entity via relationships. Supports n-hop traversal.",
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
        "Retrieve complete graph neighborhood around a node (entity or source): related entities, relationships, sources, and events.",
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
        },
        required: ["node_id"],
      },
    },
    {
      name: "store",
      description: desc(
        "store",
        "Unified storing for both file-backed and structured sources. For files: provide EITHER file_content (base64-encoded) + mime_type OR file_path. For structured data: provide entities array. File inputs are stored raw with content-addressed SHA-256 deduplication per user. Agents should parse and extract entities before storing when they need structured data from a file; include an explicit interpretation block only when those entities are source-derived and should create a Source -> Interpretation -> Observation provenance link. Ordinary structured/chat-native stores omit interpretation and keep observations.interpretation_id null. IMPORTANT FOR STRUCTURED DATA: When storing structured entities with an unregistered entity_type, the system automatically infers and creates a user-specific schema from the data structure. Agents must include ALL fields from the source data, not just fields that match the entity schema. Schema fields are stored in observations (validated), while non-schema fields are automatically stored in raw_fragments.",
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
        },
      },
    },
    {
      name: "parse_file",
      description: desc(
        "parse_file",
        "Parse local or base64-encoded files into agent-readable text and page images without storing anything. Use for PDFs or other files you need to inspect before structured storing.",
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
            description:
              "Required. Client-provided idempotency key for replay-safe corrections.",
          },
        },
        required: ["entity_id", "entity_type", "field", "value", "idempotency_key"],
      },
    },
    {
      name: "merge_entities",
      description: desc(
        "merge_entities",
        "Merge duplicate entities. Rewrites observations from source entity to target entity and marks source as merged.",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("merge_entities"),
    },
    {
      name: "split_entity",
      description: desc(
        "split_entity",
        "Inverse of merge_entities (R5). Re-point a predicate-selected subset of an entity's observations onto a new or pre-existing entity to repair over-merges. Schema-agnostic predicate; observation content is never modified. Idempotent via (user_id, idempotency_key).",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("split_entity"),
    },
    {
      name: "list_potential_duplicates",
      description: desc(
        "list_potential_duplicates",
        "List candidate duplicate entity pairs for an entity_type. Read-only; never auto-merges. Hand off confirmed pairs to merge_entities.",
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
            description: "Similarity threshold in (0, 1]. Defaults to the schema's duplicate_detection_threshold or 0.85.",
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
        "Delete an entity. Creates a deletion observation so the entity is excluded from snapshots and queries. Immutable and reversible for audit; use for user-initiated or GDPR-style removal from active use.",
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
        "Delete a relationship. Creates a deletion observation so the relationship is excluded from snapshots and queries. Immutable and reversible for audit.",
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
        "Restore a deleted entity. Creates a restoration observation (priority 1001) that overrides the deletion. Entity becomes visible in snapshots and queries again. Immutable restoration for audit.",
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
        "Restore a deleted relationship. Creates a restoration observation (priority 1001) that overrides the deletion. Relationship becomes visible in snapshots and queries again. Immutable restoration for audit.",
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
        "Return canonical entity counts by entity_type for the authenticated user, sorted by count descending. Use this when you need row counts by type; do not infer counts from list_entity_types field_count.",
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
        "List all available entity types with their schema information. Optionally filter by keyword to find entity types relevant to your data. Uses hybrid search: keyword matching first (deterministic), then vector semantic search (semantic similarity). Use this action before storing structured data to determine the correct entity_type.",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("list_entity_types"),
    },
    {
      name: "analyze_schema_candidates",
      description: desc(
        "analyze_schema_candidates",
        "Analyze raw_fragments to identify fields that should be promoted to schema fields. Returns recommendations with confidence scores based on frequency and type consistency.",
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
        "Incrementally update a schema by adding or removing fields. Adding fields creates a minor version bump; removing fields creates a major version bump. Removed fields are excluded from future snapshots via schema-projection filtering, but all observation data is preserved and can be restored by re-adding the field. Optionally migrates existing raw_fragments to observations for historical data backfill.",
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
        "Register a new schema or schema version. Supports both global and user-specific schemas.",
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
            description: "Reducer configuration with merge policies",
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
        "Create an interpretation row for an existing source from agent-extracted flat entities. Observations produced by this tool are linked to both source_id and interpretation_id. Use **`store`** with an interpretation block when the source-derived extraction can be batched in one store call.",
      ),
      inputSchema: getOpenApiInputSchemaOrThrow("create_interpretation"),
    },
    {
      name: "list_interpretations",
      description: desc(
        "list_interpretations",
        "List interpretation runs for the authenticated user, optionally filtered by source_id.",
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
        "Check for stale entity snapshots (snapshots with observation_count=0 but observations exist). Returns health status and count of stale snapshots.",
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
        "List the most recently changed records across core Neotoma tables (entities, sources, observations, interpretations, relationships, timeline_events) for the authenticated user. Returns items ordered by latest activity_at.",
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
      name: "submit_issue",
      description: desc(
        "submit_issue",
        "Submit an issue to the operator's Neotoma instance (canonical store). " +
          "For public issues, optionally publishes to GitHub first for discoverability. " +
          "For private issues, stays within Neotoma only (never touches GitHub). " +
          "Creates a local `issue` entity + associated conversation for tracking. " +
          "Submits to the operator Neotoma instance (default base URL when unset: https://neotoma.markmhendrickson.com). Override with NEOTOMA_ISSUES_TARGET_URL or issues.target_url in config. " +
          "When a non-empty target URL is configured, the tool fails (MCP error) if that remote store is unreachable or rejects the request; a local row with sync_pending may still be written first. " +
          "When `pushed_to_github` is false for a public issue, read `github_mirror_guidance` for recommended auth + manual GitHub create + entity update steps.",
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
            description: "Use 'private' for PII-sensitive issues (Neotoma only, no GitHub). 'advisory' is accepted as a deprecated alias for 'private'. Default: 'public'.",
          },
        },
        required: ["title", "body"],
      },
    },
    {
      name: "add_issue_message",
      description: desc(
        "add_issue_message",
        "Add a message to an existing issue thread. Submits to the configured operator Neotoma instance first, creates a conversation_message locally, and may push a GitHub comment. " +
          "Fails with an MCP error if the remote Neotoma store is required (non-empty target URL) but unreachable or rejects the request.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          issue_number: { type: "number", description: "GitHub issue number." },
          body: { type: "string", description: "Message body in markdown." },
        },
        required: ["issue_number", "body"],
      },
    },
    {
      name: "get_issue_status",
      description: desc(
        "get_issue_status",
        "Get the current status of an issue including its conversation messages. " +
          "Implicitly syncs from GitHub if local data is stale (>5min). Pass skip_sync=true to bypass.",
      ),
      inputSchema: {
        type: "object",
        properties: {
          issue_number: { type: "number", description: "GitHub issue number." },
          skip_sync: {
            type: "boolean",
            description: "Skip implicit sync from GitHub (use cached local data only).",
          },
        },
        required: ["issue_number"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "sync_issues",
      description: desc(
        "sync_issues",
        "Full sync of issues from the configured GitHub repo into local Neotoma. " +
          "Pulls all issues and their messages, creating/updating local entities. " +
          "Supports filtering by state, labels, and since date.",
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
        },
      },
    },
    {
      name: "npm_check_update",
      description: desc(
        "npm_check_update",
        "Check if a newer npm version is available. Returns updateAvailable, message, and suggestedCommand. Call at session start to encourage user to upgrade.",
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
        },
        required: ["packageName", "currentVersion"],
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
  "get_relationship_snapshot",
  "retrieve_entities",
  "list_timeline_events",
  "retrieve_entity_by_identifier",
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
  "analyze_schema_candidates",
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
  "npm_check_update",
] as const;

export type NeotomaToolName = (typeof NEOTOMA_TOOL_NAMES)[number];
