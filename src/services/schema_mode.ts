/**
 * Schema mode configuration (Bundles m1).
 *
 * Reads the `NEOTOMA_SCHEMA_MODE` environment variable and exposes the parsed
 * value via {@link getSchemaMode}. This is parity-preserving in m1: the value
 * is read and cached at startup but no runtime behavior is gated on it yet.
 *
 * Enforcement points (m2) will live at:
 *   - `src/server.ts` `inferSchemaFromEntities`
 *   - `src/services/interpretation.ts` `ensureSchemaForExtractedEntity`
 *
 * Values:
 *   - `evolving` (default): schemas may be inferred or extended freely.
 *   - `guided`: schemas may evolve but with stronger user prompts (m2).
 *   - `locked`: schema set is fixed; no auto-inference (m2).
 *
 * Invalid or unrecognized values fall back to `evolving` with a structured
 * warning. Parsing never throws — startup must not break on misconfiguration.
 *
 * Comparison is case-insensitive: `LOCKED`, `Locked`, and `locked` all map to
 * the canonical lowercase value.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles m1 PR C).
 */

import { logger } from "../utils/logger.js";

export type SchemaMode = "evolving" | "guided" | "locked";

export const DEFAULT_SCHEMA_MODE: SchemaMode = "evolving";

const VALID_MODES: ReadonlySet<SchemaMode> = new Set<SchemaMode>(["evolving", "guided", "locked"]);

let cached: SchemaMode | undefined;

function parseSchemaMode(raw: string | undefined): SchemaMode {
  if (raw === undefined) return DEFAULT_SCHEMA_MODE;
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_SCHEMA_MODE;
  const normalized = trimmed.toLowerCase();
  if (VALID_MODES.has(normalized as SchemaMode)) {
    return normalized as SchemaMode;
  }
  logger.warn(
    `[schema_mode] NEOTOMA_SCHEMA_MODE has invalid value ${JSON.stringify(
      raw
    )}; falling back to ${DEFAULT_SCHEMA_MODE}. Valid values: evolving, guided, locked.`
  );
  return DEFAULT_SCHEMA_MODE;
}

/**
 * Returns the configured schema mode, reading `NEOTOMA_SCHEMA_MODE` once and
 * caching the result for the lifetime of the process. Call {@link
 * resetSchemaModeCacheForTesting} between tests that mutate the env var.
 */
export function getSchemaMode(): SchemaMode {
  if (cached !== undefined) return cached;
  cached = parseSchemaMode(process.env.NEOTOMA_SCHEMA_MODE);
  if (process.env.NEOTOMA_DEBUG_SCHEMA_MODE === "1") {
    logger.debug(`[schema_mode] resolved schema mode: ${cached}`);
  }
  return cached;
}

/**
 * Test-only helper: clears the cached value so a subsequent {@link
 * getSchemaMode} call re-reads `process.env`. Not part of the public API.
 */
export function resetSchemaModeCacheForTesting(): void {
  cached = undefined;
}
