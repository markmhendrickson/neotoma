export type OperationAdapter = "mcp" | "cli" | "both" | "infra";

export interface OpenApiOperationMapping {
  operationId: string;
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  adapter: OperationAdapter;
  mcpTool?: string;
  cliCommand?: string;
  notes?: string;
}

export const OPENAPI_OPERATION_MAPPINGS: OpenApiOperationMapping[] = [
  {
    operationId: "getFileUrl",
    method: "get",
    path: "/get_file_url",
    adapter: "both",
    mcpTool: "retrieve_file_url",
    cliCommand: "request --operation getFileUrl",
  },
  {
    operationId: "healthCheck",
    method: "get",
    path: "/health",
    adapter: "infra",
    notes: "Health endpoint is infrastructure only.",
  },
  {
    operationId: "getOpenApiSpec",
    method: "get",
    path: "/openapi.yaml",
    adapter: "infra",
    notes: "OpenAPI spec fetch is infrastructure only.",
  },
  {
    operationId: "getServerInfo",
    method: "get",
    path: "/server-info",
    adapter: "infra",
    notes: "Server info is infrastructure only.",
  },
  {
    operationId: "oauthServerMetadata",
    method: "get",
    path: "/.well-known/oauth-authorization-server",
    adapter: "infra",
    notes: "OAuth metadata endpoint is infrastructure only.",
  },
  {
    operationId: "oauthProtectedResource",
    method: "get",
    path: "/.well-known/oauth-protected-resource",
    adapter: "infra",
    notes: "OAuth protected resource metadata endpoint is infrastructure only.",
  },
  {
    operationId: "mcpOAuthInitiate",
    method: "post",
    path: "/mcp/oauth/initiate",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthInitiate",
  },
  {
    operationId: "mcpOAuthAuthorize",
    method: "get",
    path: "/mcp/oauth/authorize",
    adapter: "cli",
    cliCommand: "auth login",
  },
  {
    operationId: "mcpOAuthToken",
    method: "post",
    path: "/mcp/oauth/token",
    adapter: "cli",
    cliCommand: "auth login",
  },
  {
    operationId: "mcpOAuthCallback",
    method: "get",
    path: "/mcp/oauth/callback",
    adapter: "cli",
    cliCommand: "auth login",
  },
  {
    operationId: "mcpOAuthKeyAuthGet",
    method: "get",
    path: "/mcp/oauth/key-auth",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthKeyAuthGet",
  },
  {
    operationId: "mcpOAuthKeyAuthPost",
    method: "post",
    path: "/mcp/oauth/key-auth",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthKeyAuthPost",
  },
  {
    operationId: "mcpOAuthLocalLogin",
    method: "get",
    path: "/mcp/oauth/local-login",
    adapter: "cli",
    cliCommand: "auth login --dev-stub",
  },
  {
    operationId: "mcpOAuthRegister",
    method: "post",
    path: "/mcp/oauth/register",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthRegister",
  },
  {
    operationId: "getMe",
    method: "get",
    path: "/me",
    adapter: "infra",
    notes: "Current user from auth; used by CLI auth status.",
  },
  {
    operationId: "devSignIn",
    method: "post",
    path: "/auth/dev-signin",
    adapter: "cli",
    cliCommand: "auth login --dev-stub",
    notes: "Development-only local sign-in endpoint.",
  },
  {
    operationId: "mcpOAuthStatus",
    method: "get",
    path: "/mcp/oauth/status",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthStatus",
  },
  {
    operationId: "mcpOAuthListConnections",
    method: "get",
    path: "/mcp/oauth/connections",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthListConnections",
  },
  {
    operationId: "mcpOAuthAuthorizationDetails",
    method: "get",
    path: "/mcp/oauth/authorization-details",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthAuthorizationDetails",
  },
  {
    operationId: "mcpOAuthRevokeConnection",
    method: "delete",
    path: "/mcp/oauth/connections/{connection_id}",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthRevokeConnection",
  },
  {
    operationId: "queryEntities",
    method: "post",
    path: "/entities/query",
    adapter: "both",
    mcpTool: "retrieve_entities",
    cliCommand: "entities list",
  },
  {
    operationId: "getEntityById",
    method: "get",
    path: "/entities/{id}",
    adapter: "cli",
    cliCommand: "entities get",
  },
  {
    operationId: "getEntityObservations",
    method: "get",
    path: "/entities/{id}/observations",
    adapter: "cli",
    cliCommand: "request --operation getEntityObservations",
  },
  {
    operationId: "getEntityRelationships",
    method: "get",
    path: "/entities/{id}/relationships",
    adapter: "cli",
    cliCommand: "request --operation getEntityRelationships",
  },
  {
    operationId: "mergeEntities",
    method: "post",
    path: "/entities/merge",
    adapter: "both",
    mcpTool: "merge_entities",
    cliCommand: "request --operation mergeEntities",
  },
  {
    operationId: "listSources",
    method: "get",
    path: "/sources",
    adapter: "cli",
    cliCommand: "sources list",
  },
  {
    operationId: "getSourceById",
    method: "get",
    path: "/sources/{id}",
    adapter: "cli",
    cliCommand: "request --operation getSourceById",
  },
  {
    operationId: "listObservations",
    method: "get",
    path: "/observations",
    adapter: "cli",
    cliCommand: "request --operation listObservations",
  },
  {
    operationId: "queryObservations",
    method: "post",
    path: "/observations/query",
    adapter: "cli",
    cliCommand: "observations list",
  },
  {
    operationId: "createObservation",
    method: "post",
    path: "/observations/create",
    adapter: "cli",
    cliCommand: "request --operation createObservation",
  },
  {
    operationId: "listRelationships",
    method: "get",
    path: "/relationships",
    adapter: "cli",
    cliCommand: "request --operation listRelationships",
  },
  {
    operationId: "getRelationshipById",
    method: "get",
    path: "/relationships/{id}",
    adapter: "cli",
    cliCommand: "request --operation getRelationshipById",
  },
  {
    operationId: "listTimeline",
    method: "get",
    path: "/timeline",
    adapter: "both",
    mcpTool: "list_timeline_events",
    cliCommand: "timeline list",
  },
  {
    operationId: "getTimelineById",
    method: "get",
    path: "/timeline/{id}",
    adapter: "cli",
    cliCommand: "timeline get",
  },
  {
    operationId: "listSchemas",
    method: "get",
    path: "/schemas",
    adapter: "both",
    mcpTool: "list_entity_types",
    cliCommand: "schemas list",
  },
  {
    operationId: "getSchemaByEntityType",
    method: "get",
    path: "/schemas/{entity_type}",
    adapter: "cli",
    cliCommand: "schemas get",
  },
  {
    operationId: "listInterpretations",
    method: "get",
    path: "/interpretations",
    adapter: "cli",
    cliCommand: "request --operation listInterpretations",
  },
  {
    operationId: "getStats",
    method: "get",
    path: "/stats",
    adapter: "cli",
    cliCommand: "stats",
  },
  {
    operationId: "storeStructured",
    method: "post",
    path: "/store",
    adapter: "both",
    mcpTool: "store",
    cliCommand: "store",
  },
  {
    operationId: "storeUnstructured",
    method: "post",
    path: "/store/unstructured",
    adapter: "both",
    mcpTool: "store_unstructured",
    cliCommand: "upload <path>",
  },
  {
    operationId: "getRecordById",
    method: "get",
    path: "/records/{id}",
    adapter: "cli",
    cliCommand: "request --operation getRecordById",
  },
  {
    operationId: "getRecordHistory",
    method: "get",
    path: "/records/{id}/history",
    adapter: "cli",
    cliCommand: "request --operation getRecordHistory",
  },
  {
    operationId: "getEntitySnapshot",
    method: "post",
    path: "/get_entity_snapshot",
    adapter: "both",
    mcpTool: "retrieve_entity_snapshot",
    cliCommand: "request --operation getEntitySnapshot",
  },
  {
    operationId: "listObservationsForEntity",
    method: "post",
    path: "/list_observations",
    adapter: "both",
    mcpTool: "list_observations",
    cliCommand: "request --operation listObservationsForEntity",
  },
  {
    operationId: "getFieldProvenance",
    method: "post",
    path: "/get_field_provenance",
    adapter: "both",
    mcpTool: "retrieve_field_provenance",
    cliCommand: "request --operation getFieldProvenance",
  },
  {
    operationId: "createRelationship",
    method: "post",
    path: "/create_relationship",
    adapter: "both",
    mcpTool: "create_relationship",
    cliCommand: "request --operation createRelationship",
  },
  {
    operationId: "listRelationshipsForEntity",
    method: "post",
    path: "/list_relationships",
    adapter: "both",
    mcpTool: "list_relationships",
    cliCommand: "relationships list",
  },
  {
    operationId: "recordComparison",
    method: "post",
    path: "/record_comparison",
    adapter: "cli",
    cliCommand: "request --operation recordComparison",
  },
  {
    operationId: "generateEmbedding",
    method: "post",
    path: "/generate_embedding",
    adapter: "cli",
    cliCommand: "request --operation generateEmbedding",
  },
  {
    operationId: "retrieveEntityByIdentifier",
    method: "post",
    path: "/retrieve_entity_by_identifier",
    adapter: "both",
    mcpTool: "retrieve_entity_by_identifier",
    cliCommand: "entities search",
  },
  {
    operationId: "retrieveRelatedEntities",
    method: "post",
    path: "/retrieve_related_entities",
    adapter: "both",
    mcpTool: "retrieve_related_entities",
    cliCommand: "entities related",
  },
  {
    operationId: "retrieveGraphNeighborhood",
    method: "post",
    path: "/retrieve_graph_neighborhood",
    adapter: "both",
    mcpTool: "retrieve_graph_neighborhood",
    cliCommand: "entities neighborhood",
  },
  {
    operationId: "deleteEntity",
    method: "post",
    path: "/delete_entity",
    adapter: "both",
    mcpTool: "delete_entity",
    cliCommand: "entities delete",
  },
  {
    operationId: "restoreEntity",
    method: "post",
    path: "/restore_entity",
    adapter: "both",
    mcpTool: "restore_entity",
    cliCommand: "entities restore",
  },
  {
    operationId: "deleteRelationship",
    method: "post",
    path: "/delete_relationship",
    adapter: "both",
    mcpTool: "delete_relationship",
    cliCommand: "relationships delete",
  },
  {
    operationId: "restoreRelationship",
    method: "post",
    path: "/restore_relationship",
    adapter: "both",
    mcpTool: "restore_relationship",
    cliCommand: "relationships restore",
  },
  {
    operationId: "getRelationshipSnapshot",
    method: "post",
    path: "/relationships/snapshot",
    adapter: "both",
    mcpTool: "get_relationship_snapshot",
    cliCommand: "relationships get-snapshot <relationshipType> <sourceEntityId> <targetEntityId>",
  },
  {
    operationId: "analyzeSchemaCandidates",
    method: "post",
    path: "/analyze_schema_candidates",
    adapter: "both",
    mcpTool: "analyze_schema_candidates",
    cliCommand: "schemas analyze-candidates",
  },
  {
    operationId: "getSchemaRecommendations",
    method: "post",
    path: "/get_schema_recommendations",
    adapter: "both",
    mcpTool: "get_schema_recommendations",
    cliCommand: "schemas recommendations",
  },
  {
    operationId: "updateSchemaIncremental",
    method: "post",
    path: "/update_schema_incremental",
    adapter: "both",
    mcpTool: "update_schema_incremental",
    cliCommand: "schemas update-incremental",
  },
  {
    operationId: "registerSchema",
    method: "post",
    path: "/register_schema",
    adapter: "both",
    mcpTool: "register_schema",
    cliCommand: "schemas register",
  },
  {
    operationId: "reinterpret",
    method: "post",
    path: "/reinterpret",
    adapter: "both",
    mcpTool: "reinterpret",
    cliCommand: "interpretations reinterpret",
  },
  {
    operationId: "interpretUninterpreted",
    method: "post",
    path: "/interpret-uninterpreted",
    adapter: "both",
    mcpTool: "interpret_uninterpreted",
    cliCommand: "interpretations interpret-uninterpreted",
  },
  {
    operationId: "correct",
    method: "post",
    path: "/correct",
    adapter: "both",
    mcpTool: "correct",
    cliCommand: "corrections create",
  },
  {
    operationId: "getAuthenticatedUser",
    method: "post",
    path: "/get_authenticated_user",
    adapter: "both",
    mcpTool: "get_authenticated_user",
    cliCommand: "auth whoami",
  },
  {
    operationId: "healthCheckSnapshots",
    method: "post",
    path: "/health_check_snapshots",
    adapter: "both",
    mcpTool: "health_check_snapshots",
    cliCommand: "snapshots check",
  },
];

