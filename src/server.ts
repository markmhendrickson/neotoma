import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { supabase, type NeotomaRecord } from "./db.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { generateEmbedding, getRecordText } from "./embeddings.js";
import { generateRecordSummary } from "./services/summary.js";
import { config } from "./config.js";
import { normalizeRecordType } from "./config/record_types.js";
import { createRecordFromUploadedFile } from "./services/file_analysis.js";
import { randomUUID } from "node:crypto";
import {
  buildPlaidItemContext,
  createLinkToken,
  exchangePublicToken,
  isPlaidConfigured,
} from "./integrations/plaid/client.js";
import {
  getPlaidItemById,
  getPlaidItemByItemId,
  listPlaidItems as listPlaidItemsFromStore,
  redactPlaidItem,
  syncPlaidItem,
  upsertPlaidItem as persistPlaidItem,
  type PlaidItemRow,
  type SanitizedPlaidItem,
  type PlaidSyncSummary,
} from "./services/plaid_sync.js";
import type { AccountBase } from "plaid";
import {
  providerCatalog,
  getProviderDefinition,
} from "./integrations/providers/index.js";
import {
  runConnectorSync,
  runAllConnectorSyncs,
} from "./services/importers.js";
import { recordMatchesKeywordSearch } from "./actions.js";
import {
  listEntities,
  normalizeEntityValue,
  generateEntityId,
  type Entity,
  DEFAULT_USER_ID,
} from "./services/entity_resolution.js";

