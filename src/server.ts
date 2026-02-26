import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  InitializeRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "./db.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { config } from "./config.js";
import { queryEntitiesWithCount } from "./shared/action_handlers/entity_handlers.js";
import { buildCliEquivalentInvocation } from "./shared/contract_mappings.js";
import { getOpenApiInputSchemaOrThrow } from "./shared/openapi_schema.js";
import {
  AnalyzeSchemaCandidatesRequestSchema,
  CorrectEntityRequestSchema,
  CreateRelationshipRequestSchema,
  EntitySnapshotRequestSchema,
  FieldProvenanceRequestSchema,
  GetSchemaRecommendationsRequestSchema,
  ListEntityTypesRequestSchema,
  ListObservationsRequestSchema,
  ListRelationshipsRequestSchema,
  MergeEntitiesRequestSchema,
  DeleteEntityRequestSchema,
  DeleteRelationshipRequestSchema,
  RestoreEntityRequestSchema,
  RestoreRelationshipRequestSchema,
  InterpretUninterpretedRequestSchema,
  ReinterpretRequestSchema,
  RelationshipSnapshotRequestSchema,
  RetrieveEntitiesRequestSchema,
  RetrieveEntityByIdentifierSchema,
  RetrieveGraphNeighborhoodSchema,
  RetrieveRelatedEntitiesSchema,
  TimelineEventsRequestSchema,
  UpdateSchemaIncrementalRequestSchema,
  RegisterSchemaRequestSchema,
} from "./shared/action_schemas.js";
import {
  normalizeEntityValue,
  generateEntityId,
  type Entity,
} from "./services/entity_resolution.js";
import { ensureLocalDevUser } from "./services/local_auth.js";
import type { RelationshipType } from "./services/relationships.js";
import {
  extractWithLLM,
  extractWithLLMFromImage,
  extractFromCSVWithChunking,
  isLLMExtractionAvailable,
} from "./services/llm_extraction.js";
import {
  extractTextFromBuffer,
  getPdfFirstPageImageDataUrl,
  getMimeTypeFromExtension,
  getPdfWorkerDebug,
} from "./services/file_text_extraction.js";
import {
  softDeleteEntity as softDeleteEntityService,
  softDeleteRelationship as softDeleteRelationshipService,
  restoreEntity as restoreEntityService,
  restoreRelationship as restoreRelationshipService,
} from "./services/deletion.js";
import {
  prepareEntitySnapshotWithEmbedding,
  upsertEntitySnapshotWithEmbedding,
} from "./services/entity_snapshot_embedding.js";
import { semanticSearchEntities } from "./services/entity_semantic_search.js";
import { getLatestFromRegistry, isUpdateAvailable, formatUpgradeCommand } from "./version_check.js";

const MCP_DOCS_SUBDIR = ["docs", "developer", "mcp"] as const;

export class NeotomaServer {
  private server: Server;
  private autoEnhancementCleanup?: () => void;
  private authenticatedUserId: string | null = null;
  private sessionToken: string | null = null;
  private requestAuth: Map<string, { userId: string; token: string }> = new Map();
  /** Connection ID set from HTTP layer so handlers get auth even when SDK does not pass requestInfo */
  private sessionConnectionId: string | null = null;
  /** Tool descriptions loaded from docs/developer/mcp/tool_descriptions.yaml; empty Map if file missing */
  private toolDescriptions: Map<string, string> = new Map();
  /** In-memory cache for npm registry dist-tags: key = "packageName:distTag", value = { version, until } */
  private registryCache = new Map<string, { version: string; until: number }>();
  private static REGISTRY_CACHE_TTL_MS = 10 * 60 * 1000;

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

