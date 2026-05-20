/**
 * Duplicate Detection Service (R5)
 *
 * Read-only, on-demand detector that surfaces candidate duplicate pairs for
 * operator or agent review. Never auto-merges. Hands off to
 * {@link ../services/entity_merge.ts#mergeEntities} when the reviewer
 * confirms a pair.
 *
 * Per schema_agnostic_design_rules: schemas drive behavior via
 * {@link SchemaDefinition.duplicate_detection_fields} and
 * {@link SchemaDefinition.duplicate_detection_threshold}. When a schema
 * omits these, the detector falls back to comparing canonical_name with a
 * default threshold of 0.85, which is the weakest acceptable signal.
 *
 * Doctrine preserved: identity resolution stays deterministic via the
 * `entity_type + canonical_name` hash; fuzzy matching lives here, post-hoc.
 */

import { db } from "../db.js";
import { levenshtein } from "../normalize.js";
import { schemaRegistry, type SchemaDefinition } from "./schema_registry.js";

export interface DuplicateCandidatePair {
  entity_a: {
    id: string;
    canonical_name: string;
    snapshot_fields?: Record<string, unknown>;
  };
  entity_b: {
    id: string;
    canonical_name: string;
    snapshot_fields?: Record<string, unknown>;
  };
  score: number;
  matched_fields: string[];
  entity_type: string;
}

export interface FindDuplicateCandidatesParams {
  entityType: string;
  userId: string;
  threshold?: number;
  limit?: number;
}

const DEFAULT_THRESHOLD = 0.85;
const DEFAULT_LIMIT = 50;
const MAX_CANDIDATES_PER_TYPE = 2000;

/**
 * Normalized string similarity in [0, 1] derived from Levenshtein distance.
 * Returns 1.0 for identical inputs and 0 for fully dissimilar inputs of
 * equivalent length.
 */
export function stringSimilarity(a: string, b: string): number {
  const sa = (a ?? "").toString().trim().toLowerCase();
  const sb = (b ?? "").toString().trim().toLowerCase();
  if (sa.length === 0 && sb.length === 0) return 1;
  const maxLen = Math.max(sa.length, sb.length);
  if (maxLen === 0) return 1;
  const d = levenshtein(sa, sb);
  return 1 - d / maxLen;
}

function resolveDuplicateConfig(def: SchemaDefinition | null | undefined): {
  fields: string[];
  threshold: number;
} {
  const fields = def?.duplicate_detection_fields?.length ? def.duplicate_detection_fields : [];
  const threshold =
    typeof def?.duplicate_detection_threshold === "number" &&
    def.duplicate_detection_threshold > 0 &&
    def.duplicate_detection_threshold <= 1
      ? def.duplicate_detection_threshold
      : DEFAULT_THRESHOLD;
  return { fields, threshold };
}

/**
 * Find candidate duplicate entity pairs for a given entity_type within one
 * user's scope. Read-only.
 */
export async function findDuplicateCandidates(
  params: FindDuplicateCandidatesParams
): Promise<DuplicateCandidatePair[]> {
  const { entityType, userId } = params;
  const limit = params.limit ?? DEFAULT_LIMIT;

  const schema = await schemaRegistry.loadActiveSchema(entityType, userId);
  const def = (schema?.schema_definition ?? null) as SchemaDefinition | null;
  const { fields: schemaFields, threshold: schemaThreshold } = resolveDuplicateConfig(def);
  const threshold = params.threshold ?? schemaThreshold;

  const { data: entities } = await db
    .from("entities")
    .select("id, canonical_name, user_id, entity_type, merged_to_entity_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .is("merged_to_entity_id", null)
    .limit(MAX_CANDIDATES_PER_TYPE);

  const active = (entities ?? []).filter(
    (e: { merged_to_entity_id?: string | null }) => !e.merged_to_entity_id
  );
  if (active.length < 2) return [];

  const snapshots = schemaFields.length
    ? await db
        .from("entity_snapshots")
        .select("entity_id, snapshot")
        .in(
          "entity_id",
          active.map((e: { id: string }) => e.id)
        )
    : { data: [] };

  const snapshotByEntityId = new Map<string, Record<string, unknown>>();
  for (const row of (snapshots.data ?? []) as Array<{
    entity_id: string;
    snapshot?: Record<string, unknown>;
  }>) {
    if (row.snapshot && typeof row.snapshot === "object") {
      snapshotByEntityId.set(row.entity_id, row.snapshot);
    }
  }

  const pairs: DuplicateCandidatePair[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const snapA = snapshotByEntityId.get(a.id) ?? {};
      const snapB = snapshotByEntityId.get(b.id) ?? {};

      const matched: string[] = [];
      const scores: number[] = [];

      const nameScore = stringSimilarity(a.canonical_name ?? "", b.canonical_name ?? "");
      scores.push(nameScore);
      if (nameScore >= threshold) matched.push("canonical_name");

      for (const f of schemaFields) {
        const va = snapA[f];
        const vb = snapB[f];
        if (va == null || vb == null) continue;
        if (typeof va !== "string" && typeof va !== "number") continue;
        if (typeof vb !== "string" && typeof vb !== "number") continue;
        const s = stringSimilarity(String(va), String(vb));
        scores.push(s);
        if (s >= threshold) matched.push(f);
      }

      if (matched.length === 0) continue;

      const score = scores.reduce((acc, s) => Math.max(acc, s), 0);
      if (score < threshold) continue;

      pairs.push({
        entity_a: {
          id: a.id,
          canonical_name: a.canonical_name,
          snapshot_fields: schemaFields.length ? snapA : undefined,
        },
        entity_b: {
          id: b.id,
          canonical_name: b.canonical_name,
          snapshot_fields: schemaFields.length ? snapB : undefined,
        },
        score,
        matched_fields: matched,
        entity_type: entityType,
      });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  return pairs.slice(0, limit);
}
