# `icp`

**Bundle:** `crm` · **Schema version:** 1.0

An ideal customer profile: target buyers, non-buyers, and fit weighting.

The schema file `../schemas/icp.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: `name`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field                  | Type   | Required | Description                                 |
| ---------------------- | ------ | -------- | ------------------------------------------- |
| `name`                 | string | yes      | Profile name.                               |
| `version`              | string | no       | Profile version.                            |
| `status`               | string | no       | e.g. draft, active, superseded.             |
| `company`              | string | no       | Company the profile is for.                 |
| `positioning`          | string | no       | Positioning the profile assumes.            |
| `services`             | string | no       | Offerings the profile targets.              |
| `scenarios`            | string | no       | Buying scenarios that fit.                  |
| `company_profile`      | string | no       | Firmographic profile of a good-fit company. |
| `non_buyers`           | string | no       | Who is explicitly not a fit.                |
| `scoring_weights`      | string | no       | How fit signals are weighted.               |
| `outreach_constraints` | string | no       | Constraints on outreach.                    |
| `known_gaps`           | string | no       |                                             |
| `open_questions`       | string | no       |                                             |
| `source_material`      | string | no       | Material the profile was derived from.      |

## Usage notes

Identity is the profile `name`. Persona and industry tier columns are deployment-specific and stay in `raw_fragments`.