export class NeotomaServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "neotoma",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupErrorHandler();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "submit_payload",
          description:
            "Submit a payload envelope for compilation into payloads and observations. Agents submit capability_id + body + provenance; server handles schema reasoning, deduplication, and entity extraction.",
          inputSchema: {
            type: "object",
            properties: {
              capability_id: {
                type: "string",
                description:
                  "Versioned capability identifier (e.g., 'neotoma:store_invoice:v1', 'neotoma:store_note:v1')",
              },
              body: {
                type: "object",
                description: "Payload data as key-value pairs",
              },
              provenance: {
                type: "object",
                properties: {
                  source_refs: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Immediate source payload IDs (not full chain)",
                  },
                  extracted_at: {
                    type: "string",
                    description: "ISO 8601 timestamp",
                  },
                  extractor_version: {
                    type: "string",
                    description:
                      "Extractor version (e.g., 'neotoma-mcp:v0.2.1')",
                  },
                  agent_id: {
                    type: "string",
                    description: "Optional agent identifier",
                  },
                },
                required: ["source_refs", "extracted_at", "extractor_version"],
              },
              client_request_id: {
                type: "string",
                description: "Optional client request ID for retry correlation",
              },
            },
            required: ["capability_id", "body", "provenance"],
          },
        },
        {
          name: "update_record",
          description:
            "Update an existing record's properties, file URLs, or embedding",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Record ID to update" },
              type: { type: "string", description: "Record type (optional)" },
              properties: {
                type: "object",
                description: "Properties to update (merges with existing)",
              },
              file_urls: { type: "array", items: { type: "string" } },
              embedding: {
                type: "array",
                items: { type: "number" },
                description: "Optional 1536-dimensional embedding vector",
              },
            },
            required: ["id"],
          },
        },
        {
          name: "retrieve_records",
          description:
            "Query records by type and property filters. Supports semantic search using embeddings for fuzzy matching.",
          inputSchema: {
            type: "object",
            properties: {
              type: { type: "string", description: "Filter by record type" },
              properties: {
                type: "object",
                description: "Filter by property values (supports nested keys)",
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
              },
              search: {
                type: "array",
                items: { type: "string" },
                description: "Search terms for fuzzy/semantic matching",
              },
              search_mode: {
                type: "string",
                enum: ["semantic", "keyword", "both"],
                description:
                  "Search mode: semantic (vector), keyword (text), or both",
                default: "both",
              },
              similarity_threshold: {
                type: "number",
                description:
                  "Minimum similarity score for semantic search (0-1)",
                default: 0.7,
              },
              query_embedding: {
                type: "array",
                items: { type: "number" },
                description:
                  "1536-dimensional embedding vector for semantic search query",
              },
            },
          },
        },
        {
          name: "delete_record",
          description: "Delete a record and its associated files",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Record ID to delete" },
            },
            required: ["id"],
          },
        },
        {
          name: "upload_file",
          description:
            "Upload a file and either attach it to an existing record or create a new analyzed record.",
          inputSchema: {
            type: "object",
            properties: {
              record_id: {
                type: "string",
                description: "Existing record ID to attach file to (optional).",
              },
              file_path: {
                type: "string",
                description: "Local file path to upload.",
              },
              bucket: {
                type: "string",
                description:
                  'Storage bucket name (optional, defaults to "files").',
              },
              properties: {
                type: "string",
                description:
                  "Optional JSON object of properties to apply when creating a new record (skips automatic analysis).",
              },
            },
            required: ["file_path"],
          },
        },
        {
          name: "get_file_url",
          description: "Get a signed URL for accessing a file",
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
          name: "plaid_create_link_token",
          description:
            "Create a Plaid Link token for connecting a financial institution.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "Unique identifier for the requesting user (optional; defaults from env if omitted)",
              },
              client_name: {
                type: "string",
                description: "Display name for Plaid Link (optional)",
              },
              access_token: {
                type: "string",
                description:
                  "Existing Plaid access token for update mode (optional)",
              },
              products: {
                type: "array",
                items: { type: "string" },
                description: "Override default Plaid products (optional)",
              },
              redirect_uri: {
                type: "string",
                description: "Redirect URI configured with Plaid (optional)",
              },
            },
            required: [],
          },
        },
        {
          name: "plaid_exchange_public_token",
          description:
            "Exchange a Plaid public token for permanent access and store the Plaid item.",
          inputSchema: {
            type: "object",
            properties: {
              public_token: {
                type: "string",
                description: "Public token generated by Plaid Link",
              },
              trigger_initial_sync: {
                type: "boolean",
                description:
                  "Run an immediate full sync after storing the item",
                default: false,
              },
            },
            required: ["public_token"],
          },
        },
        {
          name: "plaid_sync",
          description:
            "Run a Plaid transactions sync for one or more stored Plaid items.",
          inputSchema: {
            type: "object",
            properties: {
              plaid_item_id: {
                type: "string",
                description: "Internal Plaid item UUID to sync",
              },
              item_id: {
                type: "string",
                description: "Plaid item_id to sync (alternative identifier)",
              },
              sync_all: {
                type: "boolean",
                description: "Sync all stored Plaid items",
                default: false,
              },
              force_full_sync: {
                type: "boolean",
                description: "Ignore stored cursor and fetch entire history",
                default: false,
              },
            },
          },
        },
        {
          name: "plaid_list_items",
          description:
            "List stored Plaid items and their metadata (excluding access tokens).",
          inputSchema: {
            type: "object",
            properties: {
              plaid_item_id: {
                type: "string",
                description: "Filter by internal Plaid item UUID",
              },
              item_id: {
                type: "string",
                description: "Filter by Plaid item_id",
              },
            },
          },
        },
        {
          name: "list_provider_catalog",
          description:
            "List external provider metadata (capabilities, scopes, popularity).",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "sync_provider_imports",
          description:
            "Trigger an import sync for a provider (optionally a specific connector).",
          inputSchema: {
            type: "object",
            properties: {
              provider: {
                type: "string",
                description: "Provider identifier (e.g., x, instagram, gmail)",
              },
              connector_id: {
                type: "string",
                description: "Specific connector UUID",
              },
              sync_type: {
                type: "string",
                enum: ["initial", "incremental"],
                description: "Sync strategy override",
              },
              limit: {
                type: "number",
                description: "Max records per fetch page",
              },
              max_pages: {
                type: "number",
                description: "Maximum pages per sync run",
              },
            },
            required: ["provider"],
          },
        },
        {
          name: "get_entity_snapshot",
          description:
            "Get the current snapshot of an entity with provenance information",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description: "Entity ID to retrieve snapshot for",
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
          name: "get_field_provenance",
          description:
            "Get the provenance chain for a specific field in an entity snapshot",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: { type: "string", description: "Entity ID" },
              field_name: {
                type: "string",
                description: "Field name to trace provenance for",
              },
            },
            required: ["entity_id", "field_name"],
          },
        },
        {
          name: "create_relationship",
          description: "Create a typed relationship between two entities",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for the relationship (defaults to single-user context)",
              },
              relationship_type: {
                type: "string",
                description:
                  "Type of relationship (e.g., PART_OF, CORRECTS, SETTLES)",
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
            required: [
              "relationship_type",
              "source_entity_id",
              "target_entity_id",
            ],
          },
        },
        {
          name: "list_relationships",
          description: "List relationships for an entity",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for the relationship query (defaults to single-user context)",
              },
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
            },
            required: ["entity_id"],
          },
        },
        {
          name: "retrieve_entities",
          description:
            "Query entities with filters (type, pagination). Returns entities with their snapshots.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for the query (defaults to single-user context)",
              },
              entity_type: {
                type: "string",
                description:
                  "Filter by entity type (e.g., 'company', 'person')",
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
            "Query timeline events with filters (type, date range, source record). Returns chronological events.",
          inputSchema: {
            type: "object",
            properties: {
              event_type: {
                type: "string",
                description:
                  "Filter by event type (e.g., 'InvoiceIssued', 'FlightDeparture')",
              },
              after_date: {
                type: "string",
                description: "Filter events after this date (ISO 8601)",
              },
              before_date: {
                type: "string",
                description: "Filter events before this date (ISO 8601)",
              },
              source_record_id: {
                type: "string",
                description: "Filter by source record ID",
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
          name: "get_entity_by_identifier",
          description:
            "Find entity by identifier (name, email, etc.) across entity types or specific type.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for the lookup (defaults to single-user context)",
              },
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
          name: "get_related_entities",
          description:
            "Get entities connected to a given entity via relationships. Supports n-hop traversal.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for traversal (defaults to single-user context)",
              },
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
                description:
                  "Maximum number of relationship hops (1 = direct, 2 = 2-hop, etc.)",
                default: 1,
              },
              include_entities: {
                type: "boolean",
                description:
                  "Whether to include full entity snapshots in response",
                default: true,
              },
            },
            required: ["entity_id"],
          },
        },
        {
          name: "get_graph_neighborhood",
          description:
            "Get complete graph neighborhood around a node (entity or record): related entities, relationships, records, and events.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description:
                  "User ID scope for the neighborhood (defaults to single-user context)",
              },
              node_id: {
                type: "string",
                description:
                  "Node ID (entity_id or record_id) to get neighborhood for",
              },
              node_type: {
                type: "string",
                enum: ["entity", "record"],
                description: "Type of node",
                default: "entity",
              },
              include_relationships: {
                type: "boolean",
                description: "Include relationships in response",
                default: true,
              },
              include_records: {
                type: "boolean",
                description: "Include related records in response",
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
          case "submit_payload":
            return await this.submitPayload(args);
          case "update_record":
            return await this.updateRecord(args);
          case "retrieve_records":
            return await this.retrieveRecords(args);
          case "delete_record":
            return await this.deleteRecord(args);
          case "upload_file":
            return await this.uploadFile(args);
          case "get_file_url":
            return await this.getFileUrl(args);
          case "plaid_create_link_token":
            return await this.plaidCreateLinkToken(args);
          case "plaid_exchange_public_token":
            return await this.plaidExchangePublicToken(args);
          case "plaid_sync":
            return await this.plaidSync(args);
          case "plaid_list_items":
            return await this.plaidListItems(args);
          case "list_provider_catalog":
            return await this.listProviderCatalog();
          case "sync_provider_imports":
            return await this.syncProviderImports(args);
          case "get_entity_snapshot":
            return await this.getEntitySnapshot(args);
          case "list_observations":
            return await this.listObservations(args);
          case "get_field_provenance":
            return await this.getFieldProvenance(args);
          case "create_relationship":
            return await this.createRelationship(args);
          case "list_relationships":
            return await this.listRelationships(args);
          case "retrieve_entities":
            return await this.retrieveEntities(args);
          case "list_timeline_events":
            return await this.listTimelineEvents(args);
          case "get_entity_by_identifier":
            return await this.getEntityByIdentifier(args);
          case "get_related_entities":
            return await this.getRelatedEntities(args);
          case "get_graph_neighborhood":
            return await this.getGraphNeighborhood(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    });
  }

  private async submitPayload(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    // Import payload services dynamically
    const { validatePayloadEnvelope } =
      await import("./services/payload_schema.js");
    const { compilePayload } = await import("./services/payload_compiler.js");

    // Validate payload envelope
    const envelope = validatePayloadEnvelope(args);

    // Compile payload (handles deduplication, normalization, observation extraction)
    const result = await compilePayload(envelope);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              payload_id: result.payload_id,
              payload_content_id: result.payload_content_id,
              payload_submission_id: result.payload_submission_id,
              created: result.created,
              message: result.created
                ? "Payload created and observations extracted"
                : "Duplicate payload found, returning existing",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  // DEPRECATED: store_record replaced by submit_payload in v0.2.1
  // Kept for reference only - not exposed in MCP tool list
  private async storeRecord(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    throw new Error(
      "store_record has been replaced by submit_payload in v0.2.1. Please use submit_payload instead.",
    );
  }

  private async updateRecord(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      id: z.string(),
      type: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      file_urls: z.array(z.string()).optional(),
      embedding: z.array(z.number()).optional(),
    });

    const parsed = schema.parse(args);

    // Fetch existing record to determine if we need to regenerate embedding and summary
    const { data: existing } = await supabase
      .from("records")
      .select("type, properties, embedding, file_urls")
      .eq("id", parsed.id)
      .single();

    const updateData: Partial<NeotomaRecord> = {
      updated_at: new Date().toISOString(),
    };

    let normalizedUpdateType: string | undefined;
    if (parsed.type !== undefined) {
      normalizedUpdateType = normalizeRecordType(parsed.type).type;
      updateData.type = normalizedUpdateType;
    }

    // Generate new embedding if:
    // 1. Embedding is explicitly provided (non-empty array), OR
    // 2. Properties or type changed and no embedding was provided, OR
    // 3. Existing record has no embedding and OpenAI is configured
    if (parsed.embedding !== undefined) {
      // Filter out empty arrays - they're invalid for PostgreSQL vector type
      if (Array.isArray(parsed.embedding) && parsed.embedding.length > 0) {
        updateData.embedding = parsed.embedding;
      } else {
        // Explicitly set to null to clear embedding
        updateData.embedding = null;
      }
    } else if (
      (parsed.properties !== undefined || parsed.type !== undefined) &&
      config.openaiApiKey
    ) {
      const newType =
        parsed.type !== undefined
          ? normalizedUpdateType || normalizeRecordType(parsed.type).type
          : existing?.type || "";
      const baseProperties =
        (existing?.properties as Record<string, unknown>) || {};
      const newProperties =
        parsed.properties !== undefined
          ? { ...baseProperties, ...parsed.properties }
          : baseProperties;
      const recordText = getRecordText(newType, newProperties);
      const generatedEmbedding = await generateEmbedding(recordText);
      if (generatedEmbedding) {
        updateData.embedding = generatedEmbedding;
      }
    }

    if (parsed.properties !== undefined) {
      if (existing) {
        updateData.properties = {
          ...(existing.properties as object),
          ...parsed.properties,
        };
      } else {
        updateData.properties = parsed.properties;
      }
    }

    if (parsed.file_urls !== undefined) {
      updateData.file_urls = parsed.file_urls;
    }

    // Regenerate summary when type, properties, or file_urls change (similar to embedding logic)
    if (
      (parsed.type !== undefined ||
        parsed.properties !== undefined ||
        parsed.file_urls !== undefined) &&
      config.openaiApiKey
    ) {
      const newType =
        parsed.type !== undefined
          ? normalizedUpdateType || normalizeRecordType(parsed.type).type
          : existing?.type || "";
      // Use merged properties if properties were updated, otherwise use existing
      const newProperties =
        parsed.properties !== undefined
          ? (updateData.properties as Record<string, unknown>) ||
            (existing?.properties as Record<string, unknown>) ||
            {}
          : (existing?.properties as Record<string, unknown>) || {};
      const newFileUrls =
        parsed.file_urls !== undefined
          ? parsed.file_urls
          : (existing?.file_urls as string[]) || [];
      const generatedSummary = await generateRecordSummary(
        newType,
        newProperties,
        newFileUrls,
      );
      if (generatedSummary) {
        updateData.summary = generatedSummary;
      }
    }

    const { data, error } = await supabase
      .from("records")
      .update(updateData)
      .eq("id", parsed.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Record not found");

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async retrieveRecords(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      type: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      limit: z.number().optional(),
      search: z.array(z.string()).optional(),
      search_mode: z
        .enum(["semantic", "keyword", "both"])
        .optional()
        .default("both"),
      similarity_threshold: z.number().min(0).max(1).optional().default(0.7),
      query_embedding: z.array(z.number()).optional(),
    });

    const {
      type,
      properties,
      limit,
      search,
      search_mode,
      similarity_threshold,
      query_embedding: providedQueryEmbedding,
    } = schema.parse(args);
    const normalizedType = type ? normalizeRecordType(type).type : undefined;

    let results: NeotomaRecord[] = [];
    let totalCount = 0;
    const finalLimit = limit || 100;

    // Semantic search (vector similarity)
    if (search && (search_mode === "semantic" || search_mode === "both")) {
      // Generate query_embedding from search terms if not provided
      let query_embedding: number[] | undefined = providedQueryEmbedding;
      if (!query_embedding && config.openaiApiKey) {
        const searchText = search.join(" ");
        const generated = await generateEmbedding(searchText);
        query_embedding = generated || undefined;
        if (!query_embedding && search_mode === "semantic") {
          throw new Error(
            "Failed to generate query embedding. Ensure OPENAI_API_KEY is configured or provide query_embedding.",
          );
        }
      }

      if (!query_embedding) {
        if (search_mode === "semantic") {
          throw new Error(
            "query_embedding required for semantic search, or configure OPENAI_API_KEY for automatic generation",
          );
        }
        // If both mode, just skip semantic and do keyword only
      } else if (query_embedding.length !== 1536) {
        throw new Error(
          "query_embedding must be 1536-dimensional (OpenAI text-embedding-3-small)",
        );
      }

      if (query_embedding) {
        let embeddingQuery = supabase
          .from("records")
          .select("*")
          .not("embedding", "is", null);

        if (normalizedType) {
          embeddingQuery = embeddingQuery.eq("type", normalizedType);
        }

        const { data: candidates, error: fetchError } =
          await embeddingQuery.limit(finalLimit * 10);

        if (fetchError) {
          throw fetchError;
        }

        if (candidates) {
          const queryNorm = Math.sqrt(
            query_embedding.reduce((sum, val) => sum + val * val, 0),
          );

          const semanticMatches = candidates
            .map((rec: any) => {
              const recEmbedding = rec.embedding;
              if (
                !recEmbedding ||
                !Array.isArray(recEmbedding) ||
                recEmbedding.length !== 1536
              ) {
                return null;
              }

              const dotProduct = query_embedding.reduce(
                (sum, val, i) => sum + val * recEmbedding[i],
                0,
              );
              const recNorm = Math.sqrt(
                recEmbedding.reduce(
                  (sum: number, val: number) => sum + val * val,
                  0,
                ),
              );
              const similarity = dotProduct / (queryNorm * recNorm);

              return { ...rec, similarity };
            })
            .filter((rec: any) => rec && rec.similarity >= similarity_threshold)
            .sort((a: any, b: any) => b.similarity - a.similarity);

          // Track total count before limiting
          totalCount = semanticMatches.length;

          const limitedMatches = semanticMatches.slice(0, finalLimit);

          if (search_mode === "semantic") {
            results = limitedMatches;
          } else {
            results = limitedMatches;
          }
        }
      }
    }

    // Keyword search (text matching)
    if (search && search_mode !== "semantic") {
      let keywordQuery = supabase.from("records").select("*");

      if (normalizedType) {
        keywordQuery = keywordQuery.eq("type", normalizedType);
      }

      const { data: keywordCandidates, error: keywordError } =
        await keywordQuery.limit(finalLimit * 2);

      if (keywordError) {
        throw keywordError;
      }

      if (keywordCandidates) {
        const searchTerms = search.map((term) => term.toLowerCase());
        const keywordMatches = keywordCandidates.filter((rec: NeotomaRecord) =>
          recordMatchesKeywordSearch(rec, searchTerms),
        );

        // Track total count before limiting
        if (results.length === 0) {
          totalCount = keywordMatches.length;
          results = keywordMatches.slice(0, finalLimit);
        } else {
          // Merge keyword results with semantic results (both mode)
          const resultMap = new Map();
          results.forEach((r) => resultMap.set(r.id, r));
          keywordMatches.forEach((r) => {
            if (!resultMap.has(r.id)) {
              resultMap.set(r.id, r);
            }
          });
          const mergedResults = Array.from(resultMap.values());
          totalCount = mergedResults.length;
          results = mergedResults.slice(0, finalLimit);
        }
      }
    }

    // No search: use existing logic
    if (!search) {
      // If properties are specified, fetch all records to count accurately
      // Otherwise, use count query for efficiency
      if (properties) {
        let allQuery = supabase.from("records").select("*");

        if (normalizedType) {
          allQuery = allQuery.eq("type", normalizedType);
        }

        // Fetch up to 10000 records for property filtering
        const { data: allData, error: allError } = await allQuery
          .limit(10000)
          .order("created_at", { ascending: false });

        if (allError) throw allError;

        // Filter by properties and count
        const propertyMatches = (allData || []).filter((rec: NeotomaRecord) => {
          return Object.entries(properties).every(([key, value]) => {
            const recValue = (rec.properties as Record<string, unknown>)[key];
            return recValue === value;
          });
        });

        totalCount = propertyMatches.length;
        results = propertyMatches.slice(0, finalLimit);
      } else {
        let countQuery = supabase
          .from("records")
          .select("*", { count: "exact", head: true });

        if (normalizedType) {
          countQuery = countQuery.eq("type", normalizedType);
        }

        const { count, error: countError } = await countQuery;

        if (countError) {
          throw countError;
        }

        totalCount = count || 0;

        let query = supabase.from("records").select("*");

        if (normalizedType) {
          query = query.eq("type", normalizedType);
        }

        if (limit) {
          query = query.limit(limit);
        } else {
          query = query.limit(100);
        }

        const { data, error } = await query.order("created_at", {
          ascending: false,
        });

        if (error) throw error;

        results = data || [];
      }
    }

    // Filter by exact property matches (for search results)
    if (properties && search) {
      const beforeFilterCount = results.length;
      results = results.filter((rec: NeotomaRecord) => {
        return Object.entries(properties).every(([key, value]) => {
          const recValue = (rec.properties as Record<string, unknown>)[key];
          return recValue === value;
        });
      });
      // Adjust total count based on property filtering for search results
      if (beforeFilterCount > 0) {
        const filterRatio = results.length / beforeFilterCount;
        totalCount = Math.round(totalCount * filterRatio);
      } else {
        totalCount = results.length;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { records: results, total: totalCount },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async deleteRecord(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({ id: z.string() });
    const { id } = schema.parse(args);

    const { error } = await supabase.from("records").delete().eq("id", id);

    if (error) throw error;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, deleted_id: id }),
        },
      ],
    };
  }

  private async uploadFile(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      record_id: z.string().uuid().optional(),
      file_path: z.string(),
      bucket: z.string().optional(),
      properties: z.union([z.string(), z.record(z.unknown())]).optional(),
    });

    const { record_id, file_path, bucket, properties } = schema.parse(args);

    let overrideProperties: Record<string, unknown> | undefined;
    if (typeof properties === "string") {
      const trimmed = properties.trim();
      if (trimmed) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `properties must be valid JSON: ${
              error instanceof Error ? error.message : "parse error"
            }`,
          );
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "properties must be a JSON object",
          );
        }
        overrideProperties = parsed as Record<string, unknown>;
      }
    } else if (
      properties &&
      typeof properties === "object" &&
      !Array.isArray(properties)
    ) {
      overrideProperties = properties as Record<string, unknown>;
    }

    let existingFileUrls: string[] = [];

    const fs = await import("fs/promises");
    const path = await import("path");

    const fileBuffer = await fs.readFile(file_path);
    const stats = await fs.stat(file_path);

    const originalName = path.basename(file_path) || "upload.bin";
    const bucketName = bucket || "files";
    const recordId = record_id ?? randomUUID();

    if (record_id) {
      const { data: existing, error: fetchError } = await supabase
        .from("records")
        .select("file_urls")
        .eq("id", record_id)
        .single();

      if (fetchError || !existing) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Record ${record_id} not found`,
        );
      }

      existingFileUrls = Array.isArray(existing.file_urls)
        ? (existing.file_urls as string[])
        : [];
    }

    const safeBase =
      originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "file";
    const ext = path.extname(safeBase) || ".bin";
    const baseName = safeBase.endsWith(ext)
      ? safeBase.slice(0, safeBase.length - ext.length)
      : safeBase;
    const fileName = `${recordId}/${Date.now()}-${baseName.replace(
      /\.+/g,
      "-",
    )}${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const fileUrl = uploadData.path;

    if (record_id) {
      const updatedFileUrls = [...existingFileUrls, fileUrl];

      const { data: updatedData, error: updateError } = await supabase
        .from("records")
        .update({ file_urls: updatedFileUrls })
        .eq("id", record_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return this.buildTextResponse(updatedData);
    }

    const created = await createRecordFromUploadedFile({
      recordId,
      buffer: fileBuffer,
      fileName: originalName,
      mimeType: "application/octet-stream",
      fileSize: stats.size,
      fileUrl,
      overrideProperties,
    });

    return this.buildTextResponse(created);
  }

  private async getFileUrl(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      file_path: z.string(),
      expires_in: z.number().optional(),
    });

    const { file_path, expires_in } = schema.parse(args);

    const pathParts = file_path.split("/");
    const bucket = pathParts[0];
    const path = pathParts.slice(1).join("/");

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expires_in || 3600);

    if (error) throw error;

    return {
      content: [
        { type: "text", text: JSON.stringify({ url: data.signedUrl }) },
      ],
    };
  }

  private ensurePlaidConfigured(): void {
    if (!isPlaidConfigured()) {
      throw new McpError(
        ErrorCode.InternalError,
        "Plaid integration is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.",
      );
    }
  }

  private buildTextResponse(data: unknown): {
    content: Array<{ type: string; text: string }>;
  } {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private sanitizePlaidItem(item: PlaidItemRow): SanitizedPlaidItem {
    return redactPlaidItem(item);
  }

  private summarizePlaidAccount(account: AccountBase) {
    const balances = account.balances || {};
    return {
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      balances: {
        available: balances.available ?? null,
        current: balances.current ?? null,
        iso_currency_code: balances.iso_currency_code ?? null,
        unofficial_currency_code: balances.unofficial_currency_code ?? null,
      },
    };
  }

  private requirePlaidItem(
    item: PlaidItemRow | null,
    identifier: string | undefined,
  ): PlaidItemRow {
    if (!item) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Plaid item ${identifier ?? "(unknown)"} not found`,
      );
    }
    return item;
  }

  private async plaidCreateLinkToken(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      user_id: z.string().min(1).optional(),
      client_name: z.string().min(1).optional(),
      access_token: z.string().optional(),
      products: z.array(z.string()).min(1).optional(),
      redirect_uri: z.string().url().optional(),
    });

    const parsed = schema.parse(args ?? {});
    const response = await createLinkToken({
      userId: parsed.user_id || config.plaid.linkDefaults?.userId || "",
      clientName: parsed.client_name || config.plaid.linkDefaults?.clientName,
      accessToken: parsed.access_token,
      products: parsed.products,
      redirectUri: parsed.redirect_uri,
    });

    return this.buildTextResponse(response);
  }

  private async plaidExchangePublicToken(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      public_token: z.string().min(1),
      trigger_initial_sync: z.boolean().optional(),
    });

    const parsed = schema.parse(args ?? {});
    const exchangeResult = await exchangePublicToken(parsed.public_token);
    const context = await buildPlaidItemContext(exchangeResult.accessToken);

    const storedItem = await persistPlaidItem({
      itemId: exchangeResult.itemId,
      accessToken: exchangeResult.accessToken,
      environment: config.plaid.environment,
      products: config.plaid.products,
      countryCodes: config.plaid.countryCodes,
      institutionId: context.item.institution_id ?? null,
      institutionName: context.institution?.name ?? null,
      webhookStatus: context.item.webhook ?? null,
    });

    let syncSummary: PlaidSyncSummary | null = null;
    if (parsed.trigger_initial_sync) {
      syncSummary = await syncPlaidItem({
        plaidItemId: storedItem.id,
        forceFullSync: true,
      });
    }

    const response = {
      item: this.sanitizePlaidItem(storedItem),
      institution: context.institution
        ? {
            id: context.institution.institution_id,
            name: context.institution.name,
            url: context.institution.url,
            primary_color: context.institution.primary_color,
          }
        : context.item.institution_id
          ? {
              id: context.item.institution_id,
              name: storedItem.institution_name,
            }
          : null,
      accounts: context.accounts.map((account) =>
        this.summarizePlaidAccount(account),
      ),
      request_id: exchangeResult.requestId,
      initial_sync: syncSummary,
    };

    return this.buildTextResponse(response);
  }

  private async plaidSync(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      plaid_item_id: z.string().uuid().optional(),
      item_id: z.string().optional(),
      sync_all: z.boolean().optional().default(false),
      force_full_sync: z.boolean().optional().default(false),
    });

    const parsed = schema.parse(args ?? {});

    if (parsed.sync_all && (parsed.plaid_item_id || parsed.item_id)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "sync_all cannot be combined with plaid_item_id or item_id.",
      );
    }

    const targets: PlaidItemRow[] = [];

    if (parsed.sync_all) {
      const items = await listPlaidItemsFromStore();
      if (items.length === 0) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "No Plaid items available to sync.",
        );
      }
      targets.push(...items);
    } else if (parsed.plaid_item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemById(parsed.plaid_item_id),
        parsed.plaid_item_id,
      );
      targets.push(item);
    } else if (parsed.item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemByItemId(parsed.item_id),
        parsed.item_id,
      );
      targets.push(item);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Provide plaid_item_id, item_id, or set sync_all to true.",
      );
    }

    const summaries: Array<{
      item: SanitizedPlaidItem;
      summary: PlaidSyncSummary;
    }> = [];

    for (const item of targets) {
      const summary = await syncPlaidItem({
        plaidItemId: item.id,
        forceFullSync: parsed.force_full_sync,
      });
      const refreshed = (await getPlaidItemById(item.id)) ?? item;
      summaries.push({
        item: this.sanitizePlaidItem(refreshed),
        summary,
      });
    }

    return this.buildTextResponse(summaries);
  }

  private async plaidListItems(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.ensurePlaidConfigured();
    const schema = z.object({
      plaid_item_id: z.string().uuid().optional(),
      item_id: z.string().optional(),
    });

    const parsed = schema.parse(args ?? {});
    let items: PlaidItemRow[] = [];

    if (parsed.plaid_item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemById(parsed.plaid_item_id),
        parsed.plaid_item_id,
      );
      items = [item];
    } else if (parsed.item_id) {
      const item = this.requirePlaidItem(
        await getPlaidItemByItemId(parsed.item_id),
        parsed.item_id,
      );
      items = [item];
    } else {
      items = await listPlaidItemsFromStore();
    }

    const sanitized = items.map((item) => this.sanitizePlaidItem(item));
    return this.buildTextResponse(sanitized);
  }

  private async listProviderCatalog(): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    return this.buildTextResponse(providerCatalog);
  }

  private async syncProviderImports(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      provider: z.string(),
      connector_id: z.string().uuid().optional(),
      sync_type: z.enum(["initial", "incremental"]).optional(),
      limit: z.number().int().positive().optional(),
      max_pages: z.number().int().positive().optional(),
    });
    const parsed = schema.parse(args ?? {});
    const definition = getProviderDefinition(parsed.provider);
    if (!definition) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown provider: ${parsed.provider}`,
      );
    }

    if (parsed.connector_id) {
      const result = await runConnectorSync({
        connectorId: parsed.connector_id,
        syncType: parsed.sync_type,
        limit: parsed.limit,
        maxPages: parsed.max_pages,
      });
      return this.buildTextResponse({
        provider: definition,
        results: [result],
      });
    }

    const results = await runAllConnectorSyncs({
      provider: parsed.provider,
      limitPerConnector: parsed.limit,
      maxPages: parsed.max_pages,
    });
    return this.buildTextResponse({ provider: definition, results });
  }

  private async getEntitySnapshot(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
    });
    const parsed = schema.parse(args ?? {});

    const { data: snapshot, error } = await supabase
      .from("entity_snapshots")
      .select("*")
      .eq("entity_id", parsed.entity_id)
      .single();

    if (error || !snapshot) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Entity snapshot not found for ID: ${parsed.entity_id}`,
      );
    }

    return this.buildTextResponse(snapshot);
  }

  private async listObservations(
    args: unknown,
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
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list observations: ${error.message}`,
      );
    }

    return this.buildTextResponse({
      observations: observations || [],
      total: observations?.length || 0,
    });
  }

  private async getFieldProvenance(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      entity_id: z.string(),
      field_name: z.string(),
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
        `Entity snapshot not found for ID: ${parsed.entity_id}`,
      );
    }

    const provenance = snapshot.provenance as Record<string, string>;
    const observationId = provenance[parsed.field_name];

    if (!observationId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Field '${parsed.field_name}' not found in entity snapshot`,
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
        `Failed to get observation: ${obsError?.message}`,
      );
    }

    // Get the source record
    const { data: record, error: recordError } = await supabase
      .from("records")
      .select("*")
      .eq("id", observation.source_record_id)
      .single();

    if (recordError || !record) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get source record: ${recordError?.message}`,
      );
    }

    const provenanceChain = {
      field_name: parsed.field_name,
      field_value: (snapshot.snapshot as Record<string, unknown>)[
        parsed.field_name
      ],
      observation_id: observationId,
      observed_at: observation.observed_at,
      source_record_id: observation.source_record_id,
      record_type: record.type,
      file_urls: record.file_urls,
    };

    return this.buildTextResponse(provenanceChain);
  }

  private async createRelationship(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
      relationship_type: z.string(),
      source_entity_id: z.string(),
      target_entity_id: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

    // Check if relationship would create a cycle
    const { detectCycles } = await import("./services/graph_builder.js");

    // Insert the relationship
    const { data: relationship, error } = await supabase
      .from("relationships")
      .insert({
        relationship_type: parsed.relationship_type,
        source_entity_id: parsed.source_entity_id,
        target_entity_id: parsed.target_entity_id,
        metadata: parsed.metadata || {},
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create relationship: ${error.message}`,
      );
    }

    return this.buildTextResponse(relationship);
  }

  private async listRelationships(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
      entity_id: z.string(),
      direction: z.enum(["inbound", "outbound", "both"]).default("both"),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

    const relationships: any[] = [];

    if (parsed.direction === "outbound" || parsed.direction === "both") {
      const { data: outbound, error: outboundError } = await supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", parsed.entity_id)
        .eq("user_id", userId);

      if (!outboundError && outbound) {
        relationships.push(
          ...outbound.map((r) => ({ ...r, direction: "outbound" })),
        );
      }
    }

    if (parsed.direction === "inbound" || parsed.direction === "both") {
      const { data: inbound, error: inboundError } = await supabase
        .from("relationships")
        .select("*")
        .eq("target_entity_id", parsed.entity_id)
        .eq("user_id", userId);

      if (!inboundError && inbound) {
        relationships.push(
          ...inbound.map((r) => ({ ...r, direction: "inbound" })),
        );
      }
    }

    return this.buildTextResponse({
      relationships,
      total: relationships.length,
    });
  }

  private async retrieveEntities(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().min(1).optional(),
      entity_type: z.string().optional(),
      limit: z.number().int().positive().default(100),
      offset: z.number().int().nonnegative().default(0),
      include_snapshots: z.boolean().default(true),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

    // Get total count
    let countQuery = supabase
      .from("entities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("merged_to_entity_id", null);

    if (parsed.entity_type) {
      countQuery = countQuery.eq("entity_type", parsed.entity_type);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count entities: ${countError.message}`,
      );
    }

    // Get entities
    const entities = await listEntities({
      user_id: userId,
      entity_type: parsed.entity_type,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    // Optionally include snapshots
    let entitiesWithSnapshots = entities;
    if (parsed.include_snapshots && entities.length > 0) {
      const entityIds = entities.map((e) => e.id);
      const { data: snapshots, error: snapError } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("user_id", userId)
        .in("entity_id", entityIds);

      if (!snapError && snapshots) {
        const snapshotMap = new Map(snapshots.map((s) => [s.entity_id, s]));
        entitiesWithSnapshots = entities.map((entity) => ({
          ...entity,
          snapshot: snapshotMap.get(entity.id) || null,
        }));
      }
    }

    return this.buildTextResponse({
      entities: entitiesWithSnapshots,
      total: count || 0,
    });
  }

  private async listTimelineEvents(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      event_type: z.string().optional(),
      after_date: z.string().optional(),
      before_date: z.string().optional(),
      source_record_id: z.string().optional(),
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

    if (parsed.source_record_id) {
      query = query.eq("source_record_id", parsed.source_record_id);
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

    if (parsed.source_record_id) {
      countQuery = countQuery.eq("source_record_id", parsed.source_record_id);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to count timeline events: ${countError.message}`,
      );
    }

    // Get events with pagination
    const { data: events, error } = await query
      .order("event_timestamp", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list timeline events: ${error.message}`,
      );
    }

    return this.buildTextResponse({
      events: events || [],
      total: count || 0,
    });
  }

  private async getEntityByIdentifier(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
      identifier: z.string(),
      entity_type: z.string().optional(),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

    // Normalize the identifier
    const normalized = parsed.entity_type
      ? normalizeEntityValue(parsed.entity_type, parsed.identifier)
      : parsed.identifier.trim().toLowerCase();

    // Search in entities table by canonical_name or aliases
    let query = supabase
      .from("entities")
      .select("*")
      .eq("user_id", userId)
      .is("merged_to_entity_id", null)
      .or(`canonical_name.ilike.%${normalized}%,aliases.cs.["${normalized}"]`);

    if (parsed.entity_type) {
      query = query.eq("entity_type", parsed.entity_type);
    }

    const { data: entities, error } = await query.limit(100);

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search entities: ${error.message}`,
      );
    }

    // If no direct match, try generating entity ID to see if it exists
    if ((!entities || entities.length === 0) && parsed.entity_type) {
      const possibleId = generateEntityId(
        parsed.entity_type,
        parsed.identifier,
        userId,
      );
      const { data: entityById, error: idError } = await supabase
        .from("entities")
        .select("*")
        .eq("id", possibleId)
        .eq("user_id", userId)
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
        .eq("user_id", userId)
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

  private async getRelatedEntities(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
      entity_id: z.string(),
      relationship_types: z.array(z.string()).optional(),
      direction: z.enum(["inbound", "outbound", "both"]).default("both"),
      max_hops: z.number().int().positive().default(1),
      include_entities: z.boolean().default(true),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

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
            .eq("source_entity_id", entityId)
            .eq("user_id", userId);

          if (
            parsed.relationship_types &&
            parsed.relationship_types.length > 0
          ) {
            outboundQuery = outboundQuery.in(
              "relationship_type",
              parsed.relationship_types,
            );
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
            .eq("target_entity_id", entityId)
            .eq("user_id", userId);

          if (
            parsed.relationship_types &&
            parsed.relationship_types.length > 0
          ) {
            inboundQuery = inboundQuery.in(
              "relationship_type",
              parsed.relationship_types,
            );
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
        .eq("user_id", userId)
        .is("merged_to_entity_id", null)
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await supabase
          .from("entity_snapshots")
          .select("*")
          .eq("user_id", userId)
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
      hops_traversed: Math.min(
        parsed.max_hops,
        Array.from(visited).length > 1 ? 1 : 0,
      ),
    });
  }

  private async getGraphNeighborhood(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
      node_id: z.string(),
      node_type: z.enum(["entity", "record"]).default("entity"),
      include_relationships: z.boolean().default(true),
      include_records: z.boolean().default(true),
      include_events: z.boolean().default(true),
      include_observations: z.boolean().default(false),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.coerceUserId(parsed.user_id);

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
        .eq("user_id", userId)
        .single();

      if (entityError || !entity) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Entity not found: ${parsed.node_id}`,
        );
      }

      result.entity = entity;

      // Get entity snapshot
      const { data: snapshot, error: snapError } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", parsed.node_id)
        .eq("user_id", userId)
        .single();

      if (!snapError && snapshot) {
        result.entity_snapshot = snapshot;
      }

      // Get relationships
      if (parsed.include_relationships) {
        const { data: relationships, error: relError } = await supabase
          .from("relationships")
          .select("*")
          .eq("user_id", userId)
          .or(
            `source_entity_id.eq.${parsed.node_id},target_entity_id.eq.${parsed.node_id}`,
          );

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
              .eq("user_id", userId)
              .is("merged_to_entity_id", null)
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
          .eq("user_id", userId)
          .order("observed_at", { ascending: false })
          .limit(100);

        if (!obsError && observations) {
          result.observations = observations;

          // Get source records for observations
          if (parsed.include_records && observations.length > 0) {
            const recordIds = observations
              .map((obs: any) => obs.source_record_id)
              .filter((id: string) => id);
            if (recordIds.length > 0) {
              const { data: records, error: recError } = await supabase
                .from("records")
                .select("*")
                .in("id", recordIds);

              if (!recError && records) {
                result.related_records = records;

                // Get events for these records
                if (parsed.include_events) {
                  const { data: events, error: evtError } = await supabase
                    .from("timeline_events")
                    .select("*")
                    .in("source_record_id", recordIds);

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
      // node_type === "record"
      const { data: record, error: recordError } = await supabase
        .from("records")
        .select("*")
        .eq("id", parsed.node_id)
        .single();

      if (recordError || !record) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Record not found: ${parsed.node_id}`,
        );
      }

      result.record = record;

      // Get timeline events for this record
      if (parsed.include_events) {
        const { data: events, error: evtError } = await supabase
          .from("timeline_events")
          .select("*")
          .eq("source_record_id", parsed.node_id);

        if (!evtError && events) {
          result.timeline_events = events;
        }
      }

      // Get observations from this record
      const { data: observations, error: obsError } = await supabase
        .from("observations")
        .select("*")
        .eq("source_record_id", parsed.node_id)
        .eq("user_id", userId);

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
              .eq("user_id", userId)
              .in("id", entityIds);

            if (!entError && entities) {
              result.related_entities = entities;

              // Get relationships for these entities
              if (parsed.include_relationships && entities.length > 0) {
                const { data: relationships, error: relError } = await supabase
                  .from("relationships")
                  .select("*")
                  .eq("user_id", userId)
                  .or(
                    `source_entity_id.in.(${entityIds.join(
                      ",",
                    )}),target_entity_id.in.(${entityIds.join(",")})`,
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

  private coerceUserId(raw?: string): string {
    if (raw && raw.trim().length > 0) {
      return raw.trim();
    }
    return config.plaid.linkDefaults?.userId || DEFAULT_USER_ID;
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
  }
}
