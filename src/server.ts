import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { supabase } from "./db.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import {
  normalizeEntityValue,
  generateEntityId,
  type Entity,
} from "./services/entity_resolution.js";

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(ext: string): string | null {
  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".html": "text/html",
    ".xml": "application/xml",
    ".md": "text/markdown",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".parquet": "application/x-parquet",
  };
  return mimeTypes[ext] || null;
}

export class NeotomaServer {
  private server: Server;
  private autoEnhancementCleanup?: () => void;

  constructor() {
    this.server = new Server(
      {
        name: "neotoma",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandler();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "retrieve_file_url",
          description: "Retrieve a signed URL for accessing a file",
          inputSchema: {
            type: "object",
            properties: {
              file_path: {
                type: "string",
                description: "Path to file in storage",
              },
              expires_in: {
                type: "number",
                description: "URL expiration in seconds",
              },
            },
            required: ["file_path"],
          },
        },
        {
          name: "retrieve_entity_snapshot",
          description:
            "Retrieve the current snapshot of an entity with provenance information. Supports historical snapshots via 'at' parameter.",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description: "Entity ID to retrieve snapshot for",
              },
              at: {
                type: "string",
                description: "Optional ISO 8601 timestamp to get historical snapshot state",
              },
            },
            required: ["entity_id"],
          },
        },
        {
          name: "list_observations",
          description: "List all observations for a given entity",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description: "Entity ID to list observations for",
              },
              limit: {
                type: "number",
                description: "Maximum number of observations to return",
                default: 100,
              },
              offset: {
                type: "number",
                description: "Offset for pagination",
                default: 0,
              },
            },
            required: ["entity_id"],
          },
        },
        {
          name: "retrieve_field_provenance",
          description: "Retrieve the provenance chain for a specific field in an entity snapshot",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: { type: "string", description: "Entity ID" },
              field: {
                type: "string",
                description: "Field name to trace provenance for",
              },
            },
            required: ["entity_id", "field"],
          },
        },
        {
          name: "create_relationship",
          description: "Create a typed relationship between two entities",
          inputSchema: {
            type: "object",
            properties: {
              relationship_type: {
                type: "string",
                description: "Type of relationship (e.g., PART_OF, CORRECTS, SETTLES)",
              },
              source_entity_id: {
                type: "string",
                description: "Source entity ID",
              },
              target_entity_id: {
                type: "string",
                description: "Target entity ID",
              },
              metadata: {
                type: "object",
                description: "Optional metadata for the relationship",
              },
            },
            required: ["relationship_type", "source_entity_id", "target_entity_id"],
          },
        },
        {
          name: "list_relationships",
          description: "List relationships for an entity",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description: "Entity ID to list relationships for",
              },
              direction: {
                type: "string",
                enum: ["inbound", "outbound", "both"],
                description: "Direction of relationships to list",
                default: "both",
              },
              relationship_type: {
                type: "string",
                description: "Optional: Filter by relationship type",
              },
              limit: {
                type: "number",
                description: "Maximum number of relationships to return",
                default: 100,
              },
              offset: {
                type: "number",
                description: "Offset for pagination",
                default: 0,
              },
            },
            required: ["entity_id"],
          },
        },
        {
          name: "get_relationship_snapshot",
          description: "Get the current snapshot of a specific relationship with provenance",
          inputSchema: {
            type: "object",
            properties: {
              relationship_type: {
                type: "string",
                enum: [
                  "PART_OF",
                  "CORRECTS",
                  "REFERS_TO",
                  "SETTLES",
                  "DUPLICATE_OF",
                  "DEPENDS_ON",
                  "SUPERSEDES",
                ],
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
          description:
            "Query entities with filters (type, pagination). Returns entities with their snapshots.",
          inputSchema: {
            type: "object",
            properties: {
              entity_type: {
                type: "string",
                description: "Filter by entity type (e.g., 'company', 'person')",
              },
              limit: {
                type: "number",
                description: "Maximum number of entities to return",
                default: 100,
              },
              offset: {
                type: "number",
                description: "Offset for pagination",
                default: 0,
              },
              include_snapshots: {
                type: "boolean",
                description: "Whether to include entity snapshots in response",
                default: true,
              },
            },
            required: [],
          },
        },
        {
          name: "list_timeline_events",
          description:
            "Query timeline events with filters (type, date range, source material). Returns chronological events derived from date fields in source material.",
          inputSchema: {
            type: "object",
            properties: {
              event_type: {
                type: "string",
                description: "Filter by event type (e.g., 'InvoiceIssued', 'FlightDeparture')",
              },
              after_date: {
                type: "string",
                description: "Filter events after this date (ISO 8601)",
              },
              before_date: {
                type: "string",
                description: "Filter events before this date (ISO 8601)",
              },
              source_id: {
                type: "string",
                description: "Filter by source material ID (references sources table)",
              },
              limit: {
                type: "number",
                description: "Maximum number of events to return",
                default: 100,
              },
              offset: {
                type: "number",
                description: "Offset for pagination",
                default: 0,
              },
            },
            required: [],
          },
        },
        {
          name: "retrieve_entity_by_identifier",
          description:
            "Retrieve entity by identifier (name, email, etc.) across entity types or specific type.",
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
            },
            required: ["identifier"],
          },
        },
        {
          name: "retrieve_related_entities",
          description:
            "Retrieve entities connected to a given entity via relationships. Supports n-hop traversal.",
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
          description:
            "Retrieve complete graph neighborhood around a node (entity or source material): related entities, relationships, source material, and events.",
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
                description: "Type of node ('entity' for entities, 'source' for source material)",
                default: "entity",
              },
              include_relationships: {
                type: "boolean",
                description: "Include relationships in response",
                default: true,
              },
              include_sources: {
                type: "boolean",
                description: "Include related source material in response",
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
          description:
            "Unified storing for both unstructured and structured source material. For unstructured (files): provide EITHER file_content (base64-encoded) + mime_type OR file_path (local file path). For structured (entities): provide entities array. Content-addressed storage with SHA-256 deduplication per user. IMPORTANT FOR UNSTRUCTURED FILES: Agents MUST NOT attempt to interpret, extract, or infer structured data from unstructured files before storing. Simply provide the raw file_content (base64-encoded) and mime_type, OR provide file_path for local files. The server will automatically handle file analysis and interpretation if interpret=true (default). Do NOT read file contents to extract entities or fields - pass the file as-is. IMPORTANT FOR STRUCTURED DATA: Before storing structured source material with an entity_type value set, agents MUST use list_entity_types (optionally with a keyword matching your data) to discover available entity types and their field schemas. This helps determine the correct entity_type and avoids unnecessary interpretation. Only set entity_type directly when it can be determined from existing data, is explicitly provided by the user, or is unambiguous from the data structure itself. CRITICAL: When storing structured entities, agents MUST include ALL fields from the source data, not just fields that match the entity schema. Schema fields are stored in observations (validated), while non-schema fields are automatically stored in raw_fragments (preserved for future schema expansion). This ensures zero data loss - never filter or exclude fields based on schema compatibility. The system automatically validates and routes fields appropriately.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "User ID (UUID)",
              },
              // Unstructured source material - EITHER file_content OR file_path
              file_content: {
                type: "string",
                description:
                  "Base64-encoded file content (for unstructured storage). IMPORTANT: Do NOT interpret or extract data from the file before storing - provide the raw file content. The server handles interpretation automatically. Use file_path for local files instead of base64 encoding.",
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
                  "Original filename (optional, auto-detected from file_path if not provided)",
              },
              interpret: {
                type: "boolean",
                description:
                  "Whether to run AI interpretation immediately (for unstructured). Default: true. Set to false to defer interpretation (e.g., when approaching quota limits, for batch processing, or to interpret later with different config via reinterpret). Note: Interpretation is automatically skipped for deduplicated files only if observations already exist from that source. If a file is deduplicated but has no observations, interpretation will run if interpret=true.",
                default: true,
              },
              interpretation_config: {
                type: "object",
                description: "AI interpretation configuration (provider, model, etc.)",
              },
              // Structured source material
              entities: {
                type: "array",
                description:
                  "Array of entity data objects (for structured storage). Each entity must include entity_type. IMPORTANT: Before setting entity_type, use list_entity_types (optionally with a keyword) to discover available entity types and their field schemas. This helps determine the correct entity_type for your data and avoids unnecessary interpretation. Only set entity_type directly when it can be determined from existing data, is explicitly provided by the user, or is unambiguous from the data structure itself. CRITICAL: Include ALL fields from source data in each entity object - both schema fields AND non-schema fields. Schema fields are stored in observations (validated), while non-schema fields are automatically stored in raw_fragments (preserved for future schema expansion). Never filter or exclude fields - the system automatically validates and routes them. Example: If source has 40 fields but schema defines 15, include all 40 fields. The response includes unknown_fields_count indicating how many fields were stored in raw_fragments (this is expected and desired).",
                items: {
                  type: "object",
                  properties: {
                    entity_type: {
                      type: "string",
                      description:
                        "Entity type (e.g., 'invoice', 'note', 'person', 'company'). MUST be determined via existing actions (retrieve_entities, retrieve_entity_by_identifier) when possible to avoid unnecessary interpretation. Only set directly when: (1) determinable from existing data in Neotoma, (2) explicitly provided by user, or (3) unambiguous from data structure.",
                    },
                  },
                  required: ["entity_type"],
                },
              },
              source_priority: {
                type: "number",
                description: "Source priority for structured data (default: 100)",
                default: 100,
              },
            },
            required: ["user_id"],
          },
        },
        {
          name: "reinterpret",
          description:
            "Re-run AI interpretation on an existing source with new config. Creates new observations without modifying existing ones.",
          inputSchema: {
            type: "object",
            properties: {
              source_id: {
                type: "string",
                description: "Source ID (UUID) to reinterpret",
              },
              interpretation_config: {
                type: "object",
                description: "AI interpretation configuration",
              },
            },
            required: ["source_id", "interpretation_config"],
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
                description: "User ID (UUID)",
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
            },
            required: ["user_id", "entity_id", "entity_type", "field", "value"],
          },
        },
        {
          name: "merge_entities",
          description:
            "Merge duplicate entities. Rewrites observations from source entity to target entity and marks source as merged.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "User ID (UUID)",
              },
              from_entity_id: {
                type: "string",
                description: "Source entity ID to merge from",
              },
              to_entity_id: {
                type: "string",
                description: "Target entity ID to merge into",
              },
              merge_reason: {
                type: "string",
                description: "Optional reason for merge",
              },
            },
            required: ["user_id", "from_entity_id", "to_entity_id"],
          },
        },
        {
          name: "list_entity_types",
          description:
            "List all available entity types with their schema information. Optionally filter by keyword to find entity types relevant to your data. Uses hybrid search: keyword matching first (deterministic), then vector semantic search (semantic similarity). Use this action before storing structured data to determine the correct entity_type.",
          inputSchema: {
            type: "object",
            properties: {
              keyword: {
                type: "string",
                description:
                  "Optional keyword to filter entity types. Uses hybrid search: (1) keyword matching on entity type names and field names (deterministic, fast), (2) if no good matches, falls back to vector semantic search for semantic similarity. Examples: 'food' finds 'meal', 'recipe'; 'payment' finds 'transaction', 'invoice', 'receipt'; 'person' finds 'contact', 'person', 'company'.",
              },
            },
            required: [],
          },
        },
        {
          name: "analyze_schema_candidates",
          description: "Analyze raw_fragments to identify fields that should be promoted to schema fields. Returns recommendations with confidence scores based on frequency and type consistency.",
          inputSchema: {
            type: "object",
            properties: {
              entity_type: {
                type: "string",
                description: "Entity type to analyze (optional, analyzes all if not provided)"
              },
              user_id: {
                type: "string",
                description: "User ID for user-specific analysis (optional)"
              },
              min_frequency: {
                type: "number",
                description: "Minimum frequency threshold (default: 5)",
                default: 5
              },
              min_confidence: {
                type: "number",
                description: "Minimum confidence score 0-1 (default: 0.8)",
                default: 0.8
              }
            },
            required: []
          }
        },
        {
          name: "get_schema_recommendations",
          description: "Get schema update recommendations for an entity type from raw_fragments analysis, agent suggestions, or inference.",
          inputSchema: {
            type: "object",
            properties: {
              entity_type: {
                type: "string",
                description: "Entity type to get recommendations for"
              },
              user_id: {
                type: "string",
                description: "User ID for user-specific recommendations (optional)"
              },
              source: {
                type: "string",
                enum: ["raw_fragments", "agent", "inference", "all"],
                description: "Recommendation source (default: all)"
              },
              status: {
                type: "string",
                enum: ["pending", "approved", "rejected"],
                description: "Filter by recommendation status (default: pending)"
              }
            },
            required: ["entity_type"]
          }
        },
        {
          name: "update_schema_incremental",
          description: "Incrementally update a schema by adding new fields from raw_fragments or agent recommendations. Creates new schema version and activates it immediately, so all new data stored after this call will use the updated schema. Optionally migrates existing raw_fragments to observations for historical data backfill.",
          inputSchema: {
            type: "object",
            properties: {
              entity_type: {
                type: "string",
                description: "Entity type to update"
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
                      enum: ["string", "number", "date", "boolean", "array", "object"]
                    },
                    required: { type: "boolean", default: false },
                    reducer_strategy: {
                      type: "string",
                      enum: ["last_write", "highest_priority", "most_specific", "merge_array"]
                    }
                  },
                  required: ["field_name", "field_type"]
                }
              },
              schema_version: {
                type: "string",
                description: "New schema version (auto-increments if not provided)"
              },
              user_specific: {
                type: "boolean",
                description: "Create user-specific schema variant (default: false)",
                default: false
              },
              user_id: {
                type: "string",
                description: "User ID for user-specific schema (required if user_specific=true)"
              },
              activate: {
                type: "boolean",
                description: "Activate schema immediately so it applies to new data (default: true). If false, schema is registered but not active.",
                default: true
              },
              migrate_existing: {
                type: "boolean",
                description: "Migrate existing raw_fragments to observations for historical data backfill (default: false). Note: New data automatically uses updated schema after activation, migration is only for old data.",
                default: false
              }
            },
            required: ["entity_type", "fields_to_add"]
          }
        },
        {
          name: "register_schema",
          description: "Register a new schema or schema version. Supports both global and user-specific schemas.",
          inputSchema: {
            type: "object",
            properties: {
              entity_type: { type: "string" },
              schema_definition: { 
                type: "object",
                description: "Schema definition with fields object"
              },
              reducer_config: { 
                type: "object",
                description: "Reducer configuration with merge policies"
              },
              schema_version: { type: "string", default: "1.0" },
              user_specific: { type: "boolean", default: false },
              user_id: {
                type: "string",
                description: "User ID for user-specific schema (required if user_specific=true)"
              },
              activate: { type: "boolean", default: false }
            },
            required: ["entity_type", "schema_definition", "reducer_config"]
          }
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Check if this is an encrypted request wrapper
        if (name === "encrypted_request" && (args as any)?.encryptedPayload) {
          // Blind routing - return encrypted payload as-is
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  encryptedPayload: (args as any).encryptedPayload,
                }),
              },
            ],
          };
        }

        switch (name) {
          case "retrieve_file_url":
            return await this.retrieveFileUrl(args);
          case "retrieve_entity_snapshot":
            return await this.retrieveEntitySnapshot(args);
          case "list_observations":
            return await this.listObservations(args);
          case "retrieve_field_provenance":
            return await this.retrieveFieldProvenance(args);
          case "create_relationship":
            return await this.createRelationship(args);
          case "list_relationships":
            return await this.listRelationships(args);
          case "get_relationship_snapshot":
            return await this.getRelationshipSnapshot(args);
          case "retrieve_entities":
            return await this.retrieveEntities(args);
          case "list_timeline_events":
            return await this.listTimelineEvents(args);
          case "retrieve_entity_by_identifier":
            return await this.retrieveEntityByIdentifier(args);
          case "retrieve_related_entities":
            return await this.retrieveRelatedEntities(args);
          case "retrieve_graph_neighborhood":
            return await this.retrieveGraphNeighborhood(args);
          case "list_entity_types":
            return await this.listEntityTypes(args);
          case "analyze_schema_candidates":
            return await this.analyzeSchemaCandidates(args);
          case "get_schema_recommendations":
            return await this.getSchemaRecommendations(args);
          case "update_schema_incremental":
            return await this.updateSchemaIncremental(args);
          case "register_schema":
            return await this.registerSchema(args);
          case "store":
            return await this.store(args);
          case "reinterpret":
            return await this.reinterpret(args);
          case "correct":
            return await this.correct(args);
          case "merge_entities":
            return await this.mergeEntities(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        // Safely extract error message, handling BigInt values
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          try {
            // Try to stringify, but catch BigInt serialization errors
            errorMessage = JSON.stringify(error, (key, value) => {
              if (typeof value === 'bigint') {
                return Number(value);
              }
              return value;
            });
          } catch (stringifyError) {
            errorMessage = String(error);
          }
        }
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  /**
   * Setup resource handlers for MCP resources capability
   */
  private setupResourceHandlers(): void {
    // List all available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resources: Array<{
          uri: string;
          name: string;
          description: string;
          mimeType: string;
        }> = [];

        // Get available entity types
        const { data: entityTypes, error: etError } = await supabase
          .from("entity_types")
          .select("entity_type")
          .order("entity_type");

        if (!etError && entityTypes) {
          for (const et of entityTypes) {
            const typeName = et.entity_type;
            const capitalizedType = typeName.charAt(0).toUpperCase() + typeName.slice(1);
            resources.push({
              uri: `neotoma://entities/${typeName}`,
              name: `${capitalizedType} Entities`,
              description: `All ${typeName} entities`,
              mimeType: "application/json",
            });
          }
        }

        // Get available timeline years
        const { data: years, error: yearsError } = await supabase
          .from("timeline_events")
          .select("event_timestamp")
          .order("event_timestamp", { ascending: false });

        if (!yearsError && years && years.length > 0) {
          // Extract unique years
          const uniqueYears = new Set<string>();
          for (const event of years) {
            if (event.event_timestamp) {
              const year = new Date(event.event_timestamp).getFullYear().toString();
              uniqueYears.add(year);
            }
          }

          for (const year of Array.from(uniqueYears).sort().reverse()) {
            resources.push({
              uri: `neotoma://timeline/${year}`,
              name: `Timeline ${year}`,
              description: `All timeline events in ${year}`,
              mimeType: "application/json",
            });
          }
        }

        // Add sources collection resource
        resources.push({
          uri: "neotoma://sources",
          name: "Source Materials",
          description: "All source materials",
          mimeType: "application/json",
        });

        return { resources };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Failed to list resources"
        );
      }
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        const { uri } = request.params;
        const parsed = this.parseResourceUri(uri);

        let data: any;

        switch (parsed.type) {
          case "entity_collection":
            data = await this.handleEntityCollection(parsed.entityType!);
            break;
          case "entity":
            data = await this.handleIndividualEntity(parsed.entityId!);
            break;
          case "entity_observations":
            data = await this.handleEntityObservations(parsed.entityId!);
            break;
          case "entity_relationships":
            data = await this.handleEntityRelationships(parsed.entityId!);
            break;
          case "timeline_year":
            data = await this.handleTimelineYear(parsed.year!);
            break;
          case "timeline_month":
            data = await this.handleTimelineMonth(parsed.year!, parsed.month!);
            break;
          case "source":
            data = await this.handleSourceMaterial(parsed.sourceId!);
            break;
          case "source_collection":
            data = await this.handleSourceCollection();
            break;
          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unsupported resource type: ${parsed.type}`
            );
        }

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Failed to read resource"
        );
      }
    });
  }

  private async retrieveFileUrl(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      file_path: z.string(),
      expires_in: z.number().optional(),
    });

    const { file_path, expires_in } = schema.parse(args);

    const pathParts = file_path.split("/");
    const bucket = pathParts[0];
    const path = pathParts.slice(1).join("/");

    const expiresIn = expires_in || 3600;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error) throw error;

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            signed_url: data.signedUrl,
            expires_at: expiresAt,
          }),
        },
      ],
    };
  }

  private buildTextResponse(data: unknown): {
    content: Array<{ type: string; text: string }>;
  } {
    // Use replacer to handle BigInt values (convert to number)
    const replacer = (key: string, value: unknown) => {
      if (typeof value === 'bigint') {
        return Number(value);
      }
      return value;
    };
    return {
      content: [{ type: "text", text: JSON.stringify(data, replacer, 2) }],
    };
  }

  private async retrieveEntitySnapshot(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const { observationReducer } = await import("./reducers/observation_reducer.js");

    const schema = z.object({
      entity_id: z.string(),
      at: z.string().optional(), // ISO 8601 timestamp for historical snapshot
    });
    const parsed = schema.parse(args ?? {});

    // Get entity first to check if it exists and handle merged entity redirection
    const entity = await getEntityWithProvenance(parsed.entity_id);

    if (!entity) {
      throw new McpError(ErrorCode.InvalidParams, `Entity not found: ${parsed.entity_id}`);
    }

    // If 'at' parameter is provided, compute historical snapshot
    if (parsed.at) {
      try {
        // Validate timestamp
        const atTimestamp = new Date(parsed.at);
        if (isNaN(atTimestamp.getTime())) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid timestamp format: ${parsed.at}. Expected ISO 8601 format.`
          );
        }

        // Get all observations for this entity up to the specified timestamp
        const { data: observations, error: obsError } = await supabase
          .from("observations")
          .select("*")
          .eq("entity_id", entity.entity_id)
          .lte("observed_at", parsed.at)
          .order("observed_at", { ascending: false });

        if (obsError) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to get observations: ${obsError.message}`
          );
        }

        if (!observations || observations.length === 0) {
          // No observations at this point in time - return empty snapshot
          return this.buildTextResponse({
            entity_id: entity.entity_id,
            entity_type: entity.entity_type,
            schema_version: entity.entity_type, // Fallback
            snapshot: {},
            provenance: {},
            computed_at: new Date().toISOString(),
            observation_count: 0,
            last_observation_at: null,
          });
        }

        // Map database observations to reducer's expected format
        // Map observations to reducer's expected format
        // Note: reducer interface uses source_record_id field name, but we map from canonical source_id
        const mappedObservations = observations.map((obs: any) => ({
          id: obs.id,
          entity_id: obs.entity_id,
          entity_type: obs.entity_type,
          schema_version: obs.schema_version,
          source_record_id: obs.source_id || "", // Map from canonical source_id
          observed_at: obs.observed_at,
          specificity_score: obs.specificity_score,
          source_priority: obs.source_priority,
          fields: obs.fields,
          created_at: obs.created_at,
          user_id: obs.user_id,
        }));

        // Compute historical snapshot using reducer
        const historicalSnapshot = await observationReducer.computeSnapshot(
          entity.entity_id,
          mappedObservations
        );

        // Get raw_fragments for historical snapshot (same logic as current snapshot)
        const { getEntityWithProvenance } = await import("./services/entity_queries.js");
        const currentEntity = await getEntityWithProvenance(entity.entity_id);
        
        // Format response to match EntityWithProvenance structure
        return this.buildTextResponse({
          entity_id: historicalSnapshot.entity_id,
          entity_type: historicalSnapshot.entity_type,
          schema_version: historicalSnapshot.schema_version,
          snapshot: historicalSnapshot.snapshot,
          raw_fragments: currentEntity?.raw_fragments, // Use current raw_fragments (they don't change with historical snapshots)
          provenance: historicalSnapshot.provenance,
          computed_at: historicalSnapshot.computed_at,
          observation_count: historicalSnapshot.observation_count,
          last_observation_at: historicalSnapshot.last_observation_at,
        });
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to compute historical snapshot: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Return current snapshot (from stored entity_snapshots table)
    return this.buildTextResponse(entity);
  }

  private async listObservations(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
    });
    const parsed = schema.parse(args ?? {});

    const { data: observations, error } = await supabase
      .from("observations")
      .select("*")
      .eq("entity_id", parsed.entity_id)
      .order("observed_at", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to list observations: ${error.message}`);
    }

    return this.buildTextResponse({
      observations: observations || [],
      total: observations?.length || 0,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  }

  private async retrieveFieldProvenance(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
      field: z.string(),
    });
    const parsed = schema.parse(args ?? {});

    // Get the snapshot to extract provenance
    const { data: snapshot, error: snapshotError } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", parsed.entity_id)
      .single();

    if (snapshotError || !snapshot) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Entity snapshot not found for ID: ${parsed.entity_id}`
      );
    }

    const provenance = snapshot.provenance as Record<string, string>;
    const observationId = provenance[parsed.field];

    if (!observationId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Field '${parsed.field}' not found in entity snapshot`
      );
    }

    // Get the observation
    const { data: observation, error: obsError } = await supabase
      .from("observations")
      .select("*")
      .eq("id", observationId)
      .single();

    if (obsError || !observation) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get observation: ${obsError?.message}`
      );
    }

    // Get the source material from sources table
    if (!observation.source_id) {
      throw new McpError(ErrorCode.InternalError, `Observation does not have source_id`);
    }

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, mime_type, file_size, original_filename, created_at")
      .eq("id", observation.source_id)
      .single();

    if (sourceError || !source) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get source material: ${sourceError?.message || "Source not found"}`
      );
    }

    const sourceMaterial = {
      id: source.id,
      mime_type: source.mime_type,
      file_urls: [], // Sources table doesn't have file_urls directly
      created_at: source.created_at,
    };

    const provenanceChain = {
      field: parsed.field,
      value: (snapshot.snapshot as Record<string, unknown>)[parsed.field],
      source_observation: {
        id: observationId,
        source_id: observation.source_id,
        observed_at: observation.observed_at,
        specificity_score: observation.specificity_score,
        source_priority: observation.source_priority,
      },
      source_material: sourceMaterial,
      observed_at: observation.observed_at,
    };

    return this.buildTextResponse(provenanceChain);
  }

  private async createRelationship(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const relationshipTypeEnum = z.enum([
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]);

    const schema = z.object({
      relationship_type: relationshipTypeEnum,
      source_entity_id: z.string(),
      target_entity_id: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.parse(args ?? {});

    // Check if relationship would create a cycle
    // Get all relationships to build the graph
    const { data: allRelationships } = await supabase
      .from("relationships")
      .select("source_entity_id, target_entity_id");

    // Build graph from existing relationships
    const graph = new Map<string, Set<string>>();
    if (allRelationships) {
      for (const rel of allRelationships) {
        if (!graph.has(rel.source_entity_id)) {
          graph.set(rel.source_entity_id, new Set());
        }
        graph.get(rel.source_entity_id)!.add(rel.target_entity_id);
      }
    }

    // Check if adding source -> target would create a cycle
    // A cycle exists if there's already a path from target to source
    const visited = new Set<string>();
    const hasPath = (from: string, to: string): boolean => {
      if (from === to) return true;
      if (visited.has(from)) return false;
      visited.add(from);
      const neighbors = graph.get(from) || new Set();
      for (const neighbor of neighbors) {
        if (hasPath(neighbor, to)) return true;
      }
      return false;
    };

    // Check if target can reach source (which would create a cycle when we add source -> target)
    visited.clear();
    if (hasPath(parsed.target_entity_id, parsed.source_entity_id)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Creating this relationship would create a cycle in the graph`
      );
    }

    const userId = "00000000-0000-0000-0000-000000000000"; // Default for v0.1.0 single-user

    // Create relationship observation (new approach)
    const { createRelationshipObservations } = await import("./services/interpretation.js");
    
    try {
      // Create a source for this relationship
      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .insert({
          content_hash: `relationship_${Date.now()}`,
          mime_type: "application/json",
          storage_url: `internal://relationship/${parsed.relationship_type}`,
          file_size: 0, // No file for direct relationship creation
          user_id: userId,
        })
        .select()
        .single();
      
      if (sourceError || !source) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to create source: ${sourceError?.message || "Unknown error"}`
        );
      }
      
      await createRelationshipObservations(
        [
          {
            relationship_type: parsed.relationship_type,
            source_entity_id: parsed.source_entity_id,
            target_entity_id: parsed.target_entity_id,
            metadata: parsed.metadata || {},
          },
        ],
        source.id, // Use the created source_id
        null, // No interpretation_id for direct creation
        userId,
        100, // High priority for user-created relationships
      );

      // Get the relationship snapshot (with retry for async snapshot creation)
      const relationshipKey = `${parsed.relationship_type}:${parsed.source_entity_id}:${parsed.target_entity_id}`;
      let snapshot = null;
      let snapshotError = null;
      
      // Retry up to 5 times with increasing delays (snapshot creation is async)
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 200 * attempt)); // 200ms, 400ms, 600ms, 800ms
        }
        
        const result = await supabase
          .from("relationship_snapshots")
          .select("*")
          .eq("relationship_key", relationshipKey)
          .eq("user_id", userId)
          .maybeSingle();
        
        snapshot = result.data;
        snapshotError = result.error;
        
        if (snapshot) {
          break; // Found it, exit retry loop
        }
      }

      if (snapshotError || !snapshot) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to retrieve relationship snapshot: ${snapshotError?.message || "Not found"}`,
        );
      }

      // Also insert into relationships table for backward compatibility (deprecated)
      await supabase
        .from("relationships")
        .insert({
          relationship_type: parsed.relationship_type,
          source_entity_id: parsed.source_entity_id,
          target_entity_id: parsed.target_entity_id,
          metadata: parsed.metadata || {},
          user_id: userId,
        });

      // Add id field for backward compatibility (using relationship_key as id)
      // Add created_at field per MCP_SPEC.md 3.15 (use last_observation_at as created_at)
      return this.buildTextResponse({
        ...snapshot,
        id: snapshot.relationship_key,
        created_at: snapshot.last_observation_at,
      });
    } catch (error) {
      // Check for specific error types
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create relationship: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async listRelationships(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
      direction: z.enum(["inbound", "outbound", "both"]).default("both"),
      relationship_type: z.string().optional(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
    });
    const parsed = schema.parse(args ?? {});

    const relationships: any[] = [];

    // Query relationship_snapshots instead of relationships table
    if (parsed.direction === "outbound" || parsed.direction === "both") {
      let outboundQuery = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", parsed.entity_id);

      if (parsed.relationship_type) {
        outboundQuery = outboundQuery.eq("relationship_type", parsed.relationship_type);
      }

      const { data: outbound, error: outboundError } = await outboundQuery;

      if (!outboundError && outbound) {
        relationships.push(...outbound.map((r) => ({ 
          ...r,
          id: r.relationship_key,  // Add id field for backward compatibility 
          direction: "outbound",
          // Include snapshot metadata as top-level for backward compatibility
          metadata: r.snapshot,
          // Add created_at field per MCP_SPEC.md 3.16 (use last_observation_at as created_at)
          created_at: r.last_observation_at,
        })));
      }
    }

    if (parsed.direction === "inbound" || parsed.direction === "both") {
      let inboundQuery = supabase
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", parsed.entity_id);

      if (parsed.relationship_type) {
        inboundQuery = inboundQuery.eq("relationship_type", parsed.relationship_type);
      }

      const { data: inbound, error: inboundError } = await inboundQuery;

      if (!inboundError && inbound) {
        relationships.push(...inbound.map((r) => ({ 
          ...r,
          id: r.relationship_key,  // Add id field for backward compatibility 
          direction: "inbound",
          // Include snapshot metadata as top-level for backward compatibility
          metadata: r.snapshot,
          // Add created_at field per MCP_SPEC.md 3.16 (use last_observation_at as created_at)
          created_at: r.last_observation_at,
        })));
      }
    }

    // Sort by last_observation_at DESC and apply pagination
    relationships.sort((a, b) => {
      const aTime = new Date(a.last_observation_at || a.computed_at || 0).getTime();
      const bTime = new Date(b.last_observation_at || b.computed_at || 0).getTime();
      return bTime - aTime;
    });

    const paginated = relationships.slice(parsed.offset, parsed.offset + parsed.limit);

    return this.buildTextResponse({
      relationships: paginated,
      total: relationships.length,
      limit: parsed.limit,
      offset: parsed.offset,
    });
  }

  private async getRelationshipSnapshot(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const relationshipTypeEnum = z.enum([
      "PART_OF",
      "CORRECTS",
      "REFERS_TO",
      "SETTLES",
      "DUPLICATE_OF",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]);

    const schema = z.object({
      relationship_type: relationshipTypeEnum,
      source_entity_id: z.string(),
      target_entity_id: z.string(),
    });
    const parsed = schema.parse(args ?? {});

    const userId = "00000000-0000-0000-0000-000000000000"; // Default for v0.1.0 single-user

    // Get relationship snapshot
    const relationshipKey = `${parsed.relationship_type}:${parsed.source_entity_id}:${parsed.target_entity_id}`;
    const { data: snapshot, error } = await supabase
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to retrieve relationship snapshot: ${error.message}`,
      );
    }

    if (!snapshot) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Relationship not found: ${relationshipKey}`,
      );
    }

    // Also get the observations for this relationship to show provenance
    const { data: observations } = await supabase
      .from("relationship_observations")
      .select("id, source_id, observed_at, specificity_score, source_priority, metadata")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .order("observed_at", { ascending: false });

    return this.buildTextResponse({
      snapshot,
      observations: observations || [],
    });
  }

  private async retrieveEntities(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { queryEntities } = await import("./services/entity_queries.js");

    const schema = z.object({
      user_id: z.string().uuid().optional(),
      entity_type: z.string().optional(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
      include_snapshots: z.boolean().default(true),
      include_merged: z.boolean().default(false),
    });
    const parsed = schema.parse(args ?? {});

    // Use new query service that excludes merged entities by default
    const entities = await queryEntities({
      userId: parsed.user_id,
      entityType: parsed.entity_type,
      includeMerged: parsed.include_merged,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    // Get total count (excluding merged entities unless requested)
    let countQuery = supabase.from("entities").select("*", { count: "exact", head: true });

    if (parsed.user_id) {
      countQuery = countQuery.eq("user_id", parsed.user_id);
    }

    if (parsed.entity_type) {
      countQuery = countQuery.eq("entity_type", parsed.entity_type);
    }

    if (!parsed.include_merged) {
      countQuery = countQuery.is("merged_to_entity_id", null);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count entities: ${countError.message}`
      );
    }

    return this.buildTextResponse({
      entities,
      total: count || 0,
      excluded_merged: !parsed.include_merged,
    });
  }

  private async listTimelineEvents(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      event_type: z.string().optional(),
      after_date: z.string().optional(),
      before_date: z.string().optional(),
      source_id: z.string().optional(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
    });
    const parsed = schema.parse(args ?? {});

    let query = supabase.from("timeline_events").select("*");

    if (parsed.event_type) {
      query = query.eq("event_type", parsed.event_type);
    }

    if (parsed.after_date) {
      query = query.gte("event_timestamp", parsed.after_date);
    }

    if (parsed.before_date) {
      query = query.lte("event_timestamp", parsed.before_date);
    }

    if (parsed.source_id) {
      query = query.eq("source_id", parsed.source_id);
    }

    // Get total count
    let countQuery = supabase.from("timeline_events").select("*", {
      count: "exact",
      head: true,
    });

    if (parsed.event_type) {
      countQuery = countQuery.eq("event_type", parsed.event_type);
    }

    if (parsed.after_date) {
      countQuery = countQuery.gte("event_timestamp", parsed.after_date);
    }

    if (parsed.before_date) {
      countQuery = countQuery.lte("event_timestamp", parsed.before_date);
    }

    if (parsed.source_id) {
      countQuery = countQuery.eq("source_id", parsed.source_id);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count timeline events: ${countError.message}`
      );
    }

    // Get events with pagination
    const { data: events, error } = await query
      .order("event_timestamp", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list timeline events: ${error.message}`
      );
    }

    return this.buildTextResponse({
      events: events || [],
      total: count || 0,
    });
  }

  private async retrieveEntityByIdentifier(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      identifier: z.string(),
      entity_type: z.string().optional(),
    });
    const parsed = schema.parse(args ?? {});

    // Normalize the identifier
    const normalized = parsed.entity_type
      ? normalizeEntityValue(parsed.entity_type, parsed.identifier)
      : parsed.identifier.trim().toLowerCase();

    // Search in entities table by canonical_name or aliases
    let query = supabase
      .from("entities")
      .select("*")
      .or(`canonical_name.ilike.%${normalized}%,aliases.cs.["${normalized}"]`);

    if (parsed.entity_type) {
      query = query.eq("entity_type", parsed.entity_type);
    }

    const { data: entities, error } = await query.limit(100);

    if (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to search entities: ${error.message}`);
    }

    // If no direct match, try generating entity ID to see if it exists
    if ((!entities || entities.length === 0) && parsed.entity_type) {
      const possibleId = generateEntityId(parsed.entity_type, parsed.identifier);
      const { data: entityById, error: idError } = await supabase
        .from("entities")
        .select("*")
        .eq("id", possibleId)
        .single();

      if (!idError && entityById) {
        return this.buildTextResponse({
          entities: [entityById],
          total: 1,
        });
      }
    }

    // Optionally include snapshots for found entities
    let entitiesWithSnapshots = entities || [];
    if (entitiesWithSnapshots.length > 0) {
      const entityIds = entitiesWithSnapshots.map((e: Entity) => e.id);
      const { data: snapshots, error: snapError } = await supabase
        .from("entity_snapshots")
        .select("*")
        .in("entity_id", entityIds);

      if (!snapError && snapshots) {
        const snapshotMap = new Map(snapshots.map((s) => [s.entity_id, s]));
        entitiesWithSnapshots = entitiesWithSnapshots.map((entity: Entity) => ({
          ...entity,
          snapshot: snapshotMap.get(entity.id) || null,
        }));
      }
    }

    return this.buildTextResponse({
      entities: entitiesWithSnapshots,
      total: entitiesWithSnapshots.length,
    });
  }

  private async retrieveRelatedEntities(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
      relationship_types: z.array(z.string()).optional(),
      direction: z.enum(["inbound", "outbound", "both"]).default("both"),
      max_hops: z.number().int().positive().default(1),
      include_entities: z.boolean().default(true),
    });
    const parsed = schema.parse(args ?? {});

    const visited = new Set<string>([parsed.entity_id]);
    const relatedEntityIds = new Set<string>();
    const allRelationships: any[] = [];
    let currentLevel = [parsed.entity_id];

    // Traverse relationships up to max_hops
    for (let hop = 0; hop < parsed.max_hops; hop++) {
      const nextLevel: string[] = [];

      for (const entityId of currentLevel) {
        // Get outbound relationships
        if (parsed.direction === "outbound" || parsed.direction === "both") {
          let outboundQuery = supabase
            .from("relationships")
            .select("*")
            .eq("source_entity_id", entityId);

          if (parsed.relationship_types && parsed.relationship_types.length > 0) {
            outboundQuery = outboundQuery.in("relationship_type", parsed.relationship_types);
          }

          const { data: outbound, error: outError } = await outboundQuery;

          if (!outError && outbound) {
            allRelationships.push(...outbound);
            for (const rel of outbound) {
              if (!visited.has(rel.target_entity_id)) {
                visited.add(rel.target_entity_id);
                relatedEntityIds.add(rel.target_entity_id);
                nextLevel.push(rel.target_entity_id);
              }
            }
          }
        }

        // Get inbound relationships
        if (parsed.direction === "inbound" || parsed.direction === "both") {
          let inboundQuery = supabase
            .from("relationships")
            .select("*")
            .eq("target_entity_id", entityId);

          if (parsed.relationship_types && parsed.relationship_types.length > 0) {
            inboundQuery = inboundQuery.in("relationship_type", parsed.relationship_types);
          }

          const { data: inbound, error: inError } = await inboundQuery;

          if (!inError && inbound) {
            allRelationships.push(...inbound);
            for (const rel of inbound) {
              if (!visited.has(rel.source_entity_id)) {
                visited.add(rel.source_entity_id);
                relatedEntityIds.add(rel.source_entity_id);
                nextLevel.push(rel.source_entity_id);
              }
            }
          }
        }
      }

      if (nextLevel.length === 0) break;
      currentLevel = nextLevel;
    }

    // Get entity details if requested
    let entities: any[] = [];
    if (parsed.include_entities && relatedEntityIds.size > 0) {
      const { data: entityData, error: entityError } = await supabase
        .from("entities")
        .select("*")
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await supabase
          .from("entity_snapshots")
          .select("*")
          .in("entity_id", Array.from(relatedEntityIds));

        if (!snapError && snapshots) {
          const snapshotMap = new Map(snapshots.map((s) => [s.entity_id, s]));
          entities = entities.map((entity) => ({
            ...entity,
            snapshot: snapshotMap.get(entity.id) || null,
          }));
        }
      }
    }

    return this.buildTextResponse({
      entities,
      relationships: allRelationships,
      total_entities: relatedEntityIds.size,
      total_relationships: allRelationships.length,
      hops_traversed: Math.min(parsed.max_hops, Array.from(visited).length > 1 ? 1 : 0),
    });
  }

  private async retrieveGraphNeighborhood(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      node_id: z.string(),
      node_type: z.enum(["entity", "source"]).default("entity"),
      include_relationships: z.boolean().default(true),
      include_sources: z.boolean().default(true),
      include_events: z.boolean().default(true),
      include_observations: z.boolean().default(false),
    });
    const parsed = schema.parse(args ?? {});

    const includeSourceMaterial = parsed.include_sources;

    const result: any = {
      node_id: parsed.node_id,
      node_type: parsed.node_type,
    };

    if (parsed.node_type === "entity") {
      // Get entity
      const { data: entity, error: entityError } = await supabase
        .from("entities")
        .select("*")
        .eq("id", parsed.node_id)
        .single();

      if (entityError || !entity) {
        throw new McpError(ErrorCode.InvalidParams, `Entity not found: ${parsed.node_id}`);
      }

      result.entity = entity;

      // Get entity snapshot
      const { data: snapshot, error: snapError } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", parsed.node_id)
        .single();

      if (!snapError && snapshot) {
        result.entity_snapshot = snapshot;
      }

      // Get relationships
      if (parsed.include_relationships) {
        const { data: relationships, error: relError } = await supabase
          .from("relationships")
          .select("*")
          .or(`source_entity_id.eq.${parsed.node_id},target_entity_id.eq.${parsed.node_id}`);

        if (!relError && relationships) {
          result.relationships = relationships;
          const relatedEntityIds = new Set<string>();
          relationships.forEach((rel) => {
            if (rel.source_entity_id !== parsed.node_id) {
              relatedEntityIds.add(rel.source_entity_id);
            }
            if (rel.target_entity_id !== parsed.node_id) {
              relatedEntityIds.add(rel.target_entity_id);
            }
          });

          // Get related entities
          if (relatedEntityIds.size > 0) {
            const { data: relatedEntities, error: relEntError } = await supabase
              .from("entities")
              .select("*")
              .in("id", Array.from(relatedEntityIds));

            if (!relEntError && relatedEntities) {
              result.related_entities = relatedEntities;
            }
          }
        }
      }

      // Get observations
      if (parsed.include_observations) {
        const { data: observations, error: obsError } = await supabase
          .from("observations")
          .select("*")
          .eq("entity_id", parsed.node_id)
          .order("observed_at", { ascending: false })
          .limit(100);

        if (!obsError && observations) {
          result.observations = observations;

          // Get source material for observations
          if (includeSourceMaterial && observations.length > 0) {
            const sourceIds = observations
              .map((obs: any) => obs.source_id)
              .filter((id: string) => id);
            if (sourceIds.length > 0) {
              const { data: sources, error: sourceError } = await supabase
                .from("sources")
                .select("id, mime_type, file_size, original_filename, created_at")
                .in("id", sourceIds);

              if (!sourceError && sources) {
                result.related_sources = sources;

                // Get events for these sources
                if (parsed.include_events) {
                  const { data: events, error: evtError } = await supabase
                    .from("timeline_events")
                    .select("*")
                    .in("source_id", sourceIds);

                  if (!evtError && events) {
                    result.timeline_events = events;
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // node_type === "source"
      const { data: source, error: sourceError } = await supabase
        .from("sources")
        .select("*")
        .eq("id", parsed.node_id)
        .single();

      if (sourceError || !source) {
        throw new McpError(ErrorCode.InvalidParams, `Source material not found: ${parsed.node_id}`);
      }

      result.source_material = source;

      // Get timeline events for this source
      if (parsed.include_events) {
        const { data: events, error: evtError } = await supabase
          .from("timeline_events")
          .select("*")
          .eq("source_id", parsed.node_id);

        if (!evtError && events) {
          result.timeline_events = events;
        }
      }

      // Get observations from this source
      const { data: observations, error: obsError } = await supabase
        .from("observations")
        .select("*")
        .eq("source_id", parsed.node_id);

      if (!obsError && observations) {
        result.observations = observations;

        // Get entities mentioned in observations
        if (observations.length > 0) {
          const entityIds = observations
            .map((obs: any) => obs.entity_id)
            .filter((id: string) => id);
          if (entityIds.length > 0) {
            const { data: entities, error: entError } = await supabase
              .from("entities")
              .select("*")
              .in("id", entityIds);

            if (!entError && entities) {
              result.related_entities = entities;

              // Get relationships for these entities
              if (parsed.include_relationships && entities.length > 0) {
                const { data: relationships, error: relError } = await supabase
                  .from("relationships")
                  .select("*")
                  .or(
                    `source_entity_id.in.(${entityIds.join(
                      ","
                    )}),target_entity_id.in.(${entityIds.join(",")})`
                  )
                  .limit(1000);

                if (!relError && relationships) {
                  result.relationships = relationships;
                }
              }
            }
          }
        }
      }
    }

    return this.buildTextResponse(result);
  }

  // List entity types with optional keyword filtering (hybrid: keyword + vector search)
  private async listEntityTypes(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      keyword: z.string().optional(),
    });
    const parsed = schema.parse(args ?? {});

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const entityTypes = await schemaRegistry.listEntityTypes(parsed.keyword);

      return this.buildTextResponse({
        entity_types: entityTypes,
        total: entityTypes.length,
        keyword: parsed.keyword || null,
        search_method: parsed.keyword
          ? entityTypes[0]?.match_type === "vector"
            ? "vector_semantic"
            : "keyword_exact"
          : "all",
      });
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to list entity types: ${error.message}`);
    }
  }

  /**
   * Analyze raw_fragments to identify schema candidates
   */
  private async analyzeSchemaCandidates(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_type: z.string().optional(),
      user_id: z.string().uuid().optional(),
      min_frequency: z.number().default(5),
      min_confidence: z.number().default(0.8),
    });
    const parsed = schema.parse(args ?? {});

    const { schemaRecommendationService } = await import("./services/schema_recommendation.js");

    try {
      const recommendations = await schemaRecommendationService.analyzeRawFragments({
        entity_type: parsed.entity_type,
        user_id: parsed.user_id,
        min_frequency: parsed.min_frequency,
        min_confidence: parsed.min_confidence,
      });

      return this.buildTextResponse({
        recommendations,
        total_entity_types: recommendations.length,
        total_fields: recommendations.reduce((sum, r) => sum + r.fields.length, 0),
        min_frequency: parsed.min_frequency,
        min_confidence: parsed.min_confidence,
      });
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to analyze schema candidates: ${error.message}`);
    }
  }

  /**
   * Get schema recommendations
   */
  private async getSchemaRecommendations(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_type: z.string(),
      user_id: z.string().uuid().optional(),
      source: z.enum(["raw_fragments", "agent", "inference", "all"]).optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    });
    const parsed = schema.parse(args);

    const { schemaRecommendationService } = await import("./services/schema_recommendation.js");

    try {
      const recommendations = await schemaRecommendationService.getRecommendations({
        entity_type: parsed.entity_type,
        user_id: parsed.user_id,
        source: parsed.source === "all" ? undefined : parsed.source,
        status: parsed.status,
      });

      return this.buildTextResponse({
        recommendations,
        total: recommendations.length,
        entity_type: parsed.entity_type,
        source: parsed.source || "all",
        status: parsed.status || "any",
      });
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to get schema recommendations: ${error.message}`);
    }
  }

  /**
   * Incrementally update schema by adding fields
   */
  private async updateSchemaIncremental(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_type: z.string(),
      fields_to_add: z.array(
        z.object({
          field_name: z.string(),
          field_type: z.enum(["string", "number", "date", "boolean", "array", "object"]),
          required: z.boolean().default(false),
          reducer_strategy: z
            .enum(["last_write", "highest_priority", "most_specific", "merge_array"])
            .optional(),
        })
      ),
      schema_version: z.string().optional(),
      user_specific: z.boolean().default(false),
      user_id: z.string().uuid().optional(),
      activate: z.boolean().default(true),
      migrate_existing: z.boolean().default(false),
    });
    const parsed = schema.parse(args);

    // Validate user_id if user_specific
    if (parsed.user_specific && !parsed.user_id) {
      throw new McpError(ErrorCode.InvalidParams, "user_id is required when user_specific=true");
    }

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const updatedSchema = await schemaRegistry.updateSchemaIncremental({
        entity_type: parsed.entity_type,
        fields_to_add: parsed.fields_to_add,
        schema_version: parsed.schema_version,
        user_specific: parsed.user_specific,
        user_id: parsed.user_id,
        activate: parsed.activate,
        migrate_existing: parsed.migrate_existing,
      });

      return this.buildTextResponse({
        success: true,
        entity_type: parsed.entity_type,
        schema_version: updatedSchema.schema_version,
        fields_added: parsed.fields_to_add.map((f) => f.field_name),
        activated: parsed.activate,
        migrated_existing: parsed.migrate_existing,
        scope: parsed.user_specific ? "user" : "global",
      });
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to update schema incrementally: ${error.message}`);
    }
  }

  /**
   * Register a new schema
   */
  private async registerSchema(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_type: z.string(),
      schema_definition: z.record(z.unknown()),
      reducer_config: z.record(z.unknown()),
      schema_version: z.string().default("1.0"),
      user_specific: z.boolean().default(false),
      user_id: z.string().uuid().optional(),
      activate: z.boolean().default(false),
    });
    const parsed = schema.parse(args);

    // Validate user_id if user_specific
    if (parsed.user_specific && !parsed.user_id) {
      throw new McpError(ErrorCode.InvalidParams, "user_id is required when user_specific=true");
    }

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const registeredSchema = await schemaRegistry.register({
        entity_type: parsed.entity_type,
        schema_version: parsed.schema_version,
        schema_definition: parsed.schema_definition as any,
        reducer_config: parsed.reducer_config as any,
        user_id: parsed.user_id,
        user_specific: parsed.user_specific,
        activate: parsed.activate,
      });

      return this.buildTextResponse({
        success: true,
        entity_type: parsed.entity_type,
        schema_version: registeredSchema.schema_version,
        activated: parsed.activate,
        scope: parsed.user_specific ? "user" : "global",
        schema_id: registeredSchema.id,
      });
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to register schema: ${error.message}`);
    }
  }

  // FU-122: MCP store() Tool
  // Implements idempotence pattern: retry loop, fixed-point guarantee, deduplication
  private async store(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { storeRawContent } = await import("./services/raw_storage.js");
    const { runInterpretation, runInterpretationWithFixedPoint, checkInterpretationQuota } =
      await import("./services/interpretation.js");
    const { analyzeFileForRecord } = await import("./services/file_analysis.js");

    // Unified schema: accepts EITHER file_content (unstructured) OR file_path OR entities (structured)
    const schema = z
      .object({
        user_id: z.string().uuid(),
        // Unstructured source material - EITHER file_content OR file_path
        file_content: z.string().optional(),
        file_path: z.string().optional(),
        mime_type: z.string().optional(),
        original_filename: z.string().optional(),
        interpret: z.boolean().default(true),
        interpretation_config: z.record(z.unknown()).optional(),
        // Structured source material
        entities: z.array(z.record(z.unknown())).optional(),
        source_priority: z.number().default(100),
      })
      .refine(
        (data) => {
          // Must have either file_content+mime_type OR file_path OR entities
          const hasFileContent = data.file_content && data.mime_type;
          const hasFilePath = data.file_path;
          const hasEntities = data.entities && data.entities.length > 0;
          return hasFileContent || hasFilePath || hasEntities;
        },
        { message: "Must provide either (file_content+mime_type) OR file_path OR entities array" }
      );

    const parsed = schema.parse(args);

    // Handle structured source material (entities array)
    if (parsed.entities) {
      return await this.storeStructuredInternal(
        parsed.user_id,
        parsed.entities,
        parsed.source_priority
      );
    }

    // Handle unstructured source material (file content OR file path)
    let fileBuffer: Buffer;
    let detectedMimeType: string;
    let detectedFilename: string;

    if (parsed.file_path) {
      // Read file from filesystem
      const fs = await import("fs");
      const path = await import("path");

      // Validate file exists
      if (!fs.existsSync(parsed.file_path)) {
        throw new Error(`File not found: ${parsed.file_path}`);
      }

      // Check if this is a parquet file - handle specially via structured path
      const { isParquetFile, readParquetFile } = await import("./services/parquet_reader.js");
      if (isParquetFile(parsed.file_path)) {
        logger.error(`[STORE] Detected parquet file: ${parsed.file_path}`);
        
        try {
          // Configure timeout for large parquet files (5 minutes default)
          const PARQUET_READ_TIMEOUT = 300000; // 5 minutes
          
          // Wrap readParquetFile with timeout and BigInt error handling
          let parquetResult;
          try {
            parquetResult = await Promise.race([
              readParquetFile(parsed.file_path),
              new Promise<never>((_, reject) => 
                setTimeout(
                  () => reject(new Error(`Parquet read timeout after ${PARQUET_READ_TIMEOUT / 1000}s. File may be too large or on slow network storage.`)),
                  PARQUET_READ_TIMEOUT
                )
              )
            ]);
          } catch (parquetError: any) {
            // If error contains BigInt serialization, provide clearer message
            if (parquetError?.message?.includes('BigInt') || parquetError?.message?.includes('serialize')) {
              throw new Error(
                `Parquet file contains INT64 fields that need BigInt conversion. ` +
                `This should be handled automatically. If this error persists, ` +
                `there may be a BigInt value in an unexpected location. ` +
                `Original: ${parquetError.message}`
              );
            }
            throw parquetError;
          }
          
          // Safely log metadata (ensure no BigInt values)
          const safeRowCount = typeof parquetResult.metadata.row_count === 'bigint' 
            ? Number(parquetResult.metadata.row_count) 
            : parquetResult.metadata.row_count;
          logger.error(
            `[STORE] Read ${safeRowCount} rows from parquet file (entity_type: ${parquetResult.metadata.entity_type})`
          );
          
          // Process as structured entities
          return await this.storeStructuredInternal(
            parsed.user_id,
            parquetResult.entities,
            parsed.source_priority
          );
        } catch (error: any) {
          // Safely extract error message, handling potential BigInt values
          let errorMessage = "Unknown error";
          try {
            if (error?.message) {
              errorMessage = String(error.message);
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else {
              // Try to stringify with BigInt replacer
              errorMessage = JSON.stringify(error, (key, value) => {
                if (typeof value === 'bigint') {
                  return Number(value);
                }
                return value;
              });
            }
          } catch (stringifyError) {
            // If stringification fails, use fallback
            errorMessage = String(error);
          }
          throw new Error(`Failed to process parquet file: ${errorMessage}`);
        }
      }

      // Read file
      try {
        fileBuffer = fs.readFileSync(parsed.file_path);
      } catch (error: any) {
        throw new Error(`File read error: ${error.message}`);
      }

      // Detect MIME type if not provided
      if (parsed.mime_type) {
        detectedMimeType = parsed.mime_type;
      } else {
        // Use file extension to infer MIME type
        const ext = path.extname(parsed.file_path).toLowerCase();
        detectedMimeType = getMimeTypeFromExtension(ext) || "application/octet-stream";
      }

      // Use filename from path if not provided
      detectedFilename = parsed.original_filename || path.basename(parsed.file_path);
    } else if (parsed.file_content && parsed.mime_type) {
      // Existing base64 handling
      fileBuffer = Buffer.from(parsed.file_content, "base64");
      detectedMimeType = parsed.mime_type;
      detectedFilename = parsed.original_filename || "file";
    } else {
      throw new Error("file_content+mime_type OR file_path required for unstructured storing");
    }

    // Store raw content
    const storageResult = await storeRawContent({
      userId: parsed.user_id,
      fileBuffer,
      mimeType: detectedMimeType,
      originalFilename: detectedFilename,
      provenance: {
        upload_method: "mcp_store",
        client: "mcp",
      },
    });

    const result: any = {
      source_id: storageResult.sourceId,
      content_hash: storageResult.contentHash,
      file_size: storageResult.fileSize,
      deduplicated: storageResult.deduplicated,
    };

    // Track entity IDs for related entities lookup
    let entityIds: string[] = [];

    // Check if interpretation should run:
    // 1. User requested interpretation (parsed.interpret === true)
    // 2. Either file is new OR file is deduplicated but has no observations yet
    const existingEntityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
    const shouldRunInterpretation =
      parsed.interpret && (!storageResult.deduplicated || existingEntityIds.length === 0);

    // Add debug info to result
    result.interpretation_debug = {
      interpret_requested: parsed.interpret,
      deduplicated: storageResult.deduplicated,
      existing_observations_count: existingEntityIds.length,
      should_run: shouldRunInterpretation,
    };

    if (shouldRunInterpretation) {
      try {
        // Check quota
        const quota = await checkInterpretationQuota(parsed.user_id);
        if (!quota.allowed) {
          // Get existing entities from this source (if deduplicated previously)
          entityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
          const relatedData = await this.getRelatedEntitiesAndRelationships(entityIds);
          return this.buildTextResponse({
            ...result,
            interpretation: {
              skipped: true,
              reason: "quota_exceeded",
              quota: quota,
            },
            related_entities: relatedData.entities,
            related_relationships: relatedData.relationships,
          });
        }

        // Determine model for extraction (use from config if provided, otherwise default)
        // GPT-4o is recommended for document extraction (98.99% accuracy vs 91.84% for mini)
        const extractionModelId =
          (parsed.interpretation_config?.model_id as string | undefined) ||
          (config.openaiApiKey ? "gpt-4o" : undefined);

        // Extract data from file with retry loop for idempotence
        const analysis = await analyzeFileForRecord({
          buffer: fileBuffer,
          fileName: detectedFilename,
          mimeType: detectedMimeType,
          modelId: extractionModelId,
          useRetry: true, // Enable retry loop with schema validation
        });

        // Convert FileAnalysisResult to entity format for interpretation
        const extractedData = [
          {
            entity_type: analysis.type,
            ...analysis.properties,
          },
        ];

        // Run interpretation with fixed-point guarantee
        // Use LLM-based config if OpenAI is configured, otherwise rule-based fallback
        const defaultConfig = config.openaiApiKey
          ? {
              provider: "openai",
              model_id: "gpt-4o", // GPT-4o recommended for accuracy
              temperature: 0, // Most deterministic (changed from 0.1 for idempotence)
              prompt_hash: "llm_extraction_v2_idempotent", // Updated version identifier
              code_version: "v0.2.0",
            }
          : {
              provider: "rule_based",
              model_id: "neotoma_v1",
              temperature: 0,
              prompt_hash: "n/a",
              code_version: "v0.2.0",
            };

        const interpretationConfig = parsed.interpretation_config
          ? {
              provider: (parsed.interpretation_config.provider as string) || defaultConfig.provider,
              model_id: (parsed.interpretation_config.model_id as string) || defaultConfig.model_id,
              temperature:
                (parsed.interpretation_config.temperature as number) ?? defaultConfig.temperature,
              prompt_hash:
                (parsed.interpretation_config.prompt_hash as string) || defaultConfig.prompt_hash,
              code_version:
                (parsed.interpretation_config.code_version as string) || defaultConfig.code_version,
              feature_flags: parsed.interpretation_config.feature_flags as
                | Record<string, boolean>
                | undefined,
            }
          : defaultConfig;

        // Use fixed-point guarantee wrapper (retries until hash stabilizes)
        const featureFlags = parsed.interpretation_config?.feature_flags as
          | Record<string, boolean>
          | undefined;
        const useFixedPoint = featureFlags?.use_fixed_point ?? false;
        const interpretationResult = useFixedPoint
          ? await runInterpretationWithFixedPoint({
              userId: parsed.user_id,
              sourceId: storageResult.sourceId,
              extractedData,
              config: interpretationConfig,
            })
          : await runInterpretation({
              userId: parsed.user_id,
              sourceId: storageResult.sourceId,
              extractedData,
              config: interpretationConfig,
            });

        result.interpretation = interpretationResult;

        // Get entity IDs from interpretation result
        if (interpretationResult.entities && interpretationResult.entities.length > 0) {
          entityIds = interpretationResult.entities.map((e) => e.entityId);
        }
      } catch (error) {
        // Log error but don't fail the store operation
        logger.error("Interpretation error:", error);
        result.interpretation = {
          error: error instanceof Error ? error.message : String(error),
          skipped: true,
          reason: "interpretation_failed",
        };
        // Still try to get existing entities if any
        entityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
      }
    } else if (storageResult.deduplicated) {
      // File was deduplicated and interpretation not requested or already has observations
      // Get existing entities from this source
      const { data: observations, error: obsError } = await supabase
        .from("observations")
        .select("id, entity_id, entity_type")
        .eq("source_id", storageResult.sourceId);

      entityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
      result.entity_debug = {
        source_id: storageResult.sourceId,
        observations_found: observations?.length || 0,
        observations:
          observations?.map((obs: any) => ({
            observation_id: obs.id,
            entity_id: obs.entity_id,
            entity_type: obs.entity_type,
          })) || [],
        entity_ids_retrieved: entityIds,
        entity_ids_count: entityIds.length,
        observation_error: obsError?.message || null,
      };
    }

    // Get entities themselves (created from this source) with snapshots
    let entities: any[] = [];
    if (entityIds.length > 0) {
      // Filter out null/undefined entity IDs
      const validEntityIds = entityIds.filter((id) => id != null);

      if (validEntityIds.length > 0) {
        const { data: entityData, error: entityError } = await supabase
          .from("entities")
          .select("*")
          .in("id", validEntityIds);

        if (!entityError && entityData) {
          entities = entityData;

          // Include snapshots
          const { data: snapshots, error: snapError } = await supabase
            .from("entity_snapshots")
            .select("*")
            .in("entity_id", validEntityIds);

          if (!snapError && snapshots) {
            const snapshotMap = new Map(snapshots.map((s) => [s.entity_id, s]));
            entities = entities.map((entity) => ({
              ...entity,
              snapshot: snapshotMap.get(entity.id) || null,
            }));
          }
        }
      }

      // Add debug info about entity retrieval
      result.entity_debug = {
        entity_ids_from_observations: entityIds,
        valid_entity_ids: entityIds.filter((id) => id != null),
        entities_found: entities.length,
        entity_error:
          entityIds.length > 0 && entities.length === 0 ? "No entities found for these IDs" : null,
      };
    }

    // Also get related entities and relationships (entities connected via relationships)
    const relatedData = await this.getRelatedEntitiesAndRelationships(entityIds);

    result.related_entities = entities; // Entities created from this source
    result.related_relationships = relatedData.relationships;

    return this.buildTextResponse(result);
  }

  // Helper method to get entity IDs from a source_id
  private async getEntityIdsFromSource(sourceId: string): Promise<string[]> {
    const { data: observations, error } = await supabase
      .from("observations")
      .select("id, entity_id")
      .eq("source_id", sourceId);

    if (error) {
      console.error("Error fetching observations:", error);
      return [];
    }

    if (!observations || observations.length === 0) {
      return [];
    }

    // Debug: log observation details
    logger.error(
      `Found ${observations.length} observation(s) for source ${sourceId}:`,
      observations.map((obs: any) => ({ obs_id: obs.id, entity_id: obs.entity_id }))
    );

    // Get unique entity IDs, filtering out null/undefined
    const entityIds = Array.from(
      new Set(observations.map((obs: any) => obs.entity_id).filter((id: any) => id != null))
    );

    logger.error(`Extracted ${entityIds.length} entity ID(s):`, entityIds);
    return entityIds;
  }

  // Helper method to retrieve related entities and relationships for entity IDs
  private async getRelatedEntitiesAndRelationships(
    entityIds: string[]
  ): Promise<{ entities: any[]; relationships: any[] }> {
    if (entityIds.length === 0) {
      return { entities: [], relationships: [] };
    }

    const allRelationships: any[] = [];
    const relatedEntityIds = new Set<string>();

    // Get all relationships for the stored entities
    const { data: outboundRels, error: outError } = await supabase
      .from("relationships")
      .select("*")
      .in("source_entity_id", entityIds);

    if (!outError && outboundRels) {
      allRelationships.push(...outboundRels);
      for (const rel of outboundRels) {
        relatedEntityIds.add(rel.target_entity_id);
      }
    }

    const { data: inboundRels, error: inError } = await supabase
      .from("relationships")
      .select("*")
      .in("target_entity_id", entityIds);

    if (!inError && inboundRels) {
      allRelationships.push(...inboundRels);
      for (const rel of inboundRels) {
        relatedEntityIds.add(rel.source_entity_id);
      }
    }

    // Get related entity details with snapshots
    let entities: any[] = [];
    if (relatedEntityIds.size > 0) {
      const { data: entityData, error: entityError } = await supabase
        .from("entities")
        .select("*")
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await supabase
          .from("entity_snapshots")
          .select("*")
          .in("entity_id", Array.from(relatedEntityIds));

        if (!snapError && snapshots) {
          const snapshotMap = new Map(snapshots.map((s) => [s.entity_id, s]));
          entities = entities.map((entity) => ({
            ...entity,
            snapshot: snapshotMap.get(entity.id) || null,
          }));
        }
      }
    }

    return { entities, relationships: allRelationships };
  }

  // Internal helper for structured source material storing
  private async storeStructuredInternal(
    userId: string,
    entities: Record<string, unknown>[],
    sourcePriority: number = 100
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { storeRawContent } = await import("./services/raw_storage.js");
    const { resolveEntity } = await import("./services/entity_resolution.js");
    const { schemaRegistry } = await import("./services/schema_registry.js");
    const { getSchemaDefinition } = await import("./services/schema_definitions.js");
    const { randomUUID } = await import("crypto");
    const { supabase } = await import("./db.js");

    // Store structured data as JSON source
    // Use replacer to handle BigInt values (convert to number)
    const jsonContent = JSON.stringify(entities, (key, value) => {
      if (typeof value === 'bigint') {
        return Number(value);
      }
      return value;
    }, 2);
    const fileBuffer = Buffer.from(jsonContent, "utf-8");

    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: "application/json",
      originalFilename: "structured_data.json",
      provenance: {
        upload_method: "mcp_store",
        client: "mcp",
        source_priority: sourcePriority,
      },
    });

    // Process structured entities directly (no interpretation run)
    const createdEntities: Array<{
      entityId: string;
      entityType: string;
      observationId: string;
    }> = [];
    let unknownFieldsCount = 0;

    for (const entityData of entities) {
      // Extract entity_type (support both 'entity_type' and 'type' fields)
      const entityType =
        (entityData.entity_type as string) || (entityData.type as string) || "generic";

      // Exclude entity_type and type from field validation (they're metadata)
      const fieldsToValidate = { ...entityData };
      delete fieldsToValidate.entity_type;
      delete fieldsToValidate.type;

      // Load schema for validation
      let schema = await schemaRegistry.loadActiveSchema(entityType);

      // Fallback to code-defined schema if database schema not found
      if (!schema) {
        const codeSchema = getSchemaDefinition(entityType);
        if (
          codeSchema &&
          codeSchema.entity_type &&
          codeSchema.schema_definition &&
          codeSchema.reducer_config
        ) {
          schema = {
            id: "",
            entity_type: codeSchema.entity_type,
            schema_version: codeSchema.schema_version || "1.0",
            schema_definition: codeSchema.schema_definition,
            reducer_config: codeSchema.reducer_config,
            active: true,
            created_at: new Date().toISOString(),
          };
        }
      }

      // Validate fields against schema
      let validFields: Record<string, unknown> = {};
      let unknownFields: Record<string, unknown> = {};

      if (schema) {
        // Validate against schema
        for (const [key, value] of Object.entries(fieldsToValidate)) {
          const fieldDef = schema.schema_definition.fields[key];

          if (!fieldDef) {
            unknownFields[key] = value;
            continue;
          }

          // Basic type validation
          let isValid = false;
          switch (fieldDef.type) {
            case "string":
              isValid = typeof value === "string";
              break;
            case "number":
              isValid = typeof value === "number";
              break;
            case "boolean":
              isValid = typeof value === "boolean";
              break;
            case "date":
              isValid = typeof value === "string" || value instanceof Date;
              break;
            case "array":
              isValid = Array.isArray(value);
              break;
            case "object":
              isValid = typeof value === "object" && value !== null && !Array.isArray(value);
              break;
          }

          if (isValid) {
            validFields[key] = value;
          } else {
            unknownFields[key] = value;
          }
        }
      } else {
        // No schema found - treat all as valid for now
        validFields = fieldsToValidate;
      }

      // Store unknown fields in raw_fragments (no interpretation_id for structured data)
      // Filter out null/undefined values before storing
      const nonNullUnknownFields = Object.entries(unknownFields).filter(([_, value]) => value !== null && value !== undefined);
      
      if (nonNullUnknownFields.length > 0) {
        logger.error(`[raw_fragments] Storing ${nonNullUnknownFields.length} unknown fields for ${entityType} (source_id: ${storageResult.sourceId}, user_id: ${userId})`);
      }
      
      // Store raw_fragments per entity (each entity represents a row in parquet/CSV)
      // We'll create observations first to get observation IDs, then store fragments with observation context
      // For now, we'll use entity_id as a proxy for row diversity (each row creates unique entity/observation)
      
      for (const [key, value] of nonNullUnknownFields) {
        // Check if fragment already exists (for idempotence)
        const { data: existing } = await supabase
          .from("raw_fragments")
          .select("id, frequency_count, entity_id")
          .eq("source_id", storageResult.sourceId)
          .eq("fragment_key", key)
          .eq("user_id", userId)
          .eq("entity_type", entityType)
          .maybeSingle();

        if (existing) {
          // Update existing fragment (increment frequency, update last_seen)
          const { error: updateError } = await supabase
            .from("raw_fragments")
            .update({
              fragment_value: value, // Update value in case it changed
              fragment_envelope: {
                reason: "unknown_field",
                entity_type: entityType,
                schema_version: schema?.schema_version || "1.0",
              },
              frequency_count: (existing.frequency_count || 1) + 1,
              last_seen: new Date().toISOString(),
            })
            .eq("id", existing.id);
          
          if (updateError) {
            logger.error(`[raw_fragments] FAILED to update fragment for ${entityType}.${key}:`, {
              error: updateError,
              code: updateError.code,
              message: updateError.message,
            });
          } else {
            logger.error(`[raw_fragments] Updated existing fragment for ${entityType}.${key} (frequency: ${(existing.frequency_count || 1) + 1})`);
            unknownFieldsCount++;
            
            // Queue auto-enhancement check for this field
            try {
              const { schemaRecommendationService } = await import("./services/schema_recommendation.js");
              await schemaRecommendationService.queueAutoEnhancementCheck({
                entity_type: entityType,
                fragment_key: key,
                user_id: userId,
                frequency_count: (existing.frequency_count || 1) + 1,
              });
            } catch (queueError: any) {
              // Don't fail storage if queuing fails - it's best-effort
              logger.warn(`[AUTO_ENHANCE] Failed to queue enhancement check for ${entityType}.${key}:`, queueError.message);
            }
          }
        } else {
          // Insert new fragment
          const fragmentId = randomUUID();
          const insertData = {
            id: fragmentId,
            record_id: null,
            source_id: storageResult.sourceId,
            interpretation_id: null, // No interpretation for structured data
            user_id: userId,
            fragment_type: entityType,
            fragment_key: key,
            fragment_value: value,
            fragment_envelope: {
              reason: "unknown_field",
              entity_type: entityType,
              schema_version: schema?.schema_version || "1.0",
            },
          };
          
          const { data: insertResult, error: insertError } = await supabase
            .from("raw_fragments")
            .insert(insertData)
            .select();
          
          if (insertError) {
            // Handle unique constraint violation from race condition
            if (insertError.code === "23505") {
              logger.warn(`[raw_fragments] Race condition detected for ${entityType}.${key}, retrying as update...`);
              // Retry as update
              const { data: retryExisting } = await supabase
                .from("raw_fragments")
                .select("id, frequency_count")
                .eq("source_id", storageResult.sourceId)
                .eq("fragment_key", key)
                .eq("user_id", userId)
                .maybeSingle();
              
              if (retryExisting) {
                await supabase
                  .from("raw_fragments")
                  .update({
                    fragment_value: value,
                    fragment_envelope: {
                      reason: "unknown_field",
                      entity_type: entityType,
                      schema_version: schema?.schema_version || "1.0",
                    },
                    frequency_count: (retryExisting.frequency_count || 1) + 1,
                    last_seen: new Date().toISOString(),
                  })
                  .eq("id", retryExisting.id);
                unknownFieldsCount++;
                
                // Queue auto-enhancement check for this field
                try {
                  const { schemaRecommendationService } = await import("./services/schema_recommendation.js");
                  await schemaRecommendationService.queueAutoEnhancementCheck({
                    entity_type: entityType,
                    fragment_key: key,
                    user_id: userId,
                    frequency_count: (retryExisting.frequency_count || 1) + 1,
                  });
                } catch (queueError: any) {
                  // Don't fail storage if queuing fails - it's best-effort
                  logger.warn(`[AUTO_ENHANCE] Failed to queue enhancement check for ${entityType}.${key}:`, queueError.message);
                }
              }
            } else {
              logger.error(`[raw_fragments] FAILED to insert fragment for ${entityType}.${key}:`, {
                error: insertError,
                code: insertError.code,
                message: insertError.message,
              });
            }
          } else {
            if (insertResult && insertResult.length > 0) {
              logger.error(`[raw_fragments] Inserted new fragment for ${entityType}.${key} (id: ${fragmentId})`);
            }
            unknownFieldsCount++;
            
            // Queue auto-enhancement check for this field
            try {
              const { schemaRecommendationService } = await import("./services/schema_recommendation.js");
              await schemaRecommendationService.queueAutoEnhancementCheck({
                entity_type: entityType,
                fragment_key: key,
                user_id: userId,
                frequency_count: 1,
              });
            } catch (queueError: any) {
              // Don't fail storage if queuing fails - it's best-effort
              logger.warn(`[AUTO_ENHANCE] Failed to queue enhancement check for ${entityType}.${key}:`, queueError.message);
            }
          }
        }
      }

      // Resolve entity (user-scoped)
      const entityId = await resolveEntity({
        entityType,
        fields: validFields,
        userId,
      });

      // Create observation directly (no interpretation_id)
      // Generate observation ID early so we can use it for raw_fragments row tracking
      const observationId = randomUUID();
      const { error: obsError } = await supabase.from("observations").insert({
        id: observationId,
        entity_id: entityId,
        entity_type: entityType,
        schema_version: schema?.schema_version || "1.0",
        source_payload_id: null,
        source_id: storageResult.sourceId,
        interpretation_id: null, // No interpretation run for structured data
        observed_at: new Date().toISOString(),
        specificity_score: 1.0, // Structured data has high specificity
        source_priority: sourcePriority, // Use provided priority (default 100)
        fields: validFields,
        user_id: userId,
      });

      if (obsError) {
        throw new Error(`Failed to create observation: ${obsError.message}`);
      }

      createdEntities.push({
        entityId,
        entityType,
        observationId,
      });
    }

    // Compute and store snapshots for all entities
    const { observationReducer } = await import("./reducers/observation_reducer.js");
    for (const createdEntity of createdEntities) {
      try {
        // Get all observations for entity
        const { data: allObservations, error: obsError } = await supabase
          .from("observations")
          .select("*")
          .eq("entity_id", createdEntity.entityId)
          .order("observed_at", { ascending: false });

        if (obsError) {
          logger.error(
            `Failed to get observations for entity ${createdEntity.entityId}:`,
            obsError.message
          );
          continue;
        }

        if (allObservations && allObservations.length > 0) {
          // Map database observations to reducer's expected format
          const mappedObservations = allObservations.map((obs: any) => ({
            id: obs.id,
            entity_id: obs.entity_id,
            entity_type: obs.entity_type,
            schema_version: obs.schema_version,
            source_record_id: obs.source_id || "",
            observed_at: obs.observed_at,
            specificity_score: obs.specificity_score,
            source_priority: obs.source_priority,
            fields: obs.fields,
            created_at: obs.created_at,
            user_id: obs.user_id,
          }));

          // Compute snapshot
          const snapshot = await observationReducer.computeSnapshot(
            createdEntity.entityId,
            mappedObservations
          );

          // Save snapshot
          await supabase.from("entity_snapshots").upsert(
            {
              entity_id: snapshot.entity_id,
              entity_type: snapshot.entity_type,
              schema_version: snapshot.schema_version,
              snapshot: snapshot.snapshot,
              computed_at: snapshot.computed_at,
              observation_count: snapshot.observation_count,
              last_observation_at: snapshot.last_observation_at,
              provenance: snapshot.provenance,
              user_id: snapshot.user_id,
            },
            {
              onConflict: "entity_id",
            }
          );
        }
      } catch (error) {
        logger.error(
          `Failed to compute snapshot for entity ${createdEntity.entityId}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Get related entities and relationships for all created entities
    const relatedData = await this.getRelatedEntitiesAndRelationships(
      createdEntities.map((e) => e.entityId)
    );

    return this.buildTextResponse({
      source_id: storageResult.sourceId,
      entities: createdEntities.map((e) => ({
        entity_id: e.entityId,
        entity_type: e.entityType,
        observation_id: e.observationId,
      })),
      unknown_fields_count: unknownFieldsCount,
      related_entities: relatedData.entities,
      related_relationships: relatedData.relationships,
    });
  }

  // FU-124: MCP reinterpret() Tool
  private async reinterpret(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getSourceMetadata, downloadRawContent } = await import("./services/raw_storage.js");
    const { runInterpretation, checkInterpretationQuota } =
      await import("./services/interpretation.js");
    const { analyzeFileForRecord } = await import("./services/file_analysis.js");

    const schema = z.object({
      source_id: z.string().uuid(),
      interpretation_config: z.record(z.unknown()),
    });

    const parsed = schema.parse(args);

    // Get source metadata
    const source = await getSourceMetadata(parsed.source_id);

    // Check quota
    const quota = await checkInterpretationQuota(source.user_id);
    if (!quota.allowed) {
      return this.buildTextResponse({
        error: "quota_exceeded",
        quota,
      });
    }

    // Download and re-analyze
    const fileBuffer = await downloadRawContent(source.storage_url);
    const analysis = await analyzeFileForRecord({
      buffer: fileBuffer,
      fileName: source.original_filename || "file",
      mimeType: source.mime_type,
    });

    // Convert FileAnalysisResult to entity format for interpretation
    const extractedData = [
      {
        entity_type: analysis.type,
        ...analysis.properties,
      },
    ];

    // Validate and convert interpretation_config to InterpretationConfig
    const configValue = parsed.interpretation_config || {};
    const config = {
      provider: (configValue.provider as string) || "rule_based",
      model_id: (configValue.model_id as string) || "neotoma_v1",
      temperature: (configValue.temperature as number) ?? 0,
      prompt_hash: (configValue.prompt_hash as string) || "n/a",
      code_version: (configValue.code_version as string) || "v0.2.0",
      feature_flags: configValue.feature_flags as Record<string, boolean> | undefined,
    };

    // Run new interpretation
    const interpretationResult = await runInterpretation({
      userId: source.user_id,
      sourceId: parsed.source_id,
      extractedData,
      config,
    });

    return this.buildTextResponse(interpretationResult);
  }

  // FU-125: MCP correct() Tool
  private async correct(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { schemaRegistry } = await import("./services/schema_registry.js");

    const schema = z.object({
      user_id: z.string().uuid(),
      entity_id: z.string(),
      entity_type: z.string(),
      field: z.string(),
      value: z.unknown(),
    });

    const parsed = schema.parse(args);

    // Validate entity ownership
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("*")
      .eq("id", parsed.entity_id)
      .eq("user_id", parsed.user_id)
      .single();

    if (entityError || !entity) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Entity not found or not owned by user: ${parsed.entity_id}`
      );
    }

    // Load schema to validate field
    const schemaEntry = await schemaRegistry.loadActiveSchema(parsed.entity_type);
    if (!schemaEntry) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No active entity schema for entity type: ${parsed.entity_type}`
      );
    }

    if (!schemaEntry.schema_definition.fields[parsed.field]) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown field for entity type ${parsed.entity_type}: ${parsed.field}`
      );
    }

    // Create correction observation with priority 1000
    const observationId = randomUUID();
    const { error: obsError } = await supabase.from("observations").insert({
      id: observationId,
      entity_id: parsed.entity_id,
      entity_type: parsed.entity_type,
      schema_version: schemaEntry.schema_version,
      source_payload_id: null,
      source_id: null, // Corrections don't have a source
      interpretation_id: null,
      observed_at: new Date().toISOString(),
      specificity_score: 1.0,
      source_priority: 1000, // Corrections have highest priority
      fields: { [parsed.field]: parsed.value },
      user_id: parsed.user_id,
    });

    if (obsError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create correction: ${obsError.message}`
      );
    }

    return this.buildTextResponse({
      observation_id: observationId,
      entity_id: parsed.entity_id,
      field: parsed.field,
      value: parsed.value,
      message: "Correction applied with priority 1000",
    });
  }

  // FU-126: MCP merge_entities() Tool
  private async mergeEntities(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().uuid(),
      from_entity_id: z.string(),
      to_entity_id: z.string(),
      merge_reason: z.string().optional(),
    });

    const parsed = schema.parse(args);

    // Validate both entities exist and are owned by user
    const { data: entities, error: entitiesError } = await supabase
      .from("entities")
      .select("*")
      .in("id", [parsed.from_entity_id, parsed.to_entity_id])
      .eq("user_id", parsed.user_id);

    if (entitiesError || !entities || entities.length !== 2) {
      throw new McpError(ErrorCode.InvalidParams, "Both entities must exist and be owned by user");
    }

    // Check if source entity is already merged
    const fromEntity = entities.find((e: any) => e.id === parsed.from_entity_id);
    if (fromEntity.merged_to_entity_id) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source entity ${parsed.from_entity_id} is already merged`
      );
    }

    // Count observations to move
    const { count: obsCount } = await supabase
      .from("observations")
      .select("*", { count: "exact", head: true })
      .eq("entity_id", parsed.from_entity_id);

    // Rewrite observations to target entity
    const { error: rewriteError } = await supabase
      .from("observations")
      .update({ entity_id: parsed.to_entity_id })
      .eq("entity_id", parsed.from_entity_id);

    if (rewriteError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to rewrite observations: ${rewriteError.message}`
      );
    }

    // Mark source entity as merged
    const { error: mergeError } = await supabase
      .from("entities")
      .update({
        merged_to_entity_id: parsed.to_entity_id,
        merged_at: new Date().toISOString(),
      })
      .eq("id", parsed.from_entity_id);

    if (mergeError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to mark entity as merged: ${mergeError.message}`
      );
    }

    // Create merge audit log
    const { error: auditError } = await supabase.from("entity_merges").insert({
      user_id: parsed.user_id,
      from_entity_id: parsed.from_entity_id,
      to_entity_id: parsed.to_entity_id,
      observations_moved: obsCount || 0,
      merge_reason: parsed.merge_reason,
      merged_by: "mcp",
    });

    if (auditError) {
      // Log but don't fail - audit is not critical
      logger.warn("Failed to create merge audit log:", auditError);
    }

    const mergedAt = new Date().toISOString();
    return this.buildTextResponse({
      from_entity_id: parsed.from_entity_id,
      to_entity_id: parsed.to_entity_id,
      observations_moved: obsCount || 0,
      merged_at: mergedAt,
      merge_reason: parsed.merge_reason,
    });
  }

  /**
   * Parse resource URI into structured resource identifier
   */
  private parseResourceUri(uri: string): {
    type: string;
    entityType?: string;
    entityId?: string;
    year?: string;
    month?: string;
    sourceId?: string;
  } {
    // Validate scheme
    if (!uri.startsWith("neotoma://")) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid resource URI scheme. Expected 'neotoma://', got: ${uri}`
      );
    }

    // Extract path after scheme
    const path = uri.substring("neotoma://".length);
    const segments = path.split("/").filter(Boolean);

    if (segments.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Invalid resource URI: no path specified"
      );
    }

    // Parse based on first segment
    const [first, second, third] = segments;

    // entities/{entity_type}
    if (first === "entities" && second) {
      return { type: "entity_collection", entityType: second };
    }

    // entity/{entity_id}
    if (first === "entity" && second && !third) {
      return { type: "entity", entityId: second };
    }

    // entity/{entity_id}/observations
    if (first === "entity" && second && third === "observations") {
      return { type: "entity_observations", entityId: second };
    }

    // entity/{entity_id}/relationships
    if (first === "entity" && second && third === "relationships") {
      return { type: "entity_relationships", entityId: second };
    }

    // timeline/{year} or timeline/{year-month}
    if (first === "timeline" && second) {
      const timeMatch = second.match(/^(\d{4})(?:-(\d{2}))?$/);
      if (timeMatch) {
        const [, year, month] = timeMatch;
        if (month) {
          return { type: "timeline_month", year, month };
        }
        return { type: "timeline_year", year };
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid timeline format. Expected YYYY or YYYY-MM, got: ${second}`
      );
    }

    // source/{source_id}
    if (first === "source" && second) {
      return { type: "source", sourceId: second };
    }

    // sources
    if (first === "sources" && !second) {
      return { type: "source_collection" };
    }

    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unrecognized resource URI format: ${uri}`
    );
  }

  /**
   * Resource handler: Get entity collection by type
   */
  private async handleEntityCollection(entityType: string): Promise<any> {
    const { queryEntities } = await import("./services/entity_queries.js");

    const entities = await queryEntities({
      entityType,
      includeMerged: false,
      limit: 100,
      offset: 0,
    });

    // Get total count
    const { count, error: countError } = await supabase
      .from("entities")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .is("merged_to_entity_id", null);

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count entities: ${countError.message}`
      );
    }

    return {
      type: "entity_collection",
      entity_type: entityType,
      entities,
      total: count || 0,
      uri: `neotoma://entities/${entityType}`,
    };
  }

  /**
   * Resource handler: Get individual entity
   */
  private async handleIndividualEntity(entityId: string): Promise<any> {
    // Get entity
    const { data: entity, error: entityError } = await supabase
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .single();

    if (entityError || !entity) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Entity not found: ${entityId}`
      );
    }

    // Get snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", entityId)
      .single();

    if (snapshotError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get entity snapshot: ${snapshotError.message}`
      );
    }

    return {
      type: "entity",
      entity_id: entityId,
      entity_type: entity.entity_type,
      canonical_name: entity.canonical_name,
      snapshot: snapshot?.snapshot || {},
      provenance: snapshot?.provenance || {},
      observation_count: snapshot?.observation_count || 0,
      last_observation_at: snapshot?.last_observation_at,
    };
  }

  /**
   * Resource handler: Get entity observations
   */
  private async handleEntityObservations(entityId: string): Promise<any> {
    const { data: observations, error } = await supabase
      .from("observations")
      .select("*")
      .eq("entity_id", entityId)
      .order("observed_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get observations: ${error.message}`
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from("observations")
      .select("*", { count: "exact", head: true })
      .eq("entity_id", entityId);

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count observations: ${countError.message}`
      );
    }

    return {
      type: "entity_observations",
      entity_id: entityId,
      observations: observations || [],
      total: count || 0,
      uri: `neotoma://entity/${entityId}/observations`,
    };
  }

  /**
   * Resource handler: Get entity relationships
   */
  private async handleEntityRelationships(entityId: string): Promise<any> {
    // Get outbound relationships
    const { data: outbound, error: outError } = await supabase
      .from("relationships")
      .select("*")
      .eq("source_entity_id", entityId);

    if (outError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get outbound relationships: ${outError.message}`
      );
    }

    // Get inbound relationships
    const { data: inbound, error: inError } = await supabase
      .from("relationships")
      .select("*")
      .eq("target_entity_id", entityId);

    if (inError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get inbound relationships: ${inError.message}`
      );
    }

    return {
      type: "entity_relationships",
      entity_id: entityId,
      outbound_relationships: outbound || [],
      inbound_relationships: inbound || [],
      total_outbound: outbound?.length || 0,
      total_inbound: inbound?.length || 0,
      uri: `neotoma://entity/${entityId}/relationships`,
    };
  }

  /**
   * Resource handler: Get timeline events for a year
   */
  private async handleTimelineYear(year: string): Promise<any> {
    const startDate = `${year}-01-01T00:00:00Z`;
    const endDate = `${parseInt(year) + 1}-01-01T00:00:00Z`;

    const { data: events, error } = await supabase
      .from("timeline_events")
      .select("*")
      .gte("event_timestamp", startDate)
      .lt("event_timestamp", endDate)
      .order("event_timestamp", { ascending: false })
      .limit(1000);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get timeline events: ${error.message}`
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from("timeline_events")
      .select("*", { count: "exact", head: true })
      .gte("event_timestamp", startDate)
      .lt("event_timestamp", endDate);

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count timeline events: ${countError.message}`
      );
    }

    return {
      type: "timeline",
      year,
      events: events || [],
      total: count || 0,
      uri: `neotoma://timeline/${year}`,
    };
  }

  /**
   * Resource handler: Get timeline events for a specific month
   */
  private async handleTimelineMonth(year: string, month: string): Promise<any> {
    const startDate = `${year}-${month}-01T00:00:00Z`;
    const nextMonth = parseInt(month) === 12 ? "01" : String(parseInt(month) + 1).padStart(2, "0");
    const nextYear = parseInt(month) === 12 ? String(parseInt(year) + 1) : year;
    const endDate = `${nextYear}-${nextMonth}-01T00:00:00Z`;

    const { data: events, error } = await supabase
      .from("timeline_events")
      .select("*")
      .gte("event_timestamp", startDate)
      .lt("event_timestamp", endDate)
      .order("event_timestamp", { ascending: false })
      .limit(1000);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get timeline events: ${error.message}`
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from("timeline_events")
      .select("*", { count: "exact", head: true })
      .gte("event_timestamp", startDate)
      .lt("event_timestamp", endDate);

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count timeline events: ${countError.message}`
      );
    }

    return {
      type: "timeline",
      year,
      month,
      events: events || [],
      total: count || 0,
      uri: `neotoma://timeline/${year}-${month}`,
    };
  }

  /**
   * Resource handler: Get source material
   */
  private async handleSourceMaterial(sourceId: string): Promise<any> {
    const { data: source, error } = await supabase
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (error || !source) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Source material not found: ${sourceId}`
      );
    }

    // Get observations created from this source
    const { data: observations, error: obsError } = await supabase
      .from("observations")
      .select("id, entity_id, entity_type")
      .eq("source_id", sourceId)
      .limit(100);

    if (obsError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get observations: ${obsError.message}`
      );
    }

    return {
      type: "source",
      source_id: sourceId,
      mime_type: source.mime_type,
      file_size: source.file_size,
      content_hash: source.content_hash,
      created_at: source.created_at,
      observations: observations || [],
      observation_count: observations?.length || 0,
      uri: `neotoma://source/${sourceId}`,
    };
  }

  /**
   * Resource handler: Get all source materials
   */
  private async handleSourceCollection(): Promise<any> {
    const { data: sources, error } = await supabase
      .from("sources")
      .select("id, mime_type, file_size, content_hash, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get sources: ${error.message}`
      );
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from("sources")
      .select("*", { count: "exact", head: true });

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count sources: ${countError.message}`
      );
    }

    return {
      type: "source_collection",
      sources: sources || [],
      total: count || 0,
      uri: "neotoma://sources",
    };
  }

  private setupErrorHandler(): void {
    this.server.onerror = (error) => {
      logger.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.error("[Neotoma MCP] Server running on stdio");
    
    // Start auto-enhancement processor (runs every 30 seconds)
    try {
      const { startAutoEnhancementProcessor } = await import("./services/auto_enhancement_processor.js");
      this.autoEnhancementCleanup = startAutoEnhancementProcessor(30000);
      logger.error("[Neotoma MCP] Auto-enhancement processor started");
    } catch (error: any) {
      // Don't fail server startup if processor fails - log and continue
      logger.error(`[Neotoma MCP] Failed to start auto-enhancement processor: ${error.message}`);
    }
  }
}
