/**
 * `lead_evaluation` (crm bundle) — a scored assessment of a lead against a
 * rubric. Rubric-specific score columns are deployment-specific and stay in
 * raw_fragments; this schema carries the generic evaluation envelope.
 */

import { date, defineBundleSchema, list, str, text } from "../../schema_helpers.js";

export const leadEvaluationSchema = defineBundleSchema({
  entity_type: "lead_evaluation",
  label: "Lead Evaluation",
  description: "A scored assessment of a lead against a qualification rubric.",
  fields: {
    name: str("Short label for the evaluation."),
    contact_name: text("Name of the person being evaluated as a lead."),
    company: text("Company the lead belongs to."),
    relationship_type: str("Relationship to the lead, e.g. prospect, partner, referrer."),
    rubric_id: str("Identifier of the rubric used."),
    rubric_version: str("Version of the rubric used."),
    scored_date: date("When the evaluation was scored."),
    evidence_grade: str("Strength of the evidence behind the scoring."),
    situation: text("The lead's current situation."),
    reasoning: text("Why the lead scored as it did."),
    gaps: text("What is unknown or unverified."),
    recommended_objective: text("Recommended objective for the next conversation."),
    sources: list("Sources the evaluation relied on."),
    notes: text(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default leadEvaluationSchema;
