# `bug_report`

**Bundle:** `engineering` · **Schema version:** 1.0

A defect report against software.

The schema file `../schemas/bug_report.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field         | Type   | Required | Description                                |
| ------------- | ------ | -------- | ------------------------------------------ |
| `title`       | string | no       |                                            |
| `description` | string | no       | What is wrong.                             |
| `severity`    | string | no       |                                            |
| `status`      | string | no       | e.g. open, triaged, fixed, wont_fix.       |
| `surface`     | string | no       | Where the bug shows up, e.g. cli, api, ui. |
| `version`     | string | no       | Version the bug was observed in.           |
| `context`     | string | no       | Steps or conditions that reproduce it.     |
| `details`     | string | no       |                                            |
| `reported_at` | date   | no       |                                            |

## Usage notes

Until the `engineering` bundle registers this schema, `bug_report` resolves to the built-in `product_feedback` via its alias list.
