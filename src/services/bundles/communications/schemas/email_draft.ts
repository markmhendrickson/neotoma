/**
 * `email_draft` (communications bundle) — an unsent email being composed.
 * Recording a draft never sends it.
 */

import { defineBundleSchema, str, text } from "../../schema_helpers.js";

export const emailDraftSchema = defineBundleSchema({
  entity_type: "email_draft",
  label: "Email Draft",
  description: "An unsent email being composed.",
  fields: {
    subject: text(),
    from: str(),
    to: str("Recipients."),
    cc: str(),
    body: text("Plain-text body."),
    body_html: text("HTML body, when the draft is multipart."),
    status: str("e.g. drafting, ready, sent, discarded."),
    summary: text(),
    thread_id: str("Thread the draft replies into, if any."),
    in_reply_to_message_id: str("Message-ID the draft replies to."),
    delivery_channel: str(),
    delivery_status: str(),
  },
  identity_opt_out: "heuristic_canonical_name",
});

export default emailDraftSchema;