export const MCP_TOOL_TO_OPERATION_ID: Record<string, string> = {
  retrieve_file_url: "getFileUrl",
  retrieve_entity_snapshot: "getEntitySnapshot",
  list_observations: "listObservationsForEntity",
  retrieve_field_provenance: "getFieldProvenance",
  create_relationship: "createRelationship",
  list_relationships: "listRelationshipsForEntity",
  retrieve_entities: "queryEntities",
  list_timeline_events: "listTimeline",
  list_entity_types: "listSchemas",
  merge_entities: "mergeEntities",
  store: "storeStructured",
  store_structured: "storeStructured",
  store_unstructured: "storeUnstructured",
  retrieve_entity_by_identifier: "retrieveEntityByIdentifier",
  retrieve_related_entities: "retrieveRelatedEntities",
  retrieve_graph_neighborhood: "retrieveGraphNeighborhood",
  delete_entity: "deleteEntity",
  restore_entity: "restoreEntity",
  delete_relationship: "deleteRelationship",
  restore_relationship: "restoreRelationship",
  get_relationship_snapshot: "getRelationshipSnapshot",
  analyze_schema_candidates: "analyzeSchemaCandidates",
  get_schema_recommendations: "getSchemaRecommendations",
  update_schema_incremental: "updateSchemaIncremental",
  register_schema: "registerSchema",
  reinterpret: "reinterpret",
  interpret_uninterpreted: "interpretUninterpreted",
  correct: "correct",
  get_authenticated_user: "getAuthenticatedUser",
  health_check_snapshots: "healthCheckSnapshots",
};

