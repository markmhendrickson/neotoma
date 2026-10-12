# `outreach_interaction`

**Bundle:** `crm` · **Schema version:** 1.0

**Aliases:** `outreach_activity`

One outreach touchpoint with a contact.

The schema file `../schemas/outreach_interaction.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field              | Type   | Required | Description                                         |
| ------------------ | ------ | -------- | --------------------------------------------------- |
| `title`            | string | yes      | Short label.                                        |
| `contact_name`     | string | no       | Who the interaction was with.                       |
| `interaction_date` | string | no       | When it happened (ISO date or datetime).            |
| `interaction_type` | string | no       | e.g. message, call, meeting, reply.                 |
| `channel`          | string | no       | e.g. email, linkedin, phone.                        |
| `summary`          | string | no       |                                                     |
| `content`          | string | no       | Message content, when the interaction is a message. |
| `tags`             | array  | no       |                                                     |
| `notes`            | string | no       |                                                     |

## Usage notes

One touchpoint. Relate it `REFERS_TO` the `contact` it was with. Provenance (`data_source`) belongs in observation metadata, not a field. Once the bundle has registered this schema, writes under the alias `outreach_activity` land here.
