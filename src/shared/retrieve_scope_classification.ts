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
 *     related entities, graph neighbourhood, entity type counts).
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
  getEntityRelationships: FULL("paged relationship list; per-type narrowing not yet added"),
  listRelationshipsForEntity: FULL("paged relationship list; per-type narrowing not yet added"),
  retrieveRelatedEntities: R2("root entity checked; neighbours narrowed"),
  retrieveGraphNeighborhood: R2("root entity checked; neighbours narrowed"),
  listTimeline: FULL("paged event list; per-type narrowing not yet added"),
  // Reads with no per-type check: a type-limited grant is refused
  getFileUrl: FULL("file of a source that may back any entity type"),
  listPotentialDuplicates: FULL("candidate entity pairs across types"),
  listSources: FULL("sources may back any entity type"),
  getSourceById: FULL("source may back any entity type"),
  getSourceRelationships: FULL("entities derived from a source"),
  getRecordActivity: FULL("recent changes across entity types"),
  getComplianceScorecard: FULL("per-agent write activity across entity types"),
  getAgentRecords: FULL("per-agent record activity rows with entity ids and types"),
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

/** Every resource kind returned by parseResourceUri has an explicit read decision. */
export const MCP_RESOURCE_RETRIEVE_CLASS: Record<string, RetrieveScopeEntry> = {
  entity_collection_all: R1("untyped entity collection narrowed to granted types"),
  entity_collection: R1("typed entity collection checked before reading"),
  entity: R1("named entity and merge chain checked before reading"),
  entity_observations: R1("named entity and merge chain checked before reading"),
  entity_relationships: FULL("relationship collection may contain other entity types"),
  timeline_year: FULL("timeline includes events across entity types"),
  timeline_month: FULL("timeline includes events across entity types"),
  source: FULL("source may back several entity types"),
  source_collection: FULL("sources may back several entity types"),
  relationship_collection_all: FULL("relationships span entity types"),
  relationship_collection: FULL("relationships span entity types"),
  entity_types: EX("schema metadata only"),
  ui_timeline_widget: EX("static widget markup"),
  ui_turn_summary_widget: EX("static widget markup"),
};

export function retrieveClassForResource(kind: string): RetrieveScopeEntry | undefined {
  return MCP_RESOURCE_RETRIEVE_CLASS[kind];
}

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
  ).map((m) => ({
    operationId: m.operationId,
    method: m.method.toUpperCase(),
    re: pathPattern(m.path),
  }));

/** The `read_full_scope` operation a REST request targets, if any. */
export function fullScopeOperationForRequest(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  const effective = upper === "HEAD" ? "GET" : upper;
  for (const route of FULL_SCOPE_REST_ROUTES) {
    if (route.method === effective && route.re.test(path)) return route.operationId;
  }
  return null;
}

/**
 * Registered Express routes that have no operation in openapi.yaml (aliases,
 * UI and site pages, legacy paths). Keyed `METHOD /express/path` exactly as
 * the route is registered. tests/contract/retrieve_scope_registered_routes.test.ts
 * fails when a registered route is in neither this table nor the contract
 * mappings, so an alias cannot reach a handler without a decision.
 */
export const UNDECLARED_ROUTE_RETRIEVE_CLASS: Record<string, RetrieveScopeEntry> = {
  // Exempt: return no entity data
  "GET /": EX("landing page and instance metadata"),
  "GET /.well-known/aauth-resource.json": EX(DISCOVERY),
  "GET /.well-known/mcp/server-card.json": EX(DISCOVERY),
  "GET /docs": EX("bundled documentation"),
  "GET /docs/*": EX("bundled documentation"),
  "GET /favicon.ico": EX("static icon"),
  "GET /robots.txt": EX("static crawler policy"),
  "GET /openapi_actions.yaml": EX("serves the API description"),
  "GET /mcp/oauth/google/start": EX(AUTH_FLOW),
  "GET /mcp/oauth/google/callback": EX(AUTH_FLOW),
  "GET /sandbox/terms": EX("static sandbox terms"),
  "GET /sandbox/report/status": EX("status of a sandbox report by its own access token"),
  "ALL /entities": EX("hinted 404 for misuse of the collection path"),
  "ALL /mcp": EX("MCP transport; each tool is classified on its own"),
  // Round 1 per-entity read with its own check
  "GET /entities/:id/markdown": R1("one named entity"),
  // Aliases of reads with no per-type check: a type-limited grant is refused
  "POST /api/issues/status": FULL("alias of issuesGetStatus"),
  "GET /sources/:id/content": FULL("source content; a source may back any entity type"),
  "GET /turns": FULL("conversation turn records"),
  "GET /turns/:turn_key": FULL("conversation turn record"),
  "GET /agents": FULL("per-agent write activity across entity types"),
  "GET /agents/:key": FULL("per-agent write activity across entity types"),
  "GET /agents/:key/records": FULL("records written by an agent, any entity type"),
  "GET /submit/:entity_type/:entity_id": FULL("submitted entity record and its messages"),
  "GET /bundles": FULL("bundle administration"),
  "GET /bundles/:name": FULL("bundle administration"),
  // Writes
  "POST /api/issues/add_message": W("alias of issuesAddMessage"),
  "POST /api/issues/submit": W("alias of issuesSubmit"),
  "POST /api/issues/sync": W("alias of issuesSync"),
  "POST /github/webhook": W("inbound webhook write"),
  "POST /recompute_snapshots_by_type": W("snapshot recompute"),
  "POST /sandbox/report": W("sandbox report submission"),
  "POST /submit/:entity_type": W("entity submission"),
  "POST /submit/:entity_type/:entity_id/message": W("entity submission message"),
};