export const MCP_ONLY_TOOLS: string[] = [];

export const MCP_TOOL_TO_CLI_COMMAND: Record<string, string> = {
  get_authenticated_user: "auth whoami",
  health_check_snapshots: "snapshots check",
  retrieve_entity_by_identifier: "entities search <identifier>",
  retrieve_related_entities: "entities related <entityId>",
  retrieve_graph_neighborhood: "entities neighborhood <nodeId>",
  get_relationship_snapshot: "relationships get-snapshot <relationshipType> <sourceEntityId> <targetEntityId>",
  analyze_schema_candidates: "schemas analyze",
  get_schema_recommendations: "schemas recommend <entityType>",
  update_schema_incremental: "schemas update <entityType>",
  register_schema: "schemas register <entityType>",
  reinterpret: "interpretations reinterpret <sourceId>",
  interpret_uninterpreted: "interpretations interpret-uninterpreted",
  correct: "corrections create <entityId> <entityType> <field> <value>",
  store_unstructured: "upload <path>",
};

export function getOpenApiOperationMapping(
  operationId: string
): OpenApiOperationMapping | undefined {
  return OPENAPI_OPERATION_MAPPINGS.find((mapping) => mapping.operationId === operationId);
}

const SAFE_ARG_FIELDS = new Set([
  "entity_id",
  "entity_type",
  "source_id",
  "relationship_type",
  "source_entity_id",
  "target_entity_id",
  "direction",
  "limit",
  "offset",
  "include_snapshots",
  "include_merged",
  "include_entities",
  "include_sources",
  "include_events",
  "include_observations",
  "max_hops",
  "after_date",
  "before_date",
  "event_type",
  "field",
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const serialized = entries.map(([key, val]) => `"${key}":${stableStringify(val)}`);
    return `{${serialized.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sanitizeCliArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") {
    return {};
  }
  const input = args as Record<string, unknown>;
  const sanitizedEntries = Object.keys(input)
    .sort()
    .map((key) => {
      const value = input[key];
      if (!SAFE_ARG_FIELDS.has(key)) {
        return [key, "<redacted>"] as const;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [key, value] as const;
      }
      if (Array.isArray(value)) {
        return [key, value.map((item) => (typeof item === "string" ? item : "<redacted>"))] as const;
      }
      return [key, "<redacted>"] as const;
    });
  return Object.fromEntries(sanitizedEntries);
}

export function buildCliEquivalentInvocation(toolName: string, args: unknown): string {
  const operationId = MCP_TOOL_TO_OPERATION_ID[toolName];
  if (!operationId) {
    const cliCommand = MCP_TOOL_TO_CLI_COMMAND[toolName];
    if (cliCommand) {
      const sanitized = sanitizeCliArgs(args);
      const userId =
        args && typeof args === "object" && typeof (args as Record<string, unknown>).user_id === "string"
          ? (args as Record<string, unknown>).user_id
          : "<user_id>";
      const payload = stableStringify({ args: sanitized });
      return `neotoma ${cliCommand} --user-id ${userId} --args '${payload}' --json`;
    }
    return `neotoma mcp-only --tool ${toolName}`;
  }
  const operation = getOpenApiOperationMapping(operationId);
  const sanitized = sanitizeCliArgs(args);
  const paramKey = operation?.method === "get" ? "query" : "body";
  const payload = stableStringify({ [paramKey]: sanitized });
  return `neotoma request --operation ${operationId} --params '${payload}' --json`;
}
