# `email_draft`

**Bundle:** `communications` · **Schema version:** 1.0

An unsent email being composed.

The schema file `../schemas/email_draft.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field                    | Type   | Required | Description                             |
| ------------------------ | ------ | -------- | --------------------------------------- |
| `subject`                | string | no       |                                         |
| `from`                   | string | no       |                                         |
| `to`                     | string | no       | Recipients.                             |
| `cc`                     | string | no       |                                         |
| `body`                   | string | no       | Plain-text body.                        |
| `body_html`              | string | no       | HTML body, when the draft is multipart. |
| `status`                 | string | no       | e.g. drafting, ready, sent, discarded.  |
| `summary`                | string | no       |                                         |
| `thread_id`              | string | no       | Thread the draft replies into, if any.  |
| `in_reply_to_message_id` | string | no       | Message-ID the draft replies to.        |
| `delivery_channel`       | string | no       |                                         |
| `delivery_status`        | string | no       |                                         |

## Usage notes

Recording a draft never sends it. Set `status` to `sent` or `discarded` when the draft is resolved.
