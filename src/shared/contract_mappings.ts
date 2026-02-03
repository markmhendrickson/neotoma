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
    operationId: "listTypes",
    method: "get",
    path: "/types",
    adapter: "cli",
    cliCommand: "request --operation listTypes",
  },
  {
    operationId: "retrieveRecords",
    method: "post",
    path: "/retrieve_records",
    adapter: "cli",
    cliCommand: "request --operation retrieveRecords",
  },
  {
    operationId: "uploadFile",
    method: "post",
    path: "/upload_file",
    adapter: "cli",
    cliCommand: "upload",
  },
  {
    operationId: "analyzeFile",
    method: "post",
    path: "/analyze_file",
    adapter: "cli",
    cliCommand: "analyze",
  },
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
    path: "/api/server-info",
    adapter: "infra",
    notes: "Server info is infrastructure only.",
  },
  {
    operationId: "mcpOAuthInitiate",
    method: "post",
    path: "/api/mcp/oauth/initiate",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthInitiate",
  },
  {
    operationId: "mcpOAuthAuthorize",
    method: "get",
    path: "/api/mcp/oauth/authorize",
    adapter: "cli",
    cliCommand: "auth login",
  },
  {
    operationId: "mcpOAuthToken",
    method: "post",
    path: "/api/mcp/oauth/token",
    adapter: "cli",
    cliCommand: "auth login",
  },
  {
    operationId: "mcpOAuthStatus",
    method: "get",
    path: "/api/mcp/oauth/status",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthStatus",
  },
  {
    operationId: "mcpOAuthListConnections",
    method: "get",
    path: "/api/mcp/oauth/connections",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthListConnections",
  },
  {
    operationId: "mcpOAuthRevokeConnection",
    method: "delete",
    path: "/api/mcp/oauth/connections/{connection_id}",
    adapter: "cli",
    cliCommand: "request --operation mcpOAuthRevokeConnection",
  },
  {
    operationId: "queryEntities",
    method: "post",
    path: "/api/entities/query",
    adapter: "both",
    mcpTool: "retrieve_entities",
    cliCommand: "entities list",
  },
  {
    operationId: "getEntityById",
    method: "get",
    path: "/api/entities/{id}",
    adapter: "cli",
    cliCommand: "entities get",
  },
  {
    operationId: "getEntityObservations",
    method: "get",
    path: "/api/entities/{id}/observations",
    adapter: "cli",
    cliCommand: "request --operation getEntityObservations",
  },
  {
    operationId: "getEntityRelationships",
    method: "get",
    path: "/api/entities/{id}/relationships",
    adapter: "cli",
    cliCommand: "request --operation getEntityRelationships",
  },
  {
    operationId: "mergeEntities",
    method: "post",
    path: "/api/entities/merge",
    adapter: "both",
    mcpTool: "merge_entities",
    cliCommand: "request --operation mergeEntities",
  },
  {
    operationId: "listSources",
    method: "get",
    path: "/api/sources",
    adapter: "cli",
    cliCommand: "sources list",
  },
  {
    operationId: "getSourceById",
    method: "get",
    path: "/api/sources/{id}",
    adapter: "cli",
    cliCommand: "request --operation getSourceById",
  },
  {
    operationId: "listObservations",
    method: "get",
    path: "/api/observations",
    adapter: "cli",
    cliCommand: "request --operation listObservations",
  },
  {
    operationId: "queryObservations",
    method: "post",
    path: "/api/observations/query",
    adapter: "cli",
    cliCommand: "observations list",
  },
  {
    operationId: "createObservation",
    method: "post",
    path: "/api/observations/create",
    adapter: "cli",
    cliCommand: "request --operation createObservation",
  },
  {
    operationId: "listRelationships",
    method: "get",
    path: "/api/relationships",
    adapter: "cli",
    cliCommand: "request --operation listRelationships",
  },
  {
    operationId: "getRelationshipById",
    method: "get",
    path: "/api/relationships/{id}",
    adapter: "cli",
    cliCommand: "request --operation getRelationshipById",
  },
  {
    operationId: "listTimeline",
    method: "get",
    path: "/api/timeline",
    adapter: "both",
    mcpTool: "list_timeline_events",
    cliCommand: "timeline list",
  },
  {
    operationId: "listSchemas",
    method: "get",
    path: "/api/schemas",
    adapter: "both",
    mcpTool: "list_entity_types",
    cliCommand: "schemas list",
  },
  {
    operationId: "getSchemaByEntityType",
    method: "get",
    path: "/api/schemas/{entity_type}",
    adapter: "cli",
    cliCommand: "schemas get",
  },
  {
    operationId: "listInterpretations",
    method: "get",
    path: "/api/interpretations",
    adapter: "cli",
    cliCommand: "request --operation listInterpretations",
  },
  {
    operationId: "getStats",
    method: "get",
    path: "/api/stats",
    adapter: "cli",
    cliCommand: "stats",
  },
  {
    operationId: "storeStructured",
    method: "post",
    path: "/api/store",
    adapter: "both",
    mcpTool: "store",
    cliCommand: "store",
  },
  {
    operationId: "getRecordById",
    method: "get",
    path: "/api/records/{id}",
    adapter: "cli",
    cliCommand: "request --operation getRecordById",
  },
  {
    operationId: "getRecordHistory",
    method: "get",
    path: "/api/records/{id}/history",
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
};

export const MCP_ONLY_TOOLS: string[] = [
  "get_authenticated_user",
  "health_check_snapshots",
  "retrieve_entity_by_identifier",
  "retrieve_related_entities",
  "retrieve_graph_neighborhood",
  "get_relationship_snapshot",
  "analyze_schema_candidates",
  "get_schema_recommendations",
  "update_schema_incremental",
  "register_schema",
  "reinterpret",
  "correct",
];

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
    return `neotoma mcp-only --tool ${toolName}`;
  }
  const operation = getOpenApiOperationMapping(operationId);
  const sanitized = sanitizeCliArgs(args);
  const paramKey = operation?.method === "get" ? "query" : "body";
  const payload = stableStringify({ [paramKey]: sanitized });
  return `neotoma request --operation ${operationId} --params '${payload}' --json`;
}
