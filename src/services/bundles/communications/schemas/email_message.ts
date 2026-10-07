/**
 * `email_message` (communications bundle) — one email message, inbound or
 * outbound. Provider-specific ids (e.g. a mail provider's own message/thread
 * ids), raw API payloads, and local attachment paths stay in raw_fragments.
 *
 * Without this bundle, `email_message` resolves to the built-in `email` type
 * via its alias list. Once the bundle registers this schema, the registered
 * schema takes priority over the alias.
 */

import { date, defineBundleSchema, list, str, text } from "../../schema_helpers.js";

export const emailMessageSchema = defineBundleSchema({
  entity_type: "email_message",
  label: "Email Message",
  description: "One email message, inbound or outbound.",
  fields: {
    subject: text(),
    from_email: str("Sender address."),
    from_name: text("Sender display name."),
    to_addresses: list("Recipient addresses."),
    cc: str("Cc recipients."),
    sent_at: date(),
    received_at: date(),
    message_id: str("RFC 5322 Message-ID."),
    thread_id: str("Thread the message belongs to (see email_thread.thread_id)."),
    in_reply_to: str("Message-ID this message replies to."),
    mailbox: str("Mailbox or label the message was read from."),
    status: str("e.g. unread, read, archived, awaiting_reply."),
    summary: text(),
    body_excerpt: text("Short excerpt of the body."),
    body_text: text("Plain-text body."),
    attachment_filenames: list(),
  },
  canonical_name_fields: ["message_id", { composite: ["from_email", "subject", "sent_at"] }],
});

export default emailMessageSchema;
