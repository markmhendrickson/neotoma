# Security review — v0.23.1

Manually completed for `/release` Step 3.5 (Security review lane). This file
is the gate artifact; the supplement's Security section links it.
`npm run security:classify-diff` reports `sensitive=true` because the diff
touches `src/actions.ts`, which the classifier matches whole-file as the
`auth-middleware` concern (Gate G1's `src/actions.ts` rule is file-level, not
line-level — it fires on any edit to that file regardless of which function
is touched). A filled review is therefore gate-required; this is it.

## Scope

- Base ref: `v0.23.0`
- Head ref: `HEAD`
- Diff classifier: `sensitive=true` (`auth-middleware: src/actions.ts` —
  file-level match; see Adversarial review item 1 for why the actual edit in
  that file is not an auth-path change)
- Changed files: 9 (`src/actions.ts`, `src/server.ts`,
  `src/services/schema_registry.ts`, `src/services/store_warning_rule.ts`,
  two test files, one eval-harness scenario+cassette, one generated test
  catalog)
- Protected routes manifest: `npm run security:manifest:check` — 120 routes,
  in sync. No new routes added.

## Adversarial review

1. **Alternate-path auth.** Not implicated. This diff touches only the
   post-commit advisory `store_warnings` evaluation, which runs after the
   normal auth/route-handler path already resolved the authenticated user.
   No new route, no auth-decision code touched.
2. **Proxy trust.** Not implicated. No reads of `X-Forwarded-For`, `Host`,
   or `req.socket.remoteAddress` in the diff.
3. **Local-dev widening.** Not implicated. No reference to
   `LOCAL_DEV_USER_ID` or `assertExplicitlyTrusted` in the diff.
4. **Unauth public route.** No new Express routes registered. Manifest check
   confirms no drift (120 routes, in sync).
5. **Guest-access policy widening.** Not implicated. No changes to
   `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any guest
   token issuer.
6. **AAuth / agent identity downgrade.** Not implicated. No auth-tier logic
   touched.
7. **Denial-of-service via crafted schema.** Considered: could a
   maliciously-crafted `store_warnings` rule (e.g. a very large
   `missing_all_of` array, or deeply nested `condition`) cause excessive
   evaluation cost? `evaluateStoreWarningRule` does a single-pass `filter`/
   `every`/`some` over the declared array with no recursion and no
   unbounded loop; `condition` is read as a flat one-level object with a
   fixed set of recognized keys (`SUPPORTED_CONDITION_KEYS = ["missing_all_of"]`).
   No amplification vector found.
8. **Information disclosure via diagnostic message.** The
   `STORE_WARNING_RULE_NOT_EVALUATED` message echoes the rule's own
   `code`, the unsupported/offending key names, and index positions of
   malformed list entries — all schema-author-declared metadata, not
   entity field values or user data. No PII path.

## Findings

None. This release closes a fail-open gap in an advisory (non-security)
warning path; it introduces no new auth, routing, or data-access surface.
The prior behavior (an uncaught `TypeError` surfacing as `DB_QUERY_FAILED`)
was an availability bug, not a confidentiality or integrity issue — no
entity of the affected types could be written at all, so there was no
window for unauthorized access.

## Sign-off

- Reviewer: automated `/release` prepare pass (Phoenicurus), manual
  completion (`sensitive=true` per file-level classifier match on
  `src/actions.ts`; adversarial review above found no exploitable
  auth/routing/data-access surface in the actual diff).
- Verdict: **PASS** — diff classified sensitive by file-level heuristic
  (edits `src/actions.ts`), but the specific lines changed are the
  post-commit advisory `store_warnings` evaluator, not auth/routing logic.
  No security-sensitive behavior touched.
- Gate results: `security:classify-diff` (`sensitive=true`,
  `auth-middleware: src/actions.ts`), `security:lint` (0 errors, 133
  pre-existing warnings, none new to this diff), `security:manifest:check`
  (in sync, 120 routes), `test:security:auth-matrix` (18 passed, 1
  pre-existing skip, 0 failed).

---

## Addendum, 2026-09-27 — `patch_array_item` (Waxwing ADR, ent_4b41bb83a4faf4428a73bfc8)

Separate diff landing in the same in-progress release train. Documented here
rather than as a new version directory because it ships alongside the review
above, not as its own release.

### Scope

- Base ref: `origin/main` (HEAD at the time of this review)
- Diff classifier: `sensitive=true` — three independent matches, not one:
  `auth-middleware` (`src/actions.ts`, file-level), `openapi-security`
  (`openapi.yaml`), `protected-routes-manifest`
  (`scripts/security/protected_routes_manifest.json`).
- Changed files: 38 (reducer, correction/batch_correction services, new
  `array_item_patch.ts` + `stable_serialize.ts` services, HTTP/MCP/CLI
  surfaces, OpenAPI, docs, tests).
- Protected routes manifest: `npm run security:manifest:check` — 125 routes,
  in sync. **One new route added**: `POST /patch_array_item`.

### What changed, in security terms

1. A new Express route, `POST /patch_array_item`, registered in
   `src/actions.ts` with the same auth/capability/ownership gating as the
   adjacent `POST /correct` handler it is a sibling of: `getAuthenticatedUserId`
   resolves the caller; the target is then loaded under that user's ownership
   scope so the stored entity type, never caller input, drives
   `enforceAgentCapability("correct", ...)` and `assertCanWriteProtectedBatch`.
   `array_item_patch.ts` repeats the ownership/type assertion as a library
   entrance before writing.
2. The MCP `patch_array_item` tool follows the identical
   capability/ownership sequence before calling the same service function, so
   HTTP and MCP cannot diverge on authorization.
3. `/correct` (HTTP and MCP) gained two new optional request fields,
   `expected_version` + `overwrite`. Both are additive and no-op when absent;
   the precondition read and correction insert run in one write transaction,
   scoped to the caller's `user_id`. The existing batch-correction path now
   uses the same transaction boundary so its documented all-or-nothing/CAS
   contract is binding as well.
4. `openapi.yaml` gained the `/patch_array_item` path and documented (but did
   not newly create) the pre-existing, previously-undocumented
   `/entities/{id}/batch_correct` route — a docs-only addition for that
   route, no code change.

### Adversarial review (eight standard checks)

1. **Alternate-path auth.** Not implicated. `patch_array_item` and the
   `/correct` CAS addition both resolve the user via
   `getAuthenticatedUserId`/`this.getAuthenticatedUserId` — the same call
   every other write route uses. No bespoke auth branch introduced.
2. **Proxy trust.** Not implicated. No reads of `X-Forwarded-For`, `Host`, or
   `req.socket.remoteAddress` anywhere in this diff; `src/actions.ts`'s edit
   is confined to the new route handler and the `/correct` precondition call,
   both downstream of the existing auth middleware.
3. **Local-dev widening.** Not implicated. No reference to
   `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, or
   `NEOTOMA_TRUST_PROD_LOOPBACK` in the diff.
