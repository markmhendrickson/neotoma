/**
 * Schema-mode auto-create enforcement (Bundles m2 runtime).
 *
 * Single decision function consulted at the two auto-create points
 * (`src/server.ts` structured-store inference and
 * `src/services/interpretation.ts` extracted-entity schema creation). Gated on
 * {@link getSchemaMode}:
 *
 *   - `evolving` (default): always allowed. PARITY — the default install is a
 *     no-op for existing users; any entity type may auto-create.
 *   - `guided`: allowed only if an installed/enabled bundle provides the type.
 *     Otherwise rejected with a structured error naming the providing bundle
 *     (or "no bundle provides this type").
 *   - `locked`: never allowed; rejected with an instruction to register
 *     explicitly.
 *
 * The decision is pure data — call sites decide how to surface a rejection
 * (throw, structured MCP error, raw_fragment). Centralizing it keeps the two
 * gates identical.
 *
 * Tracking: Neotoma plan `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy).
 */

import { getSchemaMode, type SchemaMode } from "../schema_mode.js";
import { bundleProviding } from "./loader.js";

/** Why an auto-create was blocked. */
export type AutoCreateBlockReason = "guided_unprovided" | "locked";

/** Result of an auto-create gating check. */
export type AutoCreateDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: AutoCreateBlockReason;
      mode: SchemaMode;
      entityType: string;
      /** Bundle that would provide the type under `guided`, if any. */
      providingBundle?: string;
      /** Human-readable, structured-error-ready message. */
      message: string;
    };

/**
 * Decide whether `entityType` may auto-create under the current schema mode.
 * `modeOverride` is for testing; production passes nothing and reads the env.
 */
export function checkAutoCreateAllowed(
  entityType: string,
  modeOverride?: SchemaMode
): AutoCreateDecision {
  const mode = modeOverride ?? getSchemaMode();

  if (mode === "evolving") {
    return { allowed: true };
  }

  if (mode === "locked") {
    return {
      allowed: false,
      reason: "locked",
      mode,
      entityType,
      message:
        `Schema mode is "locked": auto-creating entity type "${entityType}" is not ` +
        `permitted. Register the type explicitly via an installed bundle ` +
        `(register_schema) before writing entities of this type.`,
    };
  }

  // guided
  const providingBundle = bundleProviding(entityType);
  if (providingBundle) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "guided_unprovided",
    mode,
    entityType,
    message:
      `Schema mode is "guided": entity type "${entityType}" is not provided by any ` +
      `installed bundle, so it cannot auto-create. No bundle provides this type — ` +
      `register it explicitly (register_schema) or install a bundle that provides it.`,
  };
}
