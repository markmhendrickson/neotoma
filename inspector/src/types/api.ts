/**
 * Attribution / agent-identity fields surfaced from the backend.
 *
 * These match the `AttributionProvenance` block written by the Neotoma
 * write-path services (see `src/crypto/agent_identity.ts`). Every field is
 * optional because existing rows predate AAuth and the Inspector must keep
 * rendering them.
 *
 * `attribution_tier` is the primary display signal; the remaining fields are
 * used for tooltips, filters, and the Settings summary.
 */
export type AgentAttributionTier =
  | "hardware"
  | "operator_attested"
  | "software"
  | "unverified_client"
  | "anonymous";

/**
 * Attestation envelope discriminator. Mirrors `AttestationOutcome.format`
 * from the server-side `aauth_attestation_verifier`. Kept in this file
 * (rather than re-imported from `endpoints/session`) so any per-row
 * provenance enrichment that wants to surface the attestation format
 * shares one canonical type with `/session`.
 */
export type AttestationFormat =
  | "apple-secure-enclave"
  | "webauthn-packed"
  | "tpm2";

export type AttestationFailureReason =
  | "format_unsupported"
  | "challenge_mismatch"
  | "key_binding_mismatch"
  | "chain_invalid"
  | "signature_invalid"
  | "aaguid_not_trusted"
  | "pubarea_mismatch"
  | "verifier_not_implemented"
  | "not_present";

/**
 * Per-row attestation diagnostic block, optionally surfaced through
 * provenance and `AgentDirectoryEntry`. Today the server only stamps
 * the {@link AgentAttributionTier}; this shape pre-positions the
 * Inspector for the v0.9.0 / FU-1 envelope drill-down without
 * triggering a follow-up Inspector release once the server starts
 * emitting it.
 *
 * `verified=true` matches `decision.attestation` on the `/session`
 * endpoint when the agent's `cnf.attestation` envelope was accepted.
 * `verified=false` carries a `reason` so failed promotions are
 * debuggable from the row.
 */
export interface AgentAttestationOutcome {
  verified: boolean;
  format?: AttestationFormat | null;
  reason?: AttestationFailureReason | null;
  /** Authenticator AAGUID (WebAuthn/TPM) or device-key model identifier. */
  aaguid?: string | null;
  /**
   * Whether the attested key matches `cnf.jwk` (RFC 7638 thumbprint
   * comparison). Primary trust gate alongside chain verification.
   */
  key_binding_matches_cnf_jwk?: boolean | null;
  /** Truncated `challenge` digest (hex) — full value never reaches the UI. */
  challenge_digest?: string | null;
  /**
   * One per cert in the attestation chain, leaf → root. Used by the
   * envelope panel to summarise the trust path without exposing raw
   * X.509 bodies.
   */
  chain?: AttestationChainEntry[] | null;
}

export interface AttestationChainEntry {
  subject_cn?: string | null;
  issuer_cn?: string | null;
  serial?: string | null;
  not_before?: string | null;
  not_after?: string | null;
}

export interface AgentAttribution {
  agent_public_key?: string;
  agent_thumbprint?: string;
  agent_algorithm?: string;
  agent_sub?: string;
  agent_iss?: string;
  client_name?: string;
  client_version?: string;
  connection_id?: string;
  attribution_tier?: AgentAttributionTier;
  /** ISO-8601 timestamp when the attribution was recorded. */
  attributed_at?: string;
  /**
   * Optional per-row attestation outcome. Currently never populated by
   * the v0.8.0 server (which only resolves attestation at the
   * `/session` boundary), but the Inspector reads it through to show
   * extra tooltip rows the moment the server starts stamping
   * provenance with it. See `AgentAttestationOutcome`.
   */
  attestation?: AgentAttestationOutcome | null;
  /**
   * Source of an `operator_attested` tier promotion: whether the
   * issuer alone was on the operator allowlist or whether the
   * `iss:sub` composite was. Mirrors `decision.operator_allowlist_source`.
   */
  operator_allowlist_source?: "issuer" | "issuer_subject" | null;
}

