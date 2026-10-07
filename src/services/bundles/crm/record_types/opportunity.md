# `opportunity`

**Bundle:** `crm` · **Schema version:** 1.0

A specific opening being pursued with a company or person.

The schema file `../schemas/opportunity.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field                | Type   | Required | Description                                                  |
| -------------------- | ------ | -------- | ------------------------------------------------------------ |
| `title`              | string | no       | Short name for the opportunity.                              |
| `full_name`          | string | no       | Primary contact for the opportunity.                         |
| `email`              | string | no       | Primary contact's email.                                     |
| `company`            | string | no       | Company the opportunity is with.                             |
| `role`               | string | no       | Role or position the opportunity concerns, if any.           |
| `relationship_type`  | string | no       | Relationship to the counterparty.                            |
| `source`             | string | no       | How the opportunity arose.                                   |
| `stage`              | string | no       | Current stage, free-form (e.g. exploring, proposal, closed). |
| `status`             | string | no       | Current status.                                              |
| `first_contact_date` | date   | no       | When the opportunity was first discussed.                    |
| `next_action`        | string | no       | Next action.                                                 |
| `next_action_date`   | string | no       | When the next action is due (ISO date).                      |
| `assessment`         | string | no       | Assessment of fit.                                           |
| `concerns`           | string | no       | Known concerns or risks.                                     |
| `notes`              | string | no       |                                                              |

## Usage notes

A specific opening being pursued (an engagement, a role, a partnership). There is no amount/close-date pipeline model; that is the `deal` type, deliberately not shipped.
