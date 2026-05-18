/**
 * Entity-type guards for schema registration and storage.
 *
 * Two independent checks run whenever a new entity_type is introduced (via
 * `register_schema`, `update_schema_incremental`, or implicit auto-creation
 * in `storeStructuredInternal`):
 *
 * 1. Forbidden-pattern guard (this file, `isForbiddenTestArtifactType`)
 *    Rejects type names that match "test artifact" regexes — patterns users
 *    almost always create by accident in tests or CLI experiments and then
 *    never clean up. Defaults are intentionally narrow (numeric suffix
 *    required) so that real types like `test_case` are not caught. Users can
 *    widen or narrow via `NEOTOMA_FORBIDDEN_TYPE_PATTERNS` and allow
 *    specific names via `NEOTOMA_ALLOWED_TEST_TYPES`.
 *
 * 2. Plural-form guard (this file, `isLikelyPluralType`)
 *    Rejects names that are conventionally plural (`posts`, `contacts`),
 *    nudging callers toward singular `post`, `contact`. Irregular plurals
 *    (`news`, `data`, `analytics`) and user-allowlisted names via
 *    `NEOTOMA_ALLOWED_PLURAL_TYPES` are exempt.
 *
 * Both guards can be bypassed for a specific call with `force: true`, e.g.
 * when the user really does want `test_type_123` or `songs`.
 *
 * Behaviour:
 *   - development (NODE_ENV !== "production"): warn, never throw.
 *   - production: throw with an actionable message unless `force: true`.
 */

import { logger } from "../utils/logger.js";

const DEFAULT_FORBIDDEN_PATTERNS: RegExp[] = [
  // Numeric-suffixed test types: "test_type_001", "test_foo_42"
  /^test_[a-z0-9_]+_\d{2,}$/i,
  /^test_type_\d+$/i,
  /^test_entity_\d+$/i,
  // Auto-generated test types
  /^auto_test_[a-z0-9_]+$/i,
  /^[a-z0-9_]+_auto_test$/i,
  // "__tmp__", "__scratch__" sentinels
  /^__tmp__/i,
  /^__scratch__/i,
];

const IRREGULAR_SINGULAR_NAMES: Set<string> = new Set([
  // Words that end in "s" but are singular.
  "news",
  "data",
  "analytics",
  "status",
  "address",
  "access",
  "success",
  "progress",
  "process",
  "analysis",
  "basis",
  "thesis",
  "diagnosis",
  "species",
  "series",
  "means",
  "ethics",
  "economics",
  "physics",
  "mathematics",
  "politics",
  "statistics",
  "athletics",
  "kudos",
  "bonus",
  "corpus",
  "focus",
  "genius",
  "campus",
  "chaos",
  "cosmos",
  "virus",
  "sinus",
  "census",
  "bias",
]);

function parseForbiddenPatternsFromEnv(): RegExp[] {
  const raw = process.env.NEOTOMA_FORBIDDEN_TYPE_PATTERNS;
  if (!raw) return DEFAULT_FORBIDDEN_PATTERNS;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return DEFAULT_FORBIDDEN_PATTERNS;
  const compiled: RegExp[] = [];
  for (const pattern of parts) {
    try {
      compiled.push(new RegExp(pattern, "i"));
    } catch (err) {
      logger.warn(
        `[ENTITY_TYPE_GUARD] Invalid pattern in NEOTOMA_FORBIDDEN_TYPE_PATTERNS ` +
          `"${pattern}": ${(err as Error).message}`
      );
    }
  }
  return compiled.length > 0 ? compiled : DEFAULT_FORBIDDEN_PATTERNS;
}

function parseAllowlistFromEnv(envVar: string): Set<string> {
  const raw = process.env[envVar];
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
  );
}

export interface EntityTypeGuardResult {
  reason: "forbidden_test_artifact" | "looks_plural" | null;
  message: string;
  suggestion?: string;
}

