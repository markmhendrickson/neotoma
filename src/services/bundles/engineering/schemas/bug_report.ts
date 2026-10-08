/**
 * `bug_report` (engineering bundle) — a defect report against software.
 *
 * Without this bundle, `bug_report` resolves to the built-in
 * `product_feedback` type via its alias list. Once the bundle registers this
 * schema, the registered schema takes priority over the alias.
 */

import { date, defineBundleSchema, str, text } from "../../schema_helpers.js";

export const bugReportSchema = defineBundleSchema({
  entity_type: "bug_report",
  label: "Bug Report",
  description: "A defect report against software.",
  fields: {
    title: text(),
    description: text("What is wrong."),
    severity: str(),
    status: str("e.g. open, triaged, fixed, wont_fix."),
    surface: str("Where the bug shows up, e.g. cli, api, ui."),
    version: str("Version the bug was observed in."),
    context: text("Steps or conditions that reproduce it."),
    details: text(),
    reported_at: date(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default bugReportSchema;
