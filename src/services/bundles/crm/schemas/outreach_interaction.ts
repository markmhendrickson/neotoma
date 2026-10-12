/**
 * `outreach_interaction` (crm bundle) — one touchpoint of outreach to a
 * contact (message sent, call, reply received). Field set matches production
 * minus provenance fields, which belong in observation metadata.
 */

import { defineBundleSchema, list, str, text } from "../../schema_helpers.js";

export const outreachInteractionSchema = defineBundleSchema({
  entity_type: "outreach_interaction",
  label: "Outreach Interaction",
  description: "One outreach touchpoint with a contact.",
  aliases: ["outreach_activity"],
  fields: {
    title: { type: "string", required: true, preserveCase: true, description: "Short label." },
    contact_name: text("Who the interaction was with."),
    interaction_date: str("When it happened (ISO date or datetime)."),
    interaction_type: str("e.g. message, call, meeting, reply."),
    channel: str("e.g. email, linkedin, phone."),
    summary: text(),
    content: text("Message content, when the interaction is a message."),
    tags: list(),
    notes: text(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default outreachInteractionSchema;
