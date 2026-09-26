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
 *   - Admission is key-bound: a grant admits a signed request only
 *     when its `match_thumbprint` equals the signing key's thumbprint.
 *     `match_sub` / `match_iss` are descriptive and never admit on their
 *     own (see {@link lookupGrantForIdentity}).
 *   - Cache is keyed by the full presented identity (thumbprint plus
 *     sub/iss), cleared after a small TTL and on every grant
 *     write made through this service. Revocation made via Inspector /
 *     direct entity-store calls is picked up after at most one TTL
 *     cycle.
 *   - Cross-user identity matches: a grant is owned by exactly one
 *     `user_id` (entities row). When the same identity has grants
 *     under multiple users we pick the most recently observed active
 *     grant; admission then resolves to that grant's owner. The
 *     protected-entity-types guard plus per-grant capability rules
 *     keep an admitted agent locked to its owner.
 */

import { db } from "../db.js";
import { queryEntities, getEntityWithProvenance } from "./entity_queries.js";
import { logger } from "../utils/logger.js";
import {
  AgentCapabilityError,
  type AgentCapabilityEntry,
  type AgentCapabilityOp,
} from "./agent_capabilities.js";

export type AgentGrantStatus = "active" | "suspended" | "revoked";

const GRANT_ENTITY_TYPE = "agent_grant";
const ALLOWED_STATUSES: ReadonlySet<AgentGrantStatus> = new Set(["active", "suspended", "revoked"]);
const ALLOWED_OPS: ReadonlySet<AgentCapabilityOp> = new Set([
  "store",
  "store_structured",
  "create_relationship",
  "correct",
  "retrieve",
  // THE FIX: register_relationship_type has been a valid AgentCapabilityOp
  // (agent_capabilities.ts's type union) and has been enforced by
  // enforceRelationshipTypeCapability since #1972 / G25, but was never
  // added to THIS set — the op-allowlist validateCapabilities actually
  // checks against. Every grant carrying a register_relationship_type
  // capability has therefore failed shape validation at
  // `capabilities[i].op must be one of: ...` on every write and every
  // read since the op was introduced, independent of the entity_types /
  // relationship_types fix above.
  "register_relationship_type",
  "github_harness:read",
  "github_harness:write",
  "github_harness:*",
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
/** True for github_harness:* family ops which use `repos` instead of `entity_types`. */
function isHarnessOp(op: string): boolean {
  return op === "github_harness:read" || op === "github_harness:write" || op === "github_harness:*";
}

/**
 * True for `register_relationship_type`, which is scoped by
 * `relationship_types`, NOT `entity_types` (see the field doc on
 * {@link AgentCapabilityEntry.relationship_types} in agent_capabilities.ts,
 * and ateles#925: the operator's ruling widens the grant tuple with a
 * PARALLEL `relationship_types[]` field rather than overloading
 * `entity_types` to mean two vocabularies).
 */
function isRelationshipTypeOp(op: string): boolean {
  return op === "register_relationship_type";
}

export function validateCapabilities(raw: unknown): AgentCapabilityEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new AgentGrantValidationError(
      "capabilities must be an array of { op, entity_types } or { op, repos } for github_harness ops",
      "capabilities"
    );
  }
  const out: AgentCapabilityEntry[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isPlainObject(entry)) {
      throw new AgentGrantValidationError(
        `capabilities[${i}] must be an object with op and entity_types`,
        `capabilities[${i}]`
      );
    }
    const op = entry.op;
    if (typeof op !== "string" || !ALLOWED_OPS.has(op as AgentCapabilityOp)) {
      throw new AgentGrantValidationError(
        `capabilities[${i}].op must be one of: ${Array.from(ALLOWED_OPS).join(", ")}`,
        `capabilities[${i}].op`
      );
    }

    const harness = isHarnessOp(op);
    const relationshipTypeOp = isRelationshipTypeOp(op);

    // For github_harness ops, `repos` is required and `entity_types` defaults to [].
    // For `register_relationship_type`, `entity_types` is OPTIONAL — the op is
    // keyed on `relationship_types`, validated below, and a capability that
    // grants only relationship-type registration legitimately carries no
    // entity_types at all.
    // For every other Neotoma-native op, `entity_types` is required.
    let normalisedTypes: string[] = [];
    let normalisedRepos: string[] | undefined;
    let normalisedRelationshipTypes: string[] | undefined;

    if (harness) {
      const repos = entry.repos;
      if (!Array.isArray(repos) || repos.length === 0) {
        throw new AgentGrantValidationError(
          `capabilities[${i}].repos must be a non-empty array of "owner/repo" strings for ${op}`,
          `capabilities[${i}].repos`
        );
      }
      const repoList: string[] = [];
      for (const [j, r] of repos.entries()) {
        if (typeof r !== "string" || r.trim().length === 0) {
          throw new AgentGrantValidationError(
            `capabilities[${i}].repos[${j}] must be a non-empty string`,
            `capabilities[${i}].repos[${j}]`
          );
        }
        repoList.push(r.trim());
      }
      normalisedRepos = Array.from(new Set(repoList));
      // entity_types accepted but not required for harness ops.
      const types = entry.entity_types;
      if (Array.isArray(types)) {
        normalisedTypes = types
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim());
      }
    } else if (relationshipTypeOp) {
      // entity_types accepted but not required — see comment above.
      const types = entry.entity_types;
      if (types !== undefined) {
        if (!Array.isArray(types)) {
          throw new AgentGrantValidationError(
            `capabilities[${i}].entity_types must be an array of strings when present`,
            `capabilities[${i}].entity_types`
          );
        }
        for (const [j, t] of types.entries()) {
          if (typeof t !== "string" || t.trim().length === 0) {
            throw new AgentGrantValidationError(
              `capabilities[${i}].entity_types[${j}] must be a non-empty string`,
              `capabilities[${i}].entity_types[${j}]`
            );
          }
          normalisedTypes.push(t.trim());
        }
        normalisedTypes = Array.from(new Set(normalisedTypes));
      }
      // relationship_types is the real scope for this op. Required and
      // non-empty: a register_relationship_type capability with neither
      // entity_types nor relationship_types grants nothing and is almost
      // certainly a caller mistake, so it is rejected rather than silently
      // accepted as a no-op capability.
      const relTypes = entry.relationship_types;
      if (!Array.isArray(relTypes) || relTypes.length === 0) {
        throw new AgentGrantValidationError(
          `capabilities[${i}].relationship_types must be a non-empty array of strings for register_relationship_type`,
          `capabilities[${i}].relationship_types`
        );
      }
      const relList: string[] = [];
      for (const [j, t] of relTypes.entries()) {
        if (typeof t !== "string" || t.trim().length === 0) {
          throw new AgentGrantValidationError(
            `capabilities[${i}].relationship_types[${j}] must be a non-empty string`,
            `capabilities[${i}].relationship_types[${j}]`
          );
        }
        relList.push(t.trim());
      }
      normalisedRelationshipTypes = Array.from(new Set(relList));
    } else {
      const types = entry.entity_types;
      if (!Array.isArray(types) || types.length === 0) {
        throw new AgentGrantValidationError(
          `capabilities[${i}].entity_types must be a non-empty array of strings`,
          `capabilities[${i}].entity_types`
        );
      }
      for (const [j, t] of types.entries()) {
        if (typeof t !== "string" || t.trim().length === 0) {
          throw new AgentGrantValidationError(
            `capabilities[${i}].entity_types[${j}] must be a non-empty string`,
            `capabilities[${i}].entity_types[${j}]`
          );
        }
        normalisedTypes.push(t.trim());
      }
      normalisedTypes = Array.from(new Set(normalisedTypes));
    }

    const validated: AgentCapabilityEntry = {
      op: op as AgentCapabilityOp,
      entity_types: normalisedTypes,
    };
    if (normalisedRepos !== undefined) validated.repos = normalisedRepos;
    // THE FIX: relationship_types must survive the rebuild. It was
    // previously dropped here unconditionally — every write through
    // validateCapabilities (createGrant, updateGrantFields, and every
    // snapshotToGrant read) silently stripped it, so no grant could ever
    // exercise register_relationship_type once it round-tripped through
    // this function, even though enforceRelationshipTypeCapability (in
    // agent_capabilities.ts) reads relationship_types off exactly these
    // objects.
    if (normalisedRelationshipTypes !== undefined) {
      validated.relationship_types = normalisedRelationshipTypes;
    }
    out.push(validated);
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
      "match"
    );
  }
  if (iss && !sub) {
    throw new AgentGrantValidationError(
      "match_iss requires match_sub (iss alone is not a valid identity)",
      "match_iss"
    );
  }
  return { match_sub: sub, match_iss: iss, match_thumbprint: thumbprint };
}