export interface Entity {
  id: string;
  entity_type: string;
  canonical_name: string;
  user_id?: string;
  merged_to_entity_id?: string | null;
  merged_at?: string | null;
}

export interface EntitySnapshot {
  /** Present on most API responses; some payloads use `id` only. */
  entity_id?: string;
  entity_type: string;
  schema_version?: string;
  snapshot: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  computed_at?: string;
  observation_count?: number;
  last_observation_at?: string;
  canonical_name?: string;
  id?: string;
  merged_to_entity_id?: string | null;
  merged_at?: string | null;
  /** Optional schema-derived display label for `entity_type`. */
  entity_type_label?: string | null;
  /**
   * Optional, schema-informed ordering of the most important snapshot fields
   * for overview-style display. When absent, clients should fall back to
   * their own ordering heuristics.
   */
  primary_fields?: string[] | null;
  created_at?: string;
}

export interface Source {
  id: string;
  content_hash?: string;
  mime_type?: string;
  storage_url?: string;
  /** Local backend only: resolved absolute path to raw bytes on disk. */
  filesystem_absolute_path?: string;
  file_size?: number;
  original_filename?: string;
  source_type?: string;
  created_at?: string;
  user_id?: string;
  provenance?: Record<string, unknown> & Partial<AgentAttribution>;
}

export interface Observation {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version?: string;
  /** Write classification (sensor, llm_summary, workflow_state, human, import, sync). */
  observation_source?: string | null;
  /** Cross-instance sync: originating Neotoma peer id when replayed from a peer. */
  source_peer_id?: string | null;
  source_id?: string | null;
  interpretation_id?: string | null;
  observed_at?: string;
  specificity_score?: number;
  source_priority?: number;
  fields: Record<string, unknown>;
  user_id?: string;
  canonical_hash?: string;
  /**
   * Human-readable source label attached by the backend
   * (`attachSourceLabelsToObservations`). Prefer this over `source_id` for
   * display.
   */
  source?: string | null;
  /**
   * Agent-identity provenance written at observation creation time. See
   * `AgentAttribution`. Additional free-form keys may coexist in the
   * provenance blob, hence the intersection type.
   */
  provenance?: Record<string, unknown> & Partial<AgentAttribution>;
}

export interface RelationshipSnapshot {
  relationship_key: string;
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
  schema_version?: string;
  snapshot?: Record<string, unknown>;
  computed_at?: string;
  observation_count?: number;
  last_observation_at?: string;
  /**
   * Reducer provenance: a `field → observation_id` map that records which
   * contributing observation produced each snapshot field. This is NOT
   * AAuth / clientInfo attribution — use {@link agent_attribution} for
   * that. Kept as a generic blob so `JsonViewer` and the reducer
   * inspection UI continue to work.
   */
  provenance?: Record<string, unknown>;
  /**
   * Latest agent-identity attribution attached by the backend. Derived
   * from the most recent contributing `relationship_observations.provenance`
   * row. Null when no contributing observation carried attribution keys
   * (anonymous writes, pre-AAuth rows).
   */
  agent_attribution?: (Record<string, unknown> & Partial<AgentAttribution>) | null;
  user_id?: string;
  /**
   * Convenience top-level fields attached by the backend when
   * `expand_entities=true` is requested; populated from the related
   * entity snapshot so clients don't have to look up `related_entities`.
   */
  source_entity_name?: string | null;
  source_entity_type?: string | null;
  source_entity_type_label?: string | null;
  target_entity_name?: string | null;
  target_entity_type?: string | null;
  target_entity_type_label?: string | null;
}

export interface RelationshipObservation {
  id: string;
  source_id?: string;
  observed_at?: string;
  specificity_score?: number;
  source_priority?: number;
  metadata?: Record<string, unknown>;
  /**
   * Agent-identity provenance written at relationship observation time.
   * See {@link AgentAttribution}; coexists with free-form keys.
   */
  provenance?: Record<string, unknown> & Partial<AgentAttribution>;
}

