import { Server } from "@modelcontextprotocol/sdk/server";
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
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { config } from "./config.js";
import { queryEntitiesWithCount } from "./shared/action_handlers/entity_handlers.js";
import { buildCliEquivalentInvocation } from "./shared/contract_mappings.js";
import { buildToolDefinitions } from "./tool_definitions.js";
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
  RelationshipSnapshotRequestSchema,
  RetrieveEntitiesRequestSchema,
  RetrieveEntityByIdentifierSchema,
  RetrieveGraphNeighborhoodSchema,
  RetrieveRelatedEntitiesSchema,
  TimelineEventsRequestSchema,
  UpdateSchemaIncrementalRequestSchema,
  RegisterSchemaRequestSchema,
} from "./shared/action_schemas.js";
import { ensureLocalDevUser } from "./services/local_auth.js";
import type { RelationshipType } from "./services/relationships.js";
import type { SchemaDefinition } from "./services/schema_registry.js";
import {
  extractTextFromBuffer,
  getPdfFirstPageImageDataUrl,
  getMimeTypeFromExtension,
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
import { getLatestFromRegistry, isUpdateAvailable, formatUpgradeCommand } from "./version_check.js";
import {
  isFeedbackAutoSubmitSuppressed,
  resolveFeedbackTransport,
} from "./services/feedback_transport.js";
import { loadFeedbackReportingMode } from "./services/feedback/activation.js";
import type { SubmitFeedbackArgs } from "./services/feedback/types.js";
import { buildSessionInfo } from "./services/session_info.js";
import { AttributionPolicyError } from "./services/attribution_policy.js";
import {
  getCurrentAttributionDecision,
  runWithRequestContext,
} from "./services/request_context.js";
import { retrieveEntityByIdentifierWithFallback } from "./shared/action_handlers/entity_identifier_handler.js";
import {
  createAgentIdentity as buildAgentIdentity,
  normaliseClientName,
  type AAuthRequestContext,
  type AgentIdentity,
  type AttributionDecisionDiagnostics,
} from "./crypto/agent_identity.js";

const MCP_DOCS_SUBDIR = ["docs", "developer", "mcp"] as const;
const TIMELINE_WIDGET_RESOURCE_URI = "neotoma://ui/timeline_widget";

export class NeotomaServer {
  private server: Server;
  private autoEnhancementCleanup?: () => void;
  private authenticatedUserId: string | null = null;
  private sessionToken: string | null = null;
  private requestAuth: Map<string, { userId: string; token: string }> = new Map();
  /** Connection ID set from HTTP layer so handlers get auth even when SDK does not pass requestInfo */
  private sessionConnectionId: string | null = null;
  /** AAuth-verified agent context propagated from the HTTP middleware (Phase 1). */
  private sessionAAuth: AAuthRequestContext | null = null;
  /** Client self-report from MCP initialize `clientInfo` (fallback attribution). */
  private sessionClientInfo: { name?: string; version?: string } | null = null;
  /** Tool descriptions loaded from docs/developer/mcp/tool_descriptions.yaml; empty Map if file missing */
  private toolDescriptions: Map<string, string> = new Map();
  /** In-memory cache for npm registry dist-tags: key = "packageName:distTag", value = { version, until } */
  private registryCache = new Map<string, { version: string; until: number }>();
  private static REGISTRY_CACHE_TTL_MS = 10 * 60 * 1000;
  private static INIT_UPDATE_NOTICE_TIMEOUT_MS = 750;
  private static RUNTIME_UPDATE_NOTICE_TIMEOUT_MS = 200;
  private static RUNTIME_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  private isHTTPTransportSession = false;
  private nextRuntimeUpdateCheckAt = 0;
  private lastNotifiedUpdateVersion: string | null = null;

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
      "MANDATORY in chat: every assistant turn you MUST (1) create or update a conversation entity with a stable conversation_id, (2) store this turn as a `conversation_message` (canonical; accepts legacy `agent_message` as an alias) linked to it via PART_OF (message PART_OF conversation). Always set the message's `sender_kind` field (user | assistant | agent | system | tool) alongside `role` so the stored shape is unambiguous; for agent-to-agent (A2A) traffic also set `sender_agent_id` / `recipient_agent_id` and set the parent conversation's `thread_kind` to `agent_agent` or `multi_party` as appropriate. Do NOT skip this for greetings, minimal messages, or when the user message has no extractable entities; chat storage is required every turn.",
      'In chat contexts (details): prefer host-provided conversation_id, thread_id, or session_id; when host does not provide, use entity id from first turn\'s store if re-exposed, or a deterministic derivative. Store any new attachments via the unstructured path and link them with EMBEDS. Use only Neotoma-supported relationship types (PART_OF, REFERS_TO, EMBEDS, SUPERSEDES, etc.); see MCP spec. Do this in the same turn as your response; do not wait for the user to say "save" or run an end-of-chat command. This is in addition to extracting and storing entities and attachments from the turn as below.',
      "For conversation/turn idempotency_key: use conversation-{conversation_id}-{turn_id}-{timestamp_ms} or conversation-{conversation_id}-{turn_id}-{uuid} so each turn store creates a new observation. Include stable turn identity in the message entity (e.g. turn_key or id = conversation_id:turn_id). Overwriting between branches is OK; history is available via list_observations.",
      "For reverted turns: optionally link the new message to the previous one with create_relationship(SUPERSEDES, new_message_entity_id, previous_message_entity_id).",
      'When you pull data from other MCPs (e.g. email, calendar, search), apply the same proactive storage: extract and store people, companies, locations, events, tasks, notifications, device status, and relationships from that data. Create tasks for action items (e.g. "replace battery", "share feedback", "review security alert", "reply about Madrid trip"). Store locations and link events or tasks to them. Store first, then respond.',
      "When confirming stored information, you MUST use memory-related language (e.g. “remember”, “recall”, “store in memory”) and include one of those phrases in the confirmation.",
      "When any MCP action creates or updates Neotoma entities, the user-visible reply MUST include one markdown table per affected entity with action, entity_id, entity_type, and every stored or changed property available from the snapshot or store response.",
      'Extract and store all relevant entities from what the user says: people, tasks, events, commitments, preferences, possessions, relationships, places, and any other types that fit. Store every distinct entity (e.g. a person and a task and an event from the same message). When the user mentions a place, property, or location (e.g. "our home in Barcelona", "my office", "apartment in Madrid"), store it as an entity (e.g. location, property, or place) and link the task or other entities to it. Create relationships when implied (e.g. friend of, task for person, event attendee, task for location) using create_relationship or relationship fields per schema.',
      "Proactively create a task when the user expresses intent, obligation, debt, or a future action (e.g. “I need to”, “I have to”, “I owe”, “I should”, “I want to buy”, “remind me”, or any deadline). Unless the user explicitly says no reminders or no tasks, create a task with due date if available and relate it to the relevant person or entity.",
      'When entity type is not in the known list, use list_entity_types with a keyword (e.g. "device", "asset", "preference", "gift", "reminder") or store with a descriptive entity_type; the system will infer or create schema from the data. Be proactive about storing any type of relevant entity, including types not yet registered.',
      "Example entity types (use when they fit; more may exist via list_entity_types or neotoma://entity_types): contact, person, company, task, invoice, transaction, receipt, note, contract, event, location, property, place, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision. For any other concept, use a descriptive type (e.g. device, asset, preference, gift, home) or discover via list_entity_types.",
      "Avoid calling get_authenticated_user unless required by the intended follow-up action. If the next actions do not require it, skip get_authenticated_user.",
      "Check for existing records before storing to avoid duplicates.",
      "Include all fields from source data when storing entities. Unknown fields must be included.",
      "Omit user_id. It is inferred from authentication.",
      "After any MCP action, summarize entities and relationships with all snapshot fields, and do not replace required per-entity tables with prose-only summary.",
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

      // Capture self-reported client info for fallback attribution (Phase 1.6).
      // This is NOT verified — it is whatever the MCP client put on the wire.
      const rawName = request.params?.clientInfo?.name;
      const rawVersion = request.params?.clientInfo?.version;
      this.sessionClientInfo = {
        name: typeof rawName === "string" ? rawName : undefined,
        version: typeof rawVersion === "string" ? rawVersion : undefined,
      };

      // Detect transport type: HTTP has requestInfo, stdio does not
      const isHTTPTransport = !!extra?.requestInfo;
      this.isHTTPTransportSession = isHTTPTransport;
      const updateNotice = await this.getInitializeUpdateNotice(isHTTPTransport);

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
          return this.buildAuthenticatedInitializeResponse(updateNotice);
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
          return this.buildAuthenticatedInitializeResponse(updateNotice);
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
          return this.buildAuthenticatedInitializeResponse(updateNotice);
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
          return this.buildAuthenticatedInitializeResponse(updateNotice);
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
            return this.buildAuthenticatedInitializeResponse(updateNotice);
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
   * Stash the AAuth verification result from the HTTP middleware so the
   * write-path services can attribute rows to the signing agent (Phase 1).
   * Called by actions.ts before the transport handles the MCP request. Pass
   * `null` to clear (e.g. for unsigned requests).
   */
  setSessionAgentIdentity(ctx: AAuthRequestContext | null): void {
    this.sessionAAuth = ctx;
  }

  /**
   * Return the current session's fully-resolved {@link AgentIdentity},
   * combining AAuth verification with clientInfo and connection id
   * fallback attribution. Returns `null` when nothing attributable is
   * available (stdio without env identity, etc.).
   */
  getAgentIdentity(): AgentIdentity | null {
    const aauth = this.sessionAAuth;
    const clientName = normaliseClientName(this.sessionClientInfo?.name);
    const clientVersion = this.sessionClientInfo?.version;
    const connectionId = this.sessionConnectionId ?? undefined;
    const hasAny =
      !!aauth?.verified || !!clientName || !!clientVersion || !!connectionId;
    if (!hasAny) return null;
    return buildAgentIdentity({
      publicKey: aauth?.publicKey,
      thumbprint: aauth?.thumbprint,
      algorithm: aauth?.algorithm,
      sub: aauth?.sub,
      iss: aauth?.iss,
      clientName,
      clientVersion,
      connectionId,
    });
  }

  /**
   * Synthesise an {@link AttributionDecisionDiagnostics} for the active
   * MCP session. HTTP `/mcp` requests receive a middleware-stamped
   * decision via `req.aauth`; stdio and CLI-over-MCP callers never hit
   * Express, so we derive the equivalent shape from `sessionAAuth` +
   * `sessionClientInfo`. The resulting object is safe to put on the
   * request context so `/session`-equivalent replies via stdio match the
   * HTTP response shape (see docs/subsystems/agent_attribution_integration.md).
   */
  getSessionAttributionDecision(): AttributionDecisionDiagnostics | null {
    const identity = this.getAgentIdentity();
    if (!identity) return null;
    const aauth = this.sessionAAuth;
    return {
      signature_present: !!aauth,
      signature_verified: !!aauth?.verified,
      client_info_raw_name:
        typeof this.sessionClientInfo?.name === "string"
          ? this.sessionClientInfo.name
          : undefined,
      resolved_tier: identity.tier,
    };
  }

  private buildAuthenticatedInitializeResponse(updateNotice: string | null) {
    const instructions = updateNotice
      ? `${updateNotice}\n\n${this.getMcpInteractionInstructions()}`
      : this.getMcpInteractionInstructions();

    return {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {}, resources: {} },
      serverInfo: {
        name: "neotoma",
        version: "1.0.0",
        ...(updateNotice
          ? {
              title: "Update available",
              description: updateNotice,
            }
          : {}),
      },
      instructions,
    };
  }

  private markUpdateNoticeDelivered(latestVersion: string | null): void {
    if (latestVersion) {
      this.lastNotifiedUpdateVersion = latestVersion;
    }
  }

  private getInstalledPackageMetadata(): { packageName: string; currentVersion: string } {
    try {
      const pkgPath = join(config.projectRoot, "package.json");
      const raw = readFileSync(pkgPath, "utf-8");
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      return {
        packageName: typeof parsed.name === "string" && parsed.name ? parsed.name : "neotoma",
        currentVersion:
          typeof parsed.version === "string" && parsed.version ? parsed.version : "1.0.0",
      };
    } catch {
      return { packageName: "neotoma", currentVersion: "1.0.0" };
    }
  }

  private async getLatestCachedPackageVersion(
    packageName: string,
    distTag: string
  ): Promise<string | null> {
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

    return latest;
  }

  private async getPackageUpdateNotice(
    isHTTPTransport: boolean,
    timeoutMs: number
  ): Promise<{ message: string; latestVersion: string } | null> {
    if (isHTTPTransport || process.env.NO_UPDATE_NOTIFIER === "1") {
      return null;
    }

    const { packageName, currentVersion } = this.getInstalledPackageMetadata();
    const latest = await Promise.race<string | null>([
      this.getLatestCachedPackageVersion(packageName, "latest"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (
      !latest ||
      !isUpdateAvailable(currentVersion, latest) ||
      this.lastNotifiedUpdateVersion === latest
    ) {
      return null;
    }

    return {
      latestVersion: latest,
      message: `New ${packageName} version available (${currentVersion} -> ${latest}). Run ${formatUpgradeCommand(packageName, "latest", "global")} before continuing.`,
    };
  }

  private async getInitializeUpdateNotice(isHTTPTransport: boolean): Promise<string | null> {
    const notice = await this.getPackageUpdateNotice(
      isHTTPTransport,
      NeotomaServer.INIT_UPDATE_NOTICE_TIMEOUT_MS
    );
    if (!notice) return null;
    this.markUpdateNoticeDelivered(notice.latestVersion);
    return notice.message;
  }

  private async consumeRuntimeUpdateNotice(): Promise<string | null> {
    const now = Date.now();
    if (now < this.nextRuntimeUpdateCheckAt) {
      return null;
    }

    this.nextRuntimeUpdateCheckAt = now + NeotomaServer.RUNTIME_UPDATE_CHECK_INTERVAL_MS;

    const notice = await this.getPackageUpdateNotice(
      this.isHTTPTransportSession,
      NeotomaServer.RUNTIME_UPDATE_NOTICE_TIMEOUT_MS
    );
    if (!notice) return null;
    this.markUpdateNoticeDelivered(notice.latestVersion);
    return notice.message;
  }

  private withRuntimeUpdateNotice(
    result: { content: Array<{ type: string; text?: string }> },
    notice: string | null
  ): { content: Array<{ type: string; text?: string }> } {
    if (!notice) return result;
    return {
      ...result,
      content: [...result.content, { type: "text", text: notice }],
    };
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
   * Resolve the current session's attribution and the active policy.
   * Mirrors the HTTP `GET /session` endpoint; see
   * `src/services/session_info.ts`. Read-only.
   */
  private async getSessionIdentity(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    z.object({}).parse(args ?? {});
    const userId = this.getAuthenticatedUserId();
    const identity = this.getAgentIdentity();
    const session = buildSessionInfo({
      userId,
      identity,
      middlewareDecision: getCurrentAttributionDecision(),
      rawClientInfoName: this.sessionClientInfo?.name ?? null,
    });
    return this.buildTextResponse(session);
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

  private async listRecentChanges(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      limit: z.number().int().positive().max(200).optional().default(50),
      offset: z.number().int().nonnegative().optional().default(0),
    });
    const parsed = schema.parse(args ?? {});
    const userId = this.getAuthenticatedUserId(undefined);
    const { listRecentRecordActivity } = await import("./services/recent_record_activity.js");
    const result = listRecentRecordActivity(userId, parsed.limit, parsed.offset);
    return this.buildTextResponse(result);
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

    const latest = await this.getLatestCachedPackageVersion(packageName, distTag);

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

  private async submitFeedback(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (isFeedbackAutoSubmitSuppressed()) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Feedback auto-submit is disabled via NEOTOMA_FEEDBACK_AUTO_SUBMIT=0",
      );
    }

    const schema = z.object({
      kind: z.enum([
        "incident",
        "report",
        "primitive_ask",
        "doc_gap",
        "contract_discrepancy",
        "fix_verification",
      ]),
      title: z.string().min(1),
      body: z.string().min(1),
      metadata: z.record(z.any()).optional(),
      user_consent_captured: z.boolean().optional(),
      explicit_user_request: z.boolean().optional(),
      prefer_human_draft: z.boolean().optional(),
      status_push: z
        .object({ webhook_url: z.string(), webhook_secret: z.string().optional() })
        .optional(),
      parent_feedback_id: z.string().optional(),
      verification_outcome: z
        .enum([
          "verified_working",
          "verified_working_with_caveat",
          "unable_to_verify",
          "verification_failed",
        ])
        .optional(),
      verified_at_version: z.string().optional(),
      routing_hint: z.enum(["auto", "reopen_parent", "new_child"]).optional(),
    });
    const parsed = schema.parse(args ?? {}) as SubmitFeedbackArgs;
    const mode = await loadFeedbackReportingMode();
    if (mode === "off" && !parsed.explicit_user_request) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "feedback reporting mode is off; only explicit_user_request=true submissions are accepted",
      );
    }
    if (mode === "consent" && !parsed.user_consent_captured && !parsed.explicit_user_request) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "feedback reporting mode is consent; set user_consent_captured=true or explicit_user_request=true",
      );
    }
    const transport = resolveFeedbackTransport();
    const submitterId = this.authenticatedUserId ?? "anonymous";
    try {
      const response = await transport.submit(parsed, submitterId);
      return this.buildTextResponse(response);
    } catch (err: any) {
      throw new McpError(ErrorCode.InternalError, `submit_feedback failed: ${err?.message ?? err}`);
    }
  }

  private async getFeedbackStatus(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({ access_token: z.string().min(1) });
    const parsed = schema.parse(args ?? {});
    const transport = resolveFeedbackTransport();
    try {
      const response = await transport.status(parsed.access_token);
      return this.buildTextResponse(response);
    } catch (err: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `get_feedback_status failed: ${err?.message ?? err}`,
      );
    }
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
        tools: buildToolDefinitions(this.toolDescriptions, TIMELINE_WIDGET_RESOURCE_URI).map(
          (def) => ({
            name: def.name,
            description: def.description,
            inputSchema: def.inputSchema,
            ...(def.annotations ? { annotations: def.annotations } : {}),
            ...(def._meta ? { _meta: def._meta } : {}),
          })
        ),
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

        // Phase 2 parity: wrap every tool dispatch in the request-scoped
        // AsyncLocalStorage context so write-path services read the same
        // AAuth/clientInfo identity we already capture during
        // `InitializeRequestSchema`. Without this wrap, stdio and
        // CLI-over-MCP callers landed as `anonymous` in observation
        // provenance even with valid AAuth + clientInfo (see
        // docs/subsystems/agent_attribution_integration.md). HTTP `/mcp`
        // requests still nest a richer server-resolved identity inside
        // this scope — nested AsyncLocalStorage scopes shadow outer ones.
        const identity = this.getAgentIdentity();
        const attributionDecision = this.getSessionAttributionDecision();
        const result = await runWithRequestContext(
          { agentIdentity: identity, attributionDecision },
          () => this.executeTool(name, args),
        );
        const runtimeUpdateNotice =
          name === "npm_check_update" ? null : await this.consumeRuntimeUpdateNotice();
        const resultWithNotice = this.withRuntimeUpdateNotice(result, runtimeUpdateNotice);
        const resultSummary = summarizeToolResultForLog(name, resultWithNotice);
        if (resultSummary) {
          logger.info(`[MCP Server] ${name} → ${resultSummary}`);
        }
        return resultWithNotice;
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        if (error instanceof AttributionPolicyError) {
          // Surface policy rejections as structured MCP errors so clients can
          // branch on `ATTRIBUTION_REQUIRED` without string-matching. The
          // envelope carries `min_tier` / `current_tier` / `hint` in the MCP
          // `data` field (see src/services/attribution_policy.ts).
          throw new McpError(
            ErrorCode.InvalidRequest,
            error.message,
            error.toErrorEnvelope(),
          );
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
    // Mirror the CallToolRequestSchema dispatch: wrap in the request-scoped
    // context so CLI-over-MCP callers (see src/cli/core/operations.ts and
    // openclaw_entry.ts) stamp attribution just like HTTP `/mcp`. When no
    // session identity is available this still runs the write inside an
    // "empty" context, which keeps behaviour stable for existing tests
    // that exercise local CLI writes as `anonymous`.
    const identity = this.getAgentIdentity();
    const attributionDecision = this.getSessionAttributionDecision();
    return runWithRequestContext(
      { agentIdentity: identity, attributionDecision },
      () => this.executeTool(name, args),
    );
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
      case "get_entity_type_counts":
        return await this.getEntityTypeCounts(args);
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
      case "parse_file":
        return await this.parseFile(args);
      case "correct":
        return await this.correct(args);
      case "merge_entities":
        return await this.mergeEntities(args);
      case "list_potential_duplicates":
        return await this.listPotentialDuplicates(args);
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
      case "get_session_identity":
        return await this.getSessionIdentity(args);
      case "health_check_snapshots":
        return await this.healthCheckSnapshots(args);
      case "list_recent_changes":
        return await this.listRecentChanges(args);
      case "npm_check_update":
        return await this.npmCheckUpdate(args);
      case "submit_feedback":
        return await this.submitFeedback(args);
      case "get_feedback_status":
        return await this.getFeedbackStatus(args);
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

        resources.push({
          uri: TIMELINE_WIDGET_RESOURCE_URI,
          name: "Timeline Widget",
          description: "Embedded timeline widget for timeline event tool results.",
          mimeType: "text/html;profile=mcp-app",
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
          case "ui_timeline_widget":
            return {
              contents: [
                {
                  uri,
                  mimeType: "text/html;profile=mcp-app",
                  text: this.buildTimelineWidgetHtml(),
                },
              ],
            };
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

  private async readUnstructuredInput(input: {
    file_content?: string;
    file_path?: string;
    mime_type?: string;
    original_filename?: string;
  }): Promise<{ fileBuffer: Buffer; mimeType: string; filename: string }> {
    if (input.file_path) {
      const fs = await import("node:fs");
      const path = await import("node:path");

      if (!fs.existsSync(input.file_path)) {
        throw new Error(`File not found: ${input.file_path}`);
      }

      const fileBuffer = fs.readFileSync(input.file_path);
      const ext = path.extname(input.file_path).toLowerCase();
      return {
        fileBuffer,
        mimeType: input.mime_type || getMimeTypeFromExtension(ext) || "application/octet-stream",
        filename: input.original_filename || path.basename(input.file_path),
      };
    }

    if (input.file_content && input.mime_type) {
      return {
        fileBuffer: Buffer.from(input.file_content, "base64"),
        mimeType: input.mime_type,
        filename: input.original_filename || "file",
      };
    }

    throw new Error("file_content+mime_type OR file_path required");
  }

  private async parseFile(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z
      .object({
        file_content: z.string().optional(),
        file_path: z.string().optional(),
        mime_type: z.string().optional(),
        original_filename: z.string().optional(),
      })
      .refine((data) => Boolean(data.file_path || (data.file_content && data.mime_type)), {
        message: "Must provide file_path or file_content with mime_type",
      });

    const parsed = schema.parse(args ?? {});
    const { fileBuffer, mimeType, filename } = await this.readUnstructuredInput(parsed);
    const text = await extractTextFromBuffer(fileBuffer, mimeType, filename);
    const firstPageImage = await getPdfFirstPageImageDataUrl(fileBuffer, mimeType, filename);
    const pagePayload = firstPageImage ? [{ page: 1, image_data_url: firstPageImage }] : [];
    const contentForHash = text
      ? Buffer.from(text, "utf-8")
      : firstPageImage
        ? Buffer.from(firstPageImage, "utf-8")
        : Buffer.alloc(0);

    return this.buildTextResponse({
      text: text || undefined,
      pages: pagePayload.length > 0 ? pagePayload : undefined,
      content_hash: createHash("sha256").update(contentForHash).digest("hex"),
      mime_type: mimeType,
      file_size: fileBuffer.byteLength,
      original_filename: filename,
    });
  }

  private buildTimelineWidgetHtml(): string {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Neotoma Timeline</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    body {
      margin: 0;
      padding: 12px;
      background: transparent;
    }
    .panel {
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 10px;
      padding: 12px;
      background: color-mix(in srgb, canvas 92%, transparent);
    }
    h2 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
    }
    .meta {
      margin: 0 0 10px 0;
      font-size: 12px;
      opacity: 0.75;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.45;
      padding: 10px;
      border-radius: 8px;
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
  </style>
</head>
<body>
  <div class="panel">
    <h2>Neotoma Timeline</h2>
    <p class="meta" id="summary">Waiting for timeline results...</p>
    <pre id="payload">{}</pre>
  </div>
  <script>
    const summaryEl = document.getElementById("summary");
    const payloadEl = document.getElementById("payload");

    function renderPayload(payload) {
      const safePayload = payload ?? {};
      const events = Array.isArray(safePayload.events) ? safePayload.events : [];
      const total = typeof safePayload.total === "number" ? safePayload.total : events.length;
      summaryEl.textContent = total + " event" + (total === 1 ? "" : "s");
      payloadEl.textContent = JSON.stringify(safePayload, null, 2);
    }

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      if (message.method === "ui/initialize") {
        const initial = message.params?.toolResult ?? message.params?.initialToolResult;
        if (initial) renderPayload(initial);
        return;
      }

      if (message.method === "ui/notifications/tool-result") {
        renderPayload(message.params?.result);
      }
    });
  </script>
</body>
</html>`;
  }

  private async retrieveEntitySnapshot(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { getEntityWithProvenance } = await import("./services/entity_queries.js");
    const { observationReducer } = await import("./reducers/observation_reducer.js");
    const { renderEntityCompactText } = await import("./services/canonical_markdown.js");
    const { schemaRegistry } = await import("./services/schema_registry.js");

    const parsed = EntitySnapshotRequestSchema.parse(args ?? {});
    const responseFormat = parsed.format ?? "markdown";

    const renderEntitySnapshotResponse = async (payload: {
      entity_id: string;
      entity_type: string;
      schema_version: string;
      snapshot: Record<string, unknown>;
      raw_fragments?: unknown;
      provenance: Record<string, string>;
      computed_at: string | null | undefined;
      observation_count: number;
      last_observation_at: string | null | undefined;
    }): Promise<{ content: Array<{ type: string; text: string }> }> => {
      if (responseFormat === "json") {
        return this.buildTextResponse(payload);
      }
      let schemaFieldOrder: string[] | undefined;
      try {
        const schema = await schemaRegistry.loadActiveSchema(
          payload.entity_type,
          this.authenticatedUserId ?? undefined
        );
        if (schema?.schema_definition?.fields) {
          schemaFieldOrder = Object.keys(schema.schema_definition.fields);
        }
      } catch {
        // Fall through with alphabetical ordering if schema load fails.
      }
      const text = renderEntityCompactText(
        {
          entity_id: payload.entity_id,
          entity_type: payload.entity_type,
          schema_version: payload.schema_version,
          snapshot: payload.snapshot,
          computed_at: payload.computed_at ?? null,
          observation_count: payload.observation_count,
          last_observation_at: payload.last_observation_at ?? null,
          provenance: payload.provenance,
        },
        schemaFieldOrder,
        { includeProvenance: true }
      );
      return { content: [{ type: "text", text }] };
    };

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
          return renderEntitySnapshotResponse({
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
          observation_source: obs.observation_source ?? null,
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
        return renderEntitySnapshotResponse({
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
    return renderEntitySnapshotResponse({
      entity_id: entity.entity_id,
      entity_type: entity.entity_type,
      schema_version: (entity as { schema_version?: string }).schema_version ?? entity.entity_type,
      snapshot:
        ((entity as { snapshot?: Record<string, unknown> }).snapshot as
          | Record<string, unknown>
          | undefined) ?? {},
      raw_fragments: (entity as { raw_fragments?: unknown }).raw_fragments,
      provenance:
        ((entity as { provenance?: Record<string, string> }).provenance as
          | Record<string, string>
          | undefined) ?? {},
      computed_at: (entity as { computed_at?: string | null }).computed_at ?? null,
      observation_count: (entity as { observation_count?: number }).observation_count ?? 0,
      last_observation_at:
        (entity as { last_observation_at?: string | null }).last_observation_at ?? null,
    });
  }

  private async listObservations(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = ListObservationsRequestSchema.parse(args ?? {});
    const userId = this.getAuthenticatedUserId(undefined);

    let obsQuery = db
      .from("observations")
      .select("*", { count: "exact" })
      .eq("entity_id", parsed.entity_id)
      .eq("user_id", userId);

    if (parsed.updated_since) {
      obsQuery = obsQuery.gte("observed_at", parsed.updated_since);
    }
    if (parsed.created_since) {
      obsQuery = obsQuery.gte("observed_at", parsed.created_since);
    }

    const {
      data: observations,
      error,
      count,
    } = await obsQuery
      .order("observed_at", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to list observations: ${error.message}`);
    }

    return this.buildTextResponse({
      observations: observations || [],
      total: count || 0,
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
    const rawArgs =
      args && typeof args === "object" && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
    const hasSearchIntent = "search" in rawArgs || "search_query" in rawArgs || "query" in rawArgs;
    if (hasSearchIntent && typeof parsed.search === "string" && parsed.search.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "search must be a non-empty string when search parameters are provided"
      );
    }

    // Use authenticated user_id, validate if provided
    const userId = this.getAuthenticatedUserId(parsed.user_id);

    const { entities, total, excluded_merged } = await queryEntitiesWithCount({
      userId,
      entityType: parsed.entity_type,
      includeMerged: parsed.include_merged,
      includeSnapshots: parsed.include_snapshots,
      sortBy: parsed.sort_by,
      sortOrder: parsed.sort_order,
      published: parsed.published,
      publishedAfter: parsed.published_after,
      publishedBefore: parsed.published_before,
      search: parsed.search,
      similarityThreshold: parsed.similarity_threshold,
      limit: parsed.limit,
      offset: parsed.offset,
      updatedSince: parsed.updated_since,
      createdSince: parsed.created_since,
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

    const orderColumn = parsed.order_by === "created_at" ? "created_at" : "event_timestamp";

    // Get events with pagination
    const { data: events, error } = await query
      .order(orderColumn, { ascending: false })
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
    const userId = this.getAuthenticatedUserId(undefined);
    const { entities, total } = await retrieveEntityByIdentifierWithFallback({
      identifier: parsed.identifier,
      entityType: parsed.entity_type,
      userId,
      limit: parsed.limit ?? 100,
      by: parsed.by,
      includeObservations: parsed.include_observations,
      observationsLimit: parsed.observations_limit,
    });

    return this.buildTextResponse({
      entities,
      total,
    });
  }

  private async retrieveRelatedEntities(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const parsed = RetrieveRelatedEntitiesSchema.parse(args ?? {});
    const userId = this.getAuthenticatedUserId(undefined);

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
            .eq("source_entity_id", entityId)
            .eq("user_id", userId)
            .order("relationship_key", { ascending: true });

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
            .eq("target_entity_id", entityId)
            .eq("user_id", userId)
            .order("relationship_key", { ascending: true });

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
        .eq("user_id", userId)
        .order("canonical_name", { ascending: true })
        .order("id", { ascending: true })
        .in("id", Array.from(relatedEntityIds));

      if (!entityError && entityData) {
        entities = entityData;

        // Include snapshots
        const { data: snapshots, error: snapError } = await db
          .from("entity_snapshots")
          .select("*")
          .eq("user_id", userId)
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
      total_entities: entities.length,
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
  private async getEntityTypeCounts(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const schema = z.object({
      user_id: z.string().optional(),
    });

    const parsed = schema.parse(args ?? {});
    const userId = this.getAuthenticatedUserId(parsed.user_id);
    const { getDashboardStats } = await import("./services/dashboard_stats.js");

    try {
      const stats = await getDashboardStats(userId);
      const sortedEntries = Object.entries(stats.entities_by_type ?? {}).sort((a, b) => {
        const diff = b[1] - a[1];
        return diff !== 0 ? diff : a[0].localeCompare(b[0]);
      });

      return this.buildTextResponse({
        entities_by_type: Object.fromEntries(sortedEntries),
        total_entities: stats.total_entities ?? 0,
        last_updated: stats.last_updated,
        count_source: "dashboard_stats",
        scope: "authenticated_user",
      });
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get entity type counts: ${error.message}`
      );
    }
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
   * Incrementally update schema by adding or removing fields
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
        fields_to_remove: parsed.fields_to_remove,
        schema_version: parsed.schema_version,
        user_specific: parsed.user_specific,
        user_id: parsed.user_specific ? userId : undefined,
        activate: parsed.activate,
        migrate_existing: parsed.migrate_existing,
      });

      return this.buildTextResponse({
        success: true,
        entity_type: parsed.entity_type,
        schema_version: updatedSchema.schema_version,
        fields_added: (parsed.fields_to_add || []).map((f) => f.field_name),
        fields_removed: parsed.fields_to_remove || [],
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
  // Raw file storage plus structured entity storage. Server-side LLM extraction has been removed.
  private async store(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { storeRawContent } = await import("./services/raw_storage.js");

    const schema = z
      .object({
        user_id: z.string().uuid().optional(),
        idempotency_key: z.string().min(1),
        file_idempotency_key: z.string().min(1).optional(),
        file_content: z.string().optional(),
        file_path: z.string().optional(),
        mime_type: z.string().optional(),
        original_filename: z.string().optional(),
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
        observation_source: z
          .enum(["sensor", "llm_summary", "workflow_state", "human", "import"])
          .optional(),
        commit: z.boolean().optional(),
        strict: z.boolean().optional(),
      })
      .refine(
        (data) => {
          const hasFileContent = data.file_content && data.mime_type;
          const hasFilePath = data.file_path;
          const hasEntities = data.entities && data.entities.length > 0;
          return hasFileContent || hasFilePath || hasEntities;
        },
        { message: "Must provide either (file_content+mime_type) OR file_path OR entities array" }
      );

    const parsed = schema.parse(args);
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
        parsed.relationships,
        {
          commit: (parsed as { commit?: boolean }).commit !== false,
          strict: (parsed as { strict?: boolean }).strict === true,
          observationSource: parsed.observation_source,
        }
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
      const fileIdempotencyKey = parsed.file_idempotency_key ?? `${parsed.idempotency_key}-file`;
      const unstructuredResponse = await this.store({
        idempotency_key: fileIdempotencyKey,
        file_content: parsed.file_content,
        file_path: parsed.file_path,
        mime_type: parsed.mime_type,
        original_filename: parsed.original_filename,
        source_priority: parsed.source_priority,
      });
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

    if (parsed.file_path) {
      const { isParquetFile, readParquetFile } = await import("./services/parquet_reader.js");
      if (isParquetFile(parsed.file_path)) {
        const parquetResult = await readParquetFile(parsed.file_path);
        return await this.storeStructuredInternal(
          userId,
          parquetResult.entities,
          parsed.source_priority,
          idempotencyKey,
          parsed.original_filename,
          undefined,
          { observationSource: parsed.observation_source }
        );
      }
    }

    const { fileBuffer, mimeType, filename } = await this.readUnstructuredInput(parsed);
    const storageResult = await storeRawContent({
      userId,
      fileBuffer,
      mimeType,
      originalFilename: filename,
      idempotencyKey,
      provenance: {
        upload_method: "mcp_store",
        client: "mcp",
      },
    });

    const result: Record<string, unknown> = {
      source_id: storageResult.sourceId,
      content_hash: storageResult.contentHash,
      file_size: storageResult.fileSize,
      deduplicated: storageResult.deduplicated,
    };

    const assetInfo = await this.ensureUnstructuredAssetEntity({
      userId,
      sourceId: storageResult.sourceId,
      contentHash: storageResult.contentHash,
      fileSize: storageResult.fileSize,
      mimeType,
      originalFilename: filename,
      storageUrl: storageResult.storageUrl,
      sourcePriority: parsed.source_priority,
      idempotencyKey,
    });
    result.asset_entity_id = assetInfo.entityId;
    result.asset_entity_type = assetInfo.entityType;

    const entityIds = await this.getEntityIdsFromSource(storageResult.sourceId);
    let entities: Array<Record<string, unknown>> = [];
    if (entityIds.length > 0) {
      const validEntityIds = entityIds.filter(Boolean);
      if (validEntityIds.length > 0) {
        const { data: entityData, error: entityError } = await db
          .from("entities")
          .select("*")
          .in("id", validEntityIds);

        if (!entityError && entityData) {
          entities = entityData as Array<Record<string, unknown>>;
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
              snapshot: snapshotMap.get(entity.id as string) || null,
            }));
          }
        }
      }
    }

    const relatedData = await this.getRelatedEntitiesAndRelationships(entityIds);
    result.related_entities = entities;
    result.related_relationships = relatedData.relationships;

    return this.buildTextResponse(result);
  }

  // Helper method to get entity IDs from a source_id
  private getAssetEntityType(mimeType: string): string {
    const normalized = (mimeType || "").toLowerCase();
    if (normalized.startsWith("image/")) return "image_asset";
    if (normalized.startsWith("audio/")) return "audio_asset";
    if (normalized.startsWith("video/")) return "video_asset";
    return "file_asset";
  }

  private async ensureUnstructuredAssetEntity(params: {
    userId: string;
    sourceId: string;
    contentHash: string;
    fileSize: number;
    mimeType: string;
    originalFilename?: string;
    storageUrl: string;
    sourcePriority: number;
    idempotencyKey?: string;
  }): Promise<{ entityId: string; entityType: string }> {
    const { resolveEntity } = await import("./services/entity_resolution.js");
    const { createObservation } = await import("./services/observation_storage.js");
    const {
      userId,
      sourceId,
      contentHash,
      fileSize,
      mimeType,
      originalFilename,
      storageUrl,
      sourcePriority,
      idempotencyKey,
    } = params;
    const entityType = this.getAssetEntityType(mimeType);
    const fields: Record<string, unknown> = {
      source_id: sourceId,
      content_hash: contentHash,
      mime_type: mimeType,
      file_size: fileSize,
      storage_url: storageUrl,
      original_filename: originalFilename,
      title: originalFilename || sourceId,
    };

    const entityId = await resolveEntity({
      entityType,
      fields,
      userId,
    });

    const { data: existingObservation, error: existingObservationError } = await db
      .from("observations")
      .select("id")
      .eq("user_id", userId)
      .eq("source_id", sourceId)
      .eq("entity_id", entityId)
      .limit(1)
      .maybeSingle();

    if (existingObservationError) {
      throw new Error(
        `Failed to check existing asset observation: ${existingObservationError.message}`
      );
    }

    if (!existingObservation) {
      await createObservation({
        entity_id: entityId,
        entity_type: entityType,
        schema_version: "1.0",
        source_id: sourceId,
        interpretation_id: null,
        observed_at: new Date().toISOString(),
        specificity_score: 1.0,
        source_priority: sourcePriority,
        fields,
        user_id: userId,
        idempotency_key: idempotencyKey ? `${idempotencyKey}:asset` : null,
      });
    }

    return { entityId, entityType };
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

    if (process.env.NEOTOMA_DEBUG_ENTITY_IDS_FROM_SOURCE === "1") {
      logger.debug(
        `Found ${observations.length} observation(s) for source ${sourceId}:`,
        observations.map((obs: { id: string; entity_id: string | null }) => ({
          obs_id: obs.id,
          entity_id: obs.entity_id,
        }))
      );
    }

    // Get unique entity IDs, filtering out null/undefined
    const entityIds: string[] = Array.from(
      new Set(
        observations
          .map((obs: { entity_id?: string | null }) => obs.entity_id)
          .filter((id: string | null | undefined): id is string => id != null)
      )
    );

    if (process.env.NEOTOMA_DEBUG_ENTITY_IDS_FROM_SOURCE === "1") {
      logger.debug(`Extracted ${entityIds.length} entity ID(s):`, entityIds);
    }
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
    relationships?: Array<{
      relationship_type: string;
      source_index: number;
      target_index: number;
    }>,
    options: {
      commit?: boolean;
      strict?: boolean;
      observationSource?: import("./shared/action_schemas.js").ObservationSource;
    } = {}
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const commit = options.commit !== false;
    const strict = options.strict === true;
    const observationSource = options.observationSource;
    const { storeRawContent } = await import("./services/raw_storage.js");
    const { resolveEntityWithTrace, CanonicalNameUnresolvedError, MergeRefusedError } =
      await import("./services/entity_resolution.js");
    const { schemaRegistry } = await import("./services/schema_registry.js");
    const { validateFieldsWithConverters } = await import("./services/field_validation.js");
    const { generateObservationId } = await import("./services/observation_identity.js");
    const { db } = await import("./db.js");
    const { detectFlatPackedRows, FlatPackedRowsError } =
      await import("./services/flat_packed_detection.js");

    // Reject flat-packed rows early so MCP clients get a clear error instead
    // of a single corrupted entity snapshot.
    for (const entityData of entities) {
      const detection = detectFlatPackedRows(entityData);
      if (detection.detected) {
        throw new FlatPackedRowsError(detection);
      }
    }

    // Plan mode: resolve deterministically, report planned actions per entity,
    // and skip every write (source row, observations, snapshots, relationships).
    if (!commit) {
      const planEntities: Array<{
        observation_index: number;
        entity_type: string;
        canonical_name: string;
        resolver_path: string[];
        identity_basis: string;
        identity_rule: string;
        action: string;
      }> = [];
      const issues: Array<{ observation_index: number; entity_type: string; message: string }> = [];
      for (let i = 0; i < entities.length; i++) {
        const entityData = entities[i] ?? {};
        const entityType =
          (entityData.entity_type as string) || (entityData.type as string) || "generic";
        const fieldsForPlan = { ...entityData };
        delete fieldsForPlan.entity_type;
        delete fieldsForPlan.type;
        try {
          const result = await resolveEntityWithTrace({
            entityType,
            fields: fieldsForPlan,
            userId,
            commit: false,
            strict,
          });
          planEntities.push({
            observation_index: i,
            entity_type: entityType,
            canonical_name: result.trace.canonicalName,
            resolver_path: result.trace.path,
            identity_basis: result.trace.identityBasis,
            identity_rule: result.trace.identityRule,
            action: result.trace.action,
          });
        } catch (err) {
          if (err instanceof CanonicalNameUnresolvedError || err instanceof MergeRefusedError) {
            issues.push({
              observation_index: i,
              entity_type: entityType,
              message: (err as Error).message,
            });
          } else {
            throw err;
          }
        }
      }
      if (issues.length > 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `store_structured plan: ${issues.length} entity issue(s). ` +
            issues.map((iss) => `[${iss.observation_index}] ${iss.message}`).join(" | ")
        );
      }
      return this.buildTextResponse({
        plan: true,
        commit: false,
        strict,
        source_id: null,
        entities: planEntities,
        entity_snapshots_after: planEntities.map(() => null),
        unknown_fields_count: 0,
        related_entities: [],
        related_relationships: [],
      });
    }

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
      canonicalName: string;
      resolverPath: string[];
      identityBasis: string;
      identityRule: string;
      action: string;
    }> = [];
    let unknownFieldsCount = 0;

    for (const entityData of entities) {
      // Extract entity_type (support both 'entity_type' and 'type' fields)
      let entityType =
        (entityData.entity_type as string) || (entityData.type as string) || "generic";

      // Exclude entity_type and type from field validation (they're metadata)
      const fieldsToValidate = { ...entityData };
      delete fieldsToValidate.entity_type;
      delete fieldsToValidate.type;

      const { getSchemaDefinition, resolveEntityTypeFromAlias } = await import(
        "./services/schema_definitions.js"
      );

      // Prefer a code-defined canonical alias before deciding this type is
      // truly "unknown". This keeps `conversation_message` on the seeded
      // identity-bearing schema even when the DB only has legacy rows (for
      // example `agent_message`) or no active row yet.
      const canonicalFromAlias = resolveEntityTypeFromAlias(entityType);
      if (!getSchemaDefinition(entityType) && canonicalFromAlias) {
        entityType = canonicalFromAlias;
      }

      // Load schema for validation from database.
      let schema = await schemaRegistry.loadActiveSchema(entityType, userId);
      let codeSchema = getSchemaDefinition(entityType);

      // Schema-agnostic duplicate-type collapse: before auto-creating a new
      // schema for this candidate, check whether an existing registered type
      // is semantically equivalent (alias, normalized, or same singular form).
      // If so, redirect storage to the canonical type instead of creating a
      // near-duplicate schema like `place`/`places`.
      if (!schema) {
        const { findEquivalentEntityType } = await import("./services/entity_type_equivalence.js");
        const match = await findEquivalentEntityType(entityType, { userId });
        if (match) {
          logger.warn(
            `[STORE] Collapsing new entity_type "${entityType}" -> existing ` +
              `"${match.canonical_entity_type}" (reason: ${match.reason}). ` +
              `Set schema.aliases explicitly if this is wrong.`
          );
          entityType = match.canonical_entity_type;
          schema = await schemaRegistry.loadActiveSchema(entityType, userId);
          codeSchema = getSchemaDefinition(entityType);
        }
      }

      // R2 regression fix: structured-store validation must honor the same
      // code-defined fallback that entity resolution already uses. Without
      // this, known types like `conversation_message` are misclassified as
      // unknown when no active DB schema row exists, which wrongly routes them
      // into schema inference and triggers the R2 registration error.
      if (!schema && codeSchema) {
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

      const { storeConvertedOriginals, storeUnknownFields } =
        await import("./services/raw_fragments.js");
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

      // Resolve entity (user-scoped) and capture the resolver trace so we
      // can surface action / canonical_name / resolver_path per observation.
      let entityId: string;
      let resolverTrace: {
        canonicalName: string;
        path: string[];
        identityBasis: string;
        identityRule: string;
        action: string;
      };
      try {
        const result = await resolveEntityWithTrace({
          entityType,
          fields: validFields,
          userId,
          commit: true,
          strict,
        });
        entityId = result.entityId;
        resolverTrace = {
          canonicalName: result.trace.canonicalName,
          path: result.trace.path,
          identityBasis: result.trace.identityBasis,
          identityRule: result.trace.identityRule,
          action: result.trace.action,
        };
      } catch (err) {
        if (err instanceof CanonicalNameUnresolvedError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Observation ${createdEntities.length} (${entityType}): ${err.message}`
          );
        }
        if (err instanceof MergeRefusedError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Observation ${createdEntities.length} (${entityType}): ${err.message}`
          );
        }
        throw err;
      }

      // Create observation directly (no interpretation_id).
      // Use fieldsForObservation so date-like unknowns are in the observation and thus
      // in the snapshot and timeline, even when not in the schema yet.
      const observationId = generateObservationId(
        storageResult.sourceId,
        null,
        entityId,
        fieldsForObservation
      );
      const { data: existingObservation, error: existingObservationError } = await db
        .from("observations")
        .select("id")
        .eq("id", observationId)
        .maybeSingle();

      if (existingObservationError) {
        throw new Error(
          `Failed to check existing observation ${observationId}: ${existingObservationError.message}`
        );
      }

      if (!existingObservation) {
        // Stamp agent attribution (Phase 1) so the Inspector can show the
        // writing agent for structured-store observations too.
        const { getCurrentAttribution: _structuredAttrib } = await import(
          "./services/request_context.js"
        );
        const structuredAttribution = _structuredAttrib();
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
          observation_source: observationSource ?? "llm_summary",
          fields: fieldsForObservation,
          user_id: userId,
          identity_basis: resolverTrace.identityBasis,
          identity_rule: resolverTrace.identityRule,
          ...(Object.keys(structuredAttribution).length > 0
            ? { provenance: structuredAttribution }
            : {}),
        });

        if (obsError) {
          throw new Error(`Failed to create observation: ${obsError.message}`);
        }
      }

      createdEntities.push({
        entityId,
        entityType,
        observationId,
        canonicalName: resolverTrace.canonicalName,
        resolverPath: resolverTrace.path,
        identityBasis: resolverTrace.identityBasis,
        identityRule: resolverTrace.identityRule,
        action: resolverTrace.action,
      });
    }

    // Compute and store snapshots for all entities
    const snapshotByEntityId = new Map<string, Record<string, unknown>>();
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
          snapshotByEntityId.set(
            snapshot.entity_id,
            (snapshot.snapshot as Record<string, unknown>) || {}
          );

          const sameTypeInBatch = createdEntities.filter(
            (e) => e.entityType === createdEntity.entityType
          ).length;
          const { upsertTimelineEventsForEntitySnapshot } =
            await import("./services/timeline_events.js");
          let timelineSchema: SchemaDefinition | null = null;
          try {
            const { schemaRegistry } = await import("./services/schema_registry.js");
            const entry = await schemaRegistry.loadActiveSchema(
              snapshot.entity_type,
              snapshot.user_id || userId
            );
            timelineSchema = entry?.schema_definition ?? null;
          } catch {
            timelineSchema = null;
          }
          await upsertTimelineEventsForEntitySnapshot({
            entityType: snapshot.entity_type,
            entityId: snapshot.entity_id,
            sourceId: storageResult.sourceId,
            userId: snapshot.user_id || userId,
            snapshot: (snapshot.snapshot as Record<string, unknown>) || {},
            sameTypeInSourceBatch: sameTypeInBatch,
            schema: timelineSchema,
          });

          // Schema-driven auto-linking of reference_fields → typed edges.
          if (timelineSchema?.reference_fields?.length) {
            try {
              const { autoLinkReferenceFields } =
                await import("./services/schema_reference_linking.js");
              await autoLinkReferenceFields({
                entityId: snapshot.entity_id,
                entityType: snapshot.entity_type,
                fields: (snapshot.snapshot as Record<string, unknown>) || {},
                schema: timelineSchema,
                userId: snapshot.user_id || userId,
                sourceId: storageResult.sourceId,
              });
            } catch (linkErr) {
              logger.warn(
                `[STORE] Auto-link reference fields failed for ` +
                  `${snapshot.entity_type}/${snapshot.entity_id}: ` +
                  (linkErr instanceof Error ? linkErr.message : String(linkErr))
              );
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
      entities: createdEntities.map((e, idx) => ({
        observation_index: idx,
        entity_id: e.entityId,
        entity_type: e.entityType,
        observation_id: e.observationId,
        action: e.action,
        canonical_name: e.canonicalName,
        resolver_path: e.resolverPath,
        identity_basis: e.identityBasis,
        identity_rule: e.identityRule,
        entity_snapshot_after: snapshotByEntityId.get(e.entityId) ?? null,
      })),
      unknown_fields_count: unknownFieldsCount,
      related_entities: relatedData.entities,
      related_relationships: relatedData.relationships,
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

  /**
   * MCP list_potential_duplicates: read-only fuzzy duplicate detector (R5).
   * Never auto-merges; returns ranked candidate pairs so an operator or agent
   * can invoke `merge_entities`.
   */
  private async listPotentialDuplicates(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const rawArgs = (args ?? {}) as {
      entity_type?: unknown;
      threshold?: unknown;
      limit?: unknown;
      user_id?: unknown;
    };
    const entityType = typeof rawArgs.entity_type === "string" ? rawArgs.entity_type : "";
    if (!entityType) {
      throw new McpError(ErrorCode.InvalidParams, "entity_type is required");
    }
    const userId = this.getAuthenticatedUserId(
      typeof rawArgs.user_id === "string" ? rawArgs.user_id : undefined
    );

    const threshold =
      typeof rawArgs.threshold === "number"
        ? rawArgs.threshold
        : typeof rawArgs.threshold === "string"
          ? Number(rawArgs.threshold)
          : undefined;
    if (threshold !== undefined && (Number.isNaN(threshold) || threshold <= 0 || threshold > 1)) {
      throw new McpError(ErrorCode.InvalidParams, "threshold must be a number in (0, 1]");
    }
    const limit =
      typeof rawArgs.limit === "number"
        ? rawArgs.limit
        : typeof rawArgs.limit === "string"
          ? Number(rawArgs.limit)
          : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
      throw new McpError(ErrorCode.InvalidParams, "limit must be an integer in [1, 200]");
    }

    const { findDuplicateCandidates } = await import("./services/duplicate_detection.js");
    const candidates = await findDuplicateCandidates({
      entityType,
      userId,
      threshold,
      limit,
    });

    return this.buildTextResponse({
      candidates,
      entity_type: entityType,
      threshold: threshold ?? null,
    });
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

    // ui/timeline_widget
    if (first === "ui" && second === "timeline_widget") {
      return { type: "ui_timeline_widget" };
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
        const { data: userSources } = await db.from("sources").select("id").eq("user_id", userId);

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
