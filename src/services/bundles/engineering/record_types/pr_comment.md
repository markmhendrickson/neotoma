# `pr_comment`

**Bundle:** `engineering` · **Schema version:** 1.0

A comment on a pull request or issue thread.

The schema file `../schemas/pr_comment.ts` is authoritative; this page describes it.

## Identity

Canonical name rules, in order: `html_url`, then (`repository` + `comment_id`). When no rule matches, the resolver falls back to name-like fields.

## Fields

| Field          | Type   | Required | Description                                       |
| -------------- | ------ | -------- | ------------------------------------------------- |
| `repository`   | string | no       | Repository slug in owner/repo form.               |
| `pr_number`    | number | no       | Pull request number, when the comment is on a PR. |
| `issue_number` | number | no       | Issue number, when the comment is on an issue.    |
| `comment_id`   | number | no       | Platform comment id.                              |
| `comment_kind` | string | no       | e.g. review, issue_comment, inline.               |
| `html_url`     | string | no       | URL of the comment.                               |
| `body`         | string | no       | Comment body (markdown).                          |
| `summary`      | string | no       |                                                   |
| `agent`        | string | no       | Agent that posted the comment, if any.            |
| `lens`         | string | no       | Review lens the comment speaks for, if any.       |
| `verdict`      | string | no       |                                                   |
| `head_sha`     | string | no       | Head commit the comment refers to.                |
| `status`       | string | no       |                                                   |

## Usage notes

Relate it `REFERS_TO` its `pull_request` or `issue`.
