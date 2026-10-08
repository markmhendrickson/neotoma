/**
 * Shared schema: `issue`.
 *
 * Originated by `infrastructure` (default install); referenced by
 * `engineering`, whose pull requests, reviews, and specs point at issues. The
 * type stays in `infrastructure`; ownership is recorded here at the second
 * reference per `docs/foundation/bundles.md`.
 */

import type { SharedSchemaRef } from "./shared_schema.js";

export const issueSharedSchema: SharedSchemaRef = {
  entity_type: "issue",
  originated_by: "infrastructure",
  description: "A tracked issue (e.g. a GitHub issue) mirrored into Neotoma.",
};

export default issueSharedSchema;
