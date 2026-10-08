/**
 * `release_result` (engineering bundle) — the outcome of one release attempt.
 */

import { defineBundleSchema, str, text } from "../../schema_helpers.js";

export const releaseResultSchema = defineBundleSchema({
  entity_type: "release_result",
  label: "Release Result",
  description: "The outcome of one release attempt.",
  fields: {
    version: str("Version being released."),
    status: str("e.g. published, failed, blocked."),
    system: str("Release system or package registry."),
    branch: str("Release or release-candidate branch."),
    release_url: str("URL of the release or release PR."),
    remote: str("Git remote released from."),
    workflow: str("CI workflow that ran the release."),
    reason: text("Why the release ended in its status."),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default releaseResultSchema;
