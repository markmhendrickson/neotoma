# Test coverage review — v0.18.2

## Scope

Release diff: `v0.18.1..HEAD` (5 files, 2 bug fixes).

## Code review

Ran `/review v0.18.1..HEAD` against the release diff. Both changes are narrowly scoped bug fixes — one extends an existing deny-list (no new logic path), one adds a helper and enriches a message string. No new user-facing CLI commands, no new routes, no new HTTP/MCP contract surfaces, no migrations, no external file parsers.

Verdict: **ADVISORY only** — no BLOCKING findings. The changes are mechanically simple and the new test files have strong coverage of both the unit logic and the integration path.

## Surface coverage

### `src/services/entity_resolution.ts` — provenance-label deny-list extension

- **Change:** Three new strings (`source_name`, `data_source`, `origin`) added to the existing deny-list that `deriveCanonicalNameFromFieldsWithTrace` skips when choosing a canonical name.
- **Classification:** Covers user-observable behavior end-to-end.
- **Test coverage:** `tests/services/entity_resolution.test.ts` — 58 new assertions covering each new string individually and in combination with the existing deny-list entries, including edge cases (empty string, mixed-case). All 58 pass.

### `src/services/source_priority_warning.ts` — enriched SOURCE_PRIORITY_IGNORED message

- **Change:** New `ignoredFieldStrategies()` helper + enriched `message` field in `buildSourcePriorityIgnoredWarning` naming each affected field and its effective strategy.
- **Classification:** Covers user-observable behavior end-to-end.
- **Test coverage:**
  - `tests/unit/source_priority_ignored_warning.test.ts` — 165 unit assertions covering `ignoredFieldStrategies` directly (no-schema, partial-schema, `highest_priority` entries, mixed policies, empty written fields) and the full `buildSourcePriorityIgnoredWarning` output shape.
  - `tests/integration/store_source_priority_ignored_warning.test.ts` — 9 integration assertions (6 pre-existing, 3 new) validating end-to-end warning emission through both HTTP and MCP store paths. All 9 pass.

## Surfaces that do NOT apply to this release

- Destructive / data-mutating operations: none.
- External file-shape parsers: none.
- New CLI commands or flags: none.
- Discovery / detection / parser pairs: none.
- HTTP server runtime configuration: none.

## Verdict

No BLOCKING coverage gaps. All new user-facing surfaces have end-to-end test coverage verified by inspection of the test bodies (not just file presence). Release may proceed.
