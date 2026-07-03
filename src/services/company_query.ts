/**
 * Company query: "who do we have connected at company X".
 *
 * Answers the leads-graph question by (1) resolving a free-text company name
 * to the canonical `company` entity via the same exact-normalized + fuzzy
 * resolution path used at store time (`company_resolution.ts`), then (2)
 * reading the `works_at` edges that point at it (contact -> company),
 * returning the linked contacts.
 *
 * Read-only: unlike `resolveCompanyEntity` (used at store time), this never
 * creates a company entity. When no company matches (exact or fuzzy), the
 * result reports `company: null` and an empty `contacts` list rather than
 * inventing one — matching the State Layer rule against introducing
 * inference/creation on a read path (docs/foundation/philosophy.md #15
 * "No strategy, execution, or inference logic in Neotoma").
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { stringSimilarity } from "./duplicate_detection.js";
import {
  entityIdTenantSalt,
  formatCanonicalNameForStorage,
  generateEntityId,
  normalizeEntityValue,
} from "./entity_resolution.js";
import { relationshipsService } from "./relationships.js";
import { COMPANY_FUZZY_MATCH_THRESHOLD } from "./company_resolution.js";

export interface CompanyQueryContact {
  entity_id: string;
  canonical_name: string;
  snapshot: Record<string, unknown>;
  /** The `works_at` relationship_key linking this contact to the company. */
  relationship_key: string;
  /** When the works_at relationship was last observed (relationship_snapshots.last_observation_at). */
  last_observation_at: string;
}

export interface CompanyQueryResult {
  /** The company name as given by the caller, unmodified. */
  queried_name: string;
  /** Resolved company entity, or null when no exact/fuzzy match exists. */
  company: {
    entity_id: string;
    canonical_name: string;
    basis: "exact_normalized" | "fuzzy_match";
    fuzzy_score?: number;
  } | null;
  contacts: CompanyQueryContact[];
}

/**
 * Read-only company resolution: exact-normalized match first, then a
 * conservative fuzzy pass. Mirrors `resolveCompanyEntity`'s matching order
 * (see company_resolution.ts) but never creates a new entity.
 *
 * `userId` is REQUIRED (not optional): the fuzzy pass scans raw
 * `canonical_name` values across `company` rows, so an omitted/empty userId
 * would silently read across every tenant's company data instead of failing
 * loud. Callers must resolve/require a real tenant id before calling this.
 */
async function findCompanyReadOnly(params: {
  companyName: string;
  userId: string;
  threshold: number;
}): Promise<CompanyQueryResult["company"]> {
  const { companyName, userId, threshold } = params;
  if (!userId) {
    throw new Error(
      "[COMPANY_QUERY] findCompanyReadOnly requires a non-empty userId " +
        "— refusing to read company data across all tenants."
    );
  }

  const canonicalNameForStorage = formatCanonicalNameForStorage("company", companyName);
  const exactEntityId = generateEntityId(
    "company",
    canonicalNameForStorage,
    entityIdTenantSalt(userId)
  );

  const { data: exactRow, error: exactErr } = await db
    .from("entities")
    .select("id, canonical_name, merged_to_entity_id")
    .eq("id", exactEntityId)
    .maybeSingle();

  if (!exactErr && exactRow && !exactRow.merged_to_entity_id) {
    return {
      entity_id: exactRow.id,
      canonical_name: exactRow.canonical_name,
      basis: "exact_normalized",
    };
  }

  // Fuzzy pass over existing company entities.
  const normalizedInput = normalizeEntityValue("company", companyName);
  if (!normalizedInput) return null;

  const { data, error } = await db
    .from("entities")
    .select("id, canonical_name, user_id, merged_to_entity_id")
    .eq("entity_type", "company")
    .eq("user_id", userId)
    .is("merged_to_entity_id", null)
    .limit(2000);
  if (error) {
    logger.warn(`[COMPANY_QUERY] fuzzy scan query failed: ${error.message}`);
    return null;
  }
  if (!data || data.length === 0) return null;

  let best: { entity_id: string; canonical_name: string; score: number } | null = null;
  for (const row of data as Array<{
    id: string;
    canonical_name: string | null;
    merged_to_entity_id?: string | null;
  }>) {
    if (row.merged_to_entity_id || !row.canonical_name) continue;
    const candidateNormalized = normalizeEntityValue("company", row.canonical_name);
    if (!candidateNormalized) continue;
    const score = stringSimilarity(normalizedInput, candidateNormalized);
    if (score < threshold) continue;
    if (!best || score > best.score || (score === best.score && row.id < best.entity_id)) {
      best = { entity_id: row.id, canonical_name: row.canonical_name, score };
    }
  }

  if (!best) return null;
  return {
    entity_id: best.entity_id,
    canonical_name: best.canonical_name,
    basis: "fuzzy_match",
    fuzzy_score: best.score,
  };
}

