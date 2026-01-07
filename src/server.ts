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
import { randomUUID } from "node:crypto";
import { recordMatchesKeywordSearch } from "./actions.js";
import {
  listEntities,
  normalizeEntityValue,
  generateEntityId,
  type Entity,
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
            "Query timeline events with filters (type, date range, source material). Returns chronological events derived from date fields in source material.",
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
                description: "Legacy: Filter by source record ID (deprecated - use source_id instead)",
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
          name: "get_entity_by_identifier",
          description:
            "Find entity by identifier (name, email, etc.) across entity types or specific type.",
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
          name: "get_related_entities",
          description:
            "Get entities connected to a given entity via relationships. Supports n-hop traversal.",
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
            "Get complete graph neighborhood around a node (entity or source material): related entities, relationships, source material, and events.",
          inputSchema: {
            type: "object",
            properties: {
              node_id: {
                type: "string",
                description:
                  "Node ID (entity_id or source_id) to get neighborhood for",
              },
              node_type: {
                type: "string",
                enum: ["entity", "record"],
                description: "Type of node ('entity' for entities, 'record' is legacy alias for source material)",
                default: "entity",
              },
              include_relationships: {
                type: "boolean",
                description: "Include relationships in response",
                default: true,
              },
              include_records: {
                type: "boolean",
                description: "Legacy: Include related records in response (deprecated - use include_source_material instead, maps to source material)",
                default: true,
              },
              include_source_material: {
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
          name: "ingest",
          description:
            "Unified ingestion for both unstructured and structured source material. For unstructured (files): provide file_content + mime_type. For structured (entities): provide entities array. Content-addressed storage with SHA-256 deduplication per user.",
          inputSchema: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "User ID (UUID)",
              },
              // Unstructured source material
              file_content: {
                type: "string",
                description: "Base64-encoded file content (for unstructured ingestion)",
              },
              mime_type: {
                type: "string",
                description: "MIME type (e.g., 'application/pdf', 'text/csv') - required with file_content",
              },
              original_filename: {
                type: "string",
                description: "Original filename (optional)",
              },
              interpret: {
                type: "boolean",
                description: "Whether to run AI interpretation immediately (for unstructured)",
                default: true,
              },
              interpretation_config: {
                type: "object",
                description: "AI interpretation configuration (provider, model, etc.)",
              },
              // Structured source material
              entities: {
                type: "array",
                description: "Array of entity data objects (for structured ingestion)",
                items: { type: "object" },
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
          // Removed deprecated actions: submit_payload, update_record, retrieve_records, delete_record, ingest_structured
          // Use unified ingest() action instead
          case "get_file_url":
            return await this.getFileUrl(args);
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
          case "ingest":
            return await this.ingest(args);
          case "reinterpret":
            return await this.reinterpret(args);
          case "correct":
            return await this.correct(args);
          case "merge_entities":
            return await this.mergeEntities(args);
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

  // Removed deprecated methods: submitPayload, storeRecord, updateRecord, retrieveRecords, deleteRecord, ingestStructured, uploadFile
  // Use unified ingest() action and entity-based operations instead

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

  private buildTextResponse(data: unknown): {
    content: Array<{ type: string; text: string }>;
  } {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }


  private async getEntitySnapshot(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getEntityWithProvenance } = await import("./services/entity_queries.js");

    const schema = z.object({
      entity_id: z.string(),
    });
    const parsed = schema.parse(args ?? {});

    // Use new query service that handles merged entity redirection
    const entity = await getEntityWithProvenance(parsed.entity_id);

    if (!entity) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Entity not found: ${parsed.entity_id}`,
      );
    }

    return this.buildTextResponse(entity);
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
      relationship_type: z.string(),
      source_entity_id: z.string(),
      target_entity_id: z.string(),
      metadata: z.record(z.unknown()).optional(),
    });
    const parsed = schema.parse(args ?? {});

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
        user_id: "00000000-0000-0000-0000-000000000000", // Default for v0.1.0 single-user
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
      entity_id: z.string(),
      direction: z.enum(["inbound", "outbound", "both"]).default("both"),
    });
    const parsed = schema.parse(args ?? {});

    const relationships: any[] = [];

    if (parsed.direction === "outbound" || parsed.direction === "both") {
      const { data: outbound, error: outboundError } = await supabase
        .from("relationships")
        .select("*")
        .eq("source_entity_id", parsed.entity_id);

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
        .eq("target_entity_id", parsed.entity_id);

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
    let countQuery = supabase
      .from("entities")
      .select("*", { count: "exact", head: true });

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
        `Failed to count entities: ${countError.message}`,
      );
    }

    return this.buildTextResponse({
      entities,
      total: count || 0,
      excluded_merged: !parsed.include_merged,
    });
  }

  private async listTimelineEvents(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      event_type: z.string().optional(),
      after_date: z.string().optional(),
      before_date: z.string().optional(),
      source_record_id: z.string().optional(), // Legacy - for backward compatibility
      source_id: z.string().optional(), // Canonical - references sources table
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

    // Prefer source_id (canonical) over source_record_id (legacy)
    if (parsed.source_id) {
      query = query.eq("source_id", parsed.source_id);
    } else if (parsed.source_record_id) {
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

    // Prefer source_id (canonical) over source_record_id (legacy)
    if (parsed.source_id) {
      countQuery = countQuery.eq("source_id", parsed.source_id);
    } else if (parsed.source_record_id) {
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
      );
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

  private async getRelatedEntities(
    args: unknown,
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
            .eq("target_entity_id", entityId);

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
      node_id: z.string(),
      node_type: z.enum(["entity", "record"]).default("entity"),
      include_relationships: z.boolean().default(true),
      include_records: z.boolean().default(true), // Legacy - maps to source material
      include_source_material: z.boolean().default(true), // Canonical - include related source material
      include_events: z.boolean().default(true),
      include_observations: z.boolean().default(false),
    });
    const parsed = schema.parse(args ?? {});

    // Use include_source_material if provided, otherwise fall back to include_records for backward compatibility
    const includeSourceMaterial = parsed.include_source_material ?? parsed.include_records;

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
        .single();

      if (!snapError && snapshot) {
        result.entity_snapshot = snapshot;
      }

      // Get relationships
      if (parsed.include_relationships) {
        const { data: relationships, error: relError } = await supabase
          .from("relationships")
          .select("*")
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

          // Get source material for observations (legacy: still uses records table for backward compatibility)
          if (includeSourceMaterial && observations.length > 0) {
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
        .eq("source_record_id", parsed.node_id);

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

  // FU-122: MCP ingest() Tool
  private async ingest(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { storeRawContent } = await import("./services/raw_storage.js");
    const { runInterpretation, checkInterpretationQuota } = await import("./services/interpretation.js");
    const { analyzeFileForRecord } = await import("./services/file_analysis.js");

    // Unified schema: accepts EITHER file_content (unstructured) OR entities (structured)
    const schema = z.object({
      user_id: z.string().uuid(),
      // Unstructured source material
      file_content: z.string().optional(),
      mime_type: z.string().optional(),
      original_filename: z.string().optional(),
      interpret: z.boolean().default(true),
      interpretation_config: z.record(z.unknown()).optional(),
      // Structured source material
      entities: z.array(z.record(z.unknown())).optional(),
      source_priority: z.number().default(100),
    }).refine(
      (data) => (data.file_content && data.mime_type) || data.entities,
      { message: "Must provide either file_content+mime_type OR entities array" }
    );

    const parsed = schema.parse(args);
    
    // Handle structured source material (entities array)
    if (parsed.entities) {
      return await this.ingestStructuredInternal(parsed.user_id, parsed.entities, parsed.source_priority);
    }
    
    // Handle unstructured source material (file content)
    if (!parsed.file_content || !parsed.mime_type) {
      throw new Error("file_content and mime_type required for unstructured ingestion");
    }
    const fileBuffer = Buffer.from(parsed.file_content, "base64");

    // Store raw content
    const storageResult = await storeRawContent({
      userId: parsed.user_id,
      fileBuffer,
      mimeType: parsed.mime_type,
      originalFilename: parsed.original_filename,
      provenance: {
        upload_method: "mcp_ingest",
        client: "mcp",
      },
    });

    const result: any = {
      source_id: storageResult.sourceId,
      content_hash: storageResult.contentHash,
      file_size: storageResult.fileSize,
      deduplicated: storageResult.deduplicated,
    };

    // Run interpretation if requested
    if (parsed.interpret && !storageResult.deduplicated) {
      // Check quota
      const quota = await checkInterpretationQuota(parsed.user_id);
      if (!quota.allowed) {
        return this.buildTextResponse({
          ...result,
          interpretation: {
            skipped: true,
            reason: "quota_exceeded",
            quota: quota,
          },
        });
      }

      // Extract data from file
      const analysis = await analyzeFileForRecord({
        buffer: fileBuffer,
        fileName: parsed.original_filename || "file",
        mimeType: parsed.mime_type,
      });

      // Convert FileAnalysisResult to entity format for interpretation
      const extractedData = [{
        entity_type: analysis.type,
        ...analysis.properties,
      }];

      // Run interpretation
      const defaultConfig = {
        provider: "rule_based",
        model_id: "neotoma_v1",
        temperature: 0,
        prompt_hash: "n/a",
        code_version: "v0.2.0",
      };
      
      const config = parsed.interpretation_config 
        ? {
            provider: (parsed.interpretation_config.provider as string) || defaultConfig.provider,
            model_id: (parsed.interpretation_config.model_id as string) || defaultConfig.model_id,
            temperature: (parsed.interpretation_config.temperature as number) ?? defaultConfig.temperature,
            prompt_hash: (parsed.interpretation_config.prompt_hash as string) || defaultConfig.prompt_hash,
            code_version: (parsed.interpretation_config.code_version as string) || defaultConfig.code_version,
            feature_flags: parsed.interpretation_config.feature_flags as Record<string, boolean> | undefined,
          }
        : defaultConfig;

      const interpretationResult = await runInterpretation({
        userId: parsed.user_id,
        sourceId: storageResult.sourceId,
        extractedData,
        config,
      });

      result.interpretation = interpretationResult;
    }

    return this.buildTextResponse(result);
  }

  // Internal helper for structured source material ingestion
  private async ingestStructuredInternal(
    userId: string,
    entities: Record<string, unknown>[],
    sourcePriority: number = 100
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { runInterpretation } = await import("./services/interpretation.js");
    const { storeRawContent } = await import("./services/raw_storage.js");

    // Store structured data as JSON source
    const jsonContent = JSON.stringify(entities, null, 2);
    const fileBuffer = Buffer.from(jsonContent, "utf-8");

    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: "application/json",
      originalFilename: "structured_data.json",
      provenance: {
        upload_method: "mcp_ingest",
        client: "mcp",
        source_priority: sourcePriority,
      },
    });

    // Run interpretation with structured data
    const interpretationResult = await runInterpretation({
      userId,
      sourceId: storageResult.sourceId,
      extractedData: entities,
      config: {
        provider: "structured",
        model_id: "n/a",
        temperature: 0,
        prompt_hash: "n/a",
        code_version: "v0.2.0",
      },
    });

    return this.buildTextResponse({
      source_id: storageResult.sourceId,
      interpretation: interpretationResult,
    });
  }

  // FU-124: MCP reinterpret() Tool
  private async reinterpret(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getSourceMetadata, downloadRawContent } = await import("./services/raw_storage.js");
    const { runInterpretation, checkInterpretationQuota } = await import("./services/interpretation.js");
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
    const extractedData = [{
      entity_type: analysis.type,
      ...analysis.properties,
    }];

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
    args: unknown,
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
        `Entity not found or not owned by user: ${parsed.entity_id}`,
      );
    }

    // Load schema to validate field
    const schemaEntry = await schemaRegistry.loadActiveSchema(parsed.entity_type);
    if (!schemaEntry) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No active schema for entity type: ${parsed.entity_type}`,
      );
    }

    if (!schemaEntry.schema_definition.fields[parsed.field]) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown field for entity type ${parsed.entity_type}: ${parsed.field}`,
      );
    }

    // Create correction observation with priority 1000
    const observationId = randomUUID();
    const { error: obsError } = await supabase
      .from("observations")
      .insert({
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
        `Failed to create correction: ${obsError.message}`,
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
    args: unknown,
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
      throw new McpError(
        ErrorCode.InvalidParams,
        "Both entities must exist and be owned by user",
      );
    }

    // Check if source entity is already merged
    const fromEntity = entities.find((e: any) => e.id === parsed.from_entity_id);
    if (fromEntity.merged_to_entity_id) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Source entity ${parsed.from_entity_id} is already merged`,
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
        `Failed to rewrite observations: ${rewriteError.message}`,
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
        `Failed to mark entity as merged: ${mergeError.message}`,
      );
    }

    // Create merge audit log
    const { error: auditError } = await supabase
      .from("entity_merges")
      .insert({
        user_id: parsed.user_id,
        from_entity_id: parsed.from_entity_id,
        to_entity_id: parsed.to_entity_id,
        observations_moved: obsCount || 0,
        merge_reason: parsed.merge_reason,
        merged_by: "mcp",
      });

    if (auditError) {
      // Log but don't fail - audit is not critical
      console.warn("Failed to create merge audit log:", auditError);
    }

    return this.buildTextResponse({
      from_entity_id: parsed.from_entity_id,
      to_entity_id: parsed.to_entity_id,
      observations_moved: obsCount || 0,
      message: "Entities merged successfully",
    });
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
