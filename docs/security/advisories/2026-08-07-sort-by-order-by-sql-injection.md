# sort_by / snapshot_filters ORDER BY SQL injection (v0.21.4 fix)

- **Date disclosed:** 2026-08-07
- **GHSA:** GHSA-8f95-jfm5-jjmr (draft; publish after tag per release process)
- **CVE:** _not requested_
- **Severity:** High — authenticated caller could execute arbitrary SQL expressions and bypass row-level user scoping on shared backends.
- **Affected:** all versions accepting `sort_by=snapshot.<field>` and `snapshot_filters` prior to `0.21.4`.
- **Fixed in:** `0.21.4`
- **Reporter:** internal security review.
- **CWEs:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html) (SQL Injection).

## Summary

Query endpoints accepting `sort_by=snapshot.<field>` and `snapshot_filters` keys spliced the caller-supplied field name into a `snapshot->>${field}` column expression, then interpolated the result raw into generated SQL. A caller could pass a `(CASE WHEN ...)` expression, a subquery, or a `DROP TABLE` fragment as the "field name," and it reached SQLite as executable SQL rather than being treated as an identifier — a blind ORDER BY injection. Because `sort_by`/`snapshot_filters` construction sat outside the normal `.eq("user_id", userId)` query-scoping path, a successful injection could also bypass per-row user scoping on backends shared across users.

## Impact

An authenticated caller supplying a crafted `sort_by` or `snapshot_filters` value could:

- Execute arbitrary `(CASE WHEN ...)` conditional expressions inside an `ORDER BY` clause.
- Run correlated subqueries (`(SELECT snapshot FROM entity_snapshots)`) inside the sort expression.
- Attempt destructive statements appended via comment-truncation (`amount_eur; DROP TABLE entity_snapshots;--`), though SQLite's single-statement execution model limits statement chaining in the direct query path — the more directly exploitable class is data exfiltration and cross-row read via the conditional/subquery forms.
- Bypass row-level `user_id` scoping on backends where multiple users share the same underlying tables.

## Root cause

Two layers should have rejected non-identifier field names and neither did:

1. `src/services/entity_queries.ts` accepted any string as a `snapshot_filters` key or `sort_by` field with no shape validation before splicing it into a `snapshot->>${field}` projection.
2. `src/repositories/sqlite/local_db_adapter.ts`'s column-name normalization (`normalizeColumnName`) rewrote recognized `->>` projections but had no fail-closed backstop for anything that was neither a bare identifier, a `table.column` pair, nor a recognized `->>` projection — it passed unrecognized shapes through unchanged.

## Fix

Defense in depth, both layers now reject:

1. **`isValidSnapshotFieldName`** (`src/services/entity_queries.ts`): a new exported validator backed by a bare-identifier regex (`SNAPSHOT_FIELD_NAME`). Both `snapshot_filters` key validation and `sort_by` field validation now call it before constructing any query, throwing `InvalidSnapshotFieldError` (mapped to an HTTP 400, not a 500) on rejection.
2. **`normalizeColumnName`** (`src/repositories/sqlite/local_db_adapter.ts`): the fail-closed backstop. Any column argument that is not a bare identifier, a `table.column` pair, or a recognized `->>` projection now throws, rather than passing through unchanged. This catches any future caller of the SQLite adapter that skips the `entity_queries.ts` validation layer.

Regression test: `tests/security/sort_by_sql_injection.test.ts` — asserts `isValidSnapshotFieldName` accepts only bare identifiers and rejects 11 distinct injection payloads (`CASE WHEN`, subqueries, comment-truncation, `DROP TABLE`, whitespace, empty string, raw `->>`), asserts `InvalidSnapshotFieldError` carries the field-name context needed for the 400 mapping, and asserts `normalizeColumnName` still correctly rewrites legitimate `->>` projections while throwing on every non-identifier shape.

## Operator action

- Upgrade to `>= 0.21.4`.
- No data migration required.
- Review query logs for `sort_by` or `snapshot_filters` values containing SQL keywords (`CASE`, `SELECT`, `DROP`, `--`) if the deployment logged raw query parameters prior to `0.21.4`.

## Detection

`tests/security/sort_by_sql_injection.test.ts` detects regressions of this class going forward.

## Gates that catch this regression class going forward

- **`normalizeColumnName` fail-closed backstop** — any new SQLite adapter caller that skips `entity_queries.ts` validation is still caught at the column-normalization layer.
- **`isValidSnapshotFieldName`** — the source-level gate; new query-building code should call this (or an equivalent bare-identifier check) before splicing any caller-supplied field name into generated SQL.

## Timeline

| Date | Event |
|------|-------|
| 2026-08-07 | Vulnerability identified during internal security review |
| 2026-08-07 | Fix PR #2129 merged |
| 2026-08-07 | v0.21.4 supplement prepared |
| TBD | v0.21.4 tagged and released |
| TBD | GHSA published |
