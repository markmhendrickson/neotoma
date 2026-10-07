# `pr_review`

**Bundle:** `engineering` · **Schema version:** 1.0

A review verdict on a pull request at a specific head commit.

The schema file `../schemas/pr_review.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: (`repository` + `pr_number` + `review_lens` + `head_sha`), then `comment_url`. When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field                  | Type   | Required | Description                                          |
| ---------------------- | ------ | -------- | ---------------------------------------------------- |
| `repository`           | string | no       | Repository slug in owner/repo form.                  |
| `pr_number`            | number | no       | Pull request number.                                 |
| `pr_url`               | string | no       |                                                      |
| `pr_title`             | string | no       |                                                      |
| `head_sha`             | string | no       | Head commit the review was made against.             |
| `reviewer`             | string | no       | Who (or which agent) reviewed.                       |
| `review_lens`          | string | no       | Review perspective, e.g. security, qa, architecture. |
| `verdict`              | string | no       | e.g. approve, request_changes, comment.              |
| `status`               | string | no       | e.g. posted, superseded.                             |
| `summary`              | string | no       |                                                      |
| `blocking_findings`    | array  | no       | Findings that block merge.                           |
| `nonblocking_findings` | array  | no       | Findings that do not block merge.                    |
| `review_round`         | number | no       | Review round on this PR, starting at 1.              |
| `comment_url`          | string | no       | URL of the posted review or comment.                 |
| `generated_at`         | date   | no       | When the review was produced.                        |

## Usage notes

One verdict per (repository, PR, review lens, head commit): a new push is a new review entity, not a correction of the old one.
