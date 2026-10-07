/**
 * `architectural_decision` (engineering bundle) — an architecture decision
 * record: the decision, why, and what it rules out.
 */

import { defineBundleSchema, list, num, str, text } from "../../schema_helpers.js";

export const architecturalDecisionSchema = defineBundleSchema({
  entity_type: "architectural_decision",
  label: "Architectural Decision",
  description: "An architecture decision record: the decision, rationale, and alternatives.",
  aliases: ["decision_record"],
  fields: {
    title: { type: "string", required: true, preserveCase: true },
    status: str("e.g. proposed, accepted, superseded."),
    summary: text(),
    decision: text("What was decided."),
    rationale: text("Why."),
    options_considered: text("Alternatives that were weighed."),
    caveats: text(),
    reversibility: str("How hard the decision is to reverse."),
    repo: str("Repository slug the decision concerns."),
    pr_number: num("Pull request that carries the decision."),
    related_issue: str("Issue the decision resolves."),
    tags: list(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default architecturalDecisionSchema;
