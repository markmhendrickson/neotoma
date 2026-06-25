/**
 * Shared schema: `interaction` (Bundles m2).
 *
 * Originated by `core`; referenced by `core_workflows` (the session-loop skills
 * record session interactions). Ownership transferred to `_shared_schemas/` at
 * the second reference per `docs/foundation/bundles.md`.
 */

import type { SharedSchemaRef } from "./shared_schema.js";

export const interactionSharedSchema: SharedSchemaRef = {
  entity_type: "interaction",
  originated_by: "core",
  description: "A single session interaction (start-session / get-context turn record).",
};

export default interactionSharedSchema;
