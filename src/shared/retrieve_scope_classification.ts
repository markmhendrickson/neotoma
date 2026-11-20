/**
 * Classification of every REST operation (openapi.yaml `operationId`) and
 * every MCP tool for the opt-in agent-grant retrieve scope
 * (`NEOTOMA_ENFORCE_AGENT_RETRIEVE=1`). See docs/subsystems/auth.md
 * "Agent grants: retrieve scope".
 *
 * Classes:
 *   - `write`: a mutation, governed by the write capabilities, not `retrieve`.
 *   - `read_entity`: an entity read with its own per-entity or narrowing check
 *     (round 1: entity query, detail, snapshot, observations, provenance,
 *     identifier lookup).
 *   - `read_scoped`: a read with its own root check and narrowing (round 2:
 *     relationship lists, related entities, graph neighbourhood, timeline,
 *     entity type counts).
 *   - `read_full_scope`: a read that returns entity-derived data with no
 *     per-type check of its own. A grant bound by the retrieve scope may use
 *     it only with a `"*"` retrieve entry; a type-limited grant is refused
 *     (fail closed). Enforced by the shared gate, not per handler.
 *   - `exempt`: returns no entity data (health, server info, auth flows,
 *     schema and instance metadata).
 *
 * MCP tools mapped to an operation in `MCP_TOOL_TO_OPERATION_ID` take that
 * operation's class, so the two surfaces cannot drift. Only tools with no
 * operation mapping are listed in {@link MCP_ONLY_TOOL_RETRIEVE_CLASS}.
 * tests/contract/retrieve_scope_coverage_guard.test.ts fails when an
 * operation in openapi.yaml or a tool in NEOTOMA_TOOL_NAMES is unclassified.
 */

import { MCP_TOOL_TO_OPERATION_ID, OPENAPI_OPERATION_MAPPINGS } from "./contract_mappings.js";

export type RetrieveScopeClass =
  | "write"
  | "read_entity"
  | "read_scoped"
  | "read_full_scope"
  | "exempt";

export interface RetrieveScopeEntry {
  class: RetrieveScopeClass;
  reason: string;
}

const W = (reason: string): RetrieveScopeEntry => ({ class: "write", reason });
const R1 = (reason: string): RetrieveScopeEntry => ({ class: "read_entity", reason });
const R2 = (reason: string): RetrieveScopeEntry => ({ class: "read_scoped", reason });
const FULL = (reason: string): RetrieveScopeEntry => ({ class: "read_full_scope", reason });
const EX = (reason: string): RetrieveScopeEntry => ({ class: "exempt", reason });

const AUTH_FLOW = "authentication flow; returns no entity data";
const DISCOVERY = "discovery metadata; returns no entity data";

