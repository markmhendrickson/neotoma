# SQL injection via `sort_by` / `snapshot_filters` in entity queries (vX.Y.Z fix)

- **Date disclosed:** 2026-08-07
- **GHSA:** _pending_ (draft private advisory before any public branch lands)
- **CVE:** _requested_
- **Severity:** High — authenticated SQL injection in the `ORDER BY` clause of entity queries, usable as a blind/boolean oracle to read arbitrary rows in the SQLite database, bypassing per-row `user_id` tenant scoping on shared-backend deployments. CVSS ~8.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:L).
- **Affected:** Every deployment exposing `retrieve_entities` / `POST /entities/query` with the snapshot-field sort path. Confirmed present through **`0.21.3`**. Fixed range stamped at release: `>= <first-affected>, < X.Y.Z`.
- **Fixed in:** `X.Y.Z` (coordinated hotfix; also carries the Ed25519 auth-bypass advisory of the same date).
- **Reporter:** internal security review (operator-authorized probe).
- **CWEs:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html) (SQL Injection), [CWE-943](https://cwe.mitre.org/data/definitions/943.html) (Improper Neutralization of Special Elements in a Data Query), [CWE-639](https://cwe.mitre.org/data/definitions/639.html) (Authorization Bypass — cross-tenant read on shared backends).

## Summary

The `sort_by` query parameter accepts `snapshot.<field>` to sort by a JSON snapshot field. The field name is spliced into a `snapshot->>${field}` column expression, which the SQLite adapter passes through **unchanged** when it does not match the strict `column->>field` identifier pattern — and that value is then interpolated **raw** into the generated `ORDER BY` clause. An attacker supplies a SQL expression instead of a field name (e.g. a `CASE`/subquery) and it executes. The same raw-passthrough affects arbitrary `snapshot_filters` keys, which the tool schema declares as free-form (`additionalProperties`, no field pattern).

## Impact

- **Blind/boolean SQL injection** in `ORDER BY`. An attacker places a `CASE WHEN (<subquery>) THEN <colA> ELSE <colB> END` expression in `sort_by` and reads the resulting row order (or an error/timing signal) as a one-bit oracle, extracting arbitrary DB contents one predicate at a time.
- **Cross-tenant read on shared-backend topologies.** The injected subquery is **not** constrained by the caller's `user_id` filter, so on a shared SQLite backend with per-row `user_id` scoping (the hosted multi-tenant topology) an authenticated tenant can read other tenants' snapshot data. On a single-tenant instance it is arbitrary in-DB read within that instance.
- Requires the caller to pass the middleware and reach the query handler. **Note the interaction:** the companion Ed25519 auth-bypass advisory of the same date lets an *unauthenticated* attacker reach this handler on personal-mode instances, so on an unpatched instance the two chain into unauthenticated arbitrary DB read. They are fixed together.

## Reproduction (sanitized)

Confirmed live via the `retrieve_entities` tool and `POST /entities/query`. Placeholder types only:

```jsonc
// A benign sort — control case, returns 200 and sorts by the field.
{ "entity_type": "<TYPE>", "limit": 2, "sort_by": "snapshot.<real_field>" }

// Injection: the string is parsed as SQL, not treated as a field name.
// A reference to a real column (entity_id) resolves; a bogus column (zzz)
// errors with "no such column: zzz" — proving raw interpolation, not
// opaque-field handling.
{ "entity_type": "<TYPE>", "limit": 2,
  "sort_by": "snapshot.(CASE WHEN 1=1 THEN entity_id ELSE zzz END)" }

// Boolean oracle with two real columns: the row ORDER flips with the predicate.
{ "entity_type": "<TYPE>", "limit": 50,
  "sort_by": "snapshot.(CASE WHEN (<predicate over other rows>) THEN entity_id ELSE entity_type END)" }
```

On an affected host, the `zzz` variant returns a SQLite `no such column` error (the expression reached the engine); a benign sort on the same host returns `200`. No real operator data is included here.

## Root cause

The sort field is taken from user input and built into a `snapshot->>` column:

```ts
// PRE-FIX — src/services/entity_queries.ts
} else if (isSnapshotFieldSort) {
  const snapshotField = sortBy.replace("snapshot.", "");
  snapshotQuery = snapshotQuery.order(`snapshot->>${snapshotField}`, { ascending });
}
```

The SQLite adapter only rewrites a column when it matches a strict `identifier->>identifier` pattern; **anything else is returned verbatim** and later interpolated straight into the ORDER BY text:

```ts
// PRE-FIX — src/repositories/sqlite/local_db_adapter.ts
const jsonPathMatch = column.match(/^([A-Za-z_][A-Za-z0-9_]*)->>([A-Za-z_][A-Za-z0-9_]*)$/);
if (jsonPathMatch) {
  // ... safe json_extract rewrite ...
}
return column; // <-- non-matching input (e.g. a CASE expression) passes through UNCHANGED

// ... and downstream:
// `ORDER BY ${o.column} ${o.ascending ? "ASC" : "DESC"}`
```

`snapshot.(CASE ...)` → `snapshotField = "(CASE ...)"` → `snapshot->>(CASE ...)` → fails the `->>` regex → returned raw → interpolated into `ORDER BY`. The declared params carry no allowlist: `sort_by` is a free-form string and `snapshot_filters` uses `additionalProperties` with no key pattern (`src/tool_definitions.ts`).

## Fix

1. **Validate the snapshot field name before building the column.** In `entity_queries.ts`, reject any `snapshotField` that is not a bare identifier (`^[A-Za-z_][A-Za-z0-9_]*$`) for both the sort path and every `snapshot_filters` key, returning a 400 rather than passing it downstream.
2. **Fail closed in the adapter.** `normalizeColumnName` should `throw` on any `->>`-style column whose sides are not bare identifiers, instead of `return column`. The current `return column` fallthrough is the load-bearing defect; a defense-in-depth throw ensures no other caller can reach the raw path.
3. **Bind or bound `LIMIT`/`OFFSET`.** They are numeric-typed today (lower risk) but the builder interpolates them; parameterize or clamp.
4. **Regression tests (the gate).** Add cases that a `CASE`-expression `sort_by` and a non-identifier `snapshot_filters` key are rejected (400), and an adapter unit test that `normalizeColumnName` throws on a non-identifier `->>` column. Add a cross-tenant assertion that an injected `sort_by` cannot influence results scoped to another `user_id`.

## Operator action

1. **Upgrade to `X.Y.Z` or later.** No request-shape change for legitimate `snapshot.<field>` sorts.
2. **Until upgraded, treat any instance reachable by an untrusted caller as exposed to arbitrary in-DB read** — and, on shared-backend multi-tenant hosts, cross-tenant read. Combine with the companion auth-bypass advisory when scoping exposure on personal-mode instances.
3. **Audit query logs** for `sort_by` / `snapshot_filters` values containing parentheses, `CASE`, `SELECT`, `--`, or other non-identifier characters.

## Detection

- The sanitized reproduction returns a SQLite `no such column` error on a vulnerable host for the `zzz` variant, versus `200` on a fixed host (where the whole string is treated as an unknown field and handled without reaching SQL).
- Static: grep for `order(\`snapshot->>${` and any `return column;` fallthrough in `normalizeColumnName`.

## Gates that catch this regression class going forward

| Gate | What it does |
|------|--------------|
| G1 — `scripts/security/classify_diff.js` | Add `src/services/entity_queries.ts` and `src/repositories/sqlite/local_db_adapter.ts` to the security-sensitive concern set (query-builder + SQL-generation). |
| G2 — `scripts/security/semgrep_auth_rules.yml` | Add a rule flagging interpolation of a non-constant into an `ORDER BY` / column position, and any `return column` fallthrough on an identifier-normalizer. |
| G3 — query-injection matrix | New test file asserting non-identifier `sort_by` / `snapshot_filters` keys are rejected, plus the adapter throw and the cross-tenant non-influence assertion. |
| G4 — `scripts/security/ai_review.js` | Add: "does any user-controlled value reach a SQL identifier/ORDER BY position without an allowlist?" |
| G5 — `scripts/security/deployed_probes.sh` | Add the `CASE`-expression `sort_by` negative probe (expect no SQL error / correct 400 handling) post-deploy. |

## Timeline

| When (UTC) | Event |
|-----------|-------|
| 2026-08-07 | Operator-authorized probe confirms the injection live via `retrieve_entities` (`CASE`-expression `sort_by` reaches SQLite). |
| 2026-08-07 | Confirmed present on the bottega8 client instance (same code path) and on sandbox (injection point present; attribution pinned to public user there). |
| 2026-08-07 | Affected instances taken offline. |
| _pending_ | Private GHSA drafted; CVE requested; fix + regression rows on `hotfix/vX.Y.Z`. |
| _pending_ | `X.Y.Z` tagged and deployed; advisory mirrored public; index row added. |

## References

- Root cause: `src/services/entity_queries.ts` (snapshot-field sort), `src/repositories/sqlite/local_db_adapter.ts` (`normalizeColumnName` fallthrough + ORDER BY interpolation), `src/tool_definitions.ts` (`sort_by` / `snapshot_filters` schema).
- Companion advisory (same coordinated release): `docs/security/advisories/2026-08-07-ed25519-bearer-forged-key-auth-bypass.md`.
- Prior tenant-isolation advisory (different channel): `docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md`.
- Threat model: `docs/security/threat_model.md`.
