/**
 * Pure helpers for the Inspector /feedback page. Kept DOM-free so
 * bucketing, summary computation, sort comparators, stale detection, and
 * the `upgrade_guidance` parser can be unit-tested without mounting a
 * page. The canonical `neotoma_feedback` schema lives in
 * `src/services/feedback/seed_schema.ts`; shape below is a narrow
 * Inspector mirror.
 */

import type { EntitySnapshot } from "@/types/api";

export const INSPECTOR_SCRATCH_KEY = "inspector_scratch";

/**
 * Threshold for the synthetic "stale" bucket: an open item whose
 * `last_activity_at` is older than this counts as stale. Chosen to match
 * the cadence of the automated feedback triage loop that runs locally
 * (once per day), giving a maintainer a week of grace before an item is
 * flagged for attention. Change in lockstep with
 * `docs/subsystems/agent_feedback_pipeline.md` if the cadence changes.
 */
export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Coarse pipeline-status buckets used for tab filtering. */
export type StatusBucket =
  | "all"
  | "open"
  | "stale"
  | "in_progress"
  | "resolved"
  | "inactive";

/** Canonical neotoma_feedback status values from the pipeline. */
export type FeedbackStatus =
  | "submitted"
  | "triaged"
  | "planned"
  | "in_progress"
  | "resolved"
  | "duplicate"
  | "wait_for_next_release"
  | "wontfix"
  | "removed";

/** Sort orderings available in the UI. */
export type FeedbackSort =
  | "recent_activity"
  | "oldest_open"
  | "most_hits"
  | "most_regressions";

export const STATUS_TO_BUCKET: Record<string, Exclude<StatusBucket, "all" | "stale">> = {
  submitted: "open",
  triaged: "open",
  planned: "in_progress",
  in_progress: "in_progress",
  resolved: "resolved",
  duplicate: "resolved",
  wait_for_next_release: "inactive",
  wontfix: "inactive",
  removed: "inactive",
};

/** Local scratch annotations authored by a maintainer from Inspector. */
export interface InspectorScratch {
  status?: FeedbackStatus | string;
  triage_notes?: string;
  issue_urls?: string[];
  pr_urls?: string[];
  duplicate_of_feedback_id?: string;
  updated_at?: string;
  /** Free-form marker for future extensions; preserved on round-trip. */
  [key: string]: unknown;
}

export interface FeedbackSnapshot {
  feedback_id?: string;
  title?: string;
  body?: string;
  kind?: string;
  status?: string;
  classification?: string;
  triage_notes?: string;
  submitter_id?: string;
  submitted_at?: string;
  status_updated_at?: string;
  last_activity_at?: string;
  next_check_suggested_at?: string;
  neotoma_version?: string;
  client_name?: string;
  client_version?: string;
  os?: string;
  tool_name?: string;
  invocation_shape?: unknown[];
  error_type?: string;
  error_message?: string;
  error_class?: string;
  hit_count?: number;
  github_issue_urls?: string[];
  pull_request_urls?: string[];
  commit_shas?: string[];
  duplicate_of_feedback_id?: string;
  notes_markdown?: string;
  verifications?: unknown[];
  verification_count_by_outcome?: Record<string, number>;
  resolution_confidence?: string;
  regression_candidate?: boolean;
  regression_detected_at?: string;
  regression_count?: number;
  superseded_by_version?: string;
  upgrade_guidance?: Record<string, unknown>;
  inspector_scratch?: InspectorScratch;
}

export function entityRowId(row: EntitySnapshot): string {
  return row.entity_id ?? row.id ?? "";
}

export function snapshotOf(entity: EntitySnapshot): FeedbackSnapshot {
  return (entity.snapshot ?? {}) as FeedbackSnapshot;
}

/** Read the `inspector_scratch` namespace in a null-safe way. */
export function scratchOf(snap: FeedbackSnapshot): InspectorScratch {
  const raw = snap.inspector_scratch;
  if (!raw || typeof raw !== "object") return {};
  return raw as InspectorScratch;
}

