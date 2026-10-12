/**
 * `lead_update` (crm bundle) — a dated update on a lead: what happened, what
 * was committed, and what happens next. Field set is the generic subset of how
 * the type is written in production today; deployment-specific scoring fields
 * stay in raw_fragments.
 */

import { date, defineBundleSchema, str, text } from "../../schema_helpers.js";

export const leadUpdateSchema = defineBundleSchema({
  entity_type: "lead_update",
  label: "Lead Update",
  description: "A dated update on a sales or partnership lead: what happened and what is next.",
  fields: {
    name: str("Short label for the update."),
    contact_name: text("Name of the lead's contact person."),
    company: text("Company the lead belongs to."),
    update_date: date("When the update happened."),
    interaction_type: str("e.g. call, meeting, email, message."),
    channel: str("Channel the update came through."),
    summary: text("One-paragraph summary of the update."),
    what_happened: text("Narrative of what happened."),
    commitments_made: text("Commitments made by either side."),
    commitment_date: date("Date a commitment is due."),
    open_items: text("Open questions or items still pending."),
    next_action: text("Next action on the lead."),
    notes: text(),
  },
  identity_opt_out: "heuristic_canonical_name",
  agent_instructions:
    "A lead_update records one dated development on a lead. Store one entity per update " +
    "and relate it to the lead's contact (REFERS_TO contact) rather than editing the contact.",
});

export default leadUpdateSchema;