export interface RelationshipSnapshotResponse {
  snapshot: RelationshipSnapshot;
  observations: RelationshipObservation[];
}

export interface RelatedEntityExpansion {
  entity_id?: string;
  entity_type?: string;
  canonical_name?: string;
  snapshot?: Record<string, unknown>;
  /** Present when row comes from `entity_snapshots` expansion. */
  provenance?: Record<string, unknown>;
  raw_fragments?: Record<string, unknown>;
  entity_type_label?: string | null;
  last_observation_at?: string;
}

export interface EntityRelationshipsResponse {
  outgoing: RelationshipSnapshot[];
  incoming: RelationshipSnapshot[];
  relationships: RelationshipSnapshot[];
  related_entities?: Record<string, RelatedEntityExpansion>;
}

/** GET /sources/:id/relationships — flat list (no incoming/outgoing split). */
export interface SourceRelationshipsResponse {
  relationships: RelationshipSnapshot[];
  related_entities?: Record<string, RelatedEntityExpansion>;
}

export interface TimelineEvent {
  id: string;
  event_type?: string;
  event_timestamp?: string;
  event_date?: string;
  source_id?: string;
  source_field?: string;
  entity_id?: string;
  entity_name?: string;
  entity_type?: string;
  created_at?: string;
  user_id?: string;
  entity_ids?: string[];
  properties?: Record<string, unknown>;
  provenance?: Record<string, unknown> & Partial<AgentAttribution>;
}

export interface EntitySchema {
  entity_type: string;
  schema_version?: string;
  field_names?: string[];
  field_summary?: Record<string, unknown>;
  schema_definition?: { fields: Record<string, FieldDefinition> };
  reducer_config?: { merge_policies: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  active?: boolean;
}

export interface FieldDefinition {
  type: string;
  required?: boolean;
  validator?: string;
  converters?: unknown;
}

export interface Interpretation {
  id: string;
  source_id: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  interpretation_config?: Record<string, unknown>;
  observations_created?: number;
  provenance?: Record<string, unknown> & Partial<AgentAttribution>;
}

export type RecordActivityType =
  | "entity"
  | "source"
  | "observation"
  | "interpretation"
  | "timeline_event"
  | "relationship";

export interface RecordActivityItem {
  record_type: RecordActivityType;
  id: string;
  activity_at: string;
  title: string;
  subtitle: string | null;

  /**
   * Enriched, human-readable fields emitted by newer `/record_activity`
   * responses. All optional for backwards compatibility: when absent, UI
   * should fall back to `title`/`subtitle` rendering.
   */
  entity_id?: string | null;
  entity_name?: string | null;
  entity_type?: string | null;
  source_id?: string | null;
  source_filename?: string | null;
  source_type?: string | null;
  source_entity_id?: string | null;
  source_entity_name?: string | null;
  target_entity_id?: string | null;
  target_entity_name?: string | null;
  relationship_type?: string | null;
  event_type?: string | null;
  status?: string | null;
  turn_key?: string | null;
  group_key?: string | null;