export function checkForbiddenTestArtifactType(entityType: string): EntityTypeGuardResult {
  const allowlist = parseAllowlistFromEnv("NEOTOMA_ALLOWED_TEST_TYPES");
  if (allowlist.has(entityType.toLowerCase())) {
    return { reason: null, message: "" };
  }
  const patterns = parseForbiddenPatternsFromEnv();
  for (const rx of patterns) {
    if (rx.test(entityType)) {
      return {
        reason: "forbidden_test_artifact",
        message:
          `Entity type "${entityType}" matches a forbidden test-artifact pattern ` +
          `(${rx}). Test-artifact types pollute production registries and are rejected ` +
          `by default.`,
        suggestion:
          `If this is intentional, either pass force: true, set ` +
          `NEOTOMA_ALLOWED_TEST_TYPES=${entityType.toLowerCase()} to allow it ` +
          `permanently, or narrow NEOTOMA_FORBIDDEN_TYPE_PATTERNS.`,
      };
    }
  }
  return { reason: null, message: "" };
}

/**
 * Minimal singularization heuristic (reverses common English pluralization).
 * Not perfect, but good enough to catch `posts`, `contacts`, `meeting_notes`,
 * `songs` while leaving irregular forms like `analytics`, `news` untouched.
 */
export function suggestSingular(entityType: string): string | null {
  const lower = entityType.toLowerCase();
  if (IRREGULAR_SINGULAR_NAMES.has(lower)) return null;

  // words ending in "ies" → "y" (categories → category)
  if (/[^aeiou]ies$/.test(lower)) {
    return lower.slice(0, -3) + "y";
  }
  // words ending in "es" after sibilants → strip "es" (boxes → box)
  if (/(s|x|z|ch|sh)es$/.test(lower)) {
    return lower.slice(0, -2);
  }
  // standard plural: "s" at the end, with preceding consonant
  if (/[a-z]s$/.test(lower) && !lower.endsWith("ss")) {
    return lower.slice(0, -1);
  }
  return null;
}

export function checkPluralEntityType(entityType: string): EntityTypeGuardResult {
  const allowlist = parseAllowlistFromEnv("NEOTOMA_ALLOWED_PLURAL_TYPES");
  if (allowlist.has(entityType.toLowerCase())) {
    return { reason: null, message: "" };
  }
  const suggestion = suggestSingular(entityType);
  if (!suggestion) return { reason: null, message: "" };
  if (suggestion === entityType.toLowerCase()) return { reason: null, message: "" };
  return {
    reason: "looks_plural",
    message:
      `Entity type "${entityType}" appears to be plural. Entity types should be ` +
      `singular — one entity represents one thing.`,
    suggestion:
      `Consider using "${suggestion}" instead, or pass force: true / add ` +
      `"${entityType.toLowerCase()}" to NEOTOMA_ALLOWED_PLURAL_TYPES if this ` +
      `plural form is intentional.`,
  };
}

export interface EntityTypeGuardOptions {
  force?: boolean;
  context?: string;
}

/**
 * Apply both guards. In production mode a violation throws. In development
 * mode it emits a warning and allows the operation to proceed, so callers
 * are not blocked by accidental typos while iterating.
 */
export function enforceEntityTypeGuards(
  entityType: string,
  options: EntityTypeGuardOptions = {}
): void {
  if (options.force) return;
  if (!entityType || typeof entityType !== "string") return;

  const forbidden = checkForbiddenTestArtifactType(entityType);
  const plural = checkPluralEntityType(entityType);
  const ctx = options.context ? ` (${options.context})` : "";

  const isProduction = process.env.NODE_ENV === "production";

  if (forbidden.reason) {
    const msg = `${forbidden.message}${ctx} ${forbidden.suggestion ?? ""}`.trim();
    if (isProduction) {
      const err = new Error(msg);
      (err as { code?: string }).code = "ERR_FORBIDDEN_ENTITY_TYPE";
      throw err;
    }
    logger.warn(`[ENTITY_TYPE_GUARD] ${msg}`);
  }

  if (plural.reason) {
    const msg = `${plural.message}${ctx} ${plural.suggestion ?? ""}`.trim();
    if (isProduction) {
      const err = new Error(msg);
      (err as { code?: string }).code = "ERR_PLURAL_ENTITY_TYPE";
      throw err;
    }
    logger.warn(`[ENTITY_TYPE_GUARD] ${msg}`);
  }
}
