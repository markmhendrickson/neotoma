/**
 * Schema-mode enforcement (Bundles m2).
 *
 * Provides `assertEntityTypeAllowed()`, called at both auto-create gating points:
 *   - `src/server.ts`           — `inferSchemaFromEntities` path (~line 4640)
 *   - `src/services/interpretation.ts` — `ensureSchemaForExtractedEntity` path (~line 474)
 *
 * Behavior by mode:
 *   - `evolving`: always passes (current behavior preserved).
 *   - `guided`:   passes only if the entity type is provided by a registered bundle.
 *   - `locked`:   always blocks auto-create.
 *
 * When blocked, throws `SchemaModeBlockedError` containing:
 *   - `error_code`: "SCHEMA_NOT_REGISTERED"
 *   - `entity_type`: the rejected type
 *   - `schema_mode`: the active mode
 *   - `available_bundles`: bundles that would provide the type (empty for `locked`)
 *
 * Plan: `ent_089da2ecebc3bd804d63dcf2` (Bundles Strategy m2)
 */

import { getSchemaMode } from "../schema_mode.js";
import { getBundlesProvidingType, isEntityTypeProvided } from "./loader.js";

export interface SchemaModeBlockedPayload {
  error_code: "SCHEMA_NOT_REGISTERED";
  entity_type: string;
  schema_mode: "guided" | "locked";
  available_bundles: string[];
  message: string;
}

export class SchemaModeBlockedError extends Error {
  readonly payload: SchemaModeBlockedPayload;

  constructor(payload: SchemaModeBlockedPayload) {
    super(payload.message);
    this.name = "SchemaModeBlockedError";
    this.payload = payload;
  }
}

/**
 * Assert that auto-creating a schema for `entityType` is allowed under the
 * current `NEOTOMA_SCHEMA_MODE`.
 *
 * - In `evolving` mode: always returns (no-op).
 * - In `guided` mode: throws if the type is not provided by any registered bundle.
 * - In `locked` mode: always throws.
 *
 * @throws {SchemaModeBlockedError} when the mode blocks auto-creation.
 */
export function assertEntityTypeAllowed(entityType: string): void {
  const mode = getSchemaMode();

  if (mode === "evolving") {
    // Current behavior: unrestricted auto-create.
    return;
  }

  if (mode === "locked") {
    throw new SchemaModeBlockedError({
      error_code: "SCHEMA_NOT_REGISTERED",
      entity_type: entityType,
      schema_mode: "locked",
      available_bundles: [],
      message:
        `Schema auto-creation is disabled (NEOTOMA_SCHEMA_MODE=locked). ` +
        `Entity type "${entityType}" must be registered via an installed bundle.`,
    });
  }

  // guided mode: allowed only if a registered bundle provides the type.
  if (!isEntityTypeProvided(entityType)) {
    const available = getBundlesProvidingType(entityType);
    throw new SchemaModeBlockedError({
      error_code: "SCHEMA_NOT_REGISTERED",
      entity_type: entityType,
      schema_mode: "guided",
      available_bundles: available,
      message:
        `Entity type "${entityType}" is not provided by any installed bundle ` +
        `(NEOTOMA_SCHEMA_MODE=guided). ` +
        (available.length > 0
          ? `Install one of the following bundles to enable it: ${available.join(", ")}.`
          : `No known bundle provides this type. Register it manually or switch to evolving mode.`),
    });
  }
}
