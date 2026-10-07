# `email_message`

**Bundle:** `communications` · **Schema version:** 1.0

One email message, inbound or outbound.

The schema file `../schemas/email_message.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: `message_id`, then (`from_email` + `subject` + `sent_at`). When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field                  | Type   | Required | Description                                                 |
| ---------------------- | ------ | -------- | ----------------------------------------------------------- |
| `subject`              | string | no       |                                                             |
| `from_email`           | string | no       | Sender address.                                             |
| `from_name`            | string | no       | Sender display name.                                        |
| `to_addresses`         | array  | no       | Recipient addresses.                                        |
| `cc`                   | array  | no       | Cc recipient addresses.                                     |
| `sent_at`              | date   | no       |                                                             |
| `received_at`          | date   | no       |                                                             |
| `message_id`           | string | no       | RFC 5322 Message-ID.                                        |
| `thread_id`            | string | no       | Thread the message belongs to (see email_thread.thread_id). |
| `in_reply_to`          | string | no       | Message-ID this message replies to.                         |
| `mailbox`              | string | no       | Mailbox or label the message was read from.                 |
| `status`               | string | no       | e.g. unread, read, archived, awaiting_reply.                |
| `summary`              | string | no       |                                                             |
| `body_excerpt`         | string | no       | Short excerpt of the body.                                  |
| `body_text`            | string | no       | Plain-text body.                                            |
| `attachment_filenames` | array  | no       |                                                             |

## Usage notes

Until the `communications` bundle registers this schema, `email_message` resolves to the built-in `email` via its alias list. Provider-specific ids and raw API payloads stay in `raw_fragments`. Relate it `PART_OF` its `email_thread`.