export function statusBucketFor(
  status: string | undefined,
): Exclude<StatusBucket, "all" | "stale"> {
  if (!status) return "open";
  return STATUS_TO_BUCKET[status] ?? "open";
}

export function activityTimestamp(
  snap: FeedbackSnapshot,
  fallback?: string,
): string | undefined {
  return (
    snap.last_activity_at ??
    snap.status_updated_at ??
    snap.submitted_at ??
    fallback
  );
}

/**
 * Stale predicate for the `stale` virtual bucket. An entity is stale iff
 * it is currently in the `open` bucket and its effective activity
 * timestamp is older than {@link STALE_THRESHOLD_MS}. `now` is injected
 * for deterministic testing.
 */
export function isStale(
  entity: EntitySnapshot,
  snap: FeedbackSnapshot = snapshotOf(entity),
  now: number = Date.now(),
): boolean {
  if (statusBucketFor(snap.status) !== "open") return false;
  const ts = activityTimestamp(snap, entity.last_observation_at);
  if (!ts) return false;
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return false;
  return now - parsed > STALE_THRESHOLD_MS;
}

/** Does the entity match the given {@link StatusBucket} selector? */
export function matchesBucket(
  entity: EntitySnapshot,
  bucket: StatusBucket,
  now: number = Date.now(),
): boolean {
  if (bucket === "all") return true;
  const snap = snapshotOf(entity);
  if (bucket === "stale") return isStale(entity, snap, now);
  return statusBucketFor(snap.status) === bucket;
}

export interface SummaryStats {
  total: number;
  open: number;
  stale: number;
  inProgress: number;
  resolved: number;
  regression: number;
}

export function computeSummary(
  entities: EntitySnapshot[],
  now: number = Date.now(),
): SummaryStats {
  const out: SummaryStats = {
    total: entities.length,
    open: 0,
    stale: 0,
    inProgress: 0,
    resolved: 0,
    regression: 0,
  };
  for (const e of entities) {
    const snap = snapshotOf(e);
    const bucket = statusBucketFor(snap.status);
    if (bucket === "open") {
      out.open += 1;
      if (isStale(e, snap, now)) out.stale += 1;
    } else if (bucket === "in_progress") {
      out.inProgress += 1;
    } else if (bucket === "resolved") {
      out.resolved += 1;
    }
    if (snap.regression_candidate) out.regression += 1;
  }
  return out;
}

/** Count entities per bucket for the tab row. */
export function computeBucketCounts(
  entities: EntitySnapshot[],
  now: number = Date.now(),
): Record<StatusBucket, number> {
  const counts: Record<StatusBucket, number> = {
    all: entities.length,
    open: 0,
    stale: 0,
    in_progress: 0,
    resolved: 0,
    inactive: 0,
  };
  for (const e of entities) {
    const snap = snapshotOf(e);
    const bucket = statusBucketFor(snap.status);
    counts[bucket] += 1;
    if (bucket === "open" && isStale(e, snap, now)) counts.stale += 1;
  }
  return counts;
}

/** Distinct submitter ids across the current result page. */
export function uniqueSubmitterIds(entities: EntitySnapshot[]): string[] {
  const seen = new Set<string>();
  for (const e of entities) {
    const id = snapshotOf(e).submitter_id;
    if (id && id.trim().length > 0) seen.add(id);
  }
  return Array.from(seen).sort();
}

/** Cross-cutting predicate: does a row match the active submitter filter? */
export function matchesSubmitter(
  entity: EntitySnapshot,
  submitter: string | null,
): boolean {
  if (!submitter) return true;
  return snapshotOf(entity).submitter_id === submitter;
}

