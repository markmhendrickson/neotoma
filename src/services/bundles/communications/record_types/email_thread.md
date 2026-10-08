# `email_thread`

**Bundle:** `communications` · **Schema version:** 1.0

A conversation of email messages.

The schema file `../schemas/email_thread.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: `thread_id`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field               | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `thread_id`         | string | no       | Thread identifier from the mail system. |
| `subject`           | string | no       |                                         |
| `summary`           | string | no       |                                         |
| `participants`      | string | no       | Participants in the thread.             |
| `message_count`     | number | no       |                                         |
| `last_message_date` | date   | no       |                                         |
| `status`            | string | no       | e.g. open, awaiting_reply, closed.      |
| `open_next_step`    | string | no       | What is pending on the thread.          |

## Usage notes

Until the `communications` bundle registers this schema, `email_thread` resolves to the built-in `email` via its alias list.
