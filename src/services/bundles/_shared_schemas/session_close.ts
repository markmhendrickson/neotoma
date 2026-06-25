/**
 * Shared schema: `session_close` (Bundles m2).
 *
 * Originated by `core`; referenced by `core_workflows` (the close-session skill
 * records a session-close summary). Ownership transferred to `_shared_schemas/`
 * at the second reference per `docs/foundation/bundles.md`.
 */

import type { SharedSchemaRef } from "./shared_schema.js";

export const sessionCloseSharedSchema: SharedSchemaRef = {
  entity_type: "session_close",
  originated_by: "core",
  description: "A session-close summary record produced by the close-session skill.",
};

export default sessionCloseSharedSchema;
