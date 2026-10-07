# `lead_evaluation`

**Bundle:** `crm` · **Schema version:** 1.0

A scored assessment of a lead against a qualification rubric.

The schema file `../schemas/lead_evaluation.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field                   | Type   | Required | Description                                                 |
| ----------------------- | ------ | -------- | ----------------------------------------------------------- |
| `name`                  | string | no       | Short label for the evaluation.                             |
| `contact_name`          | string | no       | Name of the person being evaluated as a lead.               |
| `company`               | string | no       | Company the lead belongs to.                                |
| `relationship_type`     | string | no       | Relationship to the lead, e.g. prospect, partner, referrer. |
| `rubric_id`             | string | no       | Identifier of the rubric used.                              |
| `rubric_version`        | string | no       | Version of the rubric used.                                 |
| `scored_date`           | date   | no       | When the evaluation was scored.                             |
| `evidence_grade`        | string | no       | Strength of the evidence behind the scoring.                |
| `situation`             | string | no       | The lead's current situation.                               |
| `reasoning`             | string | no       | Why the lead scored as it did.                              |
| `gaps`                  | string | no       | What is unknown or unverified.                              |
| `recommended_objective` | string | no       | Recommended objective for the next conversation.            |
| `sources`               | array  | no       | Sources the evaluation relied on.                           |
| `notes`                 | string | no       |                                                             |

## Usage notes

One entity per scoring pass. Rubric-specific score columns are deployment-specific; they are accepted as unknown fields and kept in `raw_fragments`.