/**
 * Path prefixes served by static middleware rather than routes (Inspector
 * bundle assets). They return no entity data, so the default-deny gate lets
 * them through.
 */
export const EXEMPT_STATIC_PATH_PREFIXES: Array<{ prefix: string; reason: string }> = [
  { prefix: "/assets/", reason: "Inspector bundle assets" },
  { prefix: "/inspector/assets/", reason: "Inspector bundle assets" },
];

/** `METHOD /path` with every path parameter rendered as `:p`. */
export function normalizeRouteKey(method: string, path: string): string {
  const shape = path
    .replace(/\{[^}]+\}/g, ":p")
    .replace(/:[A-Za-z0-9_]+(\([^)]*\))?\??/g, ":p")
    .replace(/\/+$/, "");
  return `${method.toUpperCase()} ${shape || "/"}`;
}

function expressPathPattern(path: string): RegExp {
  const escaped = path
    .replace(/\/+$/, "")
    .split(/(:[A-Za-z0-9_]+(?:\([^)]*\))?\??|\*)/)
    .map((part) => {
      if (part === "*") return ".*";
      if (/^:/.test(part)) return "[^/]+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${escaped}/*$`, "i");
}

interface GateRoute {
  id: string;
  methods: string[];
  re: RegExp;
  entry: RetrieveScopeEntry;
}

const GATE_ROUTES: GateRoute[] = [
  ...OPENAPI_OPERATION_MAPPINGS.filter((m) => OPERATION_RETRIEVE_CLASS[m.operationId]).map((m) => ({
    id: m.operationId,
    methods: [m.method.toUpperCase()],
    re: pathPattern(m.path),
    entry: OPERATION_RETRIEVE_CLASS[m.operationId],
  })),
  ...Object.entries(UNDECLARED_ROUTE_RETRIEVE_CLASS).map(([key, entry]) => {
    const space = key.indexOf(" ");
    const method = key.slice(0, space);
    return {
      id: key,
      methods: method === "ALL" ? ["*"] : [method],
      re: expressPathPattern(key.slice(space + 1)),
      entry,
    };
  }),
];

/**
 * What the shared gate does for a REST request under a type-limited grant.
 * Returns the label to refuse with (needs a `"*"` retrieve entry) or `null`
 * to let the request through to its handler.
 *
 * Default deny: a request that matches no classified route is refused. When
 * several classified routes match (a static path that a param path also
 * matches), the most restrictive one wins. `read_entity` and `read_scoped`
 * routes pass through because their handlers run the per-type check;
 * `write` routes are governed by the write capabilities; `exempt` routes
 * return no entity data.
 */
export function retrieveGateTargetForRequest(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  if (upper === "OPTIONS") return null;
  const effective = upper === "HEAD" ? "GET" : upper;
  if (
    effective === "GET" &&
    EXEMPT_STATIC_PATH_PREFIXES.some((p) => path.toLowerCase().startsWith(p.prefix))
  ) {
    return null;
  }
  const matches = GATE_ROUTES.filter(
    (r) => (r.methods.includes(effective) || r.methods.includes("*")) && r.re.test(path)
  );
  if (matches.length === 0) return `${effective} ${path}`;
  const full = matches.find((r) => r.entry.class === "read_full_scope");
  return full ? full.id : null;
}

/**
 * Registered routes (as `{ method, path }`) that no contract mapping and no
 * {@link UNDECLARED_ROUTE_RETRIEVE_CLASS} entry classifies.
 */
export function findUnclassifiedRegisteredRoutes(
  routes: Array<{ method: string; path: string }>
): string[] {
  const known = new Set<string>();
  for (const m of OPENAPI_OPERATION_MAPPINGS) {
    if (OPERATION_RETRIEVE_CLASS[m.operationId]) known.add(normalizeRouteKey(m.method, m.path));
  }
  for (const key of Object.keys(UNDECLARED_ROUTE_RETRIEVE_CLASS)) {
    const space = key.indexOf(" ");
    known.add(normalizeRouteKey(key.slice(0, space), key.slice(space + 1)));
  }
  // `app.all` registers one route per HTTP method; treat it as `ALL`.
  const methodsByPath = new Map<string, Set<string>>();
  for (const r of routes) {
    const set = methodsByPath.get(r.path) ?? new Set<string>();
    set.add(r.method.toUpperCase());
    methodsByPath.set(r.path, set);
  }
  const collapsed: Array<{ method: string; path: string }> = [];
  for (const r of routes) {
    if ((methodsByPath.get(r.path)?.size ?? 0) >= 20)
      collapsed.push({ method: "ALL", path: r.path });
    else collapsed.push(r);
  }
  const missing: string[] = [];
  for (const r of collapsed) {
    const key = `${r.method.toUpperCase()} ${r.path}`;
    const normalized = normalizeRouteKey(r.method, r.path);
    if (known.has(normalized)) continue;
    if (UNDECLARED_ROUTE_RETRIEVE_CLASS[key]) continue;
    missing.push(key);
  }
  return Array.from(new Set(missing)).sort();
}
