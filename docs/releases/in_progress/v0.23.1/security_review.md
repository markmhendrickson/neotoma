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
