/**
 * Entity-type equivalence check.
 *
 * Before auto-registering a new schema for an unseen `entity_type`, the
 * storage pipeline asks this service "is there already a registered type
 * that is semantically the same as this one?" If yes, the caller should
 * redirect the store to the existing canonical type instead of creating
 * a near-duplicate schema.
 *
 * This is the schema-agnostic replacement for pair-wise hardcoded
 * collapses like "if place then use places". The algorithm is:
 *
 *   1. Normalize the candidate name (lowercase, trimmed).
 *   2. Compute its singular form via `suggestSingular` (entity_type_guard).
 *   3. For each registered schema (global + user-specific):
 *      a. If schema.aliases includes the candidate, it's a match.
 *      b. If normalized(schema.entity_type) === normalized(candidate), match.
 *      c. If singular(schema.entity_type) === singular(candidate), match.
 *   4. First match wins; callers decide whether to collapse or pass through.
 *
 * The check is bounded: we only look at schemas already stored in the
 * registry, so we never invent new types to compare against.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import { suggestSingular } from "./entity_type_guard.js";

export interface EquivalenceMatch {
  candidate: string;
  canonical_entity_type: string;
  reason: "alias" | "normalized" | "singular_form";
  schema_scope: "global" | "user";
  schema_id?: string;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function canonicalForm(name: string): string {
  const normalized = normalize(name);
  const singular = suggestSingular(normalized);
  return singular ?? normalized;
}

interface RegistryRow {
  id?: string;
  entity_type: string;
  schema_definition: { aliases?: string[] } | null;
  scope?: string | null;
  user_id?: string | null;
}

async function loadRegistryTypes(userId?: string): Promise<RegistryRow[]> {
  const { data, error } = await db
    .from("schema_registry")
    .select("id, entity_type, schema_definition, scope, user_id")
    .eq("active", true);
  if (error) {
    logger.warn(
      `[ENTITY_TYPE_EQUIVALENCE] Failed to load registry types: ${error.message}`,
    );
    return [];
  }
  const rows = (data ?? []) as RegistryRow[];
  // Only consider global schemas and (if userId present) schemas owned by
  // this user. Do not cross-leak other users' types.
  return rows.filter((row) => {
    const scope = row.scope ?? "global";
    if (scope === "global") return true;
    if (scope === "user" && userId && row.user_id === userId) return true;
    return false;
  });
}

export interface FindEquivalentOptions {
  userId?: string;
  /**
   * When true (default), suggestions apply to both global and user scopes.
   * When false, only user-scope schemas are considered.
   */
  includeGlobal?: boolean;
}

export async function findEquivalentEntityType(
  candidate: string,
  options: FindEquivalentOptions = {},
): Promise<EquivalenceMatch | null> {
  if (!candidate || typeof candidate !== "string") return null;
  const candidateNorm = normalize(candidate);
  const candidateCanonical = canonicalForm(candidate);

  const rows = await loadRegistryTypes(options.userId);
  const filtered =
    options.includeGlobal === false
      ? rows.filter((r) => (r.scope ?? "global") === "user")
      : rows;

  for (const row of filtered) {
    const existingNorm = normalize(row.entity_type);

    // Never collapse an exact-match type to itself (same raw string). Case
    // differences (Place vs place) ARE collapsed — that's one of the things
    // this service exists to catch.
    if (row.entity_type === candidate) continue;

    // 1. Explicit alias declared on the schema.
    const aliases = Array.isArray(row.schema_definition?.aliases)
      ? row.schema_definition!.aliases!.map(normalize)
      : [];
    if (aliases.includes(candidateNorm)) {
      return {
        candidate,
        canonical_entity_type: row.entity_type,
        reason: "alias",
        schema_scope: (row.scope as "global" | "user") ?? "global",
        schema_id: row.id,
      };
    }

    // 2. Case-insensitive exact equality (e.g. Place vs place).
    if (existingNorm === candidateNorm) {
      return {
        candidate,
        canonical_entity_type: row.entity_type,
        reason: "normalized",
        schema_scope: (row.scope as "global" | "user") ?? "global",
        schema_id: row.id,
      };
    }

    // 3. Same singular form (place vs places, post vs posts).
    const existingCanonical = canonicalForm(row.entity_type);
    if (existingCanonical === candidateCanonical) {
      return {
        candidate,
        canonical_entity_type: row.entity_type,
        reason: "singular_form",
        schema_scope: (row.scope as "global" | "user") ?? "global",
        schema_id: row.id,
      };
    }
  }

  return null;
}
