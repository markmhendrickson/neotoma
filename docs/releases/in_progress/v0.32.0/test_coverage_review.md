# Test coverage review: v0.32.0

## Code review

Scope: `v0.31.0..HEAD` (2 commits, #2944 and #2946). Reviewed by the release-preparation agent reading the diff against the pre-PR checklist; the full `/review` skill was not run as a separate pass. Verdict: **APPROVE**. No BLOCKING findings.

- Contract seams: no `openapi.yaml`, MCP tool, or CLI command added or changed. `neotoma instructions print` description text changed only. `openapi:bc-diff`: no breaking changes.
- Determinism: the index is a pure function of rules and skill names in priority order; no clocks or randomness.
- Auth and tenant: no new query; rules and skills lookups are the existing user-scoped helpers. Unauthenticated entrances carry only the fixed notice.
- Advisory: the skills catalog moved from after the base block to before it (documented in the supplement under Behavior changes).

Checks run: `type-check` clean, `lint` 0 errors, `validate:test-catalog` up to date, 10 touched or new test files pass.

## Surfaces

### `GET /sources/:id/content` Content-Disposition encoding (#2946)
Covers user-observable behavior end-to-end. `tests/integration/source_content_download_filename.test.ts` downloads through the real route for an en dash, combining accent, emoji, double quote, newline, lone surrogate and a very long name, asserting bytes, the `filename` fallback, the `filename*` value and content type. `tests/unit/content_disposition.test.ts` covers the encoder. Local note: the lone-surrogate case failed in this local run at the test's own stored-name read-back (SQLite returned three U+FFFD instead of one, before any download); `CI test lanes` on bb01a10ed passed. Advisory, not blocking.


### `[SESSION INDEX]` on every instructions entrance (initialize, server/discover, GET /mcp-interaction-instructions, `neotoma instructions print`)
Covers user-observable behavior end-to-end. `tests/integration/instructions_session_index.test.ts` asserts the served text on each entrance. `tests/unit/instructions_index.test.ts` covers the byte cap, omission counts, and the empty case. `tests/integration/standing_rules_stateless_entrances.test.ts` covers the unauthenticated case.

### Compact mode (`NEOTOMA_MCP_COMPACT_INSTRUCTIONS=1`)
Covered by the integration test above per the supplement; no separate gap found.

### `neotoma instructions print` (shared composer)
Covers user-observable behavior: `tests/integration/standing_rules_cli_instructions_print.test.ts`.

No surface classified BLOCKING.