/**
 * "Who do we have connected at company X" — resolve `companyName` to the
 * canonical `company` entity (read-only) and return every contact linked to
 * it via a live `works_at` edge.
 *
 * `userId` is REQUIRED: it scopes both the company resolution (see
 * {@link findCompanyReadOnly}) and the relationship/contact lookup to one
 * tenant's graph. This reads confidential company/contact data, so an
 * omitted/empty userId must fail loud rather than silently scanning every
 * tenant's data.
 */
export async function queryContactsAtCompany(params: {
  companyName: string;
  userId: string;
  threshold?: number;
}): Promise<CompanyQueryResult> {
  const { companyName, userId } = params;
  if (!userId) {
    throw new Error(
      "[COMPANY_QUERY] queryContactsAtCompany requires a non-empty userId " +
        "— refusing to query company/contact data across all tenants."
    );
  }
  const threshold = params.threshold ?? COMPANY_FUZZY_MATCH_THRESHOLD;

  const company = await findCompanyReadOnly({ companyName, userId, threshold });
  if (!company) {
    return { queried_name: companyName, company: null, contacts: [] };
  }

  // works_at edges point contact -> company, so contacts are the *incoming*
  // side of the company entity.
  const incoming = await relationshipsService.getRelationshipsForEntity(
    company.entity_id,
    "incoming",
    false,
    userId
  );
  const worksAtEdges = incoming.filter((r) => r.relationship_type === "works_at");
  if (worksAtEdges.length === 0) {
    return {
      queried_name: companyName,
      company: {
        entity_id: company.entity_id,
        canonical_name: company.canonical_name,
        basis: company.basis,
        ...(company.fuzzy_score !== undefined ? { fuzzy_score: company.fuzzy_score } : {}),
      },
      contacts: [],
    };
  }

  const contactIds = [...new Set(worksAtEdges.map((r) => r.source_entity_id))];

  let snapshotQuery = db
    .from("entity_snapshots")
    .select("entity_id, canonical_name, snapshot")
    .in("entity_id", contactIds);
  if (userId) {
    snapshotQuery = snapshotQuery.eq("user_id", userId);
  }
  const { data: snapshots, error: snapErr } = await snapshotQuery;
  if (snapErr) {
    logger.warn(`[COMPANY_QUERY] contact snapshot fetch failed: ${snapErr.message}`);
  }

  const snapshotByEntityId = new Map<
    string,
    { canonical_name: string; snapshot: Record<string, unknown> }
  >();
  for (const row of (snapshots ?? []) as Array<{
    entity_id: string;
    canonical_name: string;
    snapshot: Record<string, unknown>;
  }>) {
    snapshotByEntityId.set(row.entity_id, {
      canonical_name: row.canonical_name,
      snapshot: row.snapshot ?? {},
    });
  }

  const contacts: CompanyQueryContact[] = worksAtEdges
    .map((edge) => {
      const snap = snapshotByEntityId.get(edge.source_entity_id);
      return {
        entity_id: edge.source_entity_id,
        canonical_name: snap?.canonical_name ?? edge.source_entity_id,
        snapshot: snap?.snapshot ?? {},
        relationship_key: edge.relationship_key,
        last_observation_at: edge.last_observation_at,
      };
    })
    // Deterministic ordering: entity_id ascending, so repeated calls (and
    // tests) get a stable order regardless of insertion order.
    .sort((a, b) => (a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0));

  return {
    queried_name: companyName,
    company: {
      entity_id: company.entity_id,
      canonical_name: company.canonical_name,
      basis: company.basis,
      ...(company.fuzzy_score !== undefined ? { fuzzy_score: company.fuzzy_score } : {}),
    },
    contacts,
  };
}