export const OPERATION_RETRIEVE_CLASS: Record<string, RetrieveScopeEntry> = {
  // Infrastructure and authentication
  healthCheck: EX("liveness probe"),
  readinessCheck: EX("readiness probe"),
  getOpenApiSpec: EX("serves the API description"),
  getServerInfo: EX("server metadata"),
  getMcpInteractionInstructions: EX("instruction text"),
  mcpStreamableHttpPost: EX("MCP transport; each tool is classified on its own"),
  mcpOAuthInitiate: EX(AUTH_FLOW),
  mcpOAuthAuthorize: EX(AUTH_FLOW),
  mcpOAuthToken: EX(AUTH_FLOW),
  getMe: EX("caller identity"),
  mcpOAuthStatus: EX(AUTH_FLOW),
  mcpOAuthListConnections: EX("connection metadata; returns no entity data"),
  mcpOAuthRevokeConnection: W("revokes a connection"),
  oauthServerMetadata: EX(DISCOVERY),
  oauthProtectedResource: EX(DISCOVERY),
  oauthProtectedResourceForMcp: EX(DISCOVERY),
  openidConfigurationNotOffered: EX(DISCOVERY),
  mcpOAuthCallback: EX(AUTH_FLOW),
  mcpOAuthKeyAuthGet: EX(AUTH_FLOW),
  mcpOAuthKeyAuthPost: EX(AUTH_FLOW),
  mcpOAuthSignOut: EX(AUTH_FLOW),
  mcpOAuthLocalLogin: EX(AUTH_FLOW),
  mcpOAuthRegister: EX(AUTH_FLOW),
  mcpOAuthAuthorizationDetails: EX(AUTH_FLOW),
  devSignIn: EX(AUTH_FLOW),
  getAuthenticatedUser: EX("caller identity"),
  getSessionInfo: EX("caller session identity"),
  // Schema and instance metadata
  listSchemas: EX("schema metadata, not entity data"),
  getSchemaByEntityType: EX("schema metadata, not entity data"),
  describeInstancePolicy: EX("instance policy metadata"),
  listRelationshipTypes: EX("relationship type registry, not entity data"),
  getAccessPolicies: EX("instance access policy configuration"),
  listPeers: EX("peer configuration, not entity data"),
  getPeerStatus: EX("peer configuration and sync status counters"),
  // Round 1 entity reads
  listEntities: R1("entity list: typed refuses, untyped narrowed"),
  queryEntities: R1("entity query: typed refuses, untyped narrowed"),
  getEntityById: R1("one named entity"),
  getEntityHtml: R1("one named entity"),
  getEntityObservations: R1("observations of one named entity"),
  listObservations: R1("observation list: entity checked, untyped narrowed"),
  queryObservations: R1("observation query: typed refuses, untyped narrowed"),
  getEntitySnapshot: R1("one named entity"),
  listObservationsForEntity: R1("observations of one named entity"),
  getFieldProvenance: R1("one named entity"),
  retrieveEntityByIdentifier: R1("identifier search: every matched type checked"),
  // Round 2 scoped reads
  getEntityRelationships: R2("root entity checked; neighbours narrowed"),
  listRelationshipsForEntity: R2("root entity checked; neighbours narrowed"),
  retrieveRelatedEntities: R2("root entity checked; neighbours narrowed"),
  retrieveGraphNeighborhood: R2("root entity checked; neighbours narrowed"),
  listTimeline: R2("entity filter checked; untyped narrowed to allowed entities"),
  // Reads with no per-type check: a type-limited grant is refused
  getFileUrl: FULL("file of a source that may back any entity type"),
  listPotentialDuplicates: FULL("candidate entity pairs across types"),
  listSources: FULL("sources may back any entity type"),
  getSourceById: FULL("source may back any entity type"),
  getSourceRelationships: FULL("entities derived from a source"),
  getRecordActivity: FULL("recent changes across entity types"),
  getComplianceScorecard: FULL("per-agent write activity across entity types"),
  listAgentGrants: FULL("agent_grant records"),
  getAgentGrant: FULL("agent_grant record"),
  getRecentConversations: FULL("conversation records and their messages"),
  getRecentConversation: FULL("conversation record and its messages"),
  getConversationTurnIndex: FULL("conversation message records"),
  listRelationships: FULL("relationships across all entities"),
  getRelationshipById: FULL("relationship between entities of any type"),
  getRelationshipSnapshot: FULL("relationship between entities of any type"),
  getTimelineById: FULL("timeline event of any entity"),
  listInterpretations: FULL("interpretation records across entity types"),
  getStats: FULL("dashboard statistics across entity types"),
  getUsage: FULL("usage statistics across entity types"),
  queryContactsAtCompany: FULL("contact entities resolved through a company"),
  identifyEntityBySignals: FULL("entity matches across types"),
  issuesGetStatus: FULL("issue record and its messages"),
  analyzeSchemaCandidates: FULL("field values sampled from stored entities"),
  auditUndeclaredFragments: FULL("field values sampled from stored entities"),
  getSchemaRecommendations: FULL("field values sampled from stored entities"),
  healthCheckSnapshots: FULL("snapshot health across entity types"),
  listSubscriptions: FULL("subscription records"),
  getSubscriptionStatus: FULL("subscription record"),
  eventsStream: FULL("change events across entity types"),
  listSyncEntities: FULL("entities offered for peer sync"),
  // Writes
  mergeEntities: W("merge"),
  splitEntity: W("split"),
  createAgentGrant: W("grant administration"),
  updateAgentGrant: W("grant administration"),
  suspendAgentGrant: W("grant administration"),
  revokeAgentGrant: W("grant administration"),
  restoreAgentGrant: W("grant administration"),
  createObservation: W("observation write"),
  createInterpretation: W("interpretation write"),
  store: W("store"),
  createRelationship: W("relationship write"),
  createRelationships: W("relationship write"),
  bulkCloseIssues: W("issue write"),
  bulkRemoveIssues: W("issue write"),
  issuesAddMessage: W("issue write"),
  issuesSubmit: W("issue write"),
  issuesSync: W("issue sync"),
  deleteEntity: W("delete"),
  restoreEntity: W("restore"),
  deleteRelationship: W("relationship delete"),
  restoreRelationship: W("relationship restore"),
  updateSchemaIncremental: W("schema write"),
  registerRelationshipType: W("relationship type write"),
  registerSchema: W("schema write"),
  correctTransaction: W("correction"),
  correct: W("correction"),
  patchArrayItem: W("correction"),
  batchCorrectEntity: W("correction"),
  turnSummary: W("turn summary write"),
  revokeGuestAccessToken: W("token administration"),
  publishRenderedPage: W("page publish"),
  subscribe: W("subscription write"),
  unsubscribe: W("subscription write"),
  addPeer: W("peer configuration"),
  removePeer: W("peer configuration"),
  syncPeer: W("peer sync"),
  resolveSyncConflict: W("peer sync"),
  applySyncWebhook: W("peer sync"),
};

