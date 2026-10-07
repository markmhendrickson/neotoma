# `release_result`

**Bundle:** `engineering` · **Schema version:** 1.0

The outcome of one release attempt.

The schema file `../schemas/release_result.ts` is authoritative; this page describes it.

## Identity

Heuristic (`identity_opt_out: heuristic_canonical_name`): resolved from name-like fields such as `name` or `title`.

## Fields

| Field         | Type   | Required | Description                          |
| ------------- | ------ | -------- | ------------------------------------ |
| `version`     | string | no       | Version being released.              |
| `status`      | string | no       | e.g. published, failed, blocked.     |
| `system`      | string | no       | Release system or package registry.  |
| `branch`      | string | no       | Release or release-candidate branch. |
| `release_url` | string | no       | URL of the release or release PR.    |
| `remote`      | string | no       | Git remote released from.            |
| `workflow`    | string | no       | CI workflow that ran the release.    |
| `reason`      | string | no       | Why the release ended in its status. |

## Usage notes

One entity per release attempt.