4. **Unauth public route.** `POST /patch_array_item` requires auth
   (`requires_auth: true` in the manifest, matching `/correct`'s entry) and is
   added to `protected_routes_manifest.json` in the same change;
   `security:manifest:check` confirms 125 routes in sync with no drift.
5. **Guest-access policy widening.** Not implicated. Neither new code path
   touches `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or any
   guest token issuer; `patch_array_item` uses the same
   `assertCanWriteProtectedBatch` gate as `/correct`.
6. **AAuth / agent identity downgrade.** Not implicated. Both new/changed
   handlers call `enforceAgentCapability("correct", ...)` — reusing
   `correct`'s existing capability scope rather than introducing a new,
   possibly-looser one.
7. **Denial-of-service via crafted input.** Considered. `key_value` is limited
   at the shared request boundary to a non-null JSON scalar.
   `patchArrayItem()` does a single linear `findIndex` scan over the target
   array plus one `stableSerialize` call per comparison — bounded by the
   size of the array field itself, no recursion, no unbounded loop.
   `mergeArrayByKey` in the reducer is the same shape: one pass over the
   top-priority observations' items. Both scale with existing stored data
   size, not with attacker-controlled amplification (the caller cannot make
   the stored array larger than their own prior writes already made it).
8. **Information disclosure via diagnostic message / error envelope.** The
   new `ERR_ARRAY_ITEM_CONFLICT` and `ERR_FIELD_VERSION_CONFLICT` envelopes
   echo back `entity_id`, `field`, `key_field`/`key_value`, and the
   caller-owned current item/version — all data the caller already has read
   access to via `getEntityWithProvenance`'s own `user_id` scoping (the
   conflict path cannot be reached for an entity the caller doesn't own,
   since the underlying read is scoped the same way the write is). No other
   user's fields, credentials, or headers are included.

### Findings

No unresolved security finding. The implementation audit found and fixed the
following correctness, contract, and fail-closed gaps before PR.

1. **Fixed — store-policy-denial envelope swallowing (both transports).**
   The HTTP `/patch_array_item` catch block and the MCP `patchArrayItem()`
   inner catch each generalized a `StorePolicyDeniedError` /
   `StorePolicyUnavailableError` into a generic 500 / `InternalError` instead
   of mapping it to the same structured 400 / denial envelope `/correct`
   already returns for the identical failure (both write through the same
   `createCorrection` → `assertStorePolicyAllows` gate). This is an
   availability/DX defect (a policy rejection reads as a server fault), not
   an authorization bypass — the underlying policy enforcement itself was
   never skipped, only its outward-facing shape was wrong. Fixed by
   re-throwing both error types unwrapped from `patchArrayItem()`'s catch
   (mirroring the existing `EntityOwnerConflictError` passthrough) and adding
   the matching HTTP branch; regression-guarded by
   `tests/unit/patch_array_item_store_policy_envelope.test.ts`.
2. **Fixed — no cross-check between the caller-supplied `key_field` and the
   schema's declared `merge_array_by_key` key_field.** `patchArrayItem` used
   the caller's `key_field` to locate/update a row, but the reducer's
   `mergeArrayByKey` always reconciles by the schema's declared `key_field`
   — a stale or mistyped caller `key_field` would locate the row by the WRONG
   identity, write it back, and the reducer would then treat it as a
   distinct new key, silently duplicating the row in the snapshot instead of
   updating it in place. This is a correctness/data-integrity defect (a
   caller mistake corrupts its own data unnoticed), not a cross-tenant
   access issue. Fixed by loading the schema's merge policy earlier in
   `patchArrayItem` and refusing a mismatch with a new, dedicated
   `ArrayItemKeyFieldMismatchError` → `400 ERR_ARRAY_ITEM_KEY_FIELD_MISMATCH`
   on both transports; regression-guarded by two new cases in
   `tests/integration/array_item_patch_conflict.test.ts` (HTTP and MCP each
   refuse the mismatch and write nothing).
3. **Fixed — check-then-act CAS races.** `patchArrayItem`, entity-level
   `/correct` CAS, and the pre-existing `batch_correction` CAS/all-or-nothing
   path now bind their read, version comparison, and observation insert(s) in
   one database write transaction. Regression tests race two writers holding
   the same valid token and require exactly one success plus one conflict;
   disjoint keyed writers must both survive.
4. **Fixed — authorization checked against caller-supplied entity type.** Both
   HTTP and MCP resolve the target under the authenticated user first, reject
   a supplied/stored type mismatch, and run capability/protected-type checks
   against the stored type. A decoy unprotected type cannot weaken the gate.
5. **Fixed — keyed patch could proceed without a binding keyed policy.** Schema
   lookup failures now propagate, and an absent/non-array/non-keyed policy is
   rejected with `ERR_ARRAY_ITEM_POLICY_REQUIRED` before any write. This
   prevents the safety surface from silently falling back to last-write.
6. **Fixed — misleading/non-opaque version token.** Item versions are now
   SHA-256 hashes of stable serialization rather than the serialized item
   content itself; the OpenAPI response constrains the token to 64 hex digits.
7. **Fixed — unkeyed historical accumulation.** Malformed keyless rows remain
   preserved, while byte-equivalent historical values are deduplicated by
   stable serialization so repeated observations do not grow the snapshot.
8. **Fixed — schema-surface parity gaps.** Incremental schema update now
   accepts `merge_array_by_key`, requires and persists `reducer_key_field`,
   and CLI schema registration preserves per-field `key_field`. OpenAPI,
   shared validation, service, CLI, and tests now describe the same contract.
9. **Fixed — `/correct` trusted a caller-supplied entity type at the shared
   service boundary.** The correction service now loads the authoritative
   stored type and rejects a mismatch with `ERR_ENTITY_TYPE_MISMATCH` before
   any observation is written. This protects HTTP, MCP, and future direct
   callers even if a transport-level precheck is skipped; the focused atomic
   suite verifies the rejected value never reaches the snapshot.

The new route otherwise reuses the existing `/correct` sibling's auth,
capability, and ownership-scoping stack rather than introducing a parallel
one; the two new conflict error codes are additive, opt-in (callers who omit
`expected_version`/`expected_item_version` see no behavior change), and their
envelopes carry only caller-owned data.

### Sign-off

- Reviewer: Cicada (implementation agent), self-review before PR, per
  change_guardrails MUST #18.
- Verdict: **PASS** — new route added with parity to the existing `/correct`
  auth/ownership stack; its policy and type assertions fail closed; the
  adjacent `/correct` type check also fails closed at the shared service
  boundary; two new opt-in conflict codes; no new
  auth/routing/proxy-trust/guest-access surface.
- Gate results: `security:classify-diff` (`sensitive=true`;
  `auth-middleware: src/actions.ts`, `openapi-security: openapi.yaml`,
  `protected-routes-manifest`), `security:lint` (0 errors, 137 pre-existing
  warnings, none new — `patch_array_item` itself is not flagged),
  `security:manifest:check` (in sync, 125 routes, one new route added),
  `test:security:auth-matrix` (18 passed, 1 pre-existing skip, 0 failed).
