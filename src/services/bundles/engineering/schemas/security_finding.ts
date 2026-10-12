/**
 * `security_finding` (engineering bundle) — one security issue found in code,
 * configuration, or a running system. Production rows of this type accumulated
 * many synonym columns for severity; the bundle keeps one `severity` field.
 */

import { defineBundleSchema, list, num, str, text } from "../../schema_helpers.js";

export const securityFindingSchema = defineBundleSchema({
  entity_type: "security_finding",
  label: "Security Finding",
  description: "A security issue found in code, configuration, or a running system.",
  fields: {
    title: text(),
    finding_key: str("Stable key for the finding, used to de-duplicate re-reports."),
    severity: str("e.g. critical, high, medium, low, info."),
    status: str("e.g. open, fixed, accepted, false_positive."),
    category: str("Class of weakness."),
    summary: text(),
    description: text(),
    repository: str("Repository slug in owner/repo form."),
    file_path: str("Primary file the finding concerns."),
    commit_sha: str("Commit the finding was observed at."),
    pr_number: num("Pull request the finding was raised on or fixed in."),
    fix: text("Remediation applied or proposed."),
    regression_test_path: str("Test that guards against recurrence."),
    verified_at: str("When the fix was verified (ISO datetime)."),
    reported_by: str(),
    tags: list(),
  },
  canonical_name_fields: [{ composite: ["repository", "finding_key"] }, "finding_key"],
});

export default securityFindingSchema;
