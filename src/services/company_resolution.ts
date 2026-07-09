/**
 * Company entity resolution (leads graph join key).
 *
 * Turns a free-text organization name (e.g. `contact.organization`) into a
 * reliable, queryable join key: a canonical `company` entity that fuzzy
 * duplicates ("Kestrel8", "Kestrel 8", "Kestrel8 LLC") all resolve to.
 *
 * Resolution order (conservative — exact before fuzzy, fuzzy before create):
 *   1. Normalize the raw org string with the same rules `entity_resolution.ts`
 *      already applies to `company`/`organization` canonical names (lowercase,
 *      strip legal-entity suffixes, collapse whitespace) via
 *      {@link formatCanonicalNameForStorage} / {@link normalizeEntityValue}.
 *   2. Exact-normalized match: `resolveEntityWithTrace({entityType:"company"})`
 *      — deterministic get-or-create keyed on the normalized canonical_name.
 *      This alone already collapses case/whitespace/suffix variants (e.g.
 *      "Kestrel8 LLC" -> "kestrel8") because the normalizer strips suffixes
 *      before hashing.
 *   3. Fuzzy pre-check (only reached when step 2 is about to CREATE a new
 *      row): scan existing `company` entities for this user and score each
 *      against the normalized input with {@link stringSimilarity} (Levenshtein
 *      distance normalized to [0,1], reused from `duplicate_detection.ts`).
 *      A conservative threshold (default 0.88 — stricter than the 0.85
 *      generic duplicate-detector default, since companies collapsing
 *      incorrectly is a worse failure than missing a collapse) picks the
 *      best-scoring existing entity instead of creating a new one.
 *   4. Only when neither an exact nor a fuzzy match is found does a new
 *      `company` entity get created.
 *
 * This is intentionally a NEW, additive resolver layered on top of
 * `resolveEntityWithTrace` rather than a change to the exact-match resolver
 * itself — the generic resolver stays deterministic and fast for every other
 * entity type; only `company` resolution pays for the fuzzy scan, and only
 * on the (rare) path where no exact match exists.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { stringSimilarity } from "./duplicate_detection.js";
import {
  entityIdTenantSalt,
  formatCanonicalNameForStorage,
  generateEntityId,
  normalizeEntityValue,
  resolveEntityWithTrace,
} from "./entity_resolution.js";

/** Conservative fuzzy-match floor for company-name collapse. See module doc. */
export const COMPANY_FUZZY_MATCH_THRESHOLD = 0.88;

/** Hard cap on how many existing company rows are pulled into memory to score. */
const MAX_FUZZY_CANDIDATES = 2000;

export type CompanyResolutionBasis = "exact_normalized" | "fuzzy_match" | "created";

export interface CompanyResolutionResult {
  entityId: string;
  /** Normalized (lowercased, suffix-stripped) name used for matching. */
  normalizedName: string;
  /** Human-readable canonical name persisted on a newly created entity. */
  canonicalName: string;
  /** Which step produced the result. */
  basis: CompanyResolutionBasis;
  /** True when a new `company` entity was created (no match found). */
  created: boolean;
  /**
   * Present when `basis === "fuzzy_match"`: the similarity score in [0,1]
   * against the winning candidate.
   */
  fuzzyScore?: number;
}

/**
 * Normalize a raw organization string the same way `company` canonical
 * names are normalized elsewhere, for callers that need the token without
 * performing a full resolve (e.g. tests, query-side normalization).
 */
export function normalizeCompanyName(raw: string): string {
  return normalizeEntityValue("company", raw);
}

/**
 * Find the best fuzzy match for `normalizedInput` among existing `company`
 * entities for this user. Never throws — scan failures are logged and
 * treated as "no match" so callers can fall back to creating a new entity.
 *
 * `userId` is REQUIRED (not optional): this scans and fuzzy-matches raw
 * `canonical_name` values across `company` rows, so an omitted/empty userId
 * would silently perform a global cross-tenant scan over confidential
 * company data instead of failing loud. Callers must resolve/require a real
 * tenant id before calling this.
 */
