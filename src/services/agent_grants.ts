/**
 * Agent grants — domain layer over the `agent_grant` entity_type.
 *
 * Grants are first-class entities (see Stronger AAuth Admission Plan) so
 * they ride the standard entity store: observations, snapshots,
 * `correct`, history view. This module is a thin wrapper that:
 *
 *   - validates the grant shape (capabilities, identity, status)
 *   - exposes ergonomic CRUD helpers reused by the REST routes,
 *     Inspector grants page, env-config import, and the AAuth
 *     admission service
 *   - keeps a small in-memory cache for identity → grant lookups so
 *     admission stays cheap on the hot path while still propagating
 *     revocation within a few seconds
 *
 * Design notes:
 *
 *   - Writes flow through `storeStructuredForApi` / `createCorrection`
 *     so observation history doubles as the audit log. We never insert
 *     observations directly here.
 *   - Cache is keyed by `(thumbprint | sub:iss | sub)` and invalidated
 *     after a small TTL plus on every grant write made through this
 *     service. Revocation made via Inspector / direct entity-store
 *     calls is picked up after at most one TTL cycle.
 *   - Cross-user identity matches: a grant is owned by exactly one
 *     `user_id` (entities row). When the same identity has grants
 *     under multiple users we pick the most recently observed active
 *     grant; admission then resolves to that grant's owner. The
 *     protected-entity-types guard plus per-grant capability rules
 *     keep an admitted agent locked to its owner.
 */

import { db } from "../db.js";
import { queryEntities, getEntityWithProvenance } from "./entity_queries.js";
import {
  AgentCapabilityError,
  type AgentCapabilityEntry,
  type AgentCapabilityOp,
} from "./agent_capabilities.js";

export type AgentGrantStatus = "active" | "suspended" | "revoked";

const GRANT_ENTITY_TYPE = "agent_grant";
const ALLOWED_STATUSES: ReadonlySet<AgentGrantStatus> = new Set([
  "active",
  "suspended",
  "revoked",
]);
const ALLOWED_OPS: ReadonlySet<AgentCapabilityOp> = new Set([
  "store",
  "store_structured",
  "create_relationship",
  "correct",
  "retrieve",
]);

/**
 * Identity match shape persisted on a grant. At least one of
 * `match_sub` or `match_thumbprint` MUST be present (validation lives
 * in {@link validateGrantDraft}). When `match_iss` is set, both `sub`
 * and `iss` from the request must match.
 */
export interface AgentGrantMatch {
  match_sub?: string | null;
  match_iss?: string | null;
  match_thumbprint?: string | null;
}

export interface AgentGrant extends AgentGrantMatch {
  grant_id: string;
  user_id: string;
  label: string;
  capabilities: AgentCapabilityEntry[];
  status: AgentGrantStatus;
  notes?: string | null;
  last_used_at?: string | null;
  import_source?: string | null;
  created_at?: string;
  last_observation_at?: string;
  /** Linked GitHub login (set by `neotoma github link` or Inspector OAuth). */
  linked_github_login?: string | null;
  /** Linked GitHub numeric user id. */
  linked_github_user_id?: number | null;
  /** Timestamp when GitHub link was verified via OAuth. */
  linked_github_verified_at?: string | null;
}

export interface AgentGrantDraft extends AgentGrantMatch {
  label: string;
  capabilities?: AgentCapabilityEntry[];
  status?: AgentGrantStatus;
  notes?: string | null;
  import_source?: string | null;
}

export interface AgentGrantUpdate {
  label?: string;
  capabilities?: AgentCapabilityEntry[];
  notes?: string | null;
  match_sub?: string | null;
  match_iss?: string | null;
  match_thumbprint?: string | null;
}

export interface ListGrantsFilters {
  status?: AgentGrantStatus | "all";
  /** Substring match against `label`, `match_sub`, or `match_thumbprint`. */
  query?: string;
}