function validateStatus(value: unknown): AgentGrantStatus {
  if (typeof value !== "string" || !ALLOWED_STATUSES.has(value as AgentGrantStatus)) {
    throw new AgentGrantValidationError(
      `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      "status"
    );
  }
  return value as AgentGrantStatus;
}

function validateLabel(raw: unknown): string {
  const label = trimOrNull(raw);
  if (!label) {
    throw new AgentGrantValidationError(
      "label is required and must be a non-empty string",
      "label"
    );
  }
  return label;
}

/** ---------- Identity → grant cache ---------- */

/**
 * Cached result of one identity lookup, keyed by the full presented
 * identity (key thumbprint plus `sub` / `iss`), so an entry is only
 * served back to a request presenting the same key.
 */
interface CacheEntry {
  lookup: GrantIdentityLookup;
  expiresAt: number;
}

const CACHE_TTL_MS = 5_000;
const identityCache = new Map<string, CacheEntry>();

function cacheKeyForIdentity(input: {
  sub: string | null;
  iss: string | null;
  thumbprint: string;
}): string {
  return JSON.stringify([input.thumbprint, input.sub ?? "", input.iss ?? ""]);
}

/**
 * Drop cached lookups after a grant write. Entries are keyed by the
 * presented identity, not the grant, so a write clears the whole cache;
 * the TTL is a few seconds and grant writes are rare.
 */
export function invalidateGrantCache(_grant?: AgentGrant): void {
  identityCache.clear();
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
  meta: { created_at?: string; last_observation_at?: string }
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
  filters: ListGrantsFilters = {}
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
        })
      );
    } catch {
      // Malformed grant snapshot — skip rather than break the list.
    }
  }
  const wanted = filters.status ?? "all";
  const filtered = grants.filter((g) => (wanted === "all" ? true : g.status === wanted));
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

export async function getGrant(userId: string, grantId: string): Promise<AgentGrant | null> {
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
 * Result of resolving a verified AAuth identity against the grant set.
 */
export interface GrantIdentityLookup {
  /**
   * Active grant bound to the presented key (`match_thumbprint` equals
   * the request's JWK thumbprint), or `null`.
   */
  grant: AgentGrant | null;
  /**
   * True when no key-bound grant matched but an active grant matched the
   * request's `sub` (and `iss`, when the grant pins one) without pinning
   * a `match_thumbprint`. Diagnostic only; such a grant does not admit.
   */
  unbound_claim_match: boolean;
  /**
   * A grant whose `match_thumbprint` equals the presented key, but whose
   * `status` is `suspended` or `revoked` rather than `active`. Reported
   * so admission can distinguish "this key was pinned to a grant the
   * operator turned off" (`grant_suspended` / `grant_revoked`) from
   * "this key matches nothing" (`no_match`). Only the single
   * most-recently-observed key-bound inactive grant is reported, mirroring
   * the tie-break already used for active candidates. `null` when no
   * key-bound grant matched at all, active or not.
   */
  inactive_grant: AgentGrant | null;
  /**
   * Entity id of a key-bound, active grant whose stored `capabilities`
   * failed {@link validateCapabilities} (or whose `status`/`label` failed
   * shape validation) — e.g. capabilities persisted as a JSON string, or a
   * non-harness capability entry with empty `entity_types`. Before this
   * field existed, `scanForGrant` caught the validation error and silently
   * skipped the candidate exactly like "no grant matched at all", so a
   * signature that DID name a real, key-bound, active grant was reported
   * as `no_match` — indistinguishable from an unrecognised caller. Reported
   * here so admission can classify it as `grant_invalid` instead: a
   * distinct, fail-closed reason naming the specific broken grant. `null`
   * when every key-bound active candidate either admitted or was never
   * tried (i.e. this is populated only when a candidate was found and
   * rejected by validation, not merely absent).
   */
  invalid_grant_id: string | null;
}

/**
 * Resolve a verified AAuth identity to an active grant.
 *
 * Admission requires a key binding: a grant matches only when its
 * `match_thumbprint` equals the RFC 7638 thumbprint of the key that
 * signed the request. Grants without a thumbprint pin do not admit
 * signed requests.
 *
 * When several key-bound grants match, the most recently observed wins.
 */
export async function lookupGrantForIdentity(input: {
  sub?: string | null;
  iss?: string | null;
  thumbprint?: string | null;
}): Promise<GrantIdentityLookup> {
  const sub = trimOrNull(input.sub);
  const iss = trimOrNull(input.iss);
  const thumbprint = trimOrNull(input.thumbprint);
  if (!thumbprint) {
    return {
      grant: null,
      unbound_claim_match: false,
      inactive_grant: null,
      invalid_grant_id: null,
    };
  }

  const key = cacheKeyForIdentity({ sub, iss, thumbprint });
  const now = Date.now();
  const hit = identityCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.lookup;
  }

  const lookup = await scanForGrant({ sub, iss, thumbprint });
  identityCache.set(key, { lookup, expiresAt: now + CACHE_TTL_MS });
  return lookup;
}

/**
 * Find the active grant bound to the supplied identity's key. Returns
 * `null` when no grant pins the presented key's thumbprint. See
 * {@link lookupGrantForIdentity}.
 */
export async function findActiveGrantByIdentity(input: {
  sub?: string | null;
  iss?: string | null;
  thumbprint?: string | null;
}): Promise<AgentGrant | null> {
  return (await lookupGrantForIdentity(input)).grant;
}

function claimsMatchGrant(
  input: { sub: string | null; iss: string | null },
  snapSub: string | null,
  snapIss: string | null
): boolean {
  if (!input.sub || !snapSub || input.sub !== snapSub) return false;
  if (!snapIss) return true;
  return !!input.iss && input.iss === snapIss;
}

async function scanForGrant(input: {
  sub: string | null;
  iss: string | null;
  thumbprint: string;
}): Promise<GrantIdentityLookup> {
  const rows = await queryEntities({
    entityType: GRANT_ENTITY_TYPE,
    includeMerged: false,
    includeDeleted: false,
    limit: 1000,
    sortBy: "last_observation_at",
    sortOrder: "desc",
  });
  if (rows.length === 0) {
    return {
      grant: null,
      unbound_claim_match: false,
      inactive_grant: null,
      invalid_grant_id: null,
    };
  }

  // queryEntities does not include user_id on the returned shape, so we
  // batch-fetch owners for the matched entities below.
  type Candidate = {
    entity_id: string;
    snapshot: Record<string, unknown>;
    last_observation_at: string;
    created_at?: string;
  };
  const activeCandidates: Candidate[] = [];
  // Key-bound grants whose status is NOT "active" — surfaced so admission
  // can report grant_revoked / grant_suspended instead of silently
  // treating a shut-off credential the same as one that never matched.
  const inactiveCandidates: Candidate[] = [];
  let unboundClaimMatch = false;

  for (const row of rows) {
    const snap = row.snapshot ?? {};
    const snapTp = trimOrNull(snap.match_thumbprint);
    if (snapTp) {
      // Key-bound grant: the presented key must be the pinned key.
      if (snapTp !== input.thumbprint) continue;
      const candidate: Candidate = {
        entity_id: row.entity_id,
        snapshot: snap,
        last_observation_at: row.last_observation_at,
        created_at: row.created_at,
      };
      if (snap.status === "active") {
        activeCandidates.push(candidate);
      } else {
        // suspended / revoked (or any other non-active status) — still
        // reported, never silently dropped like "no grant at all".
        inactiveCandidates.push(candidate);
      }
      continue;
    }
    if (snap.status !== "active") continue;
    // Grant pins no key: it does not admit. Record the match so
    // admission can report why.
    if (claimsMatchGrant(input, trimOrNull(snap.match_sub), trimOrNull(snap.match_iss))) {
      unboundClaimMatch = true;
    }
  }

  activeCandidates.sort((a, b) =>
    (b.last_observation_at ?? "").localeCompare(a.last_observation_at ?? "")
  );

  // Set the moment a key-bound active candidate fails validation, so a
  // later successful candidate (if the scan finds one) does not mask the
  // fact that an earlier, more-recently-observed candidate was broken —
  // reported only when the scan ultimately finds no admitting grant.
  let invalidGrantId: string | null = null;

  for (const cand of activeCandidates) {
    const owner = await getGrantOwner(cand.entity_id);
    if (!owner) continue;
    try {
      return {
        grant: snapshotToGrant(cand.entity_id, owner, cand.snapshot, {
          created_at: cand.created_at,
          last_observation_at: cand.last_observation_at,
        }),
        unbound_claim_match: false,
        inactive_grant: null,
        invalid_grant_id: null,
      };
    } catch (err) {
      // THE FIX: previously this candidate was dropped exactly like "did
      // not match at all" — the request's key WAS pinned to this grant,
      // but its stored shape (e.g. capabilities as a JSON string, or a
      // capability entry with empty entity_types) failed validation, so
      // admission reported no_match, indistinguishable from an
      // unrecognised caller. Record it instead, and keep scanning in case
      // a different, valid, key-bound grant also matches (identity
      // collisions are possible even though thumbprints are meant to be
      // unique) — but only the first one found is reported, since that is
      // the one the request's key most specifically names.
      if (invalidGrantId === null) {
        invalidGrantId = cand.entity_id;
        warnInvalidGrant(cand.entity_id, err);
      }
      continue;
    }
  }

  // No active key-bound grant admitted. Report the most-recently-observed
  // key-bound inactive grant, if any, so admission can distinguish
  // grant_revoked/grant_suspended from no_match.
  inactiveCandidates.sort((a, b) =>
    (b.last_observation_at ?? "").localeCompare(a.last_observation_at ?? "")
  );
  for (const cand of inactiveCandidates) {
    const owner = await getGrantOwner(cand.entity_id);
    if (!owner) continue;
    try {
      return {
        grant: null,
        unbound_claim_match: unboundClaimMatch,
        inactive_grant: snapshotToGrant(cand.entity_id, owner, cand.snapshot, {
          created_at: cand.created_at,
          last_observation_at: cand.last_observation_at,
        }),
        invalid_grant_id: invalidGrantId,
      };
    } catch {
      continue;
    }
  }

  return {
    grant: null,
    unbound_claim_match: unboundClaimMatch,
    inactive_grant: null,
    invalid_grant_id: invalidGrantId,
  };
}

/**
 * Rate-limited warning for a key-bound grant that failed shape validation
 * during admission. Debounced per grant id (same window as
 * {@link recordMatch}'s daily debounce) so a repeatedly-signed broken
 * credential does not spam the log on every request. Never logs secret
 * values — the grant id and the validator's field path only. The
 * validator's message names the field (e.g.
 * `capabilities[4].relationship_types`) but never echoes capability
 * contents, match_thumbprint, or any other credential material.
 */
const invalidGrantWarnDebounce = new Map<string, string>();

function warnInvalidGrant(grantId: string, err: unknown): void {
  const today = todayUtc();
  if (invalidGrantWarnDebounce.get(grantId) === today) return;
  invalidGrantWarnDebounce.set(grantId, today);
  const field = err instanceof AgentGrantValidationError ? (err.field ?? null) : null;
  const message = err instanceof Error ? err.message : String(err);
  logger.warn(
    JSON.stringify({
      event: "agent_grant_invalid",
      reason: "grant_invalid",
      grant_id: grantId,
      field,
      message,
    })
  );
}

/** Test-only — clears the invalid-grant warning debounce map. */
export function clearInvalidGrantWarnDebounceForTests(): void {
  invalidGrantWarnDebounce.clear();
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

async function writeGrantEntity(params: InternalGrantWrite): Promise<AgentGrant> {
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
    throw new Error(`Grant entity ${entityId} not visible after write (snapshot pipeline)`);
  }
  invalidateGrantCache(grant);
  return grant;
}

/**
 * Pre-persist guard for a raw write to `agent_grant` fields, called from
 * the two choke points every transport converges on before an
 * `agent_grant` observation or correction is ever inserted:
 * {@link ../services/observation_storage.ts#createObservation} (the
 * `store` / `store_structured` path, both HTTP and MCP) and
 * {@link ../services/correction.ts#createCorrection} (the `correct` path,
 * both HTTP and MCP).
 *
 * `createGrant` / `updateGrantFields` in this module already call
 * {@link validateCapabilities} directly before they persist, so grants
 * written through those ergonomic helpers were always pre-validated. The
 * gap this closes is the RAW entity-store surface: `correct()` (MCP tool
 * or `POST /entities/{id}/corrections`) and a raw `store`/`store_structured`
 * targeting `entity_type: "agent_grant"` write straight through
 * `createObservation` / `createCorrection` without ever calling into this
 * module's CRUD helpers — which is exactly how the JSON-string-capabilities
 * and empty-entity_types grants now live in prod got there in the first
 * place (both landed via `correct`, not via `PATCH /agents/grants/{id}`).
 *
 * Scoped strictly to `entity_type === "agent_grant"` and the `capabilities`
 * field — every other entity_type and every other agent_grant field is a
 * no-op here, mirroring the `usage_digest` redaction guard's shape in
 * `actions.ts`. Throws {@link AgentGrantValidationError} (mapped to a 400
 * by the same envelope `createGrant`/`updateGrantFields` already produce)
 * before any row is written, so an invalid capability can never be stored
 * by ANY write surface — not only the two ergonomic helpers.
 */
export function assertAgentGrantFieldValid(
  entityType: string,
  field: string,
  value: unknown
): void {
  if (entityType !== GRANT_ENTITY_TYPE) return;
  if (field === "capabilities") {
    validateCapabilities(value);
    return;
  }
  if (field === "status") {
    validateStatus(value);
    return;
  }
  if (field === "label") {
    validateLabel(value);
    return;
  }
}

/**
 * Advisory warnings for a grant as stored. A grant without
 * `match_thumbprint` is accepted (for example while the agent's key is
 * being provisioned) but does not admit signed requests, so callers
 * that create or edit one are told at write time rather than on the
 * first refused request.
 */
export function grantAdmissionWarnings(
  grant: Pick<AgentGrant, "match_thumbprint" | "status">
): string[] {
  const warnings: string[] = [];
  if (grant.status !== "revoked" && !trimOrNull(grant.match_thumbprint)) {
    warnings.push(
      "This grant pins no match_thumbprint, so it does not admit signed requests, " +
        "and capability-gated writes signed by an agent whose sub/iss match it are " +
        "refused until a key is pinned. Set match_thumbprint to the agent's key " +
        "thumbprint (`neotoma auth session` on the agent's host prints it); see " +
        "docs/subsystems/agent_capabilities.md#pin-a-key-to-an-existing-grant."
    );
  }
  return warnings;
}

/**
 * Create a new grant for `userId`. Capability shape is validated.
 * Status defaults to `active`. Idempotent on the canonical-name key
 * derived from the identity match.
 */
export async function createGrant(userId: string, draft: AgentGrantDraft): Promise<AgentGrant> {
  const match = validateIdentityMatch(draft);
  const label = validateLabel(draft.label);
  const capabilities = validateCapabilities(draft.capabilities ?? []);
  const status: AgentGrantStatus = draft.status ? validateStatus(draft.status) : "active";
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
  changes: AgentGrantUpdate
): Promise<AgentGrant> {
  const existing = await getGrant(userId, grantId);
  if (!existing) {
    throw new AgentGrantNotFoundError(grantId);
  }
  const next: AgentGrantMatch = {
    match_sub: changes.match_sub ?? existing.match_sub ?? null,
    match_iss: changes.match_iss ?? existing.match_iss ?? null,
    match_thumbprint: changes.match_thumbprint ?? existing.match_thumbprint ?? null,
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
    correctionFields.push(["capabilities", validateCapabilities(changes.capabilities)]);
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
    correctionFields.push(["match_thumbprint", trimOrNull(changes.match_thumbprint)]);
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
  next: AgentGrantStatus
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