  /**
   * Derived agent trust tier for this activity row. Provided by the
   * backend from row-level `AgentAttribution` provenance. Null for
   * record types that do not carry attribution (e.g. entity rows) or
   * rows that predate AAuth.
   */
  attribution_tier?: AgentAttributionTier | null;
  /**
   * Best-effort human-readable agent label for feed rendering. Priority
   * chosen server-side: `client_name` (+ `client_version`) → `agent_sub`
   * → shortened `agent_thumbprint`.
   */
  agent_label?: string | null;
}

/**
 * One row of the Agents directory (`GET /agents`). Aggregates a distinct
 * writer across all write-path tables based on `AgentAttribution`
 * provenance. `agent_key` is a stable identifier suitable for URL paths
 * — format: `thumb:<thumbprint>`, `sub:<subject>`,
 * `name:<client>[@version]`, or `anonymous`.
 */
export interface AgentDirectoryEntry {
  agent_key: string;
  label: string;
  tier: AgentAttributionTier;
  agent_thumbprint?: string | null;
  agent_public_key?: string | null;
  agent_algorithm?: string | null;
  agent_sub?: string | null;
  agent_iss?: string | null;
  client_name?: string | null;
  client_version?: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  total_records: number;
  record_counts: Partial<Record<RecordActivityType, number>>;
  /**
   * Observation rows for this agent, grouped by target `entity_type`
   * (see `GET /agents` OpenAPI). Highlights feedback vs governance vs
   * other high-signal writes.
   */
  observation_entity_type_counts?: Record<string, number>;
  /**
   * Latest attestation outcome observed for this agent. Surfaced on the
   * agent detail page via `AttestationEnvelopePanel`. Optional and
   * forward-compatible: today the v0.8.0 server returns `null`/absent;
   * v0.9.0+ may stamp it once per-row attestation enrichment ships.
   */
  attestation?: AgentAttestationOutcome | null;
  operator_allowlist_source?: "issuer" | "issuer_subject" | null;
}

export interface AgentsListResponse {
  agents: AgentDirectoryEntry[];
  total: number;
}

export interface AgentDetailResponse {
  agent: AgentDirectoryEntry;
}

export interface AgentRecordsResponse {
  items: RecordActivityItem[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export type AgentCapabilityOp =
  | "store_structured"
  | "create_relationship"
  | "correct"
  | "retrieve";

export interface AgentCapabilityEntry {
  op: AgentCapabilityOp;
  entity_types: string[];
}

export type AgentGrantStatus = "active" | "suspended" | "revoked";

export interface AgentGrant {
  grant_id: string;
  user_id: string;
  label: string;
  capabilities: AgentCapabilityEntry[];
  status: AgentGrantStatus;
  match_sub?: string | null;
  match_iss?: string | null;
  match_thumbprint?: string | null;
  notes?: string | null;
  last_used_at?: string | null;
  import_source?: string | null;
  created_at?: string | null;
  last_observation_at?: string | null;
  linked_github_login?: string | null;
  linked_github_user_id?: number | null;
  linked_github_verified_at?: string | null;
}

export interface AgentGrantsListResponse {
  grants: AgentGrant[];
}

export interface AgentGrantResponse {
  grant: AgentGrant;
}

export interface AgentGrantCreateRequest {
  label: string;
  capabilities: AgentCapabilityEntry[];
  status?: AgentGrantStatus;
  match_sub?: string | null;
  match_iss?: string | null;
  match_thumbprint?: string | null;
  notes?: string | null;
}

export interface AgentGrantUpdateRequest {
  label?: string;
  capabilities?: AgentCapabilityEntry[];
  notes?: string | null;
  match_sub?: string | null;
  match_iss?: string | null;
  match_thumbprint?: string | null;
}

export interface RecentConversationRelatedEntity {
  entity_id: string;
  entity_type?: string | null;
  canonical_name?: string | null;
  title?: string | null;
  relationship_type: string;
}

export interface ConversationTurnHookSummary {
  hook_event_count: number;
  tool_invocation_count: number;
  store_structured_calls: number;
  retrieve_calls: number;
  retrieved_entity_count: number;
  stored_entity_count: number;
  neotoma_tool_failures: number;
}

export interface RecentConversationMessage {
  message_id: string;
  canonical_name?: string | null;
  role?: string | null;
  /** Present on v0.6+ snapshots alongside legacy `role`. */
  sender_kind?: string | null;
  content?: string | null;
  turn_key?: string | null;
  activity_at: string;
  related_entities: RecentConversationRelatedEntity[];
  /**
   * Per-turn hook activity summary derived from the matching
   * `conversation_turn` (or legacy `turn_compliance` /
   * `turn_activity`) entity by `turn_key`.
   */
  hook_summary?: ConversationTurnHookSummary | null;
}

export interface ConversationTurnSummary {
  entity_id: string;
  turn_key?: string | null;
  session_id?: string | null;
  turn_id?: string | null;
  conversation_id?: string | null;
  harness?: string | null;
  harness_version?: string | null;
  model?: string | null;
  status?: string | null;
  hook_events: string[];
  missed_steps: string[];
  tool_invocation_count: number;
  store_structured_calls: number;
  retrieve_calls: number;
  neotoma_tool_failures: number;
  retrieved_entity_ids: string[];
  stored_entity_ids: string[];
  injected_context_chars?: number | null;
  failure_hint_shown?: boolean | null;
  safety_net_used?: boolean | null;
  started_at?: string | null;
  ended_at?: string | null;
  activity_at: string;
  cwd?: string | null;
  latest_write_provenance?: Record<string, unknown> | null;
  hook_summary: ConversationTurnHookSummary;
}

export interface ConversationTurnRelatedEntity {
  entity_id: string;
  entity_type?: string | null;
  canonical_name?: string | null;
  title?: string | null;
  relationship_type: string;
  direction: "outgoing" | "incoming";
}

export interface ConversationTurnDetail extends ConversationTurnSummary {
  related_entities: ConversationTurnRelatedEntity[];
  messages: RecentConversationMessage[];
}

export interface ConversationTurnsResponse {
  items: ConversationTurnSummary[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface RecentConversationItem {
  conversation_id: string;
  canonical_name?: string | null;
  title?: string | null;
  activity_at: string;
  message_count: number;
  /** Latest observation provenance on the conversation entity (agent identity). */
  latest_write_provenance?: Record<string, unknown> | null;
  messages: RecentConversationMessage[];
}

export interface RecentConversationsResponse {
  items: RecentConversationItem[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export interface DashboardStats {
  sources_count: number;
  total_entities: number;
  entities_by_type: Record<string, number>;
  total_relationships: number;
  total_events: number;
  total_observations: number;
  total_interpretations: number;
  last_updated: string;
}

/**
 * Rollup of attribution coverage across the write-path record types, used by
 * the Settings "Attribution" section. Counts are per-tier so hardware /
 * operator_attested / software / unverified_client / anonymous ratios can be rendered at a
 * glance. Backend may omit a bucket when the count is zero.
 */
export interface AttributionSummary {
  total_rows: number;
  by_tier: Partial<Record<AgentAttributionTier, number>>;
  by_record_type: Partial<
    Record<
      "observation" | "relationship" | "source" | "timeline_event" | "interpretation",
      {
        total: number;
        by_tier: Partial<Record<AgentAttributionTier, number>>;
      }
    >
  >;
  /** Distinct agents seen (count by `agent_thumbprint` or falling back to client_name). */
  distinct_agents?: number;
  last_attributed_at?: string;
}

export interface ServerInfo {
  httpPort?: number;
  apiBase?: string;
  mcpUrl?: string;
  /** Resolved `NEOTOMA_ENV` on the API process (`development` | `production`). */
  neotoma_env?: string;
  /** Package version (`x.y.z`). */
  version?: string;
  /** Git SHA or fly machine version from the server environment. */
  git_sha?: string | null;
  /** Named endpoint paths relative to the API base. */
  endpoints?: Record<string, string>;
}

/**
 * Server-resolved mode reported by /me. The server picks one of these at boot
 * via `resolveSandboxMode()`; UI gates downstream branch on this value.
 *
 *   - `local`          — installed end-user app (single user, real data).
 *   - `production`     — hosted multi-tenant production deployment.
 *   - `local_sandbox`  — developer's per-install dev environment.
 *   - `hosted_sandbox` — public sandbox at neotoma.io (funnel landing).
 *   - `refuse`         — v0.11.1 advisory shape; surfaced for debug only.
 */
export type ServerMode =
  | "local"
  | "production"
  | "local_sandbox"
  | "hosted_sandbox"
  | "refuse";

export interface UserInfo {
  user_id: string;
  email?: string;
  storage?: {
    storage_backend: string;
    data_dir?: string;
    sqlite_db?: string;
  };
  /**
   * Boot-resolved server mode. Always set when the server has completed
   * startup; absent only in degraded states (test harness without
   * startHTTPServer, or pre-resolver init).
   */
  sandbox_mode?: ServerMode;
}

export interface StoreRequest {
  entities?: Record<string, unknown>[];
  relationships?: StoreRelationship[];
  source_priority?: number;
  idempotency_key?: string;
  file_idempotency_key?: string;
  file_content?: string;
  file_path?: string;
  mime_type?: string;
  original_filename?: string;
  user_id?: string;
}

export interface StoreRelationship {
  relationship_type: string;
  source_index: number;
  target_index: number;
}

export interface StoreResponse {
  source_id?: string;
  entities?: Array<{ entity_id: string; entity_type: string; observation_id?: string }>;
  structured?: {
    success: boolean;
    entities: Array<{ entity_id: string; entity_type: string; observation_id: string }>;
  };
  unstructured?: {
    source_id: string;
    content_hash: string;
    file_size: number;
    deduplicated: boolean;
    interpretation?: Record<string, unknown>;
    entity_ids?: string[];
    asset_entity_id?: string;
  };
}

export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export interface SnapshotFilter {
  op: "eq" | "in" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: unknown;
}

export interface EntitiesQueryParams {
  entity_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  published?: boolean;
  published_after?: string;
  published_before?: string;
  include_snapshots?: boolean;
  include_merged?: boolean;
  user_id?: string;
  /**
   * R3: filter entities by the identity_basis carried on their observations.
   * Most useful value is `heuristic_name`, which surfaces entities that were
   * matched by canonical_name similarity rather than a schema rule.
   */
  identity_basis?:
    | "schema_rule"
    | "schema_lookup"
    | "heuristic_name"
    | "heuristic_fallback"
    | "target_id";
  /** Filter entities by snapshot field values. */
  snapshot_filters?: Record<string, SnapshotFilter>;
}

export interface ObservationsQueryParams {
  entity_id?: string;
  entity_type?: string;
  source_id?: string;
  limit?: number;
  offset?: number;
  user_id?: string;
}

export interface GraphNeighborhoodParams {
  node_id: string;
  node_type?: "entity" | "source";
  include_relationships?: boolean;
  include_sources?: boolean;
  include_events?: boolean;
  include_observations?: boolean;
}

export interface RelatedEntitiesParams {
  entity_id: string;
  relationship_types?: string[];
  direction?: "inbound" | "outbound" | "both";
  max_hops?: number;
  include_entities?: boolean;
}

export interface HealthCheckResult {
  stale_snapshots?: number;
  details?: Record<string, unknown>[];
  auto_fix?: boolean;
}

export interface UsageStats {
  /** Count of active (non-merged) entities per entity_type, sorted by count desc. */
  entities_by_type: Record<string, number>;
  /** Total active entities. */
  total_entities: number;
  /** Count of observations grouped by observation_source. */
  observations_by_source: Record<string, number>;
  /** Total observations. */
  total_observations: number;
  /** Number of entities created in the last 7 days. */
  entities_created_last_7_days: number;
  /** Number of entities created in the last 30 days. */
  entities_created_last_30_days: number;
  /** Number of distinct entity_types that have a registered schema. */
  entity_types_with_schema: number;
  /** Total distinct entity_types present in the entities table. */
  entity_types_total: number;
  last_updated: string;
}

// FU-2026-05-003: Conversation turn index — drives per-turn anchor sections
// (#msg-N, #stored-N, #retrieved-N, #issues-N) and the turn timeline sidebar.
export interface ConversationTurnEntityRef {
  entity_id: string;
  entity_type: string;
  canonical_name?: string | null;
}

export interface ConversationTurnIndexTurn {
  turn_number: number;
  message_entity_id: string;
  role: string;
  turn_key: string;
  content_preview?: string | null;
  created_at?: string | null;
  stored: ConversationTurnEntityRef[];
  retrieved: ConversationTurnEntityRef[];
  issues: ConversationTurnEntityRef[];
}

export interface ConversationTurnIndex {
  conversation_id: string;
  conversation_entity_id: string;
  turns: ConversationTurnIndexTurn[];
}
