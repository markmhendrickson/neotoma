/**
 * Selected entity visibility authority (#2588).
 *
 * This pure selector receives an explicitly complete acquisition and its
 * immutable cutover certificate. It does not read a global database, infer
 * trust from marker-shaped fields, or turn a filtered array into current truth.
 */
import { createHash } from "node:crypto";
import { DEFAULT_OBSERVATION_SOURCE_PRIORITY } from "./schema_registry.js";

export const ENTITY_LIFECYCLE_CUTOVER_ID = "entity_lifecycle_authority_v1";
export const ENTITY_LEGACY_SELECTOR_VERSION = "entity_visibility_legacy_v1";
export const ENTITY_LIFECYCLE_KINDS = [
  "delete",
  "restore",
  "legacy_visible",
  "legacy_hidden",
] as const;
export type EntityLifecycleKind = (typeof ENTITY_LIFECYCLE_KINDS)[number];
export interface LifecycleObservation {
  id: string;
  entity_id: string;
  entity_type: string;
  user_id: string;
  observed_at: string;
  created_at: string;
  source_priority: number;
  observation_source?: string | null;
  fields: Record<string, unknown>;
  entity_lifecycle_kind?: EntityLifecycleKind | null;
  entity_lifecycle_sequence?: number | null;
  entity_lifecycle_target_id?: string | null;
}
export interface LifecycleTarget {
  id: string;
  user_id: string;
  entity_type: string;
}
export interface LegacyMembershipCertificate {
  target: LifecycleTarget;
  observation_ids: readonly string[];
  count: number;
  sha256: string;
}
export type EntityLifecycleContext = {
  acquisition: "complete";
  target: LifecycleTarget;
} & (
  | { mode: "pre_migration" }
  | {
      mode: "current" | "historical";
      cutover_id: typeof ENTITY_LIFECYCLE_CUTOVER_ID;
      selector_version: typeof ENTITY_LEGACY_SELECTOR_VERSION;
      recorded_at: string;
      // Complete validated owner/target membership, not a time-filtered set.
      legacy_memberships: readonly LegacyMembershipCertificate[];
      authority_targets: readonly LifecycleTarget[];
      at?: string;
      at_ingested?: string;
    }
);
export class EntityLifecycleAcquisitionError extends Error {
  readonly code = "ERR_ENTITY_LIFECYCLE_ACQUISITION";
  constructor() {
    super("Entity lifecycle authority acquisition is incomplete or inconsistent");
    this.name = "EntityLifecycleAcquisitionError";
  }
}
function refuse(): never {
  throw new EntityLifecycleAcquisitionError();
}
function validTime(value: string): number {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) refuse();
  return parsed;
}
export function legacyMembershipDigest(ids: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...ids].sort()))
    .digest("hex");
}
/** Frozen legacy reducer selection: preserve its pre-sort/tie/source-rank order. */
export function selectLegacyEntityVisibility(
  observations: readonly LifecycleObservation[],
  validateForCutover = true
): {
  hidden: boolean;
  selected_observation_id: string | null;
} {
  for (const row of observations) {
    if (validateForCutover) {
      validTime(row.observed_at);
      if (!Number.isFinite(row.source_priority) || !row.id || !row.fields) refuse();
    }
  }
  const rank = new Map<string, number>(DEFAULT_OBSERVATION_SOURCE_PRIORITY.map((v, i) => [v, i]));
  const ordered = [...observations].sort((a, b) => {
    const timeA = Date.parse(a.observed_at),
      timeB = Date.parse(b.observed_at);
    return timeB !== timeA ? timeB - timeA : a.id.localeCompare(b.id);
  });
  // Stable sort retains the reducer's existing observation/id tie order.
  ordered.sort((a, b) => {
    if (b.source_priority !== a.source_priority) return b.source_priority - a.source_priority;
    const sourceRank =
      (rank.get(a.observation_source ?? "") ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.observation_source ?? "") ?? Number.MAX_SAFE_INTEGER);
    return sourceRank || Date.parse(b.observed_at) - Date.parse(a.observed_at);
  });
  return {
    hidden: ordered[0]?.fields._deleted === true,
    selected_observation_id: ordered[0]?.id ?? null,
  };
}
export function hasEntityLifecycleAuthority(row: LifecycleObservation): boolean {
  const values = [
    row.entity_lifecycle_kind,
    row.entity_lifecycle_sequence,
    row.entity_lifecycle_target_id,
  ];
  const populated = values.filter((v) => v !== null && v !== undefined).length;
  if (populated === 0) return false;
  if (
    populated !== 3 ||
    !ENTITY_LIFECYCLE_KINDS.includes(row.entity_lifecycle_kind as EntityLifecycleKind) ||
    !Number.isSafeInteger(row.entity_lifecycle_sequence) ||
    row.entity_lifecycle_sequence! < 0 ||
    typeof row.entity_lifecycle_target_id !== "string" ||
    !row.entity_lifecycle_target_id
  )
    refuse();
  const legacy = row.entity_lifecycle_kind!.startsWith("legacy_");
  if (legacy !== (row.entity_lifecycle_sequence === 0)) refuse();
  const hidden =
    row.entity_lifecycle_kind === "delete" || row.entity_lifecycle_kind === "legacy_hidden";
  // Encrypted audit prose is unavailable, not a contradiction. The tuple
  // remains typed authority; ordinary plaintext action metadata must agree.
  if (
    row.fields._encrypted !== true &&
    Object.prototype.hasOwnProperty.call(row.fields, "_deleted") &&
    row.fields._deleted !== hidden
  )
    refuse();
  validTime(row.observed_at);
  validTime(row.created_at);
  return true;
}
export interface EntityVisibilitySelection {
  hidden: boolean;
  selected_authority_id: string | null;
  factual_observations: LifecycleObservation[];
}
export function selectEntityLifecycleVisibility(
  observations: readonly LifecycleObservation[],
  context: EntityLifecycleContext
): EntityVisibilitySelection {
  if (
    context.acquisition !== "complete" ||
    !context.target.id ||
    !context.target.user_id ||
    !context.target.entity_type
  )
    refuse();
  const target = context.target;
  const ids = new Set<string>();
  for (const row of observations) {
    if (ids.has(row.id) || row.user_id !== target.user_id || row.entity_type !== target.entity_type)
      refuse();
    ids.add(row.id);
  }
  if (context.mode === "pre_migration") {
    if (observations.some(hasEntityLifecycleAuthority)) refuse();
    // Prior to the explicit migration, retain the existing reducer's permissive
    // comparator behavior. Cutover capture and historical fallback validate the
    // comparator inputs; loading new software alone does not migrate old data.
    const legacy = selectLegacyEntityVisibility(observations, false);
    return {
      hidden: legacy.hidden,
      selected_authority_id: null,
      factual_observations: [...observations],
    };
  }
  if (
    context.cutover_id !== ENTITY_LIFECYCLE_CUTOVER_ID ||
    context.selector_version !== ENTITY_LEGACY_SELECTOR_VERSION
  )
    refuse();
  validTime(context.recorded_at);
  if (context.mode === "current" && (context.at !== undefined || context.at_ingested !== undefined))
    refuse();
  const at = context.at === undefined ? Infinity : validTime(context.at);
  const ingested = context.at_ingested === undefined ? Infinity : validTime(context.at_ingested);
  const eligible = (row: LifecycleObservation) =>
    validTime(row.observed_at) <= at && validTime(row.created_at) <= ingested;
  const targets = new Map<string, LifecycleTarget>();
  for (const ownerTarget of context.authority_targets) {
    if (
      targets.has(ownerTarget.id) ||
      ownerTarget.user_id !== target.user_id ||
      ownerTarget.entity_type !== target.entity_type
    )
      refuse();
    targets.set(ownerTarget.id, ownerTarget);
  }
  if (!targets.has(target.id)) refuse();
  const authority: LifecycleObservation[] = [];
  const sequences = new Set<string>();
  const factual: LifecycleObservation[] = [];
  for (const row of observations) {
    if (hasEntityLifecycleAuthority(row)) {
      if (!targets.has(row.entity_lifecycle_target_id!)) refuse();
      const sequenceKey = JSON.stringify([
        row.entity_lifecycle_target_id,
        row.entity_lifecycle_sequence,
      ]);
      if (sequences.has(sequenceKey)) refuse();
      sequences.add(sequenceKey);
      // Mutable fact attachment cannot transfer a source target's authority.
      if (row.entity_lifecycle_target_id === target.id && eligible(row)) authority.push(row);
    } else if (eligible(row)) factual.push(row);
  }
  const legacyIds = new Set<string>();
  const memberTargets = new Set<string>();
  for (const certificate of context.legacy_memberships) {
    if (
      certificate.target.user_id !== target.user_id ||
      certificate.target.entity_type !== target.entity_type ||
      memberTargets.has(certificate.target.id) ||
      !targets.has(certificate.target.id) ||
      !Number.isSafeInteger(certificate.count) ||
      certificate.count < 0 ||
      certificate.count !== certificate.observation_ids.length ||
      certificate.sha256 !== legacyMembershipDigest(certificate.observation_ids)
    )
      refuse();
    memberTargets.add(certificate.target.id);
    for (const id of certificate.observation_ids) {
      if (legacyIds.has(id)) refuse();
      legacyIds.add(id);
    }
  }
  // Certificates are complete capture proofs. An erased/missing attached
  // legacy row prevents certifying historical acquisition, not an empty past.
  if (context.mode === "historical") {
    for (const id of legacyIds) if (!ids.has(id)) refuse();
  }
  const latest = authority.sort(
    (a, b) => b.entity_lifecycle_sequence! - a.entity_lifecycle_sequence!
  )[0];
  if (latest)
    return {
      hidden:
        latest.entity_lifecycle_kind === "delete" ||
        latest.entity_lifecycle_kind === "legacy_hidden",
      selected_authority_id: latest.id,
      factual_observations: factual,
    };
  if (context.mode === "current")
    return { hidden: false, selected_authority_id: null, factual_observations: factual };
  const legacy = selectLegacyEntityVisibility(factual.filter((row) => legacyIds.has(row.id)));
  return { hidden: legacy.hidden, selected_authority_id: null, factual_observations: factual };
}
