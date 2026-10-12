# `lead_update`

**Bundle:** `crm` · **Schema version:** 1.0

A dated update on a sales or partnership lead: what happened and what is next.

The schema file `../schemas/lead_update.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field              | Type   | Required | Description                            |
| ------------------ | ------ | -------- | -------------------------------------- |
| `name`             | string | no       | Short label for the update.            |
| `contact_name`     | string | no       | Name of the lead's contact person.     |
| `company`          | string | no       | Company the lead belongs to.           |
| `update_date`      | date   | no       | When the update happened.              |
| `interaction_type` | string | no       | e.g. call, meeting, email, message.    |
| `channel`          | string | no       | Channel the update came through.       |
| `summary`          | string | no       | One-paragraph summary of the update.   |
| `what_happened`    | string | no       | Narrative of what happened.            |
| `commitments_made` | string | no       | Commitments made by either side.       |
| `commitment_date`  | date   | no       | Date a commitment is due.              |
| `open_items`       | string | no       | Open questions or items still pending. |
| `next_action`      | string | no       | Next action on the lead.               |
| `notes`            | string | no       |                                        |

## Usage notes

Store one entity per dated development and link it `REFERS_TO` the lead's `contact` (and `company` when known). Do not overwrite the contact with update narrative.
