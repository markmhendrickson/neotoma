/**
 * `email_thread` (communications bundle) — a conversation of email messages.
 */

import { date, defineBundleSchema, num, str, text } from "../../schema_helpers.js";

export const emailThreadSchema = defineBundleSchema({
  entity_type: "email_thread",
  label: "Email Thread",
  description: "A conversation of email messages.",
  fields: {
    thread_id: str("Thread identifier from the mail system."),
    subject: text(),
    summary: text(),
    participants: text("Participants in the thread."),
    message_count: num(),
    last_message_date: date(),
    status: str("e.g. open, awaiting_reply, closed."),
    open_next_step: text("What is pending on the thread."),
  },
  canonical_name_fields: ["thread_id"],
});

export default emailThreadSchema;
