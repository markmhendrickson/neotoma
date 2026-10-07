/**
 * Shared schema: `contact`.
 *
 * Originated by `core` (default install); referenced by `crm`, whose lead,
 * opportunity, and outreach records relate to contacts. Ownership recorded
 * here at the second reference per `docs/foundation/bundles.md`. The runtime
 * definition stays in `schema_definitions.ts`.
 */

import type { SharedSchemaRef } from "./shared_schema.js";

export const contactSharedSchema: SharedSchemaRef = {
  entity_type: "contact",
  originated_by: "core",
  description: "A person or organization the user has a relationship with.",
};

export default contactSharedSchema;