/** Does an entity have any non-empty inspector scratch annotations? */
export function hasScratchAnnotations(entity: EntitySnapshot): boolean {
  const scratch = scratchOf(snapshotOf(entity));
  if (!scratch || Object.keys(scratch).length === 0) return false;
  for (const [key, value] of Object.entries(scratch)) {
    if (key === "updated_at") continue;
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return true;
  }
  return false;
}

function tsMillis(ts: string | undefined): number {
  if (!ts) return 0;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Factory for client-side sort comparators. Pure: does not mutate the
 * input array. Ties break by entity_id for a stable ordering.
 */
export function feedbackComparator(
  sort: FeedbackSort,
): (a: EntitySnapshot, b: EntitySnapshot) => number {
  return (a, b) => {
    const sa = snapshotOf(a);
    const sb = snapshotOf(b);
    let delta = 0;
    switch (sort) {
      case "recent_activity": {
        const ta = tsMillis(activityTimestamp(sa, a.last_observation_at));
        const tb = tsMillis(activityTimestamp(sb, b.last_observation_at));
        delta = tb - ta;
        break;
      }
      case "oldest_open": {
        // Only open rows have meaningful "oldest open" ordering; sink
        // non-open rows to the bottom so the mode stays useful when
        // applied across a mixed page.
        const openA = statusBucketFor(sa.status) === "open" ? 1 : 0;
        const openB = statusBucketFor(sb.status) === "open" ? 1 : 0;
        if (openA !== openB) {
          delta = openB - openA;
        } else {
          const ta = tsMillis(sa.submitted_at ?? activityTimestamp(sa, a.last_observation_at));
          const tb = tsMillis(sb.submitted_at ?? activityTimestamp(sb, b.last_observation_at));
          delta = ta - tb;
        }
        break;
      }
      case "most_hits": {
        const ha = typeof sa.hit_count === "number" ? sa.hit_count : 0;
        const hb = typeof sb.hit_count === "number" ? sb.hit_count : 0;
        delta = hb - ha;
        break;
      }
      case "most_regressions": {
        const ra = typeof sa.regression_count === "number" ? sa.regression_count : 0;
        const rb = typeof sb.regression_count === "number" ? sb.regression_count : 0;
        delta = rb - ra;
        break;
      }
    }
    if (delta !== 0) return delta;
    return entityRowId(a).localeCompare(entityRowId(b));
  };
}

/** Parsed view of the optional `upgrade_guidance` blob on a feedback row. */
export interface ParsedUpgradeGuidance {
  actionRequired: string | null;
  installCommands: string[];
  verificationSteps: string[];
  verifyBy: string | null;
  notes: string | null;
}

export function parseUpgradeGuidance(
  guidance: unknown,
): ParsedUpgradeGuidance | null {
  if (!guidance || typeof guidance !== "object") return null;
  const g = guidance as Record<string, unknown>;
  const pickString = (key: string): string | null => {
    const v = g[key];
    return typeof v === "string" && v.trim().length > 0 ? v : null;
  };
  const pickStringArray = (key: string): string[] => {
    const v = g[key];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  };
  const parsed: ParsedUpgradeGuidance = {
    actionRequired: pickString("action_required"),
    installCommands: pickStringArray("install_commands"),
    verificationSteps: pickStringArray("verification_steps"),
    verifyBy: pickString("verify_by"),
    notes: pickString("notes"),
  };
  const empty =
    !parsed.actionRequired &&
    parsed.installCommands.length === 0 &&
    parsed.verificationSteps.length === 0 &&
    !parsed.verifyBy &&
    !parsed.notes;
  return empty ? null : parsed;
}

/** Safe string-array coercion shared by the Inspector renderer. */
export function arrayOfStrings(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * localStorage key used by Phase 1 to remember a user-chosen "my
 * submitter id" before the Phase 2 session-identity wire-up. Phase 2
 * keeps the key around as a manual override for operators whose session
 * `agent_sub` does not match the `submitter_id` recorded by the pipeline.
 */
export const FEEDBACK_MINE_STORAGE_KEY = "inspector.feedback.mine_submitter_id";
