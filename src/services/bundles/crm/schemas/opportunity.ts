/**
 * `opportunity` (crm bundle) — a specific opening being pursued with a
 * company or person (engagement, role, partnership). Not a pipeline `deal`:
 * no amount/close-date model, matching how the type is written today.
 */

import { date, defineBundleSchema, str, text } from "../../schema_helpers.js";

export const opportunitySchema = defineBundleSchema({
  entity_type: "opportunity",
  label: "Opportunity",
  description: "A specific opening being pursued with a company or person.",
  fields: {
    title: text("Short name for the opportunity."),
    full_name: text("Primary contact for the opportunity."),
    email: str("Primary contact's email."),
    company: text("Company the opportunity is with."),
    role: text("Role or position the opportunity concerns, if any."),
    relationship_type: str("Relationship to the counterparty."),
    source: str("How the opportunity arose."),
    stage: str("Current stage, free-form (e.g. exploring, proposal, closed)."),
    status: str("Current status."),
    first_contact_date: date("When the opportunity was first discussed."),
    next_action: text("Next action."),
    next_action_date: str("When the next action is due (ISO date)."),
    assessment: text("Assessment of fit."),
    concerns: text("Known concerns or risks."),
    notes: text(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default opportunitySchema;