export class AgentGrantValidationError extends Error {
  readonly code = "agent_grant_invalid" as const;
  readonly statusCode = 400;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "AgentGrantValidationError";
    this.field = field;
  }
}

export class AgentGrantNotFoundError extends Error {
  readonly code = "agent_grant_not_found" as const;
  readonly statusCode = 404;
  readonly grantId: string;

  constructor(grantId: string) {
    super(`Agent grant ${grantId} not found.`);
    this.name = "AgentGrantNotFoundError";
    this.grantId = grantId;
  }
}

export class AgentGrantStatusTransitionError extends Error {
  readonly code = "agent_grant_status_transition" as const;
  readonly statusCode = 409;
  readonly from: AgentGrantStatus;
  readonly to: AgentGrantStatus;

  constructor(from: AgentGrantStatus, to: AgentGrantStatus) {
    super(`Illegal grant status transition: ${from} → ${to}.`);
    this.name = "AgentGrantStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Allowed status transitions:
 *   active     ↔ suspended
 *   active     → revoked
 *   suspended  → revoked
 *   revoked    → active           (restore; audit-visible)
 *
 * `revoked → suspended` is rejected: callers that want to bring a
 * revoked grant back into rotation must restore it first.
 */
const ALLOWED_TRANSITIONS: Record<AgentGrantStatus, AgentGrantStatus[]> = {
  active: ["suspended", "revoked"],
  suspended: ["active", "revoked"],
  revoked: ["active"],
};

/** ---------- Validation ---------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate the capabilities array. Returns a freshly-allocated, normalised
 * array so callers can pass the result straight to the entity store
 * without worrying about prototype pollution or extra fields.
 */
export function validateCapabilities(
  raw: unknown,
): AgentCapabilityEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new AgentGrantValidationError(
      "capabilities must be an array of { op, entity_types }",
      "capabilities",
    );
  }
  const out: AgentCapabilityEntry[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isPlainObject(entry)) {
      throw new AgentGrantValidationError(
        `capabilities[${i}] must be an object with op and entity_types`,
        `capabilities[${i}]`,
      );
    }
    const op = entry.op;
    if (typeof op !== "string" || !ALLOWED_OPS.has(op as AgentCapabilityOp)) {
      throw new AgentGrantValidationError(
        `capabilities[${i}].op must be one of: ${Array.from(ALLOWED_OPS).join(", ")}`,
        `capabilities[${i}].op`,
      );
    }
    const types = entry.entity_types;
    if (!Array.isArray(types) || types.length === 0) {
      throw new AgentGrantValidationError(
        `capabilities[${i}].entity_types must be a non-empty array of strings`,
        `capabilities[${i}].entity_types`,
      );
    }
    const normalisedTypes: string[] = [];
    for (const [j, t] of types.entries()) {
      if (typeof t !== "string" || t.trim().length === 0) {
        throw new AgentGrantValidationError(
          `capabilities[${i}].entity_types[${j}] must be a non-empty string`,
          `capabilities[${i}].entity_types[${j}]`,
        );
      }
      normalisedTypes.push(t.trim());
    }
    out.push({
      op: op as AgentCapabilityOp,
      entity_types: Array.from(new Set(normalisedTypes)),
    });
  }
  return out;
}

function validateIdentityMatch(match: AgentGrantMatch): AgentGrantMatch {
  const sub = trimOrNull(match.match_sub);
  const iss = trimOrNull(match.match_iss);
  const thumbprint = trimOrNull(match.match_thumbprint);
  if (!sub && !thumbprint) {
    throw new AgentGrantValidationError(
      "Grant must declare at least one of match_sub or match_thumbprint",
      "match",
    );
  }
  if (iss && !sub) {
    throw new AgentGrantValidationError(
      "match_iss requires match_sub (iss alone is not a valid identity)",
      "match_iss",
    );
  }
  return { match_sub: sub, match_iss: iss, match_thumbprint: thumbprint };
}

