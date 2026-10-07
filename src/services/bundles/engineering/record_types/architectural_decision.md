# `architectural_decision`

**Bundle:** `engineering` · **Schema version:** 1.0

**Aliases:** `decision_record`

An architecture decision record: the decision, rationale, and alternatives.

The schema file `../schemas/architectural_decision.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field                | Type   | Required | Description                             |
| -------------------- | ------ | -------- | --------------------------------------- |
| `title`              | string | yes      |                                         |
| `status`             | string | no       | e.g. proposed, accepted, superseded.    |
| `summary`            | string | no       |                                         |
| `decision`           | string | no       | What was decided.                       |
| `rationale`          | string | no       | Why.                                    |
| `options_considered` | string | no       | Alternatives that were weighed.         |
| `caveats`            | string | no       |                                         |
| `reversibility`      | string | no       | How hard the decision is to reverse.    |
| `repo`               | string | no       | Repository slug the decision concerns.  |
| `pr_number`          | number | no       | Pull request that carries the decision. |
| `related_issue`      | string | no       | Issue the decision resolves.            |
| `tags`               | array  | no       |                                         |

## Usage notes

Once the bundle has registered this schema, writes under the alias `decision_record` land here. Relate it `REFERS_TO` the `pull_request` or `issue` that carries it.