async function findBestFuzzyCompanyMatch(params: {
  normalizedInput: string;
  userId: string;
  threshold: number;
}): Promise<{ entityId: string; canonicalName: string; score: number } | null> {
  const { normalizedInput, userId, threshold } = params;
  if (!userId) {
    throw new Error(
      "[COMPANY_RESOLUTION] findBestFuzzyCompanyMatch requires a non-empty userId " +
        "— refusing to fuzzy-scan company data across all tenants."
    );
  }
  if (!normalizedInput) return null;

  try {
    const { data, error } = await db
      .from("entities")
      .select("id, canonical_name, user_id, merged_to_entity_id")
      .eq("entity_type", "company")
      .eq("user_id", userId)
      .is("merged_to_entity_id", null)
      .limit(MAX_FUZZY_CANDIDATES);
    if (error) {
      logger.warn(`[COMPANY_RESOLUTION] fuzzy scan query failed: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;

    let best: { entityId: string; canonicalName: string; score: number } | null = null;
    for (const row of data as Array<{
      id: string;
      canonical_name: string | null;
      merged_to_entity_id?: string | null;
    }>) {
      if (row.merged_to_entity_id) continue;
      if (!row.canonical_name) continue;

      const candidateNormalized = normalizeEntityValue("company", row.canonical_name);
      if (!candidateNormalized) continue;

      const score = stringSimilarity(normalizedInput, candidateNormalized);
      if (score < threshold) continue;

      if (
        !best ||
        score > best.score ||
        // Deterministic tie-break: lower entity_id wins so repeated calls
        // with identical scores always pick the same candidate.
        (score === best.score && row.id < best.entityId)
      ) {
        best = { entityId: row.id, canonicalName: row.canonical_name, score };
      }
    }

    return best;
  } catch (err) {
    logger.warn(
      `[COMPANY_RESOLUTION] fuzzy scan failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Resolve (get-or-create) a canonical `company` entity from a free-text
 * organization name. See module doc for the full resolution order.
 *
 * Always commits (creates the entity when no match is found) — this is the
 * get-or-create primitive used by contact->company auto-linking and by the
 * company query seam (`company_query.ts`), which resolves read-only via the
 * fuzzy pass alone (see {@link findBestFuzzyCompanyMatch} usage there).
 *
 * `userId` is REQUIRED: it is forwarded to {@link findBestFuzzyCompanyMatch},
 * which fuzzy-scans confidential company data and must always be scoped to
 * one tenant (see that function's doc).
 */
export async function resolveCompanyEntity(params: {
  organizationName: string;
  userId: string;
  threshold?: number;
}): Promise<CompanyResolutionResult> {
  const { organizationName, userId } = params;
  if (!userId) {
    throw new Error(
      "[COMPANY_RESOLUTION] resolveCompanyEntity requires a non-empty userId " +
        "— refusing to resolve/create company entities across all tenants."
    );
  }
  const threshold = params.threshold ?? COMPANY_FUZZY_MATCH_THRESHOLD;

  const normalizedName = normalizeEntityValue("company", organizationName);
  const canonicalNameForStorage = formatCanonicalNameForStorage("company", organizationName);

  // Step 2: exact-normalized match via the deterministic resolver, but with
  // commit:false first so we can intercept the "about to create" case and
  // run the fuzzy pass before minting a new row.
  const probe = await resolveEntityWithTrace({
    entityType: "company",
    fields: { name: canonicalNameForStorage },
    userId,
    commit: false,
  });

  if (probe.trace.action === "would_match_existing") {
    return {
      entityId: probe.entityId,
      normalizedName,
      canonicalName: probe.trace.canonicalName,
      basis: "exact_normalized",
      created: false,
    };
  }

  // Step 3: fuzzy pre-check before creating.
  const fuzzyMatch = await findBestFuzzyCompanyMatch({
    normalizedInput: normalizedName,
    userId,
    threshold,
  });
  if (fuzzyMatch) {
    return {
      entityId: fuzzyMatch.entityId,
      normalizedName,
      canonicalName: fuzzyMatch.canonicalName,
      basis: "fuzzy_match",
      created: false,
      fuzzyScore: fuzzyMatch.score,
    };
  }

  // Step 4: no match — commit the create via the deterministic resolver so
  // the entity_id/canonical_name stay consistent with every other `company`
  // row (same hash basis as the probe above).
  const created = await resolveEntityWithTrace({
    entityType: "company",
    fields: { name: canonicalNameForStorage },
    userId,
    commit: true,
  });

  return {
    entityId: created.entityId,
    normalizedName,
    canonicalName: created.trace.canonicalName,
    basis: "created",
    created: created.trace.action === "created",
  };
}

/**
 * Deterministic entity_id for a company name, WITHOUT touching the database.
 * Exposed for callers (tests, docs) that need to compute the id a given
 * organization string would resolve to via the exact-normalized path.
 * Does not account for fuzzy collapse — a fuzzy match may resolve to a
 * different entity_id than this function returns.
 */
export function computeExactCompanyEntityId(organizationName: string, userId?: string): string {
  const canonicalNameForStorage = formatCanonicalNameForStorage("company", organizationName);
  return generateEntityId("company", canonicalNameForStorage, entityIdTenantSalt(userId));
}