function validateStatus(value: unknown): AgentGrantStatus {
  if (typeof value !== "string" || !ALLOWED_STATUSES.has(value as AgentGrantStatus)) {
    throw new AgentGrantValidationError(
      `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      "status",
    );
  }
  return value as AgentGrantStatus;
}

function validateLabel(raw: unknown): string {
  const label = trimOrNull(raw);
  if (!label) {
    throw new AgentGrantValidationError(
      "label is required and must be a non-empty string",
      "label",
    );
  }
  return label;
}

/** ---------- Identity → grant cache ---------- */

interface CacheEntry {
  grant: AgentGrant | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5_000;
const identityCache = new Map<string, CacheEntry>();

function cacheKeysForIdentity(input: {
  sub?: string | null;
  iss?: string | null;
  thumbprint?: string | null;
}): string[] {
  const keys: string[] = [];
  if (input.thumbprint) keys.push(`tp:${input.thumbprint}`);
  if (input.sub && input.iss) keys.push(`si:${input.sub}|${input.iss}`);
  if (input.sub) keys.push(`s:${input.sub}`);
  return keys;
}

function cacheKeysForGrant(grant: AgentGrant): string[] {
  return cacheKeysForIdentity({
    sub: grant.match_sub ?? undefined,
    iss: grant.match_iss ?? undefined,
    thumbprint: grant.match_thumbprint ?? undefined,
  });
}

/** Drop every cache entry that touches the given grant's identity. */
export function invalidateGrantCache(grant?: AgentGrant): void {
  if (!grant) {
    identityCache.clear();
    return;
  }
  for (const key of cacheKeysForGrant(grant)) {
    identityCache.delete(key);
  }
}

/** Test-only escape hatch. */
export function clearGrantCacheForTests(): void {
  identityCache.clear();
}

/** ---------- Read helpers ---------- */

function snapshotToGrant(
  entity_id: string,
  user_id: string,
  snapshot: Record<string, unknown>,
  meta: { created_at?: string; last_observation_at?: string },
): AgentGrant {
  const status = validateStatus(snapshot.status);
  const capabilities = validateCapabilities(snapshot.capabilities);
  const label = validateLabel(snapshot.label);
  return {
    grant_id: entity_id,
    user_id,
    label,
    match_sub: trimOrNull(snapshot.match_sub),
    match_iss: trimOrNull(snapshot.match_iss),
    match_thumbprint: trimOrNull(snapshot.match_thumbprint),
    capabilities,
    status,
    notes: trimOrNull(snapshot.notes),
    last_used_at: trimOrNull(snapshot.last_used_at),
    import_source: trimOrNull(snapshot.import_source),
    created_at: meta.created_at,
    last_observation_at: meta.last_observation_at,
  };
}

/**
 * Resolve `entity_id → user_id` for a single grant. The
 * `EntityWithProvenance` shape returned by `getEntityWithProvenance`
 * does not include `user_id`, so we hit the entities table directly.
 */
async function getGrantOwner(grantId: string): Promise<string | null> {
  const { data, error } = await db
    .from("entities")
    .select("user_id, entity_type")
    .eq("id", grantId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.entity_type !== GRANT_ENTITY_TYPE) return null;
  return (data.user_id as string | null) ?? null;
}

/**
 * List grants for a user, optionally filtered. Caller scope is assumed
 * already enforced (route-level auth).
 */
export async function listGrantsForUser(
  userId: string,
  filters: ListGrantsFilters = {},
): Promise<AgentGrant[]> {
  const rows = await queryEntities({
    userId,
    entityType: GRANT_ENTITY_TYPE,
    includeMerged: false,
    includeDeleted: false,
    limit: 1000,
  });
  const grants: AgentGrant[] = [];
  for (const row of rows) {
    try {
      grants.push(
        snapshotToGrant(row.entity_id, userId, row.snapshot ?? {}, {
          created_at: row.created_at,
          last_observation_at: row.last_observation_at,
        }),
      );
    } catch {
      // Malformed grant snapshot — skip rather than break the list.
    }
  }
  const wanted = filters.status ?? "all";
  const filtered = grants.filter((g) =>
    wanted === "all" ? true : g.status === wanted,
  );
  if (filters.query) {
    const q = filters.query.toLowerCase();
    return filtered.filter((g) => {
      return (
        g.label.toLowerCase().includes(q) ||
        (g.match_sub ?? "").toLowerCase().includes(q) ||
        (g.match_thumbprint ?? "").toLowerCase().includes(q)
      );
    });
  }
  return filtered;
}

export async function getGrant(
  userId: string,
  grantId: string,
): Promise<AgentGrant | null> {
  const owner = await getGrantOwner(grantId);
  if (!owner) return null;
  if (owner !== userId) return null;
  const ent = await getEntityWithProvenance(grantId);
  if (!ent) return null;
  if (ent.entity_type !== GRANT_ENTITY_TYPE) return null;
  return snapshotToGrant(ent.entity_id, owner, ent.snapshot ?? {}, {
    created_at: ent.created_at,
    last_observation_at: ent.last_observation_at,
  });
}

/**
 * Find the most recently-observed active grant matching the supplied
 * AAuth identity. Thumbprint match wins over `(sub, iss)` — see plan.
 * Returns `null` when nothing matches.
 */
export async function findActiveGrantByIdentity(input: {
  sub?: string | null;
  iss?: string | null;
  thumbprint?: string | null;
}): Promise<AgentGrant | null> {
  const sub = trimOrNull(input.sub);
  const iss = trimOrNull(input.iss);
  const thumbprint = trimOrNull(input.thumbprint);
  if (!sub && !thumbprint) return null;

  const keys = cacheKeysForIdentity({ sub, iss, thumbprint });
  const now = Date.now();
  for (const key of keys) {
    const hit = identityCache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.grant;
    }
  }

  const grant = await scanForGrant({ sub, iss, thumbprint });
  for (const key of keys) {
    identityCache.set(key, { grant, expiresAt: now + CACHE_TTL_MS });
  }
  return grant;
}

async function scanForGrant(input: {
  sub: string | null;
  iss: string | null;
  thumbprint: string | null;
}): Promise<AgentGrant | null> {
  const rows = await queryEntities({
    entityType: GRANT_ENTITY_TYPE,
    includeMerged: false,
    includeDeleted: false,
    limit: 1000,
    sortBy: "last_observation_at",
    sortOrder: "desc",
  });
  if (rows.length === 0) return null;

  // queryEntities does not include user_id on the returned shape, so we
  // batch-fetch owners for the matched entities below.
  const candidates: Array<{
    entity_id: string;
    snapshot: Record<string, unknown>;
    last_observation_at: string;
    created_at?: string;
    score: number;
  }> = [];

  for (const row of rows) {
    const snap = row.snapshot ?? {};
    if (snap.status !== "active") continue;
    const snapSub = trimOrNull(snap.match_sub);
    const snapIss = trimOrNull(snap.match_iss);
    const snapTp = trimOrNull(snap.match_thumbprint);

    let score = 0;
    if (input.thumbprint && snapTp && input.thumbprint === snapTp) {
      score = 3; // strongest signal
    } else if (input.sub && snapSub && input.sub === snapSub) {
      if (snapIss) {
        if (input.iss && input.iss === snapIss) {
          score = 2; // sub + iss match
        }
      } else {
        score = 1; // sub-only match (grant did not pin iss)
      }
    }
    if (score === 0) continue;
    candidates.push({
      entity_id: row.entity_id,
      snapshot: snap,
      last_observation_at: row.last_observation_at,
      created_at: row.created_at,
      score,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.last_observation_at ?? "").localeCompare(
      a.last_observation_at ?? "",
    );
  });

  for (const cand of candidates) {
    const owner = await getGrantOwner(cand.entity_id);
    if (!owner) continue;
    try {
      return snapshotToGrant(cand.entity_id, owner, cand.snapshot, {
        created_at: cand.created_at,
        last_observation_at: cand.last_observation_at,
      });
    } catch {
      continue;
    }
  }
  return null;
}

/** ---------- Write helpers ---------- */

interface InternalGrantWrite {
  userId: string;
  fields: Record<string, unknown>;
  idempotencyKey: string;
  /**
   * When set, treat this as an upsert against an existing grant. Used by
   * the env-config import command to avoid creating duplicates on
   * re-runs.
   */
  intentTargetEntityId?: string;
}

async function writeGrantEntity(
  params: InternalGrantWrite,
): Promise<AgentGrant> {
  // Lazy import to break the actions.ts ↔ services cycle.
  const { storeStructuredForApi } = await import("../actions.js");
  const result = await storeStructuredForApi({
    userId: params.userId,
    entities: [
      {
        entity_type: GRANT_ENTITY_TYPE,
        ...params.fields,
      },
    ],
    sourcePriority: 80,
    observationSource: "human",
    idempotencyKey: params.idempotencyKey,
  });
  const created = (result as { entities?: Array<{ entity_id: string }> }).entities ?? [];
  if (created.length === 0) {
    throw new Error("Grant write returned no entity (unexpected)");
  }
  const entityId = created[0].entity_id;
  const grant = await getGrant(params.userId, entityId);
  if (!grant) {
    throw new Error(
      `Grant entity ${entityId} not visible after write (snapshot pipeline)`,
    );
  }
  invalidateGrantCache(grant);
  return grant;
}

/**
 * Create a new grant for `userId`. Capability shape is validated.
 * Status defaults to `active`. Idempotent on the canonical-name key
 * derived from the identity match.
 */
export async function createGrant(
  userId: string,
  draft: AgentGrantDraft,
): Promise<AgentGrant> {
  const match = validateIdentityMatch(draft);
  const label = validateLabel(draft.label);
  const capabilities = validateCapabilities(draft.capabilities ?? []);
  const status: AgentGrantStatus = draft.status
    ? validateStatus(draft.status)
    : "active";
  const fields: Record<string, unknown> = {
    label,
    capabilities,
    status,
    match_sub: match.match_sub ?? undefined,
    match_iss: match.match_iss ?? undefined,
    match_thumbprint: match.match_thumbprint ?? undefined,
  };
  if (draft.notes !== undefined) fields.notes = trimOrNull(draft.notes) ?? undefined;
  if (draft.import_source !== undefined) {
    fields.import_source = trimOrNull(draft.import_source) ?? undefined;
  }
  const idempotencyKey = `agent_grant:create:${userId}:${match.match_thumbprint ?? ""}:${match.match_sub ?? ""}:${match.match_iss ?? ""}`;
  return writeGrantEntity({ userId, fields, idempotencyKey });
}

/**
 * Update mutable grant fields. Each changed field is persisted as a
 * `correct` observation so observation history shows exactly what
 * moved. Invalid status transitions (use {@link setStatus}) and
 * identity changes that violate the at-least-one-match rule are
 * rejected up front.
 */
export async function updateGrantFields(
  userId: string,
  grantId: string,
  changes: AgentGrantUpdate,
): Promise<AgentGrant> {
  const existing = await getGrant(userId, grantId);
  if (!existing) {
    throw new AgentGrantNotFoundError(grantId);
  }
  const next: AgentGrantMatch = {
    match_sub: changes.match_sub ?? existing.match_sub ?? null,
    match_iss: changes.match_iss ?? existing.match_iss ?? null,
    match_thumbprint:
      changes.match_thumbprint ?? existing.match_thumbprint ?? null,
  };
  if (
    changes.match_sub !== undefined ||
    changes.match_iss !== undefined ||
    changes.match_thumbprint !== undefined
  ) {
    validateIdentityMatch(next);
  }
  if (changes.capabilities !== undefined) {
    validateCapabilities(changes.capabilities);
  }
  if (changes.label !== undefined) {
    validateLabel(changes.label);
  }

  const { createCorrection } = await import("./correction.js");
  const correctionFields: Array<[string, unknown]> = [];
  if (changes.label !== undefined) correctionFields.push(["label", changes.label.trim()]);
  if (changes.capabilities !== undefined) {
    correctionFields.push([
      "capabilities",
      validateCapabilities(changes.capabilities),
    ]);
  }
  if (changes.notes !== undefined) {
    correctionFields.push(["notes", trimOrNull(changes.notes)]);
  }
  if (changes.match_sub !== undefined) {
    correctionFields.push(["match_sub", trimOrNull(changes.match_sub)]);
  }
  if (changes.match_iss !== undefined) {
    correctionFields.push(["match_iss", trimOrNull(changes.match_iss)]);
  }
  if (changes.match_thumbprint !== undefined) {
    correctionFields.push([
      "match_thumbprint",
      trimOrNull(changes.match_thumbprint),
    ]);
  }

  for (const [field, value] of correctionFields) {
    await createCorrection({
      entity_id: grantId,
      entity_type: GRANT_ENTITY_TYPE,
      field,
      value,
      schema_version: "1.0.0",
      user_id: userId,
      idempotency_key: `agent_grant:update:${grantId}:${field}:${Date.now()}`,
    });
  }

  invalidateGrantCache(existing);
  const refreshed = await getGrant(userId, grantId);
  if (!refreshed) throw new AgentGrantNotFoundError(grantId);
  invalidateGrantCache(refreshed);
  return refreshed;
}

export async function setStatus(
  userId: string,
  grantId: string,
  next: AgentGrantStatus,
): Promise<AgentGrant> {
  validateStatus(next);
  const existing = await getGrant(userId, grantId);
  if (!existing) throw new AgentGrantNotFoundError(grantId);
  if (existing.status === next) return existing;
  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(next)) {
    throw new AgentGrantStatusTransitionError(existing.status, next);
  }
  const { createCorrection } = await import("./correction.js");
  await createCorrection({
    entity_id: grantId,
    entity_type: GRANT_ENTITY_TYPE,
    field: "status",
    value: next,
    schema_version: "1.0.0",
    user_id: userId,
    idempotency_key: `agent_grant:status:${grantId}:${next}:${Date.now()}`,
  });
  invalidateGrantCache(existing);
  const refreshed = await getGrant(userId, grantId);
  if (!refreshed) throw new AgentGrantNotFoundError(grantId);
  invalidateGrantCache(refreshed);
  return refreshed;
}

/** ---------- Match recording (admission service hook) ---------- */

const matchDebounce = new Map<string, string>();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record that the supplied grant was used for admission. Debounced to
 * once per UTC day per grant so admission cost on hot paths stays
 * bounded. Best-effort: failures are logged and swallowed because the
 * caller is on the request critical path.
 */
export async function recordMatch(grant: AgentGrant): Promise<void> {
  const today = todayUtc();
  const last = matchDebounce.get(grant.grant_id);
  if (last === today) return;
  matchDebounce.set(grant.grant_id, today);
  try {
    const { createCorrection } = await import("./correction.js");
    await createCorrection({
      entity_id: grant.grant_id,
      entity_type: GRANT_ENTITY_TYPE,
      field: "last_used_at",
      value: new Date().toISOString(),
      schema_version: "1.0.0",
      user_id: grant.user_id,
      idempotency_key: `agent_grant:last_used:${grant.grant_id}:${today}`,
    });
  } catch (err) {
    // Best-effort. Don't fail the admission flow if observability fails.
    matchDebounce.delete(grant.grant_id);
    if (err instanceof AgentCapabilityError) {
      // The admission service runs as the grant owner; if the protected
      // guard rejects this we have a deeper bug worth surfacing.
      throw err;
    }
  }
}

/** Test-only — clears the debounce map. */
export function clearMatchDebounceForTests(): void {
  matchDebounce.clear();
}
