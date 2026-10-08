# `security_finding`

**Bundle:** `engineering` · **Schema version:** 1.0

A security issue found in code, configuration, or a running system.

The schema file `../schemas/security_finding.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: (`repository` + `finding_key`), then `finding_key`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field                  | Type   | Required | Description                                                  |
| ---------------------- | ------ | -------- | ------------------------------------------------------------ |
| `title`                | string | no       |                                                              |
| `finding_key`          | string | no       | Stable key for the finding, used to de-duplicate re-reports. |
| `severity`             | string | no       | e.g. critical, high, medium, low, info.                      |
| `status`               | string | no       | e.g. open, fixed, accepted, false_positive.                  |
| `category`             | string | no       | Class of weakness.                                           |
| `summary`              | string | no       |                                                              |
| `description`          | string | no       |                                                              |
| `repository`           | string | no       | Repository slug in owner/repo form.                          |
| `file_path`            | string | no       | Primary file the finding concerns.                           |
| `commit_sha`           | string | no       | Commit the finding was observed at.                          |
| `pr_number`            | number | no       | Pull request the finding was raised on or fixed in.          |
| `fix`                  | string | no       | Remediation applied or proposed.                             |
| `regression_test_path` | string | no       | Test that guards against recurrence.                         |
| `verified_at`          | string | no       | When the fix was verified (ISO datetime).                    |
| `reported_by`          | string | no       |                                                              |
| `tags`                 | array  | no       |                                                              |

## Usage notes

Use `finding_key` for a stable key so a re-reported finding resolves to the same entity. Keep exploit detail out of the entity until the fix ships.