    this.toolDescriptions = this.loadToolDescriptionsMap();
    this.setupInitializeHandler();
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandler();
  }

  private mcpDocsPath(): string {
    return join(config.projectRoot, ...MCP_DOCS_SUBDIR);
  }

  private getMcpInteractionInstructions(): string {
    const fallback = [
      "Use MCP actions proactively. Store and retrieve without waiting for explicit requests.",
      "Always store when the user states relevant information, even in conversational contexts. Store first, then respond. Do not skip store because the user did not explicitly ask to save.",
      "MANDATORY in chat: every assistant turn you MUST (1) create or update a conversation entity with a stable conversation_id, (2) store this turn as an agent_message linked to it via PART_OF (message PART_OF conversation). Do NOT skip this for greetings, minimal messages, or when the user message has no extractable entities; chat storage is required every turn.",
      'In chat contexts (details): prefer host-provided conversation_id, thread_id, or session_id; when host does not provide, use entity id from first turn\'s store if re-exposed, or a deterministic derivative. Store any new attachments via the unstructured path and link them with EMBEDS. Use only Neotoma-supported relationship types (PART_OF, REFERS_TO, EMBEDS, SUPERSEDES, etc.); see MCP spec. Do this in the same turn as your response; do not wait for the user to say "save" or run an end-of-chat command. This is in addition to extracting and storing entities and attachments from the turn as below.',
      "For conversation/turn idempotency_key: use conversation-{conversation_id}-{turn_id}-{timestamp_ms} or conversation-{conversation_id}-{turn_id}-{uuid} so each turn store creates a new observation. Include stable turn identity in the message entity (e.g. turn_key or id = conversation_id:turn_id). Overwriting between branches is OK; history is available via list_observations.",
      "For reverted turns: optionally link the new message to the previous one with create_relationship(SUPERSEDES, new_message_entity_id, previous_message_entity_id).",
      'When you pull data from other MCPs (e.g. email, calendar, search), apply the same proactive storage: extract and store people, companies, locations, events, tasks, notifications, device status, and relationships from that data. Create tasks for action items (e.g. "replace battery", "share feedback", "review security alert", "reply about Madrid trip"). Store locations and link events or tasks to them. Store first, then respond.',
      "When confirming stored information, you MUST use memory-related language (e.g. “remember”, “recall”, “store in memory”) and include one of those phrases in the confirmation.",
      'Extract and store all relevant entities from what the user says: people, tasks, events, commitments, preferences, possessions, relationships, places, and any other types that fit. Store every distinct entity (e.g. a person and a task and an event from the same message). When the user mentions a place, property, or location (e.g. "our home in Barcelona", "my office", "apartment in Madrid"), store it as an entity (e.g. location, property, or place) and link the task or other entities to it. Create relationships when implied (e.g. friend of, task for person, event attendee, task for location) using create_relationship or relationship fields per schema.',
      "Proactively create a task when the user expresses intent, obligation, debt, or a future action (e.g. “I need to”, “I have to”, “I owe”, “I should”, “I want to buy”, “remind me”, or any deadline). Unless the user explicitly says no reminders or no tasks, create a task with due date if available and relate it to the relevant person or entity.",
      'When entity type is not in the known list, use list_entity_types with a keyword (e.g. "device", "asset", "preference", "gift", "reminder") or store with a descriptive entity_type; the system will infer or create schema from the data. Be proactive about storing any type of relevant entity, including types not yet registered.',
      "Example entity types (use when they fit; more may exist via list_entity_types or neotoma://entity_types): contact, person, company, task, invoice, transaction, receipt, note, contract, event, location, property, place, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision. For any other concept, use a descriptive type (e.g. device, asset, preference, gift, home) or discover via list_entity_types.",
      "Avoid calling get_authenticated_user unless required by the intended follow-up action. If the next actions do not require it, skip get_authenticated_user.",
      "Check for existing records before storing to avoid duplicates.",
      "Include all fields from source data when storing entities. Unknown fields must be included.",
      "Omit user_id. It is inferred from authentication.",
      "After any MCP action, summarize entities and relationships with all snapshot fields.",
      'If the prompt ends with "via mcp", use MCP actions only and do not read or write local files.',
    ].join("\n");
    const instructionsPath = join(this.mcpDocsPath(), "instructions.md");
    try {
      const raw = readFileSync(instructionsPath, "utf-8");
      const match = raw.match(/```\s*\n?([\s\S]*?)```/);
      if (match && match[1]) {
        const text = match[1].trim();
        return text || fallback;
      }
    } catch {
      // File missing or unreadable (e.g. packaged app); use fallback
    }
    return fallback;
  }

  private getUnauthenticatedInstructions(): {
    instructions: string;
    serverInfoDescription: string;
  } {
    const fallback = {
      instructions: "Authentication needed. Use the Connect button to sign in.",
      serverInfoDescription:
        "Authentication needed. Use the Connect button to sign in and access tools.",
    };
    const path = join(this.mcpDocsPath(), "unauthenticated.md");
    try {
      const raw = readFileSync(path, "utf-8");
      const blocks = raw.match(/```\s*\n?([\s\S]*?)```/g);
      if (blocks && blocks.length >= 2) {
        const a = blocks[0].replace(/^```\s*\n?|```$/g, "").trim();
        const b = blocks[1].replace(/^```\s*\n?|```$/g, "").trim();
        if (a && b) return { instructions: a, serverInfoDescription: b };
      }
    } catch {
      // File missing or unreadable; use fallback
    }
    return fallback;
  }

  private loadToolDescriptionsMap(): Map<string, string> {
    const path = join(this.mcpDocsPath(), "tool_descriptions.yaml");
    try {
      const raw = readFileSync(path, "utf-8");
      const data = yaml.load(raw) as { tools?: Record<string, string> } | undefined;
      if (data?.tools && typeof data.tools === "object") {
        return new Map(Object.entries(data.tools));
      }
    } catch {
      // File missing or invalid; use empty Map so tools keep inline descriptions
    }
    return new Map();
  }

  /**
   * Setup MCP initialize request handler for authentication
   * Supports both OAuth connections (recommended) and session tokens (deprecated)
   * Works with both stdio (env vars) and HTTP (request context) transports
   */
  private setupInitializeHandler(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async (request, extra) => {
      const requestId = request.params?.clientInfo?.name || randomUUID();

      // Detect transport type: HTTP has requestInfo, stdio does not
      const isHTTPTransport = !!extra?.requestInfo;

      // Extract connection_id: prefer HTTP-layer value (set by actions.ts) so auth works when SDK does not pass requestInfo
      const allHeaders = (extra?.requestInfo as any)?.headers || {};
      const authHeader = allHeaders["authorization"] || allHeaders["Authorization"];
      let connectionId =
        this.sessionConnectionId ||
        (extra?.authInfo as any)?.connectionId ||
        allHeaders["x-connection-id"] ||
        allHeaders["X-Connection-Id"] ||
        (!isHTTPTransport ? process.env.NEOTOMA_CONNECTION_ID : undefined);

      // If no connection ID header, try to get it from Bearer token
      if (
        !connectionId &&
        authHeader &&
        typeof authHeader === "string" &&
        authHeader.startsWith("Bearer ")
      ) {
        try {
          const token = authHeader.substring(7);
          const { validateTokenAndGetConnectionId } = await import("./services/mcp_oauth.js");
          const { connectionId: resolvedConnectionId } =
            await validateTokenAndGetConnectionId(token);
          connectionId = resolvedConnectionId;
          logger.info(`[MCP Server] Resolved connection ID from Bearer token: ${connectionId}`);
        } catch (error: any) {
          logger.error(
            `[MCP Server] Failed to resolve connection ID from Bearer token: ${error.message}`
          );
        }
      }

      // Stdio + encryption off: no auth required, same as HTTP (actions.ts sets x-connection-id to dev-local)
      if (!connectionId && !isHTTPTransport && !config.encryption.enabled) {
        connectionId = "dev-local";
      }

      logger.info(
        `[MCP Server] Initialize: connectionId=${connectionId}, authHeader=${authHeader ? "present" : "missing"}`
      );

      if (connectionId) {
        // In test environment, allow test connection ID to bypass authentication
        const isTestEnv = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
        if (connectionId === "test-connection-bypass" && isTestEnv) {
          this.authenticatedUserId = "00000000-0000-0000-0000-000000000000";
          this.requestAuth.set(requestId, {
            userId: this.authenticatedUserId,
            token: "test-bypass-token",
          });
          logger.info(
            `[MCP Server] Using test authentication bypass (user: ${this.authenticatedUserId})`
          );
          return {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "neotoma", version: "1.0.0" },
            instructions: this.getMcpInteractionInstructions(),
          };
        }

        // HTTP (insecure) no-auth: default to anonymous 000... user so unencrypted access is restricted.
        if (connectionId === "dev-local-http") {
          this.authenticatedUserId = "00000000-0000-0000-0000-000000000000";
          this.requestAuth.set(requestId, {
            userId: this.authenticatedUserId,
            token: "dev-local-http",
          });
          logger.info(
            `[MCP Server] Using HTTP no-auth (anonymous user: ${this.authenticatedUserId})`
          );
          return {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "neotoma", version: "1.0.0" },
            instructions: this.getMcpInteractionInstructions(),
          };
        }

        // Dev-local (HTTPS or secure): no-auth default with full dev user. Allowed when no creds over secure transport.
        if (connectionId === "dev-local") {
          const devUser = ensureLocalDevUser();
          this.authenticatedUserId = devUser.id;
          this.requestAuth.set(requestId, {
            userId: this.authenticatedUserId,
            token: "dev-local",
          });
          logger.info(`[MCP Server] Using dev-local auth (user: ${this.authenticatedUserId})`);
          return {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "neotoma", version: "1.0.0" },
            instructions: this.getMcpInteractionInstructions(),
          };
        }

        // OAuth flow - check if connection ID is valid
        try {
          const { getAccessTokenForConnection } = await import("./services/mcp_oauth.js");
          const { accessToken, userId } = await getAccessTokenForConnection(connectionId);

          // Store auth per request (for HTTP) and at instance level (for stdio)
          this.requestAuth.set(requestId, { userId, token: accessToken });
          this.authenticatedUserId = userId;
          this.sessionToken = accessToken;

          logger.info(
            `[MCP Server] Initialized with OAuth connection: ${connectionId} (user: ${userId})`
          );
          return {
            protocolVersion: "2025-11-25",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "neotoma",
              version: "1.0.0",
            },
            instructions: this.getMcpInteractionInstructions(),
          };
        } catch (error: any) {
          const isConnectionNotFound =
            error.message?.includes("Connection not found") ||
            error.message?.includes("connection_id") ||
            error.code === "OAUTH_CONNECTION_NOT_FOUND";

          if (isConnectionNotFound) {
            logger.error(
              `[MCP Server] Invalid or expired X-Connection-Id: ${connectionId}. Clearing connection ID.`
            );
            this.sessionConnectionId = null;
          } else {
            logger.error(`[MCP Server] OAuth initialization failed: ${error.message}`);
          }

          // Stdio + encryption off: fall back to dev-local (default user)
          if (!isHTTPTransport && !config.encryption.enabled) {
            logger.info(
              "[MCP Server] Stdio with encryption off: falling back to dev-local (no auth required)."
            );
            const devUser = ensureLocalDevUser();
            this.authenticatedUserId = devUser.id;
            this.requestAuth.set(requestId, {
              userId: this.authenticatedUserId,
              token: "dev-local",
            });
            return {
              protocolVersion: "2025-11-25",
              capabilities: { tools: {}, resources: {} },
              serverInfo: { name: "neotoma", version: "1.0.0" },
              instructions: this.getMcpInteractionInstructions(),
            };
          }

          if (isConnectionNotFound) {
            return this.getUnauthenticatedResponse(true);
          }
          return this.getUnauthenticatedResponse();
        }
      }

      // No authentication method provided - return with OAuth capabilities
      // This allows Cursor to show "Connect" button for OAuth
      return this.getUnauthenticatedResponse();
    });
  }

  /**
   * Returns initialize response when authentication is missing
   * Declares OAuth capabilities so Cursor shows "Connect" button and "Authentication needed" message
   */
  private getUnauthenticatedResponse(invalidConnection?: boolean) {
    const authStrategy = {
      id: "oauth2-neotoma",
      type: "oauth2",
      title: "Neotoma OAuth2",
      authorizationUrl: `${config.apiBase}/mcp/oauth/authorize`,
      tokenUrl: `${config.apiBase}/mcp/oauth/token`,
      scopes: ["openid", "email"],
      pkce: true,
    };

    const instructions = invalidConnection
      ? "Invalid or expired connection. Remove X-Connection-Id from mcp.json and use Connect button."
      : this.getUnauthenticatedInstructions().instructions;

    const description = invalidConnection
      ? "Your X-Connection-Id is invalid or expired. Remove it from your .cursor/mcp.json configuration and click Connect to authenticate again."
      : this.getUnauthenticatedInstructions().serverInfoDescription;

    return {
      protocolVersion: "2025-11-25",
      capabilities: {
        tools: {},
        resources: {},
        // Declare OAuth authentication requirement so Cursor shows Connect button
        authentication: {
          type: "oauth2",
          authorizationUrl: `${config.apiBase}/mcp/oauth/authorize`,
          tokenUrl: `${config.apiBase}/mcp/oauth/token`,
        },
      },
      serverInfo: {
        name: "neotoma",
        version: "1.0.0",
        title: invalidConnection ? "Invalid connection" : "Authentication needed",
        description,
        // Add authenticationStrategies array (used by SDK-based servers like oauth-ping)
        // Cursor may require this in addition to capabilities.authentication
        authenticationStrategies: [authStrategy],
      },
      instructions,
    };
  }

  /**
   * Set connection ID for this session from the HTTP layer.
   * Ensures listTools/listResources get auth when the SDK does not pass requestInfo to handlers.
   */
  setSessionConnectionId(connectionId: string): void {
    this.sessionConnectionId = connectionId;
  }

  /**
   * Get authenticated user ID and validate against provided user_id
   * @param providedUserId - Optional user_id parameter from action call
   * @returns Authenticated user_id
   * @throws McpError if not authenticated or user_id mismatch
   */
  private getAuthenticatedUserId(providedUserId?: string): string {
    if (!this.authenticatedUserId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Authentication required. Set NEOTOMA_CONNECTION_ID in mcp.json env. Get your connection from the Neotoma web UI (MCP Setup → OAuth Connection)."
      );
    }
    if (providedUserId && providedUserId !== this.authenticatedUserId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `user_id parameter (${providedUserId}) does not match authenticated user (${this.authenticatedUserId})`
      );
    }
    return this.authenticatedUserId;
  }

  /**
   * Get authenticated user information
   * Returns the user_id that is automatically used for all authenticated actions
   */
  private async getAuthenticatedUser(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    // No arguments needed, but validate the schema
    z.object({}).parse(args ?? {});

    // Get authenticated user_id (will throw if not authenticated)
    const userId = this.getAuthenticatedUserId();
    const storage =
      config.storageBackend === "local"
        ? {
            storage_backend: "local" as const,
            data_dir: config.dataDir,
            sqlite_db: config.sqlitePath,
          }
        : undefined;

    return this.buildTextResponse({
      user_id: userId,
      authenticated: true,
      storage,
    });
  }

  /**
   * Health check for entity snapshots
   * Detects stale snapshots (observation_count=0 but observations exist)
   */
  private async healthCheckSnapshots(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      auto_fix: z.boolean().default(false),
    });

    const parsed = schema.parse(args ?? {});
    const { db } = await import("./db.js");

    // Get all entity snapshots with observation_count = 0
    const { data: potentiallyStale, error: snapshotError } = await db
      .from("entity_snapshots")
      .select("entity_id, entity_type, observation_count, computed_at")
      .eq("observation_count", 0)
      .order("computed_at", { ascending: false });

    if (snapshotError) {
      return this.buildTextResponse({
        healthy: false,
        error: `Failed to query snapshots: ${snapshotError.message}`,
      });
    }

    if (!potentiallyStale || potentiallyStale.length === 0) {
      return this.buildTextResponse({
        healthy: true,
        message: "All snapshots healthy (no snapshots with observation_count=0)",
        checked: 0,
        stale: 0,
      });
    }

    // Check for actual observations
    const staleSnapshots: Array<{
      entity_id: string;
      entity_type: string;
      observation_count_snapshot: number;
      observation_count_actual: number;
    }> = [];

    for (const snapshot of potentiallyStale) {
      const { data: observations, error: obsError } = await db
        .from("observations")
        .select("id")
        .eq("entity_id", snapshot.entity_id);

      if (obsError) {
        continue;
      }

      const actualObsCount = observations?.length || 0;

      if (actualObsCount > 0) {
        staleSnapshots.push({
          entity_id: snapshot.entity_id,
          entity_type: snapshot.entity_type,
          observation_count_snapshot: snapshot.observation_count,
          observation_count_actual: actualObsCount,
        });
      }
    }

    // Auto-fix if requested
    if (parsed.auto_fix && staleSnapshots.length > 0) {
      const { observationReducer } = await import("./reducers/observation_reducer.js");
      let fixedCount = 0;

      for (const stale of staleSnapshots) {
        try {
          // Get all observations
          const { data: observations } = await db
            .from("observations")
            .select("*")
            .eq("entity_id", stale.entity_id)
            .order("observed_at", { ascending: false });

          if (!observations || observations.length === 0) continue;

          // Recompute snapshot
          const newSnapshot = await observationReducer.computeSnapshot(
            stale.entity_id,
            observations as any
          );

          if (!newSnapshot) continue;

          const rowWithEmbedding = await prepareEntitySnapshotWithEmbedding({
            entity_id: newSnapshot.entity_id,
            entity_type: newSnapshot.entity_type,
            schema_version: newSnapshot.schema_version,
            snapshot: newSnapshot.snapshot,
            computed_at: newSnapshot.computed_at,
            observation_count: newSnapshot.observation_count,
            last_observation_at: newSnapshot.last_observation_at,
            provenance: newSnapshot.provenance,
            user_id: newSnapshot.user_id,
          });
          await upsertEntitySnapshotWithEmbedding(rowWithEmbedding);

          fixedCount++;
        } catch (error) {
          console.error(`Failed to fix snapshot for ${stale.entity_id}:`, error);
        }
      }

      return this.buildTextResponse({
        healthy: false,
        message: `Found ${staleSnapshots.length} stale snapshots, fixed ${fixedCount}`,
        checked: potentiallyStale.length,
        stale: staleSnapshots.length,
        fixed: fixedCount,
        stale_snapshots: staleSnapshots,
      });
    }

    return this.buildTextResponse({
      healthy: staleSnapshots.length === 0,
      message:
        staleSnapshots.length === 0
          ? "All snapshots healthy"
          : `Found ${staleSnapshots.length} stale snapshots`,
      checked: potentiallyStale.length,
      stale: staleSnapshots.length,
      stale_snapshots: staleSnapshots,
    });
  }

  private async npmCheckUpdate(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      packageName: z.string(),
      currentVersion: z.string(),
      distTag: z.string().default("latest"),
    });
    const parsed = schema.parse(args ?? {});
    const { packageName, currentVersion, distTag } = parsed;

    const cacheKey = `${packageName}:${distTag}`;
    const cached = this.registryCache.get(cacheKey);
    let latest: string | null = cached && cached.until > Date.now() ? cached.version : null;

    if (latest === null) {
      latest = await getLatestFromRegistry(packageName, distTag);
      if (latest) {
        this.registryCache.set(cacheKey, {
          version: latest,
          until: Date.now() + NeotomaServer.REGISTRY_CACHE_TTL_MS,
        });
      }
    }

    if (latest === null) {
      return this.buildTextResponse({
        packageName,
        currentVersion,
        distTag,
        latestVersion: null,
        updateAvailable: false,
        message: "Registry unreachable.",
        suggestedCommand: null,
      });
    }

    const updateAvailable = isUpdateAvailable(currentVersion, latest);
    const message = updateAvailable
      ? `New version available (${latest}). Please upgrade before continuing.`
      : "No update available.";
    const suggestedCommand = updateAvailable
      ? formatUpgradeCommand(packageName, distTag, "global")
      : null;

    return this.buildTextResponse({
      packageName,
      currentVersion,
      distTag,
      latestVersion: latest,
      updateAvailable,
      message,
      suggestedCommand,
    });
  }

  /**
   * Validate session token and extract user_id
   * @param token - access_token (JWT)
   * @returns user_id extracted from token
   * @throws McpError if token is invalid
   */
  private async validateSessionToken(token: string): Promise<string> {
    try {
      const { validateSessionToken } = await import("./services/mcp_auth.js");
      const { userId } = await validateSessionToken(token);
      return userId;
    } catch (error: any) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid session token: ${error.message}`);
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
      // Check authentication - try to get userId from request context if instance-level isn't set
      // This handles cases where authentication happens in initialize but instance state isn't preserved
      let userId = this.authenticatedUserId;

      // If instance-level userId isn't set, try session connection ID (set by HTTP layer) or request context
      if (!userId) {
        const connectionId =
          this.sessionConnectionId ||
          (extra?.requestInfo &&
            ((extra.requestInfo as any)?.headers?.["x-connection-id"] ??
              (extra.requestInfo as any)?.headers?.["X-Connection-Id"])) ||
          (extra?.authInfo as any)?.connectionId;

        if (connectionId) {
          try {
            if (connectionId === "dev-local") {
              userId = ensureLocalDevUser().id;
            } else {
              const { getAccessTokenForConnection } = await import("./services/mcp_oauth.js");
              const { userId: resolvedUserId } = await getAccessTokenForConnection(connectionId);
              userId = resolvedUserId;
            }
            this.authenticatedUserId = userId;
            logger.info(`[MCP Server] listTools fallback resolved userId: ${userId}`);
          } catch (error: any) {
            // Check if error is a connection not found error (invalid/expired X-Connection-Id)
            const isInvalidConnection =
              error.message?.includes("Connection not found") ||
              error.message?.includes("connection_id") ||
              error.code === "OAUTH_CONNECTION_NOT_FOUND";

            if (isInvalidConnection) {
              logger.error(
                `[MCP Server] Invalid or expired X-Connection-Id: ${connectionId}. User needs to remove header and reconnect.`
              );
              // Don't throw - throwing causes "Error - Show Output" instead of triggering reconnection
              // The invalid connection was already handled in initialize by throwing an error there
              // This is a fallback case if listTools is called somehow
            } else {
              logger.error(
                `[MCP Server] Failed to resolve userId from connection: ${error.message}`
              );
            }
          }
        }
      }

      // Return empty tools when unauthenticated so the client shows success (green) with 0 tools.
      // Throwing causes Cursor to show "Error - Show Output" instead of "Needs authentication".
      if (!userId) {
        logger.error(
          `[MCP Server] listTools called without authentication (authenticatedUserId: ${this.authenticatedUserId})`
        );
        return { tools: [] };
      }

      logger.info(`[MCP Server] listTools called for authenticated user: ${userId}`);

      return {
        tools: [
          {
            name: "retrieve_file_url",
            description:
              this.toolDescriptions.get("retrieve_file_url") ??
              "Retrieve a signed URL for accessing a file",
            inputSchema: getOpenApiInputSchemaOrThrow("retrieve_file_url"),
          },
          {
            name: "retrieve_entity_snapshot",
            description:
              this.toolDescriptions.get("retrieve_entity_snapshot") ??
              "Retrieve the current snapshot of an entity with provenance information. Supports historical snapshots via 'at' parameter.",
            inputSchema: getOpenApiInputSchemaOrThrow("retrieve_entity_snapshot"),
          },
          {
            name: "list_observations",
            description:
              this.toolDescriptions.get("list_observations") ??
              "List all observations for a given entity",
            inputSchema: getOpenApiInputSchemaOrThrow("list_observations"),
          },
          {
            name: "retrieve_field_provenance",
            description:
              this.toolDescriptions.get("retrieve_field_provenance") ??
              "Retrieve the provenance chain for a specific field in an entity snapshot",
            inputSchema: getOpenApiInputSchemaOrThrow("retrieve_field_provenance"),
          },
          {
            name: "create_relationship",
            description:
              this.toolDescriptions.get("create_relationship") ??
              "Create a typed relationship between two entities",
            inputSchema: getOpenApiInputSchemaOrThrow("create_relationship"),
          },
          {
            name: "list_relationships",
            description:
              this.toolDescriptions.get("list_relationships") ?? "List relationships for an entity",
            inputSchema: getOpenApiInputSchemaOrThrow("list_relationships"),
          },
          {
            name: "get_relationship_snapshot",
            description:
              this.toolDescriptions.get("get_relationship_snapshot") ??
              "Get the current snapshot of a specific relationship with provenance",
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
                    "EMBEDS",
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
              this.toolDescriptions.get("retrieve_entities") ??
              "Query entities with filters (type, pagination). Returns entities with their snapshots.",
            inputSchema: getOpenApiInputSchemaOrThrow("retrieve_entities"),
          },
          {
            name: "list_timeline_events",
            description:
              "Query timeline events with filters (type, date range, source). Returns chronological events derived from date fields in sources.",
            inputSchema: getOpenApiInputSchemaOrThrow("list_timeline_events"),
          },
          {
            name: "retrieve_entity_by_identifier",
            description:
              this.toolDescriptions.get("retrieve_entity_by_identifier") ??
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
              this.toolDescriptions.get("retrieve_related_entities") ??
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
              this.toolDescriptions.get("retrieve_graph_neighborhood") ??
              "Retrieve complete graph neighborhood around a node (entity or source): related entities, relationships, sources, and events.",
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
            description:
              this.toolDescriptions.get("store") ??
              "Unified storing for both unstructured and structured sources. For unstructured (files): provide EITHER file_content (base64-encoded) + mime_type OR file_path (local file path). For structured (entities): provide entities array. Content-addressed storage with SHA-256 deduplication per user. IMPORTANT FOR UNSTRUCTURED FILES: Agents MUST NOT attempt to interpret, extract, or infer structured data from unstructured files before storing. Simply provide the raw file_content (base64-encoded) and mime_type, OR provide file_path for local files. The server will automatically handle file analysis and interpretation if interpret=true (default). Do NOT read file contents to extract entities or fields - pass the file as-is. IMPORTANT FOR STRUCTURED DATA: When storing structured data with an unregistered entity_type, the system will automatically infer and create a user-specific schema from the data structure (parquet schema or JSON field types). Agents do NOT need to pre-register schemas - they are created on-demand. Entity type: When the type is one of the common types (contact, person, company, task, invoice, transaction, receipt, note, contract, event) and the user's intent is clear, set entity_type directly and skip list_entity_types. For other types or when field schemas are needed, use list_entity_types or read resource neotoma://entity_types first. CRITICAL: When storing structured entities, agents MUST include ALL fields from the source data, not just fields that match the entity schema. Schema fields are stored in observations (validated), while non-schema fields are automatically stored in raw_fragments (preserved for future schema expansion). This ensures zero data loss - never filter or exclude fields based on schema compatibility. The system automatically validates and routes fields appropriately.",
            inputSchema: (() => {
              const baseSchema = getOpenApiInputSchemaOrThrow("store");
              const baseProperties = (baseSchema.properties ?? {}) as Record<string, unknown>;
              return {
                ...baseSchema,
                type: "object",
                properties: {
                  ...baseProperties,
                  // Unstructured source - EITHER file_content OR file_path
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
                      "Original filename or source label (optional). For unstructured: auto-detected from file_path if not provided. For structured (entities): omit when data is agent-provided (no file origin); the source will have no filename. Pass only when mirroring a real file name or when a display label is desired.",
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
                },
              };
            })(),
          },
          {
            name: "store_structured",
            description:
              this.toolDescriptions.get("store_structured") ??
              "Store structured entities only. Use this when you already have entity objects and do not need file ingestion.",
            inputSchema: getOpenApiInputSchemaOrThrow("store_structured"),
          },
          {
            name: "store_unstructured",
            description:
              this.toolDescriptions.get("store_unstructured") ??
              "Store raw files only. Provide file_content (base64) + mime_type or file_path. Use when you only have unstructured files.",
            inputSchema: {
              type: "object",
              properties: {
                idempotency_key: {
                  type: "string",
                  description: "Required. Client-provided idempotency key for replay-safe storing.",
                },
                file_content: {
                  type: "string",
                  description:
                    "Base64-encoded file content (for unstructured storage). Use file_path for local files instead of base64 encoding.",
                },
                file_path: {
                  type: "string",
                  description:
                    "Local file path (alternative to file_content). If provided, file will be read from filesystem.",
                },
                mime_type: {
                  type: "string",
                  description:
                    "MIME type (e.g., 'application/pdf', 'text/csv') - required with file_content, optional with file_path",
                },
                original_filename: {
                  type: "string",
                  description:
                    "Original filename (optional, auto-detected from file_path if not provided)",
                },
                interpret: {
                  type: "boolean",
                  description:
                    "Whether to run AI interpretation immediately (for unstructured). Default: true.",
                  default: true,
                },
                interpretation_config: {
                  type: "object",
                  description: "AI interpretation configuration (provider, model, etc.)",
                },
              },
              required: ["idempotency_key"],
            },
          },
          {
            name: "reinterpret",
            description:
              this.toolDescriptions.get("reinterpret") ??
              "Re-run AI interpretation on an existing source with optional config. Creates new observations without modifying existing ones (immutability).",
            inputSchema: {
              type: "object",
              properties: {
                source_id: {
                  type: "string",
                  description: "Source ID (UUID) to reinterpret",
                },
                interpretation_config: {
                  type: "object",
                  description:
                    "Optional AI interpretation configuration (model_id, temperature, etc.)",
                },
              },
              required: ["source_id"],
            },
          },
          {
            name: "interpret_uninterpreted",
            description:
              this.toolDescriptions.get("interpret_uninterpreted") ??
              "Interpret stored sources that have no prior interpretation runs. Supports dry_run and limit.",
            inputSchema: {
              type: "object",
              properties: {
                user_id: {
                  type: "string",
                  description: "Optional. Inferred from authentication if omitted.",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of uninterpreted sources to process (default 50, max 100).",
                  default: 50,
                },
                dry_run: {
                  type: "boolean",
                  description: "When true, return source IDs that would be interpreted without running interpretation.",
                  default: false,
                },
                interpretation_config: {
                  type: "object",
                  description: "Optional AI interpretation configuration to apply to each source run.",
                },
              },
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
            description:
              this.toolDescriptions.get("merge_entities") ??
              "Merge duplicate entities. Rewrites observations from source entity to target entity and marks source as merged.",
            inputSchema: getOpenApiInputSchemaOrThrow("merge_entities"),
          },
          {
            name: "delete_entity",
            description:
              this.toolDescriptions.get("delete_entity") ??
              "Delete an entity. Creates a deletion observation so the entity is excluded from snapshots and queries. Immutable and reversible for audit; use for user-initiated or GDPR-style removal from active use.",
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
            description:
              this.toolDescriptions.get("delete_relationship") ??
              "Delete a relationship. Creates a deletion observation so the relationship is excluded from snapshots and queries. Immutable and reversible for audit.",
            inputSchema: {
              type: "object",
              properties: {
                relationship_type: {
                  type: "string",
                  description: "Relationship type (e.g. PART_OF, REFERS_TO, EMBEDS)",
                  enum: [
                    "PART_OF",
                    "CORRECTS",
                    "REFERS_TO",
                    "SETTLES",
                    "DUPLICATE_OF",
                    "DEPENDS_ON",
                    "SUPERSEDES",
                    "EMBEDS",
                  ],
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
            description:
              this.toolDescriptions.get("restore_entity") ??
              "Restore a deleted entity. Creates a restoration observation (priority 1001) that overrides the deletion. Entity becomes visible in snapshots and queries again. Immutable restoration for audit.",
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
            description:
              this.toolDescriptions.get("restore_relationship") ??
              "Restore a deleted relationship. Creates a restoration observation (priority 1001) that overrides the deletion. Relationship becomes visible in snapshots and queries again. Immutable restoration for audit.",
            inputSchema: {
              type: "object",
              properties: {
                relationship_type: {
                  type: "string",
                  description: "Relationship type (e.g. PART_OF, REFERS_TO, EMBEDS)",
                  enum: [
                    "PART_OF",
                    "CORRECTS",
                    "REFERS_TO",
                    "SETTLES",
                    "DUPLICATE_OF",
                    "DEPENDS_ON",
                    "SUPERSEDES",
                    "EMBEDS",
                  ],
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
            name: "list_entity_types",
            description:
              this.toolDescriptions.get("list_entity_types") ??
              "List all available entity types with their schema information. Optionally filter by keyword to find entity types relevant to your data. Uses hybrid search: keyword matching first (deterministic), then vector semantic search (semantic similarity). Use this action before storing structured data to determine the correct entity_type.",
            inputSchema: getOpenApiInputSchemaOrThrow("list_entity_types"),
          },
          {
            name: "analyze_schema_candidates",
            description:
              this.toolDescriptions.get("analyze_schema_candidates") ??
              "Analyze raw_fragments to identify fields that should be promoted to schema fields. Returns recommendations with confidence scores based on frequency and type consistency.",
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
            description:
              this.toolDescriptions.get("update_schema_incremental") ??
              "Incrementally update a schema by adding new fields from raw_fragments or agent recommendations. Creates new schema version and activates it immediately, so all new data stored after this call will use the updated schema. Optionally migrates existing raw_fragments to observations for historical data backfill.",
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
              required: ["entity_type", "fields_to_add"],
            },
          },
          {
            name: "register_schema",
            description:
              this.toolDescriptions.get("register_schema") ??
              "Register a new schema or schema version. Supports both global and user-specific schemas.",
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
            name: "health_check_snapshots",
            description:
              this.toolDescriptions.get("health_check_snapshots") ??
              "Check for stale entity snapshots (snapshots with observation_count=0 but observations exist). Returns health status and count of stale snapshots.",
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
            name: "npm_check_update",
            description:
              this.toolDescriptions.get("npm_check_update") ??
              "Check if a newer npm version is available. Returns updateAvailable, message, and suggestedCommand. Call at session start to encourage user to upgrade.",
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
        ],
      };
    });

    const summarizeToolResultForLog = (
      toolName: string,
      result: { content: Array<{ type: string; text?: string }> }
    ): string => {
      const first = result?.content?.[0];
      if (!first || first.type !== "text" || typeof first.text !== "string") return "ok";
      const maxLen = 140;
      const text = first.text.trim();
      if (text.length === 0) return "ok";
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const id = parsed?.record_id ?? parsed?.entity_id ?? parsed?.relationship_id ?? parsed?.id;
        if (id != null) return String(id).slice(0, maxLen);
        const msg = parsed?.message ?? parsed?.summary;
        if (msg != null) return String(msg).slice(0, maxLen);
      } catch {
        // not JSON
      }
      return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
    };

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        const cliEquivalent = buildCliEquivalentInvocation(name, args);
        logger.info(`[MCP Server] CLI equivalent: ${cliEquivalent}`);

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

        const result = await this.executeTool(name, args);
        const resultSummary = summarizeToolResultForLog(name, result);
        if (resultSummary) {
          logger.info(`[MCP Server] ${name} → ${resultSummary}`);
        }
        return result;
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        // Safely extract error message, handling BigInt values
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        } else {
          try {
            // Try to stringify, but catch BigInt serialization errors
            errorMessage = JSON.stringify(error, (key, value) => {
              if (typeof value === "bigint") {
                return Number(value);
              }
              return value;
            });
          } catch {
            errorMessage = String(error);
          }
        }
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  public async executeToolForCli(
    name: string,
    args: unknown,
    userId: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    this.authenticatedUserId = userId;
    return this.executeTool(name, args);
  }

  private async executeTool(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
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
      case "store_structured":
        return await this.store(args);
      case "store_unstructured":
        return await this.store(args);
      case "reinterpret":
        return await this.reinterpret(args);
      case "interpret_uninterpreted":
        return await this.interpretUninterpreted(args);
      case "correct":
        return await this.correct(args);
      case "merge_entities":
        return await this.mergeEntities(args);
      case "delete_entity":
        return await this.deleteEntity(args);
      case "delete_relationship":
        return await this.deleteRelationship(args);
      case "restore_entity":
        return await this.restoreEntity(args);
      case "restore_relationship":
        return await this.restoreRelationship(args);
      case "get_authenticated_user":
        return await this.getAuthenticatedUser(args);
      case "health_check_snapshots":
        return await this.healthCheckSnapshots(args);
      case "npm_check_update":
        return await this.npmCheckUpdate(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  /**
   * Setup resource handlers for MCP resources capability
   */
  private setupResourceHandlers(): void {
    // List all available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
      // Check authentication - try to get userId from request context if instance-level isn't set
      let userId = this.authenticatedUserId;

      // If instance-level userId isn't set, try session connection ID (set by HTTP layer) or request context
      if (!userId) {
        const connectionId =
          this.sessionConnectionId ||
          (extra?.requestInfo &&
            ((extra.requestInfo as any)?.headers?.["x-connection-id"] ??
              (extra.requestInfo as any)?.headers?.["X-Connection-Id"])) ||
          (extra?.authInfo as any)?.connectionId;

        if (connectionId) {
          try {
            if (connectionId === "dev-local") {
              userId = ensureLocalDevUser().id;
            } else {
              const { getAccessTokenForConnection } = await import("./services/mcp_oauth.js");
              const { userId: resolvedUserId } = await getAccessTokenForConnection(connectionId);
              userId = resolvedUserId;
            }
            this.authenticatedUserId = userId;
            logger.info(`[MCP Server] listResources fallback resolved userId: ${userId}`);
          } catch (error: any) {
            // Check if error is a connection not found error (invalid/expired X-Connection-Id)
            const isInvalidConnection =
              error.message?.includes("Connection not found") ||
              error.message?.includes("connection_id") ||
              error.code === "OAUTH_CONNECTION_NOT_FOUND";

            if (isInvalidConnection) {
              logger.error(
                `[MCP Server] Invalid or expired X-Connection-Id: ${connectionId}. User needs to remove header and reconnect.`
              );
              // Don't throw - throwing causes "Error - Show Output" instead of triggering reconnection
              // The invalid connection was already handled in initialize by throwing an error there
              // This is a fallback case if listResources is called somehow
            } else {
              logger.error(
                `[MCP Server] Failed to resolve userId from connection: ${error.message}`
              );
            }
          }
        }
      }

      if (!userId) {
        logger.error(
          `[MCP Server] listResources called without authentication (authenticatedUserId: ${this.authenticatedUserId})`
        );
        return { resources: [] };
      }

      logger.info(`[MCP Server] listResources called for authenticated user: ${userId}`);

      try {
        const resources: Array<{
          uri: string;
          name: string;
          description: string;
          mimeType: string;
        }> = [];

        // Note: Entity type collections (neotoma://entities/{entity_type}) are NOT enumerated as resources because:
        // 1. Entity types are schema-level (relatively stable), not data-level
        // 2. Discovery should use neotoma://entity_types resource (enumerated below) or list_entity_types action
        // 3. Type-specific queries should use retrieve_entities action with entity_type filter
        // However, we DO provide neotoma://entity_types as an enumerated resource for schema-level discovery

        // Get available timeline years and months
        try {
          const { data: years, error: yearsError } = await db
            .from("timeline_events")
            .select("event_timestamp")
            .order("event_timestamp", { ascending: false });

          if (!yearsError && years && years.length > 0) {
            // Extract unique years and year-month combinations
            const uniqueYears = new Set<string>();
            const uniqueYearMonths = new Set<string>();

            for (const event of years) {
              if (event.event_timestamp) {
                const date = new Date(event.event_timestamp);
                const year = date.getFullYear().toString();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const yearMonth = `${year}-${month}`;

                uniqueYears.add(year);
                uniqueYearMonths.add(yearMonth);
              }
            }

            // Add year resources with counts
            for (const year of Array.from(uniqueYears).sort().reverse()) {
              const yearEvents = years.filter((e: { event_timestamp?: string | null }) => {
                if (!e.event_timestamp) return false;
                return new Date(e.event_timestamp).getFullYear().toString() === year;
              });
              resources.push({
                uri: `neotoma://timeline/${year}`,
                name: `Timeline ${year}`,
                description: `All timeline events in ${year} (${yearEvents.length} events)`,
                mimeType: "application/json",
              });
            }

            // Add year-month resources with counts
            for (const yearMonth of Array.from(uniqueYearMonths).sort().reverse()) {
              const [year, month] = yearMonth.split("-");
              const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString(
                "default",
                { month: "long" }
              );
              const monthEvents = years.filter((e: { event_timestamp?: string | null }) => {
                if (!e.event_timestamp) return false;
                const date = new Date(e.event_timestamp);
                return (
                  date.getFullYear().toString() === year &&
                  String(date.getMonth() + 1).padStart(2, "0") === month
                );
              });
              resources.push({
                uri: `neotoma://timeline/${yearMonth}`,
                name: `Timeline ${monthName} ${year}`,
                description: `All timeline events in ${monthName} ${year} (${monthEvents.length} events)`,
                mimeType: "application/json",
              });
            }
          }
        } catch (timelineError) {
          // Log error but don't fail resource listing
          logger.warn("Failed to enumerate timeline resources:", timelineError);
        }

        // Add generic collection resources (data-driven, always available)
        // Get counts for better descriptions
        const { count: entityCount } = await db
          .from("entities")
          .select("*", { count: "exact", head: true })
          .is("merged_to_entity_id", null);

        const { count: relationshipCount } = await db
          .from("relationship_snapshots")
          .select("*", { count: "exact", head: true });

        const { count: sourceCount } = await db
          .from("sources")
          .select("*", { count: "exact", head: true });

        resources.push({
          uri: "neotoma://entities",
          name: "All Entities",
          description: `All entities regardless of type (${entityCount || 0} total)`,
          mimeType: "application/json",
        });

        resources.push({
          uri: "neotoma://relationships",
          name: "All Relationships",
          description: `All relationships regardless of type (${relationshipCount || 0} total)`,
          mimeType: "application/json",
        });

        resources.push({
          uri: "neotoma://sources",
          name: "Sources",
          description: `All sources (${sourceCount} total)`,
          mimeType: "application/json",
        });

        // Get entity types count from schema registry
        try {
          const { SchemaRegistryService } = await import("./services/schema_registry.js");
          const schemaRegistry = new SchemaRegistryService();
          const entityTypes = await schemaRegistry.listEntityTypes();
          resources.push({
            uri: "neotoma://entity_types",
            name: "Entity Types",
            description: `All available entity types (${entityTypes.length} types)`,
            mimeType: "application/json",
          });
        } catch (entityTypesError) {
          // Log error but don't fail resource listing
          logger.warn("Failed to enumerate entity types resource:", entityTypesError);
        }

        // Get available relationship types
        try {
          const { data: relationshipTypes, error: rtError } = await db
            .from("relationship_snapshots")
            .select("relationship_type")
            .order("relationship_type");

          if (!rtError && relationshipTypes && relationshipTypes.length > 0) {
            // Extract unique relationship types
            const uniqueTypes = new Set<string>();
            for (const rt of relationshipTypes as Array<{ relationship_type?: string }>) {
              if (rt.relationship_type) {
                uniqueTypes.add(rt.relationship_type);
              }
            }

            // Add relationship type resources with counts
            for (const relType of Array.from(uniqueTypes).sort()) {
              const typeName = relType
                .replace(/_/g, " ")
                .toLowerCase()
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
              const typeCount = relationshipTypes.filter(
                (rt: { relationship_type?: string }) => rt.relationship_type === relType
              ).length;
              resources.push({
                uri: `neotoma://relationships/${relType}`,
                name: `${typeName} Relationships`,
                description: `All relationships of type ${relType} (${typeCount} relationships)`,
                mimeType: "application/json",
              });
            }
          }
        } catch (error) {
          // Log error but don't fail resource listing
          logger.warn("Failed to enumerate relationship type resources:", error);
        }

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
          case "entity_collection_all":
            data = await this.handleEntityCollectionAll(parsed.queryParams);
            break;
          case "entity_collection":
            data = await this.handleEntityCollection(parsed.entityType!, parsed.queryParams);
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
            data = await this.handleTimelineYear(parsed.year!, parsed.queryParams);
            break;
          case "timeline_month":
            data = await this.handleTimelineMonth(parsed.year!, parsed.month!, parsed.queryParams);
            break;
          case "source":
            data = await this.handleSource(parsed.sourceId!);
            break;
          case "source_collection":
            data = await this.handleSourceCollection(parsed.queryParams);
            break;
          case "relationship_collection_all":
            data = await this.handleRelationshipCollectionAll(parsed.queryParams);
            break;
          case "relationship_collection":
            data = await this.handleRelationshipCollection(
              parsed.relationshipType!,
              parsed.queryParams
            );
            break;
          case "entity_types":
            data = await this.handleEntityTypes();
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
              text: JSON.stringify(data),
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
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) throw error ?? new Error("Failed to create signed URL");

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
      if (typeof value === "bigint") {
        return Number(value);
      }
      return value;
    };
    // Use compact JSON (no indentation) to reduce response size and avoid Cursor file-writing threshold
    return {
      content: [{ type: "text", text: JSON.stringify(data, replacer) }],
    };
  }

  private async retrieveEntitySnapshot(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const { observationReducer } = await import("./reducers/observation_reducer.js");

    const parsed = EntitySnapshotRequestSchema.parse(args ?? {});

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
        const { data: observations, error: obsError } = await db
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

        // Map observations to reducer's expected format
        const mappedObservations = observations.map((obs: any) => ({
          id: obs.id,
          entity_id: obs.entity_id,
          entity_type: obs.entity_type,
          schema_version: obs.schema_version,
          source_id: obs.source_id || "",
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

        if (!historicalSnapshot) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to compute historical snapshot for entity ${entity.entity_id}`
          );
        }

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
    const parsed = ListObservationsRequestSchema.parse(args ?? {});

    const { data: observations, error } = await db
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
    const parsed = FieldProvenanceRequestSchema.parse(args ?? {});

    // Get the snapshot to extract provenance
    const { data: snapshot, error: snapshotError } = await db
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
    const { data: observation, error: obsError } = await db
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

    // Get the source from sources table
    if (!observation.source_id) {
      throw new McpError(ErrorCode.InternalError, `Observation does not have source_id`);
    }

    const { data: sourceData, error: sourceError } = await db
      .from("sources")
      .select("id, mime_type, file_size, original_filename, created_at")
      .eq("id", observation.source_id)
      .single();

    if (sourceError || !sourceData) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get source: ${sourceError?.message || "Source not found"}`
      );
    }

    const source = {
      id: sourceData.id,
      mime_type: sourceData.mime_type,
      file_urls: [], // Sources table doesn't have file_urls directly
      created_at: sourceData.created_at,
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
      source: source,
      observed_at: observation.observed_at,
    };

    return this.buildTextResponse(provenanceChain);
  }

  private async createRelationship(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = CreateRelationshipRequestSchema.parse(args ?? {});

    // Check if relationship would create a cycle
    // Get all relationships to build the graph
    const { data: allRelationships } = await db
      .from("relationship_snapshots")
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

    // Use authenticated user_id
    const userId = this.getAuthenticatedUserId();

    try {
      // Create a source for this relationship
      const { data: source, error: sourceError } = await db
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

      const { relationshipsService } = await import("./services/relationships.js");
      const snapshot = await relationshipsService.createRelationship({
        relationship_type: parsed.relationship_type,
        source_entity_id: parsed.source_entity_id,
        target_entity_id: parsed.target_entity_id,
        source_id: source.id,
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
        `Failed to create relationship: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async listRelationships(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ListRelationshipsRequestSchema.parse(args ?? {});
    const normalizedDirection =
      parsed.direction === "incoming" || parsed.direction === "inbound"
        ? "inbound"
        : parsed.direction === "outgoing" || parsed.direction === "outbound"
          ? "outbound"
          : "both";

    const relationships: any[] = [];

    // Query relationship_snapshots instead of relationships table
    if (normalizedDirection === "outbound" || normalizedDirection === "both") {
      let outboundQuery = db
        .from("relationship_snapshots")
        .select("*")
        .eq("source_entity_id", parsed.entity_id);

      if (parsed.relationship_type) {
        outboundQuery = outboundQuery.eq("relationship_type", parsed.relationship_type);
      }

      const { data: outbound, error: outboundError } = await outboundQuery;

      if (!outboundError && outbound) {
        relationships.push(
          ...outbound.map(
            (r: {
              relationship_key: string;
              snapshot?: unknown;
              last_observation_at?: string;
            }) => ({
              ...r,
              id: r.relationship_key, // Add id field for backward compatibility
              direction: "outbound",
              // Include snapshot metadata as top-level for backward compatibility
              metadata: r.snapshot,
              // Add created_at field per MCP_SPEC.md 3.16 (use last_observation_at as created_at)
              created_at: r.last_observation_at,
            })
          )
        );
      }
    }

    if (normalizedDirection === "inbound" || normalizedDirection === "both") {
      let inboundQuery = db
        .from("relationship_snapshots")
        .select("*")
        .eq("target_entity_id", parsed.entity_id);

      if (parsed.relationship_type) {
        inboundQuery = inboundQuery.eq("relationship_type", parsed.relationship_type);
      }

      const { data: inbound, error: inboundError } = await inboundQuery;

      if (!inboundError && inbound) {
        relationships.push(
          ...inbound.map(
            (r: {
              relationship_key: string;
              snapshot?: unknown;
              last_observation_at?: string;
            }) => ({
              ...r,
              id: r.relationship_key, // Add id field for backward compatibility
              direction: "inbound",
              // Include snapshot metadata as top-level for backward compatibility
              metadata: r.snapshot,
              // Add created_at field per MCP_SPEC.md 3.16 (use last_observation_at as created_at)
              created_at: r.last_observation_at,
            })
          )
        );
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
    const parsed = RelationshipSnapshotRequestSchema.parse(args ?? {});

    const userId = "00000000-0000-0000-0000-000000000000"; // Default for v0.1.0 single-user

    // Get relationship snapshot
    const relationshipKey = `${parsed.relationship_type}:${parsed.source_entity_id}:${parsed.target_entity_id}`;
    const { data: snapshot, error } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("relationship_key", relationshipKey)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to retrieve relationship snapshot: ${error.message}`
      );
    }

    if (!snapshot) {
      throw new McpError(ErrorCode.InvalidParams, `Relationship not found: ${relationshipKey}`);
    }

    // Also get the observations for this relationship to show provenance
    const { data: observations } = await db
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
    const parsed = RetrieveEntitiesRequestSchema.parse(args ?? {});

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { entities, total, excluded_merged } = await queryEntitiesWithCount({
      userId,
      entityType: parsed.entity_type,
      includeMerged: parsed.include_merged,
      search: parsed.search,
      similarityThreshold: parsed.similarity_threshold,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return this.buildTextResponse({
      entities,
      total,
      excluded_merged,
    });
  }

  private async listTimelineEvents(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = TimelineEventsRequestSchema.parse(args ?? {});

    let query = db.from("timeline_events").select("*");

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
    let countQuery = db.from("timeline_events").select("*", {
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
    const parsed = RetrieveEntityByIdentifierSchema.parse(args ?? {});

    // Normalize the identifier
    const normalized = parsed.entity_type
      ? normalizeEntityValue(parsed.entity_type, parsed.identifier)
      : parsed.identifier.trim().toLowerCase();

    // Search in entities table by canonical_name or aliases
    let query = db
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
      const { data: entityById, error: idError } = await db
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

    // If still no match, try semantic search (when keyword returns 0)
    if (!entities || entities.length === 0) {
      const userId = this.getAuthenticatedUserId(undefined);
      const { entityIds } = await semanticSearchEntities({
        searchText: parsed.identifier,
        userId,
        entityType: parsed.entity_type,
        includeMerged: false,
        limit: 100,
        offset: 0,
      });

      if (entityIds.length > 0) {
        const { queryEntities } = await import("./services/entity_queries.js");
        const semanticEntities = await queryEntities({
          userId,
          includeMerged: false,
          entityIds,
          limit: 100,
          offset: 0,
        });
        const entitiesWithSnapshots = semanticEntities.map((e) => ({
          id: e.entity_id,
          entity_type: e.entity_type,
          canonical_name: e.canonical_name,
          snapshot: e.snapshot,
        }));
        return this.buildTextResponse({
          entities: entitiesWithSnapshots,
          total: entitiesWithSnapshots.length,
        });
      }
    }

    // Optionally include snapshots for found entities
    let entitiesWithSnapshots = entities || [];
    if (entitiesWithSnapshots.length > 0) {
      const entityIds = entitiesWithSnapshots.map((e: Entity) => e.id);
      const { data: snapshots, error: snapError } = await db
        .from("entity_snapshots")
        .select("*")
        .in("entity_id", entityIds);

      if (!snapError && snapshots) {
        const snapshotMap = new Map(snapshots.map((s: { entity_id: string }) => [s.entity_id, s]));
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
    const parsed = RetrieveRelatedEntitiesSchema.parse(args ?? {});

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
          let outboundQuery = db
            .from("relationship_snapshots")
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
          let inboundQuery = db
            .from("relationship_snapshots")
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
      const { data: entityData, error: entityError } = await db
        .from("entities")
        .select("*")
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await db
          .from("entity_snapshots")
          .select("*")
          .in("entity_id", Array.from(relatedEntityIds));

        if (!snapError && snapshots) {
          const snapshotMap = new Map(
            snapshots.map((s: { entity_id: string }) => [s.entity_id, s])
          );
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
    const parsed = RetrieveGraphNeighborhoodSchema.parse(args ?? {});

    const includeSources = parsed.include_sources;

    const result: any = {
      node_id: parsed.node_id,
      node_type: parsed.node_type,
    };

    if (parsed.node_type === "entity") {
      // Get entity
      const { data: entity, error: entityError } = await db
        .from("entities")
        .select("*")
        .eq("id", parsed.node_id)
        .single();

      if (entityError || !entity) {
        throw new McpError(ErrorCode.InvalidParams, `Entity not found: ${parsed.node_id}`);
      }

      result.entity = entity;

      // Get entity snapshot
      const { data: snapshot, error: snapError } = await db
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", parsed.node_id)
        .single();

      if (!snapError && snapshot) {
        result.entity_snapshot = snapshot;
      }

      // Get relationships
      if (parsed.include_relationships) {
        const { data: relationships, error: relError } = await db
          .from("relationship_snapshots")
          .select("*")
          .or(`source_entity_id.eq.${parsed.node_id},target_entity_id.eq.${parsed.node_id}`);

        if (!relError && relationships) {
          result.relationships = relationships;
          const relatedEntityIds = new Set<string>();
          relationships.forEach((rel: { source_entity_id: string; target_entity_id: string }) => {
            if (rel.source_entity_id !== parsed.node_id) {
              relatedEntityIds.add(rel.source_entity_id);
            }
            if (rel.target_entity_id !== parsed.node_id) {
              relatedEntityIds.add(rel.target_entity_id);
            }
          });

          // Get related entities
          if (relatedEntityIds.size > 0) {
            const { data: relatedEntities, error: relEntError } = await db
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
        const { data: observations, error: obsError } = await db
          .from("observations")
          .select("*")
          .eq("entity_id", parsed.node_id)
          .order("observed_at", { ascending: false })
          .limit(100);

        if (!obsError && observations) {
          result.observations = observations;

          // Get sources for observations
          if (includeSources && observations.length > 0) {
            const sourceIds = observations
              .map((obs: any) => obs.source_id)
              .filter((id: string) => id);
            if (sourceIds.length > 0) {
              const { data: sources, error: sourceError } = await db
                .from("sources")
                .select("id, mime_type, file_size, original_filename, created_at")
                .in("id", sourceIds);

              if (!sourceError && sources) {
                result.related_sources = sources;

                // Get events for these sources
                if (parsed.include_events) {
                  const { data: events, error: evtError } = await db
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
      const { data: source, error: sourceError } = await db
        .from("sources")
        .select("*")
        .eq("id", parsed.node_id)
        .single();

      if (sourceError || !source) {
        throw new McpError(ErrorCode.InvalidParams, `Source not found: ${parsed.node_id}`);
      }

      result.source = source;

      // Get timeline events for this source
      if (parsed.include_events) {
        const { data: events, error: evtError } = await db
          .from("timeline_events")
          .select("*")
          .eq("source_id", parsed.node_id);

        if (!evtError && events) {
          result.timeline_events = events;
        }
      }

      // Get observations from this source
      const { data: observations, error: obsError } = await db
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
            const { data: entities, error: entError } = await db
              .from("entities")
              .select("*")
              .in("id", entityIds);

            if (!entError && entities) {
              result.related_entities = entities;

              // Get relationships for these entities
              if (parsed.include_relationships && entities.length > 0) {
                const { data: relationships, error: relError } = await db
                  .from("relationship_snapshots")
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
    const parsed = ListEntityTypesRequestSchema.parse(args ?? {});

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const entityTypes = await schemaRegistry.listEntityTypes(parsed.keyword);

      // When no keyword, always return summary to avoid huge payload (all types × full schema).
      // When keyword is provided, respect summary param (default full detail for the few matches).
      const useSummary =
        parsed.keyword === undefined || parsed.keyword === "" ? true : parsed.summary;

      const responseData = useSummary
        ? {
            entity_types: entityTypes.map((et) => ({
              entity_type: et.entity_type,
              schema_version: et.schema_version,
              field_count: et.field_names?.length || 0,
            })),
            total: entityTypes.length,
            keyword: parsed.keyword || null,
            search_method: parsed.keyword
              ? entityTypes[0]?.match_type === "vector"
                ? "vector_semantic"
                : "keyword_exact"
              : "all",
          }
        : {
            entity_types: entityTypes,
            total: entityTypes.length,
            keyword: parsed.keyword || null,
            search_method: parsed.keyword
              ? entityTypes[0]?.match_type === "vector"
                ? "vector_semantic"
                : "keyword_exact"
              : "all",
          };

      return this.buildTextResponse(responseData);
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
    const parsed = AnalyzeSchemaCandidatesRequestSchema.parse(args ?? {});

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { schemaRecommendationService } = await import("./services/schema_recommendation.js");

    try {
      const recommendations = await schemaRecommendationService.analyzeRawFragments({
        entity_type: parsed.entity_type,
        user_id: userId,
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
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to analyze schema candidates: ${error.message}`
      );
    }
  }

  /**
   * Get schema recommendations
   */
  private async getSchemaRecommendations(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = GetSchemaRecommendationsRequestSchema.parse(args);

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { schemaRecommendationService } = await import("./services/schema_recommendation.js");

    try {
      const recommendations = await schemaRecommendationService.getRecommendations({
        entity_type: parsed.entity_type,
        user_id: userId,
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
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get schema recommendations: ${error.message}`
      );
    }
  }

  /**
   * Incrementally update schema by adding fields
   */
  private async updateSchemaIncremental(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = UpdateSchemaIncrementalRequestSchema.parse(args);

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const updatedSchema = await schemaRegistry.updateSchemaIncremental({
        entity_type: parsed.entity_type,
        fields_to_add: parsed.fields_to_add,
        schema_version: parsed.schema_version,
        user_specific: parsed.user_specific,
        user_id: parsed.user_specific ? userId : undefined, // Only set user_id if user_specific
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
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update schema incrementally: ${error.message}`
      );
    }
  }

  /**
   * Register a new schema
   */
  private async registerSchema(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = RegisterSchemaRequestSchema.parse(args);

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { SchemaRegistryService } = await import("./services/schema_registry.js");
    const schemaRegistry = new SchemaRegistryService();

    try {
      const registeredSchema = await schemaRegistry.register({
        entity_type: parsed.entity_type,
        schema_version: parsed.schema_version,
        schema_definition: parsed.schema_definition as any,
        reducer_config: parsed.reducer_config as any,
        user_id: parsed.user_specific ? userId : undefined, // Only set user_id if user_specific
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

    // Unified schema: accepts file_content (unstructured), file_path, entities (structured), or both.
    const schema = z
      .object({
        user_id: z.string().uuid().optional(), // Optional - will use authenticated user_id
        idempotency_key: z.string().min(1),
        file_idempotency_key: z.string().min(1).optional(),
        // Unstructured source - EITHER file_content OR file_path
        file_content: z.string().optional(),
        file_path: z.string().optional(),
        mime_type: z.string().optional(),
        original_filename: z.string().optional(),
        interpret: z.boolean().default(true),
        interpretation_config: z.record(z.unknown()).optional(),
        // Structured source
        entities: z.array(z.record(z.unknown())).optional(),
        relationships: z
          .array(
            z.object({
              relationship_type: z.string(),
              source_index: z.number().int().min(0),
              target_index: z.number().int().min(0),
            })
          )
          .optional(),
        source_priority: z.number().default(100),
      })
      .refine(
        (data) => {
          // Must have either file_content+mime_type OR file_path OR entities (or both structured+unstructured)
          const hasFileContent = data.file_content && data.mime_type;
          const hasFilePath = data.file_path;
          const hasEntities = data.entities && data.entities.length > 0;
          return hasFileContent || hasFilePath || hasEntities;
        },
        { message: "Must provide either (file_content+mime_type) OR file_path OR entities array" }
      );

    const parsed = schema.parse(args);

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);
    const idempotencyKey = parsed.idempotency_key;

    const hasEntities = Boolean(parsed.entities && parsed.entities.length > 0);
    const hasUnstructured = Boolean((parsed.file_content && parsed.mime_type) || parsed.file_path);

    let structuredResponsePayload: Record<string, unknown> | undefined;
    if (hasEntities) {
      const structuredResponse = await this.storeStructuredInternal(
        userId,
        parsed.entities as Record<string, unknown>[],
        parsed.source_priority,
        idempotencyKey,
        parsed.original_filename,
        parsed.relationships
      );
      try {
        const text = structuredResponse.content[0]?.text ?? "{}";
        structuredResponsePayload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        structuredResponsePayload = { success: true };
      }
      if (!hasUnstructured) {
        return structuredResponse;
      }
    }

    if (hasEntities && hasUnstructured) {
      // Use a distinct idempotency key for the file so the unstructured source is not confused
      // with the structured source (which already claimed idempotency_key). Otherwise reinterpret
      // would run on the JSON body instead of the PDF. See docs/reports/neotoma_pdf_interpreted_as_note_investigation_2026_02_23.md
      const fileIdempotencyKey =
        parsed.file_idempotency_key ?? (parsed.idempotency_key ? `${parsed.idempotency_key}-file` : undefined);
      const unstructuredOnlyArgs = {
        ...parsed,
        idempotency_key: fileIdempotencyKey,
      };
      delete (unstructuredOnlyArgs as Record<string, unknown>).entities;
      delete (unstructuredOnlyArgs as Record<string, unknown>).relationships;
      const unstructuredResponse = await this.store(unstructuredOnlyArgs);
      let unstructuredPayload: Record<string, unknown>;
      try {
        const text = unstructuredResponse.content[0]?.text ?? "{}";
        unstructuredPayload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        unstructuredPayload = {};
      }
      return this.buildTextResponse({
        structured: structuredResponsePayload,
        unstructured: unstructuredPayload,
      });
    }

    // Handle unstructured source (file content OR file path)
    let fileBuffer: Buffer;
    let detectedMimeType: string;
    let detectedFilename: string;

    if (idempotencyKey) {
      const { data: existingSource, error: existingSourceError } = await db
        .from("sources")
        .select("id, content_hash, file_size")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingSourceError) {
        throw new Error(`Failed to check idempotency key: ${existingSourceError.message}`);
      }

      if (existingSource) {
        if (!parsed.interpret) {
          return this.buildTextResponse({
            source_id: existingSource.id,
            content_hash: existingSource.content_hash,
            file_size: existingSource.file_size,
            deduplicated: true,
            interpretation: { skipped: true, reason: "interpret_false" },
            interpretation_debug: {
              interpret_requested: false,
              deduplicated: true,
              existing_observations_count: 0,
              should_run: false,
              reason: "interpret_false",
            },
            related_entities: [],
            related_relationships: [],
          });
        }
        // Idempotency-key hit with interpret=true: run reinterpret (download, extract, runInterpretation).
        const {
          runInterpretation: runInterpretationForIdempotency,
          runInterpretationWithFixedPoint: runInterpretationWithFixedPointForIdempotency,
          checkInterpretationQuota: checkInterpretationQuotaForIdempotency,
        } = await import("./services/interpretation.js");
        const { getSourceMetadata, downloadRawContent } = await import("./services/raw_storage.js");
        const source = await getSourceMetadata(existingSource.id);
        const isCsvIdem =
          (source.mime_type || "").toLowerCase() === "text/csv" ||
          (source.original_filename || "").toLowerCase().endsWith(".csv");
        const quota = isCsvIdem
          ? { allowed: true, current: 0, limit: 0 }
          : await checkInterpretationQuotaForIdempotency(userId);
        if (!quota.allowed) {
          const existingEntityIds = await this.getEntityIdsFromSource(existingSource.id);
          const relatedData = await this.getRelatedEntitiesAndRelationships(existingEntityIds);
          return this.buildTextResponse({
            source_id: existingSource.id,
            content_hash: existingSource.content_hash,
            file_size: existingSource.file_size,
            deduplicated: true,
            interpretation: { skipped: true, reason: "quota_exceeded", quota },
            interpretation_debug: {
              interpret_requested: true,
              deduplicated: true,
              existing_observations_count: existingEntityIds.length,
              should_run: true,
              reason: "quota_exceeded",
            },
            related_entities: relatedData.entities,
            related_relationships: relatedData.relationships,
          });
        }
        // Missing file in sources_prod fails the request so data is not silently lost
        const idempotencyFileBuffer = await downloadRawContent(source.storage_url);
        const rawText = await extractTextFromBuffer(
          idempotencyFileBuffer,
          source.mime_type,
          source.original_filename || "file"
        );
        if (!isCsvIdem && !isLLMExtractionAvailable()) {
          const existingEntityIds = await this.getEntityIdsFromSource(existingSource.id);
          const relatedData = await this.getRelatedEntitiesAndRelationships(existingEntityIds);
          return this.buildTextResponse({
            source_id: existingSource.id,
            content_hash: existingSource.content_hash,
            file_size: existingSource.file_size,
            deduplicated: true,
            interpretation: {
              skipped: true,
              reason: "openai_not_configured",
              message: "Set OPENAI_API_KEY in .env to enable AI interpretation",
            },
            interpretation_debug: {
              interpret_requested: true,
              deduplicated: true,
              existing_observations_count: existingEntityIds.length,
              should_run: true,
              reason: "openai_not_configured",
            },
            related_entities: relatedData.entities,
            related_relationships: relatedData.relationships,
          });
        }
        const existingEntityIdsForDebug = await this.getEntityIdsFromSource(existingSource.id);
        const idempotencyPdfDebug = getPdfWorkerDebug();
        const idempotencyExtractionDebug: {
          raw_text_length?: number;
          extraction_field_keys?: string[];
          used_vision_fallback?: boolean;
          vision_fallback_attempted?: boolean;
          vision_fallback_image_got?: boolean;
          vision_fallback_image_error?: string;
          vision_fallback_error?: string;
          pdf_worker_wrapper_used?: boolean;
          pdf_worker_wrapper_path_tried?: string | null;
          pdf_worker_set_worker_error?: string;
        } = {
          raw_text_length: typeof rawText === "string" ? rawText.length : 0,
          pdf_worker_wrapper_used: idempotencyPdfDebug.configured,
          pdf_worker_wrapper_path_tried: idempotencyPdfDebug.wrapper_path_tried,
          pdf_worker_set_worker_error: idempotencyPdfDebug.set_worker_error,
        };
        const isPdfIdem =
          (source.mime_type || "").toLowerCase().includes("pdf") ||
          (source.original_filename || "").toLowerCase().endsWith(".pdf");
        let idempotencyExtractionResult:
          | Awaited<ReturnType<typeof extractWithLLM>>
          | Awaited<ReturnType<typeof extractFromCSVWithChunking>>
          | undefined = undefined;
        let idempotencyExtractedData: Array<Record<string, unknown>> = [];
        if (idempotencyExtractionDebug.raw_text_length === 0 && isPdfIdem) {
          idempotencyExtractionDebug.vision_fallback_attempted = true;
          const imageResult = await getPdfFirstPageImageDataUrl(
            idempotencyFileBuffer,
            source.mime_type,
            source.original_filename || "file",
            { returnError: true }
          );
          const imageDataUrl = typeof imageResult === "object" ? imageResult.dataUrl : imageResult;
          if (typeof imageResult === "object" && imageResult.error) {
            idempotencyExtractionDebug.vision_fallback_image_error = imageResult.error;
          }
          idempotencyExtractionDebug.vision_fallback_image_got = Boolean(imageDataUrl);
          if (imageDataUrl) {
            try {
              idempotencyExtractionResult = await extractWithLLMFromImage(
                imageDataUrl,
                source.original_filename || "file",
                source.mime_type || "text/plain",
                "gpt-4o"
              );
              idempotencyExtractionDebug.used_vision_fallback = true;
            } catch (visionErr) {
              logger.warn("Vision extraction failed (idempotency):", visionErr);
              idempotencyExtractionDebug.vision_fallback_error =
                visionErr instanceof Error ? visionErr.message : String(visionErr);
            }
          }
        }
        if (typeof idempotencyExtractionResult === "undefined") {
          if (isCsvIdem) {
            const { extractEntitiesFromCsvRows } = await import("./services/csv_row_extraction.js");
            const csvExtracted = extractEntitiesFromCsvRows(
              idempotencyFileBuffer,
              source.original_filename || "file"
            );
            idempotencyExtractionDebug.extraction_field_keys = csvExtracted.flatMap((row) =>
              Object.keys(row).filter((k) => k !== "entity_type" && k !== "type")
            );
            idempotencyExtractedData = csvExtracted;
          } else {
            idempotencyExtractionResult = await extractWithLLM(
                rawText,
                source.original_filename || "file",
                source.mime_type || "text/plain",
                "gpt-4o"
              );
          }
        }
        if (idempotencyExtractedData.length === 0 && idempotencyExtractionResult) {
          if ("entities" in idempotencyExtractionResult) {
            const multiResult = idempotencyExtractionResult as {
              entities: Array<{ entity_type: string; fields: Record<string, unknown> }>;
            };
            idempotencyExtractedData = multiResult.entities.map((entity) => ({
              entity_type: entity.entity_type,
              ...entity.fields,
            }));
            idempotencyExtractionDebug.extraction_field_keys =
              multiResult.entities.flatMap((e) =>
                Object.keys(e.fields ?? {}).filter((k) => k !== "entity_type" && k !== "type")
              );
          } else {
            const { entity_type, fields } = idempotencyExtractionResult;
            idempotencyExtractionDebug.extraction_field_keys = Object.keys(fields ?? {}).filter(
              (k) => k !== "entity_type" && k !== "type"
            );
            idempotencyExtractedData = [{ entity_type, ...fields }];
          }
        }
        const defaultConfig = config.openaiApiKey
          ? {
              provider: "openai",
              model_id: "gpt-4o",
              temperature: 0,
              prompt_hash: "llm_extraction_v2_idempotent",
              code_version: "v0.2.0",
            }
          : {
              provider: "rule_based",
              model_id: "neotoma_v1",
              temperature: 0,
              prompt_hash: "n/a",
              code_version: "v0.2.0",
            };
        const idempotencyInterpretationConfig = parsed.interpretation_config
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
        const idempotencyFeatureFlags = parsed.interpretation_config?.feature_flags as
          | Record<string, boolean>
          | undefined;
        const useFixedPoint = idempotencyFeatureFlags?.use_fixed_point ?? false;
        let idempotencyInterpretationResult;
        try {
          idempotencyInterpretationResult = useFixedPoint
            ? await runInterpretationWithFixedPointForIdempotency({
                userId,
                sourceId: existingSource.id,
                extractedData: idempotencyExtractedData,
                config: idempotencyInterpretationConfig,
              })
            : await runInterpretationForIdempotency({
                userId,
                sourceId: existingSource.id,
                extractedData: idempotencyExtractedData,
                config: idempotencyInterpretationConfig,
              });
        } catch (interpretError) {
          logger.error("Interpretation error (idempotency-key reinterpret):", interpretError);
          idempotencyInterpretationResult = {
            error:
              interpretError instanceof Error ? interpretError.message : String(interpretError),
            skipped: true,
            reason: "interpretation_failed",
          };
        }
        let idempotencyEntityIds: string[] = [];
        if (
          idempotencyInterpretationResult &&
          !(
            "skipped" in idempotencyInterpretationResult && idempotencyInterpretationResult.skipped
          ) &&
          (idempotencyInterpretationResult as { entities?: { entityId: string }[] }).entities
        ) {
          idempotencyEntityIds = (
            idempotencyInterpretationResult as { entities: { entityId: string }[] }
          ).entities.map((e) => e.entityId);
        } else {
          idempotencyEntityIds = await this.getEntityIdsFromSource(existingSource.id);
        }
        const         idempotencyRelatedData =
          await this.getRelatedEntitiesAndRelationships(idempotencyEntityIds);
        return this.buildTextResponse({
          source_id: existingSource.id,
          content_hash: existingSource.content_hash,
          file_size: existingSource.file_size,
          deduplicated: true,
          interpretation: idempotencyInterpretationResult,
          interpretation_debug: {
            interpret_requested: true,
            deduplicated: true,
            existing_observations_count: existingEntityIdsForDebug.length,
            should_run: true,
            reason: "idempotency_key_reinterpret",
            ...idempotencyExtractionDebug,
          },
          related_entities: idempotencyRelatedData.entities,
          related_relationships: idempotencyRelatedData.relationships,
          entity_debug: {
            entity_ids_retrieved: idempotencyEntityIds,
            valid_entity_ids: idempotencyEntityIds.filter((id) => id != null),
          },
        });
      }
    }

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
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              new Promise<never>((_resolve, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `Parquet read timeout after ${PARQUET_READ_TIMEOUT / 1000}s. File may be too large or on slow network storage.`
                      )
                    ),
                  PARQUET_READ_TIMEOUT
                )
              ),
            ]);
          } catch (parquetError: any) {
            // If error contains BigInt serialization, provide clearer message
            if (
              parquetError?.message?.includes("BigInt") ||
              parquetError?.message?.includes("serialize")
            ) {
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
          const safeRowCount =
            typeof parquetResult.metadata.row_count === "bigint"
              ? Number(parquetResult.metadata.row_count)
              : parquetResult.metadata.row_count;
          logger.error(
            `[STORE] Read ${safeRowCount} rows from parquet file (entity_type: ${parquetResult.metadata.entity_type})`
          );

          // Process as structured entities
          return await this.storeStructuredInternal(
            userId,
            parquetResult.entities,
            parsed.source_priority,
            idempotencyKey,
            parsed.original_filename
          );
        } catch (error: any) {
          // Safely extract error message, handling potential BigInt values
          let errorMessage = "Unknown error";
          try {
            if (error?.message) {
              errorMessage = String(error.message);
            } else if (typeof error === "string") {
              errorMessage = error;
            } else {
              // Try to stringify with BigInt replacer
              errorMessage = JSON.stringify(error, (key, value) => {
                if (typeof value === "bigint") {
                  return Number(value);
                }
                return value;
              });
            }
          } catch {
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
      userId: userId,
      fileBuffer,
      mimeType: detectedMimeType,
      originalFilename: detectedFilename,
      idempotencyKey,
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

    // Check if interpretation should run: when interpret=true, always run (first time or reinterpret).
    const existingEntityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
    const shouldRunInterpretation = parsed.interpret;

    // Add debug info to result
    result.interpretation_debug = {
      interpret_requested: parsed.interpret,
      deduplicated: storageResult.deduplicated,
      existing_observations_count: existingEntityIds.length,
      should_run: shouldRunInterpretation,
    };

    if (shouldRunInterpretation) {
      try {
        const isCsvFile =
          detectedMimeType?.toLowerCase() === "text/csv" ||
          detectedFilename?.toLowerCase().endsWith(".csv");

        // CSV extraction is deterministic/rule-based and does not consume LLM quota.
        const quota = isCsvFile
          ? { allowed: true, current: 0, limit: 0 }
          : await checkInterpretationQuota(userId);
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

        // Extract data from file using AI interpretation
        const rawText = await extractTextFromBuffer(fileBuffer, detectedMimeType, detectedFilename);

        // Debug: surface extraction input/output so store response shows why refinement may have few keys
        const extractionDebug: {
          raw_text_length?: number;
          extraction_field_keys?: string[];
          used_vision_fallback?: boolean;
          vision_fallback_attempted?: boolean;
          vision_fallback_image_got?: boolean;
          vision_fallback_image_error?: string;
          vision_fallback_error?: string;
          pdf_worker_wrapper_used?: boolean;
          pdf_worker_wrapper_path_tried?: string | null;
          pdf_worker_set_worker_error?: string;
        } = {};
        extractionDebug.raw_text_length = typeof rawText === "string" ? rawText.length : 0;
        const pdfDebug = getPdfWorkerDebug();
        extractionDebug.pdf_worker_wrapper_used = pdfDebug.configured;
        extractionDebug.pdf_worker_wrapper_path_tried = pdfDebug.wrapper_path_tried;
        extractionDebug.pdf_worker_set_worker_error = pdfDebug.set_worker_error;

        // Check if OpenAI is configured for non-CSV interpretation paths
        if (!isCsvFile && !isLLMExtractionAvailable()) {
          return this.buildTextResponse({
            ...result,
            interpretation: {
              skipped: true,
              reason: "openai_not_configured",
              message: "Set OPENAI_API_KEY in .env to enable AI interpretation",
            },
          });
        }

        // When PDF text is empty (e.g. scanned/image-only), use vision on first page
        const isPdf =
          detectedMimeType?.toLowerCase().includes("pdf") ||
          detectedFilename?.toLowerCase().endsWith(".pdf");
        let extractionResult:
          | Awaited<ReturnType<typeof extractWithLLM>>
          | Awaited<ReturnType<typeof extractFromCSVWithChunking>>
          | undefined = undefined;
        let extractedData: Array<Record<string, unknown>> = [];
        if (extractionDebug.raw_text_length === 0 && isPdf) {
          extractionDebug.vision_fallback_attempted = true;
          const imageResult = await getPdfFirstPageImageDataUrl(
            fileBuffer,
            detectedMimeType,
            detectedFilename,
            { returnError: true }
          );
          const imageDataUrl = typeof imageResult === "object" ? imageResult.dataUrl : imageResult;
          if (typeof imageResult === "object" && imageResult.error) {
            extractionDebug.vision_fallback_image_error = imageResult.error;
          }
          extractionDebug.vision_fallback_image_got = Boolean(imageDataUrl);
          if (imageDataUrl) {
            try {
              extractionResult = await extractWithLLMFromImage(
                imageDataUrl,
                detectedFilename,
                detectedMimeType,
                "gpt-4o"
              );
              extractionDebug.used_vision_fallback = true;
            } catch (visionErr) {
              logger.warn("Vision extraction failed:", visionErr);
              extractionDebug.vision_fallback_error =
                visionErr instanceof Error ? visionErr.message : String(visionErr);
            }
          }
        }
        if (typeof extractionResult === "undefined") {
          if (isCsvFile) {
            const { extractEntitiesFromCsvRows } = await import("./services/csv_row_extraction.js");
            extractedData = extractEntitiesFromCsvRows(fileBuffer, detectedFilename);
            extractionDebug.extraction_field_keys = extractedData.flatMap((row) =>
              Object.keys(row).filter((k) => k !== "entity_type" && k !== "type")
            );
          } else {
            extractionResult = await extractWithLLM(
                rawText,
                detectedFilename,
                detectedMimeType,
                "gpt-4o" // Will be overridden by interpretationConfig.model_id if specified
              );
          }
        }

        // Handle both single entity (LLMExtractionResult) and multi-entity (MultiEntityExtractionResult) results
        if (extractedData.length === 0 && extractionResult) {
          if ("entities" in extractionResult) {
            // Multi-entity result from CSV chunking
            const multiResult = extractionResult as {
              entities: Array<{ entity_type: string; fields: Record<string, unknown> }>;
            };
            extractedData = multiResult.entities.map((entity) => ({
              entity_type: entity.entity_type,
              ...entity.fields,
            }));
          } else {
            // Single entity result
            const { entity_type, fields } = extractionResult;
            extractionDebug.extraction_field_keys = Object.keys(fields ?? {}).filter(
              (k) => k !== "entity_type" && k !== "type"
            );
            extractedData = [
              {
                entity_type,
                ...fields,
              },
            ];
          }
          if ("entities" in extractionResult) {
            const multiResult = extractionResult as {
              entities: Array<{ entity_type: string; fields: Record<string, unknown> }>;
            };
            extractionDebug.extraction_field_keys = multiResult.entities.flatMap((e) =>
              Object.keys(e.fields ?? {}).filter((k) => k !== "entity_type" && k !== "type")
            );
          }
        }

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
              userId: userId,
              sourceId: storageResult.sourceId,
              extractedData,
              config: interpretationConfig,
            })
          : await runInterpretation({
              userId: userId,
              sourceId: storageResult.sourceId,
              extractedData,
              config: interpretationConfig,
            });

        result.interpretation = interpretationResult;
        result.interpretation_debug = {
          ...result.interpretation_debug,
          ...extractionDebug,
        };

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
    } else if (storageResult.deduplicated && parsed.interpret) {
      // File was deduplicated and interpretation not requested or already has observations
      // Get existing entities from this source
      const { data: observations, error: obsError } = await db
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
        const { data: entityData, error: entityError } = await db
          .from("entities")
          .select("*")
          .in("id", validEntityIds);

        if (!entityError && entityData) {
          entities = entityData;

          // Include snapshots
          const { data: snapshots, error: snapError } = await db
            .from("entity_snapshots")
            .select("*")
            .in("entity_id", validEntityIds);

          if (!snapError && snapshots) {
            const snapshotMap = new Map(
              snapshots.map((s: { entity_id: string }) => [s.entity_id, s])
            );
            entities = entities.map((entity) => ({
              ...entity,
              snapshot: snapshotMap.get(entity.id) || null,
            }));
          }
        }
      }

      // Add debug info about entity retrieval (merge with any existing entity_debug from dedup path so client keeps entity_ids_retrieved)
      const existingDebug = (result as { entity_debug?: Record<string, unknown> }).entity_debug ?? {};
      result.entity_debug = {
        ...existingDebug,
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
    const { data: observations, error } = await db
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
      observations.map((obs: { id: string; entity_id: string | null }) => ({
        obs_id: obs.id,
        entity_id: obs.entity_id,
      }))
    );

    // Get unique entity IDs, filtering out null/undefined
    const entityIds: string[] = Array.from(
      new Set(
        observations
          .map((obs: { entity_id?: string | null }) => obs.entity_id)
          .filter((id: string | null | undefined): id is string => id != null)
      )
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
    const { data: outboundRels, error: outError } = await db
      .from("relationship_snapshots")
      .select("*")
      .in("source_entity_id", entityIds);

    if (!outError && outboundRels) {
      allRelationships.push(...outboundRels);
      for (const rel of outboundRels) {
        relatedEntityIds.add(rel.target_entity_id);
      }
    }

    const { data: inboundRels, error: inError } = await db
      .from("relationship_snapshots")
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
      const { data: entityData, error: entityError } = await db
        .from("entities")
        .select("*")
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await db
          .from("entity_snapshots")
          .select("*")
          .in("entity_id", Array.from(relatedEntityIds));

        if (!snapError && snapshots) {
          const snapshotMap = new Map(
            snapshots.map((s: { entity_id: string }) => [s.entity_id, s])
          );
          entities = entities.map((entity) => ({
            ...entity,
            snapshot: snapshotMap.get(entity.id) || null,
          }));
        }
      }
    }

    return { entities, relationships: allRelationships };
  }

  // Internal helper for structured source storing
  private async storeStructuredInternal(
    userId: string,
    entities: Record<string, unknown>[],
    sourcePriority: number = 100,
    idempotencyKey?: string,
    originalFilename?: string,
    relationships?: Array<{ relationship_type: string; source_index: number; target_index: number }>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { storeRawContent } = await import("./services/raw_storage.js");
    const { resolveEntity } = await import("./services/entity_resolution.js");
    const { schemaRegistry } = await import("./services/schema_registry.js");
    const { validateFieldsWithConverters } = await import("./services/field_validation.js");
    const { generateObservationId } = await import("./services/observation_identity.js");
    const { db } = await import("./db.js");

    if (idempotencyKey) {
      const { data: existingSource, error: existingSourceError } = await db
        .from("sources")
        .select("id")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingSourceError) {
        throw new Error(`Failed to check idempotency key: ${existingSourceError.message}`);
      }

      if (existingSource) {
        const { data: existingObservations, error: obsError } = await db
          .from("observations")
          .select("id, entity_id, entity_type")
          .eq("source_id", existingSource.id)
          .eq("user_id", userId);

        if (obsError) {
          throw new Error(`Failed to fetch existing observations: ${obsError.message}`);
        }

        const existingEntityIds =
          existingObservations?.map(
            (obs: { id: string; entity_id: string; entity_type: string }) => obs.entity_id
          ) ?? [];
        const relatedData = await this.getRelatedEntitiesAndRelationships(existingEntityIds);
        const { count: unknownFieldsCount } = await db
          .from("raw_fragments")
          .select("id", { count: "exact", head: true })
          .eq("source_id", existingSource.id)
          .eq("user_id", userId);

        return this.buildTextResponse({
          source_id: existingSource.id,
          entities:
            existingObservations?.map(
              (obs: { id: string; entity_id: string; entity_type: string }) => ({
                entity_id: obs.entity_id,
                entity_type: obs.entity_type,
                observation_id: obs.id,
              })
            ) ?? [],
          unknown_fields_count: unknownFieldsCount || 0,
          related_entities: relatedData.entities,
          related_relationships: relatedData.relationships,
        });
      }
    }

    // Store structured data as JSON source
    // Use replacer to handle BigInt values (convert to number)
    const jsonContent = JSON.stringify(
      entities,
      (key, value) => {
        if (typeof value === "bigint") {
          return Number(value);
        }
        return value;
      },
      2
    );
    const fileBuffer = Buffer.from(jsonContent, "utf-8");

    // Omit filename when not provided: agent-provided structured data has no real file origin.
    const filenameForStorage = originalFilename?.trim() || undefined;
    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType: "application/json",
      originalFilename: filenameForStorage,
      idempotencyKey,
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

      // Load schema for validation from database
      let schema = await schemaRegistry.loadActiveSchema(entityType, userId);

      if (!schema) {
        // Auto-create user-specific schema from structured data
        logger.error(`[STORE] No schema found for "${entityType}", inferring from data structure`);

        const { inferSchemaFromEntities } = await import("./services/schema_inference.js");

        const inferredSchema = await inferSchemaFromEntities(entities, entityType);

        // Use global scope for default test user, user-specific otherwise
        const defaultUserId = "00000000-0000-0000-0000-000000000000";
        const isDefaultUser = userId === defaultUserId;

        // Check if this is a test schema (by entity_type pattern)
        const isTestEntityType =
          /^test$/i.test(entityType) ||
          /^test_/i.test(entityType) ||
          /_test$/i.test(entityType) ||
          /^test\d+$/i.test(entityType) ||
          /^test_record$/i.test(entityType) ||
          /^test_entity$/i.test(entityType) ||
          /^test_schema$/i.test(entityType) ||
          /^auto_test/i.test(entityType) ||
          /_auto_test/i.test(entityType);

        // Mark test schemas with metadata
        const metadata = isTestEntityType
          ? { test: true, test_marked_at: new Date().toISOString() }
          : undefined;

        schema = await schemaRegistry.register({
          entity_type: entityType,
          schema_version: "1.0",
          schema_definition: inferredSchema.schemaDefinition,
          reducer_config: inferredSchema.reducerConfig,
          user_id: isDefaultUser ? undefined : userId,
          user_specific: !isDefaultUser,
          activate: true,
          metadata,
        });

        logger.error(
          `[STORE] Auto-created ${isDefaultUser ? "global" : "user-specific"} schema for "${entityType}" ` +
            `(version 1.0, ${Object.keys(inferredSchema.schemaDefinition.fields).length} fields)`
        );
      }

      // Validate fields against schema (with converter support)
      const validationResult = validateFieldsWithConverters(
        fieldsToValidate,
        schema.schema_definition.fields
      );
      const validFields = validationResult.validFields;
      const unknownFields = validationResult.unknownFields;
      const originalValues = validationResult.originalValues;

      // Include date-like unknown fields in the observation so they flow into the snapshot
      // and timeline derivation, even when not yet in the entity schema.
      const { getDateLikeFields } = await import("./services/timeline_events.js");
      const dateLikeUnknowns = getDateLikeFields(unknownFields);
      const fieldsForObservation =
        Object.keys(dateLikeUnknowns).length > 0
          ? { ...validFields, ...dateLikeUnknowns }
          : validFields;

      const { storeConvertedOriginals, storeUnknownFields } = await import(
        "./services/raw_fragments.js"
      );
      const schemaVer = schema?.schema_version || "1.0";

      await storeConvertedOriginals({
        sourceId: storageResult.sourceId,
        userId,
        entityType,
        schemaVersion: schemaVer,
        originalValues,
        validFields,
      });

      unknownFieldsCount += await storeUnknownFields({
        sourceId: storageResult.sourceId,
        userId,
        entityType,
        schemaVersion: schemaVer,
        unknownFields,
      });

      // Resolve entity (user-scoped)
      const entityId = await resolveEntity({
        entityType,
        fields: validFields,
        userId,
      });

      // Create observation directly (no interpretation_id).
      // Use fieldsForObservation so date-like unknowns are in the observation and thus
      // in the snapshot and timeline, even when not in the schema yet.
      const observationId = generateObservationId(
        storageResult.sourceId,
        null,
        entityId,
        fieldsForObservation
      );
      const { error: obsError } = await db.from("observations").insert({
        id: observationId,
        entity_id: entityId,
        entity_type: entityType,
        schema_version: schema?.schema_version || "1.0",
        source_id: storageResult.sourceId,
        interpretation_id: null, // No interpretation run for structured data
        observed_at: new Date().toISOString(),
        specificity_score: 1.0, // Structured data has high specificity
        source_priority: sourcePriority, // Use provided priority (default 100)
        fields: fieldsForObservation,
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
        const { data: allObservations, error: obsError } = await db
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
            source_id: obs.source_id || "",
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

          if (!snapshot) {
            continue; // Skip snapshot and timeline derivation if snapshot computation failed
          }

          const rowWithEmbedding = await prepareEntitySnapshotWithEmbedding({
            entity_id: snapshot.entity_id,
            entity_type: snapshot.entity_type,
            schema_version: snapshot.schema_version,
            snapshot: snapshot.snapshot,
            computed_at: snapshot.computed_at,
            observation_count: snapshot.observation_count,
            last_observation_at: snapshot.last_observation_at,
            provenance: snapshot.provenance,
            user_id: snapshot.user_id,
          });
          await upsertEntitySnapshotWithEmbedding(rowWithEmbedding);

          // Derive and insert timeline events from date fields in snapshot
          const { deriveTimelineEventsFromSnapshot, deriveTimelineEventsFromRawFragments } =
            await import("./services/timeline_events.js");
          const snapshotFields = (snapshot.snapshot as Record<string, unknown>) || {};
          let timelineRows = deriveTimelineEventsFromSnapshot(
            snapshot.entity_type,
            snapshot.entity_id,
            storageResult.sourceId,
            snapshot.user_id || userId,
            snapshotFields
          );

          // Fallback: when exactly one entity of this type in this batch, also derive from
          // raw_fragments so date fields that didn't make it into the observation still get events.
          const sameTypeInBatch = createdEntities.filter(
            (e) => e.entityType === createdEntity.entityType
          ).length;
          if (sameTypeInBatch === 1) {
            const { data: fragments } = await db
              .from("raw_fragments")
              .select("fragment_key, fragment_value")
              .eq("source_id", storageResult.sourceId)
              .eq("entity_type", createdEntity.entityType)
              .eq("user_id", userId);
            if (fragments && fragments.length > 0) {
              const snapshotKeys = new Set(Object.keys(snapshotFields));
              const fromFragments = deriveTimelineEventsFromRawFragments(
                fragments,
                snapshot.entity_type,
                snapshot.entity_id,
                storageResult.sourceId,
                snapshot.user_id || userId,
                snapshotKeys
              );
              timelineRows = timelineRows.concat(fromFragments);
            }
          }

          for (const row of timelineRows) {
            const { error: evtError } = await db.from("timeline_events").upsert(
              {
                id: row.id,
                event_type: row.event_type,
                event_timestamp: row.event_timestamp,
                source_id: row.source_id,
                source_field: row.source_field,
                entity_id: row.entity_id,
                created_at: row.created_at,
                user_id: row.user_id,
              },
              { onConflict: "id" }
            );
            if (evtError) {
              logger.warn(`Failed to upsert timeline event ${row.id}:`, evtError.message);
            }
          }
        }
      } catch (error) {
        logger.error(
          `Failed to compute snapshot for entity ${createdEntity.entityId}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Create relationships between just-created entities when requested (e.g. one-call chat: message PART_OF conversation)
    if (relationships?.length) {
      const { relationshipsService } = await import("./services/relationships.js");
      const entityIds = createdEntities.map((e) => e.entityId);
      for (const rel of relationships) {
        if (rel.source_index >= entityIds.length || rel.target_index >= entityIds.length) {
          logger.warn(
            `store_structured: relationship index out of range (source_index=${rel.source_index}, target_index=${rel.target_index}, entities.length=${entityIds.length}); skipping`
          );
          continue;
        }
        const sourceEntityId = entityIds[rel.source_index];
        const targetEntityId = entityIds[rel.target_index];
        try {
          await relationshipsService.createRelationship({
            relationship_type: rel.relationship_type as RelationshipType,
            source_entity_id: sourceEntityId,
            target_entity_id: targetEntityId,
            source_id: storageResult.sourceId,
            metadata: {},
            user_id: userId,
          });
        } catch (relError) {
          logger.warn(
            `store_structured: failed to create relationship ${rel.relationship_type} ${sourceEntityId} -> ${targetEntityId}:`,
            relError instanceof Error ? relError.message : String(relError)
          );
        }
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
  // Invariant: Creates NEW observations; never modifies or deletes existing ones (docs/foundation/philosophy.md, docs/architecture/determinism.md).
  private async reinterpret(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getSourceMetadata, downloadRawContent } = await import("./services/raw_storage.js");
    const { runInterpretation, checkInterpretationQuota } =
      await import("./services/interpretation.js");

    const parsed = ReinterpretRequestSchema.parse(args);

    if (!parsed.source_id) {
      return this.buildTextResponse({
        error: "source_id_required",
        message: "source_id is required for MCP reinterpret action",
      });
    }

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

    // When this source is the "structured twin" (JSON from entities+file store) and a sibling file
    // source exists (key K + "-file"), use the file source's content for extraction so we interpret
    // the actual document instead of the message JSON. See docs/reports/neotoma_pdf_interpreted_as_note_investigation_2026_02_23.md
    let contentSource = source;
    const key = (source.idempotency_key as string) || "";
    const isStructuredTwin =
      (source.mime_type || "").toLowerCase() === "application/json" &&
      key.length > 0 &&
      !key.endsWith("-file");
    if (isStructuredTwin) {
      const { data: fileSourceRow } = await db
        .from("sources")
        .select("id, storage_url, mime_type, original_filename")
        .eq("user_id", source.user_id)
        .eq("idempotency_key", `${key}-file`)
        .maybeSingle();
      if (fileSourceRow) {
        contentSource = fileSourceRow as typeof source;
      }
    }

    // Download and re-analyze (from this source or linked file source). Missing file fails so sources_prod is not silently lost.
    const fileBuffer = await downloadRawContent(contentSource.storage_url);
    const rawText = await extractTextFromBuffer(
      fileBuffer,
      contentSource.mime_type,
      contentSource.original_filename || "file"
    );

    // Check if OpenAI is configured
    if (!isLLMExtractionAvailable()) {
      return this.buildTextResponse({
        error: "openai_not_configured",
        message: "Set OPENAI_API_KEY in .env to enable AI interpretation",
      });
    }

    // Validate and convert interpretation_config to InterpretationConfig
    const configValue = parsed.interpretation_config || {};
    const config = {
      provider: (configValue.provider as string) || "openai",
      model_id: (configValue.model_id as string) || "gpt-4o",
      temperature: (configValue.temperature as number) ?? 0,
      prompt_hash: (configValue.prompt_hash as string) || "llm_extraction_v2_idempotent",
      code_version: (configValue.code_version as string) || "v0.2.0",
      feature_flags: configValue.feature_flags as Record<string, boolean> | undefined,
    };

    const { entity_type, fields } = await extractWithLLM(
      rawText,
      contentSource.original_filename || "file",
      contentSource.mime_type,
      config.model_id
    );

    const extractedData = [
      {
        entity_type,
        ...fields,
      },
    ];

    // Run new interpretation (creates NEW observations; prior observations unchanged per immutability)
    const interpretationResult = await runInterpretation({
      userId: source.user_id,
      sourceId: parsed.source_id,
      extractedData,
      config,
    });

    const responsePayload =
      contentSource.id !== source.id
        ? { ...interpretationResult, interpretation_used_file_source: true }
        : interpretationResult;
    return this.buildTextResponse(responsePayload);
  }

  private async listUninterpretedSourceIdsForUser(userId: string, limit: number): Promise<string[]> {
    const interpretedSet = new Set<string>();
    const { data: interpretedData, error: interpretedError } = await db
      .from("interpretations")
      .select("source_id")
      .eq("user_id", userId);
    if (interpretedError) {
      throw new Error(`Failed to list interpretations: ${interpretedError.message}`);
    }
    for (const row of interpretedData || []) {
      if (row.source_id) interpretedSet.add(row.source_id);
    }

    const pageSize = Math.max(100, limit * 3);
    const sourceIds: string[] = [];
    let offset = 0;

    while (sourceIds.length < limit) {
      const { data: sourcePage, error: sourceError } = await db
        .from("sources")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (sourceError) {
        throw new Error(`Failed to list sources: ${sourceError.message}`);
      }
      if (!sourcePage || sourcePage.length === 0) {
        break;
      }

      for (const source of sourcePage) {
        if (sourceIds.length >= limit) break;
        if (interpretedSet.has(source.id)) continue;
        sourceIds.push(source.id);
      }

      if (sourcePage.length < pageSize) break;
      offset += sourcePage.length;
    }

    return sourceIds;
  }

  private async interpretUninterpreted(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = InterpretUninterpretedRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);
    const limit = parsed.limit ?? 50;
    const dryRun = parsed.dry_run ?? false;
    const sourceIds = await this.listUninterpretedSourceIdsForUser(userId, limit);

    if (dryRun) {
      return this.buildTextResponse({
        dry_run: true,
        count: sourceIds.length,
        would_interpret: sourceIds,
      });
    }

    const interpreted: Array<{
      source_id: string;
      interpretation_id?: string;
      observations_created?: number;
      success: boolean;
    }> = [];
    const errors: Array<{ source_id: string; error: string }> = [];

    for (const sourceId of sourceIds) {
      const single = await this.reinterpret({
        source_id: sourceId,
        interpretation_config: parsed.interpretation_config,
      });
      const rawText = single.content?.[0]?.text;
      if (!rawText) {
        errors.push({ source_id: sourceId, error: "Missing reinterpret response payload" });
        continue;
      }
      try {
        const parsedSingle = JSON.parse(rawText) as Record<string, unknown>;
        if (parsedSingle.error) {
          errors.push({
            source_id: sourceId,
            error: String(parsedSingle.message ?? parsedSingle.error),
          });
          continue;
        }
        interpreted.push({
          source_id: sourceId,
          interpretation_id:
            typeof parsedSingle.interpretation_id === "string"
              ? parsedSingle.interpretation_id
              : undefined,
          observations_created:
            typeof parsedSingle.observations_created === "number"
              ? parsedSingle.observations_created
              : undefined,
          success: true,
        });
      } catch {
        errors.push({ source_id: sourceId, error: "Failed to parse reinterpret response payload" });
      }
    }

    return this.buildTextResponse({
      dry_run: false,
      count: interpreted.length,
      interpreted,
      errors,
    });
  }

  // FU-125: MCP correct() Tool
  private async correct(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { schemaRegistry } = await import("./services/schema_registry.js");

    const parsed = CorrectEntityRequestSchema.parse(args);

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { data: existingObservation, error: existingObservationError } = await db
      .from("observations")
      .select("id, entity_id, entity_type, fields")
      .eq("user_id", userId)
      .eq("idempotency_key", parsed.idempotency_key)
      .maybeSingle();

    if (existingObservationError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to check idempotency key: ${existingObservationError.message}`
      );
    }

    if (existingObservation) {
      const existingFields = existingObservation.fields as Record<string, unknown> | null;
      const existingValue = existingFields ? existingFields[parsed.field] : undefined;
      const existingValueJson = JSON.stringify(existingValue);
      const incomingValueJson = JSON.stringify(parsed.value);

      if (
        existingObservation.entity_id !== parsed.entity_id ||
        existingObservation.entity_type !== parsed.entity_type ||
        existingValueJson !== incomingValueJson
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Idempotency key reuse detected with different correction payload."
        );
      }

      return this.buildTextResponse({
        observation_id: existingObservation.id,
        entity_id: parsed.entity_id,
        field: parsed.field,
        value: parsed.value,
        message: "Correction already applied for this idempotency key",
      });
    }

    // Validate entity ownership
    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("*")
      .eq("id", parsed.entity_id)
      .eq("user_id", userId)
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

    const { createCorrection } = await import("./services/correction.js");

    try {
      const result = await createCorrection({
        entity_id: parsed.entity_id,
        entity_type: parsed.entity_type,
        field: parsed.field,
        value: parsed.value,
        schema_version: schemaEntry.schema_version,
        user_id: userId,
        idempotency_key: parsed.idempotency_key,
      });

      return this.buildTextResponse({
        observation_id: result.observation_id,
        entity_id: parsed.entity_id,
        field: parsed.field,
        value: parsed.value,
        message: "Correction applied with priority 1000",
      });
    } catch (corrErr) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create correction: ${corrErr instanceof Error ? corrErr.message : String(corrErr)}`
      );
    }
  }

  // FU-126: MCP merge_entities() Tool
  private async mergeEntities(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = MergeEntitiesRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const {
      mergeEntities: mergeEntitiesService,
      EntityNotFoundError,
      EntityAlreadyMergedError,
    } = await import("./services/entity_merge.js");

    try {
      const result = await mergeEntitiesService({
        fromEntityId: parsed.from_entity_id,
        toEntityId: parsed.to_entity_id,
        userId,
        mergeReason: parsed.merge_reason,
        mergedBy: "mcp",
      });

      return this.buildTextResponse({
        from_entity_id: parsed.from_entity_id,
        to_entity_id: parsed.to_entity_id,
        observations_moved: result.observations_moved,
        merged_at: result.merged_at,
        merge_reason: parsed.merge_reason,
      });
    } catch (err) {
      if (err instanceof EntityNotFoundError) {
        throw new McpError(ErrorCode.InvalidParams, err.message);
      }
      if (err instanceof EntityAlreadyMergedError) {
        throw new McpError(ErrorCode.InvalidParams, err.message);
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to merge entities: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** MCP delete_entity: delete an entity via deletion observation (immutable, reversible for audit) */
  private async deleteEntity(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = DeleteEntityRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const result = await softDeleteEntityService(
      parsed.entity_id,
      parsed.entity_type,
      userId,
      parsed.reason
    );

    if (!result.success) {
      throw new McpError(ErrorCode.InternalError, result.error ?? "Delete entity failed");
    }

    return this.buildTextResponse({
      success: true,
      entity_id: result.entity_id,
      observation_id: result.observation_id,
      message: "Entity deleted. Excluded from snapshots and default queries.",
    });
  }

  /** MCP delete_relationship: delete a relationship via deletion observation (immutable, reversible for audit) */
  private async deleteRelationship(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = DeleteRelationshipRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);
    const relationshipKey = `${parsed.relationship_type}:${parsed.source_entity_id}:${parsed.target_entity_id}`;

    const result = await softDeleteRelationshipService(
      relationshipKey,
      parsed.relationship_type,
      parsed.source_entity_id,
      parsed.target_entity_id,
      userId,
      parsed.reason
    );

    if (!result.success) {
      throw new McpError(ErrorCode.InternalError, result.error ?? "Delete relationship failed");
    }

    return this.buildTextResponse({
      success: true,
      relationship_key: result.entity_id,
      observation_id: result.observation_id,
      message: "Relationship deleted. Excluded from snapshots and default queries.",
    });
  }

  /** MCP restore_entity: restore a deleted entity via restoration observation (priority 1001, overrides deletion) */
  private async restoreEntity(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = RestoreEntityRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const result = await restoreEntityService(
      parsed.entity_id,
      parsed.entity_type,
      userId,
      parsed.reason
    );

    if (!result.success) {
      throw new McpError(ErrorCode.InternalError, result.error ?? "Restore entity failed");
    }

    return this.buildTextResponse({
      success: true,
      entity_id: result.entity_id,
      observation_id: result.observation_id,
      message: "Entity restored. Now visible in snapshots and default queries.",
    });
  }

  /** MCP restore_relationship: restore a deleted relationship via restoration observation (priority 1001, overrides deletion) */
  private async restoreRelationship(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = RestoreRelationshipRequestSchema.parse(args);
    const userId = this.getAuthenticatedUserId(parsed.user_id);
    const relationshipKey = `${parsed.relationship_type}:${parsed.source_entity_id}:${parsed.target_entity_id}`;

    const result = await restoreRelationshipService(
      relationshipKey,
      parsed.relationship_type,
      parsed.source_entity_id,
      parsed.target_entity_id,
      userId,
      parsed.reason
    );

    if (!result.success) {
      throw new McpError(ErrorCode.InternalError, result.error ?? "Restore relationship failed");
    }

    return this.buildTextResponse({
      success: true,
      relationship_key: result.entity_id,
      observation_id: result.observation_id,
      message: "Relationship restored. Now visible in snapshots and default queries.",
    });
  }

  /**
   * Parse resource URI into structured resource identifier with query parameters
   */
  private parseResourceUri(uri: string): {
    type: string;
    entityType?: string;
    entityId?: string;
    year?: string;
    month?: string;
    sourceId?: string;
    relationshipType?: string;
    queryParams?: {
      limit?: number;
      offset?: number;
      sort?: string;
      order?: "asc" | "desc";
      entity_type?: string;
      relationship_type?: string;
      user_id?: string;
    };
  } {
    // Validate scheme
    if (!uri.startsWith("neotoma://")) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid resource URI scheme. Expected 'neotoma://', got: ${uri}`
      );
    }

    // Extract path and query string
    const uriWithoutScheme = uri.substring("neotoma://".length);
    const [pathPart, queryString] = uriWithoutScheme.split("?");
    const segments = pathPart.split("/").filter(Boolean);

    if (segments.length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, "Invalid resource URI: no path specified");
    }

    // Parse query parameters if present
    let queryParams:
      | {
          limit?: number;
          offset?: number;
          sort?: string;
          order?: "asc" | "desc";
          entity_type?: string;
          relationship_type?: string;
          user_id?: string;
        }
      | undefined;

    if (queryString) {
      const params = new URLSearchParams(queryString);
      queryParams = {};

      // Parse limit (max 1000)
      if (params.has("limit")) {
        const limit = parseInt(params.get("limit")!, 10);
        if (!isNaN(limit) && limit > 0 && limit <= 1000) {
          queryParams.limit = limit;
        }
      }

      // Parse offset
      if (params.has("offset")) {
        const offset = parseInt(params.get("offset")!, 10);
        if (!isNaN(offset) && offset >= 0) {
          queryParams.offset = offset;
        }
      }

      // Parse sort field
      if (params.has("sort")) {
        queryParams.sort = params.get("sort")!;
      }

      // Parse order (asc/desc)
      if (params.has("order")) {
        const order = params.get("order")!.toLowerCase();
        if (order === "asc" || order === "desc") {
          queryParams.order = order;
        }
      }

      // Parse entity_type filter
      if (params.has("entity_type")) {
        queryParams.entity_type = params.get("entity_type")!;
      }

      // Parse relationship_type filter
      if (params.has("relationship_type")) {
        queryParams.relationship_type = params.get("relationship_type")!;
      }

      // Parse user_id filter (UUID format)
      if (params.has("user_id")) {
        const userId = params.get("user_id")!;
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(userId)) {
          queryParams.user_id = userId;
        }
      }
    }

    // Parse based on first segment
    const [first, second, third] = segments;

    // entities (all entities)
    if (first === "entities" && !second) {
      return { type: "entity_collection_all", queryParams };
    }

    // entities/{entity_type}
    if (first === "entities" && second) {
      return { type: "entity_collection", entityType: second, queryParams };
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

    // relationships (all relationships)
    if (first === "relationships" && !second) {
      return { type: "relationship_collection_all", queryParams };
    }

    // relationships/{relationship_type}
    if (first === "relationships" && second) {
      return { type: "relationship_collection", relationshipType: second, queryParams };
    }

    // timeline/{year} or timeline/{year-month}
    if (first === "timeline" && second) {
      const timeMatch = second.match(/^(\d{4})(?:-(\d{2}))?$/);
      if (timeMatch) {
        const [, year, month] = timeMatch;
        if (month) {
          return { type: "timeline_month", year, month, queryParams };
        }
        return { type: "timeline_year", year, queryParams };
      }
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid timeline format. Expected YYYY or YYYY-MM, got: ${second}`
      );
    }

    // source/{source_id}
    if (first === "source" && second) {
      return { type: "source", sourceId: second, queryParams };
    }

    // sources
    if (first === "sources" && !second) {
      return { type: "source_collection", queryParams };
    }

    // entity_types
    if (first === "entity_types" && !second) {
      return { type: "entity_types" };
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unrecognized resource URI format: ${uri}`);
  }

  /**
   * Resource handler: Get all entities (generic collection)
   */
  private async handleEntityCollectionAll(queryParams?: {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: "asc" | "desc";
    entity_type?: string;
    user_id?: string;
  }): Promise<any> {
    try {
      const { queryEntities } = await import("./services/entity_queries.js");

      // Apply query parameters
      const limit = queryParams?.limit || 100;
      const offset = queryParams?.offset || 0;
      const entityTypeFilter = queryParams?.entity_type;
      const userId = queryParams?.user_id;

      // Get entities with filters
      const entities = await queryEntities({
        userId,
        entityType: entityTypeFilter,
        includeMerged: false,
        limit,
        offset,
      });

      // Get total count and metadata
      let countQuery = db
        .from("entities")
        .select("*", { count: "exact", head: true })
        .is("merged_to_entity_id", null);

      if (userId) {
        countQuery = countQuery.eq("user_id", userId);
      }

      if (entityTypeFilter) {
        countQuery = countQuery.eq("entity_type", entityTypeFilter);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn("Failed to count entities:", countError);
      }

      // Get last_updated timestamp
      let latestQuery = db
        .from("entities")
        .select("updated_at, created_at")
        .is("merged_to_entity_id", null);

      if (userId) {
        latestQuery = latestQuery.eq("user_id", userId);
      }

      if (entityTypeFilter) {
        latestQuery = latestQuery.eq("entity_type", entityTypeFilter);
      }

      const { data: latestEntity } = await latestQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      return {
        type: "entity_collection_all",
        category: "entities",
        entities,
        total: count || 0,
        returned: entities.length,
        has_more: (count || 0) > entities.length,
        last_updated:
          latestEntity?.updated_at || latestEntity?.created_at || new Date().toISOString(),
        uri: "neotoma://entities",
      };
    } catch (error) {
      logger.warn("Failed to get entities:", error);
      return {
        type: "entity_collection_all",
        category: "entities",
        entities: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: "neotoma://entities",
        error: error instanceof Error ? error.message : "Failed to retrieve entities",
      };
    }
  }

  /**
   * Resource handler: Get entity collection by type
   */
  private async handleEntityCollection(
    entityType: string,
    queryParams?: {
      limit?: number;
      offset?: number;
      sort?: string;
      order?: "asc" | "desc";
      user_id?: string;
    }
  ): Promise<any> {
    try {
      const { queryEntities } = await import("./services/entity_queries.js");

      // Apply query parameters
      const limit = queryParams?.limit || 100;
      const offset = queryParams?.offset || 0;
      const userId = queryParams?.user_id;

      const entities = await queryEntities({
        userId,
        entityType,
        includeMerged: false,
        limit,
        offset,
      });

      // Get total count
      let countQuery = db
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("entity_type", entityType)
        .is("merged_to_entity_id", null);

      if (userId) {
        countQuery = countQuery.eq("user_id", userId);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn(`Failed to count entities of type ${entityType}:`, countError);
      }

      // Get last_updated timestamp
      let latestQuery = db
        .from("entities")
        .select("updated_at, created_at")
        .eq("entity_type", entityType)
        .is("merged_to_entity_id", null);

      if (userId) {
        latestQuery = latestQuery.eq("user_id", userId);
      }

      const { data: latestEntity } = await latestQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      return {
        type: "entity_collection",
        category: "entities",
        entity_type: entityType,
        entities,
        total: count || 0,
        returned: entities.length,
        has_more: (count || 0) > entities.length,
        last_updated:
          latestEntity?.updated_at || latestEntity?.created_at || new Date().toISOString(),
        uri: `neotoma://entities/${entityType}`,
      };
    } catch (error) {
      logger.warn(`Failed to get entities of type ${entityType}:`, error);
      return {
        type: "entity_collection",
        category: "entities",
        entity_type: entityType,
        entities: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: `neotoma://entities/${entityType}`,
        error: error instanceof Error ? error.message : `Failed to retrieve ${entityType} entities`,
      };
    }
  }

  /**
   * Resource handler: Get individual entity
   */
  private async handleIndividualEntity(entityId: string): Promise<any> {
    // Get entity
    const { data: entity, error: entityError } = await db
      .from("entities")
      .select("*")
      .eq("id", entityId)
      .single();

    if (entityError || !entity) {
      throw new McpError(ErrorCode.InvalidRequest, `Entity not found: ${entityId}`);
    }

    // Get snapshot
    const { data: snapshot, error: snapshotError } = await db
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
    const { data: observations, error } = await db
      .from("observations")
      .select("*")
      .eq("entity_id", entityId)
      .order("observed_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get observations: ${error.message}`);
    }

    // Get total count
    const { count, error: countError } = await db
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
    const { data: outbound, error: outError } = await db
      .from("relationship_snapshots")
      .select("*")
      .eq("source_entity_id", entityId);

    if (outError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get outbound relationships: ${outError.message}`
      );
    }

    // Get inbound relationships
    const { data: inbound, error: inError } = await db
      .from("relationship_snapshots")
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
  private async handleTimelineYear(
    year: string,
    queryParams?: {
      limit?: number;
      offset?: number;
      user_id?: string;
    }
  ): Promise<any> {
    try {
      const startDate = `${year}-01-01T00:00:00Z`;
      const endDate = `${parseInt(year) + 1}-01-01T00:00:00Z`;

      // Apply query parameters
      const limit = queryParams?.limit || 1000;
      const offset = queryParams?.offset || 0;

      let query = db
        .from("timeline_events")
        .select("*")
        .gte("event_timestamp", startDate)
        .lt("event_timestamp", endDate)
        .order("event_timestamp", { ascending: false });

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data: events, error } = await query;

      if (error) {
        logger.warn("Failed to get timeline events:", error);
      }

      // Get total count
      const { count, error: countError } = await db
        .from("timeline_events")
        .select("*", { count: "exact", head: true })
        .gte("event_timestamp", startDate)
        .lt("event_timestamp", endDate);

      if (countError) {
        logger.warn("Failed to count timeline events:", countError);
      }

      return {
        type: "timeline",
        category: "timeline",
        year,
        events: events || [],
        total: count || 0,
        returned: (events || []).length,
        has_more: (count || 0) > (events || []).length,
        last_updated:
          events && events.length > 0 ? events[0].event_timestamp : new Date().toISOString(),
        uri: `neotoma://timeline/${year}`,
      };
    } catch (error) {
      logger.warn(`Failed to get timeline for year ${year}:`, error);
      return {
        type: "timeline",
        category: "timeline",
        year,
        events: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: `neotoma://timeline/${year}`,
        error: error instanceof Error ? error.message : `Failed to retrieve timeline for ${year}`,
      };
    }
  }

  /**
   * Resource handler: Get timeline events for a specific month
   */
  private async handleTimelineMonth(
    year: string,
    month: string,
    queryParams?: {
      limit?: number;
      offset?: number;
      user_id?: string;
    }
  ): Promise<any> {
    try {
      const startDate = `${year}-${month}-01T00:00:00Z`;
      const nextMonth =
        parseInt(month) === 12 ? "01" : String(parseInt(month) + 1).padStart(2, "0");
      const nextYear = parseInt(month) === 12 ? String(parseInt(year) + 1) : year;
      const endDate = `${nextYear}-${nextMonth}-01T00:00:00Z`;

      // Apply query parameters
      const limit = queryParams?.limit || 1000;
      const offset = queryParams?.offset || 0;
      const userId = queryParams?.user_id;

      // If user_id is provided, get source IDs for that user first
      let userSourceIds: string[] | undefined;
      if (userId) {
        const { data: userSources } = await db
          .from("sources")
          .select("id")
          .eq("user_id", userId);

        if (userSources && userSources.length > 0) {
          userSourceIds = userSources.map((s: any) => s.id);
        } else {
          // No sources for this user, return empty result
          return {
            type: "timeline",
            category: "timeline",
            year,
            month,
            events: [],
            total: 0,
            returned: 0,
            has_more: false,
            uri: `neotoma://timeline/${year}-${month}`,
          };
        }
      }

      let query = db
        .from("timeline_events")
        .select("*")
        .gte("event_timestamp", startDate)
        .lt("event_timestamp", endDate);

      // Filter by user_id through sources
      if (userSourceIds && userSourceIds.length > 0) {
        query = query.in("source_id", userSourceIds);
      }

      query = query.order("event_timestamp", { ascending: false });

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data: events, error } = await query;

      if (error) {
        logger.warn("Failed to get timeline events:", error);
      }

      // Get total count
      let countQuery = db
        .from("timeline_events")
        .select("*", { count: "exact", head: true })
        .gte("event_timestamp", startDate)
        .lt("event_timestamp", endDate);

      if (userSourceIds && userSourceIds.length > 0) {
        countQuery = countQuery.in("source_id", userSourceIds);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn("Failed to count timeline events:", countError);
      }

      return {
        type: "timeline",
        category: "timeline",
        year,
        month,
        events: events || [],
        total: count || 0,
        returned: (events || []).length,
        has_more: (count || 0) > (events || []).length,
        last_updated:
          events && events.length > 0 ? events[0].event_timestamp : new Date().toISOString(),
        uri: `neotoma://timeline/${year}-${month}`,
      };
    } catch (error) {
      logger.warn(`Failed to get timeline for ${year}-${month}:`, error);
      return {
        type: "timeline",
        category: "timeline",
        year,
        month,
        events: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: `neotoma://timeline/${year}-${month}`,
        error:
          error instanceof Error
            ? error.message
            : `Failed to retrieve timeline for ${year}-${month}`,
      };
    }
  }

  /**
   * Resource handler: Get source
   */
  private async handleSource(sourceId: string): Promise<any> {
    const { data: source, error } = await db
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (error || !source) {
      throw new McpError(ErrorCode.InvalidRequest, `Source not found: ${sourceId}`);
    }

    // Get observations created from this source
    const { data: observations, error: obsError } = await db
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
   * Resource handler: Get all sources
   */
  private async handleSourceCollection(queryParams?: {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: "asc" | "desc";
    user_id?: string;
  }): Promise<any> {
    try {
      // Apply query parameters
      const limit = queryParams?.limit || 100;
      const offset = queryParams?.offset || 0;
      const sortField = queryParams?.sort || "created_at";
      const sortOrder = queryParams?.order === "asc";
      const userId = queryParams?.user_id;

      let query = db
        .from("sources")
        .select("id, mime_type, file_size, content_hash, created_at, user_id")
        .order(sortField, { ascending: sortOrder });

      if (userId) {
        query = query.eq("user_id", userId);
      }

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data: sources, error } = await query;

      if (error) {
        logger.warn("Failed to get sources:", error);
      }

      // Get total count
      let countQuery = db.from("sources").select("*", { count: "exact", head: true });

      if (userId) {
        countQuery = countQuery.eq("user_id", userId);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn("Failed to count sources:", countError);
      }

      return {
        type: "source_collection",
        category: "sources",
        sources: sources || [],
        total: count || 0,
        returned: (sources || []).length,
        has_more: (count || 0) > (sources || []).length,
        last_updated:
          sources && sources.length > 0 ? sources[0].created_at : new Date().toISOString(),
        uri: "neotoma://sources",
      };
    } catch (error) {
      logger.warn("Failed to get sources:", error);
      return {
        type: "source_collection",
        category: "sources",
        sources: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: "neotoma://sources",
        error: error instanceof Error ? error.message : "Failed to retrieve sources",
      };
    }
  }

  /**
   * Resource handler: Get all relationships (generic collection)
   */
  private async handleRelationshipCollectionAll(queryParams?: {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: "asc" | "desc";
    relationship_type?: string;
    user_id?: string;
  }): Promise<any> {
    try {
      // Apply query parameters
      const limit = queryParams?.limit || 100;
      const offset = queryParams?.offset || 0;
      const sortField = queryParams?.sort || "last_observation_at";
      const sortOrder = queryParams?.order === "asc";
      const relationshipTypeFilter = queryParams?.relationship_type;
      const userId = queryParams?.user_id;

      // If user_id is provided, get entity IDs for that user first
      let userEntityIds: string[] | undefined;
      if (userId) {
        const { data: userEntities } = await db
          .from("entities")
          .select("id")
          .eq("user_id", userId)
          .is("merged_to_entity_id", null);

        if (userEntities && userEntities.length > 0) {
          userEntityIds = userEntities.map((e: any) => e.id);
        } else {
          // No entities for this user, return empty result
          return {
            type: "relationship_collection_all",
            category: "relationships",
            relationships: [],
            total: 0,
            returned: 0,
            has_more: false,
            uri: "neotoma://relationships",
          };
        }
      }

      let query = db
        .from("relationship_snapshots")
        .select(
          "relationship_key, relationship_type, source_entity_id, target_entity_id, snapshot, computed_at, last_observation_at"
        );

      if (relationshipTypeFilter) {
        query = query.eq("relationship_type", relationshipTypeFilter);
      }

      // Filter by user_id through entities
      if (userEntityIds && userEntityIds.length > 0) {
        query = query.or(
          `source_entity_id.in.(${userEntityIds.join(",")}),target_entity_id.in.(${userEntityIds.join(",")})`
        );
      }

      query = query.order(sortField, { ascending: sortOrder });

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data: relationships, error } = await query;

      if (error) {
        logger.warn("Failed to get relationships:", error);
      }

      // Get total count
      let countQuery = db
        .from("relationship_snapshots")
        .select("*", { count: "exact", head: true });

      if (relationshipTypeFilter) {
        countQuery = countQuery.eq("relationship_type", relationshipTypeFilter);
      }

      if (userEntityIds && userEntityIds.length > 0) {
        countQuery = countQuery.or(
          `source_entity_id.in.(${userEntityIds.join(",")}),target_entity_id.in.(${userEntityIds.join(",")})`
        );
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn("Failed to count relationships:", countError);
      }

      return {
        type: "relationship_collection_all",
        category: "relationships",
        relationships: relationships || [],
        total: count || 0,
        returned: (relationships || []).length,
        has_more: (count || 0) > (relationships || []).length,
        last_updated:
          relationships && relationships.length > 0
            ? relationships[0].computed_at
            : new Date().toISOString(),
        uri: "neotoma://relationships",
      };
    } catch (error) {
      logger.warn("Failed to get relationships:", error);
      return {
        type: "relationship_collection_all",
        category: "relationships",
        relationships: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: "neotoma://relationships",
        error: error instanceof Error ? error.message : "Failed to retrieve relationships",
      };
    }
  }

  /**
   * Resource handler: Get relationships by type
   */
  private async handleRelationshipCollection(
    relationshipType: string,
    queryParams?: {
      limit?: number;
      offset?: number;
      sort?: string;
      order?: "asc" | "desc";
      user_id?: string;
    }
  ): Promise<any> {
    try {
      // Apply query parameters
      const limit = queryParams?.limit || 100;
      const offset = queryParams?.offset || 0;
      const sortField = queryParams?.sort || "last_observation_at";
      const sortOrder = queryParams?.order === "asc";
      const userId = queryParams?.user_id;

      // If user_id is provided, get entity IDs for that user first
      let userEntityIds: string[] | undefined;
      if (userId) {
        const { data: userEntities } = await db
          .from("entities")
          .select("id")
          .eq("user_id", userId)
          .is("merged_to_entity_id", null);

        if (userEntities && userEntities.length > 0) {
          userEntityIds = userEntities.map((e: any) => e.id);
        } else {
          // No entities for this user, return empty result
          return {
            type: "relationship_collection",
            category: "relationships",
            relationship_type: relationshipType,
            relationships: [],
            total: 0,
            returned: 0,
            has_more: false,
            uri: `neotoma://relationships/${relationshipType}`,
          };
        }
      }

      let query = db
        .from("relationship_snapshots")
        .select(
          "relationship_key, relationship_type, source_entity_id, target_entity_id, snapshot, computed_at, last_observation_at"
        )
        .eq("relationship_type", relationshipType);

      // Filter by user_id through entities
      if (userEntityIds && userEntityIds.length > 0) {
        query = query.or(
          `source_entity_id.in.(${userEntityIds.join(",")}),target_entity_id.in.(${userEntityIds.join(",")})`
        );
      }

      query = query.order(sortField, { ascending: sortOrder });

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data: relationships, error } = await query;

      if (error) {
        logger.warn("Failed to get relationships:", error);
      }

      // Get total count for this type
      let countQuery = db
        .from("relationship_snapshots")
        .select("*", { count: "exact", head: true })
        .eq("relationship_type", relationshipType);

      if (userEntityIds && userEntityIds.length > 0) {
        countQuery = countQuery.or(
          `source_entity_id.in.(${userEntityIds.join(",")}),target_entity_id.in.(${userEntityIds.join(",")})`
        );
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        logger.warn("Failed to count relationships:", countError);
      }

      return {
        type: "relationship_collection",
        category: "relationships",
        relationship_type: relationshipType,
        relationships: relationships || [],
        total: count || 0,
        returned: (relationships || []).length,
        has_more: (count || 0) > (relationships || []).length,
        last_updated:
          relationships && relationships.length > 0
            ? relationships[0].computed_at
            : new Date().toISOString(),
        uri: `neotoma://relationships/${relationshipType}`,
      };
    } catch (error) {
      logger.warn(`Failed to get relationships of type ${relationshipType}:`, error);
      return {
        type: "relationship_collection",
        category: "relationships",
        relationship_type: relationshipType,
        relationships: [],
        total: 0,
        returned: 0,
        has_more: false,
        uri: `neotoma://relationships/${relationshipType}`,
        error:
          error instanceof Error
            ? error.message
            : `Failed to retrieve ${relationshipType} relationships`,
      };
    }
  }

  /**
   * Resource handler: Get all entity types (schema-level discovery resource)
   */
  private async handleEntityTypes(): Promise<any> {
    try {
      const { SchemaRegistryService } = await import("./services/schema_registry.js");
      const schemaRegistry = new SchemaRegistryService();
      const entityTypes = await schemaRegistry.listEntityTypes();

      // Return simplified entity type information for discovery
      return {
        type: "entity_types",
        category: "schema",
        entity_types: entityTypes.map((et) => ({
          entity_type: et.entity_type,
          schema_version: et.schema_version,
          field_count: et.field_names?.length || 0,
        })),
        total: entityTypes.length,
        uri: "neotoma://entity_types",
      };
    } catch (error) {
      logger.warn("Failed to get entity types:", error);
      return {
        type: "entity_types",
        category: "schema",
        entity_types: [],
        total: 0,
        uri: "neotoma://entity_types",
        error: error instanceof Error ? error.message : "Failed to retrieve entity types",
      };
    }
  }

  private setupErrorHandler(): void {
    this.server.onerror = (error) => {
      logger.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });

    // Exit cleanly when stdio pipe breaks (e.g. machine sleep/wake; Cursor closes the pipe).
    // Allows Cursor to show a clean disconnect and restart the server.
    process.on("SIGPIPE", () => {
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("[Neotoma MCP] Server running on stdio");

    await this.startAutoEnhancement();
  }

  /**
   * Run MCP server with StreamableHTTP transport (HTTP-based)
   * Used when MCP server is integrated into Express HTTP server
   */
  async runHTTP(transport: StreamableHTTPServerTransport): Promise<void> {
    await this.server.connect(transport);
    logger.info("[Neotoma MCP] Server running on StreamableHTTP");

    await this.startAutoEnhancement();
  }

  /**
   * Start auto-enhancement processor (shared by both transports)
   */
  private async startAutoEnhancement(): Promise<void> {
    // Start auto-enhancement processor (runs every 30 seconds)
    try {
      const { startAutoEnhancementProcessor } =
        await import("./services/auto_enhancement_processor.js");
      this.autoEnhancementCleanup = startAutoEnhancementProcessor(30000);
      logger.info("[Neotoma MCP] Auto-enhancement processor started");
    } catch (error: any) {
      // Don't fail server startup if processor fails - log and continue
      logger.error(`[Neotoma MCP] Failed to start auto-enhancement processor: ${error.message}`);
    }
  }
}