/** MCP tools that have no operation mapping in MCP_TOOL_TO_OPERATION_ID. */
export const MCP_ONLY_TOOL_RETRIEVE_CLASS: Record<string, RetrieveScopeEntry> = {
  get_entity_type_counts: R2("counts returned only for allowed types"),
  parse_file: EX("parses a supplied file; reads nothing stored"),
  npm_check_update: EX("package version check"),
  manage_bundles: FULL("bundle administration; type-limited grants refused"),
  submit_entity: W("entity submission"),
  add_entity_message: W("entity submission message"),
  sync_entity_submissions: W("entity submission sync"),
  get_entity_submission_status: FULL("submitted entity record and its messages"),
  list_entity_submissions: FULL("submitted entity records"),
};

/** The class of an MCP tool, derived from its operation mapping first. */
export function retrieveClassForTool(toolName: string): RetrieveScopeEntry | undefined {
  const operationId = MCP_TOOL_TO_OPERATION_ID[toolName];
  if (operationId) return OPERATION_RETRIEVE_CLASS[operationId];
  return MCP_ONLY_TOOL_RETRIEVE_CLASS[toolName];
}

/** The class of an operation by id. */
export function retrieveClassForOperation(operationId: string): RetrieveScopeEntry | undefined {
  return OPERATION_RETRIEVE_CLASS[operationId];
}

/**
 * Operations and tools with no classification. Used by the coverage guard;
 * a non-empty result means a new operation was added without a decision.
 */
export function findUnclassified(
  operationIds: string[],
  toolNames: string[]
): { operations: string[]; tools: string[] } {
  return {
    operations: operationIds.filter((id) => !retrieveClassForOperation(id)),
    tools: toolNames.filter((name) => !retrieveClassForTool(name)),
  };
}

function pathPattern(path: string): RegExp {
  const escaped = path
    .replace(/\/+$/, "")
    .split(/(\{[^}]+\})/)
    .map((part) =>
      /^\{[^}]+\}$/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("");
  // Express 4 routing ignores letter case and a trailing slash by default.
  return new RegExp(`^${escaped}/*$`, "i");
}

/**
 * REST routes of `read_full_scope` operations, derived from the contract
 * mappings (method + path), so a reclassification moves both surfaces.
 */
export const FULL_SCOPE_REST_ROUTES: Array<{ operationId: string; method: string; re: RegExp }> =
  OPENAPI_OPERATION_MAPPINGS.filter(
    (m) => OPERATION_RETRIEVE_CLASS[m.operationId]?.class === "read_full_scope"
  ).map((m) => ({ operationId: m.operationId, method: m.method.toUpperCase(), re: pathPattern(m.path) }));

/** The `read_full_scope` operation a REST request targets, if any. */
export function fullScopeOperationForRequest(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  const effective = upper === "HEAD" ? "GET" : upper;
  for (const route of FULL_SCOPE_REST_ROUTES) {
    if (route.method === effective && route.re.test(path)) return route.operationId;
  }
  return null;
}
