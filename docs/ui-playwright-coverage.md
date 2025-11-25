# UI Playwright Coverage

Playwright verifies end-to-end behaviour for every UI surface. The source of truth for expected coverage lives in `playwright/tests/coverage-map.json`, which maps feature keys to the corresponding spec files, states, and components.

## Coverage Matrix

| Feature key | Spec file | Focus |
| --- | --- | --- |
| `recordsLifecycle` | `playwright/tests/records-lifecycle.spec.ts` | Records table rendering, search/filter logic, uploads, batch delete, quota banner |
| `recordDetails` | `playwright/tests/record-details.spec.ts` | Detail sheet rendering, file affordances, status metadata |
| `chatPanel` | `playwright/tests/chat-panel.spec.ts` | Message composer, persistence, mock API responses |
| `settingsAndKeys` | `playwright/tests/settings-keys.spec.ts` | Floating settings trigger, cloud storage toggle, key management actions |
| `storageAndSchema` | `playwright/tests/storage-schema.spec.ts` | Seeding helpers, storage quota disclosure, sheet-to-settings flow |

Update the JSON map and this document whenever you add a new UI journey or skip an existing one so gaps remain explicit.

## Workflow Expectations

1. **Add or update specs** under `playwright/tests/**` whenever UI-facing files change (see coverage checker below).
2. **Keep the matrix current** by editing `playwright/tests/coverage-map.json` (and this doc) when functionality shifts between specs.
3. **Run the suites locally**:
   - `npm run test:e2e` &rarr; executes the full Playwright suite (Chromium + Mobile WebKit) and emits reports in `playwright/report`.
   - `npm run check:pw-coverage` &rarr; enforces that staged UI changes accompany Playwright coverage or docs updates.

Both commands run quickly against the mock API + deterministic keypairs provided by `playwright/fixtures/servers.ts`.

## Adding New Coverage

1. Extend `playwright/tests/coverage-map.json` with the new feature key, description, and spec pointer.
2. Create or update the matching spec under `playwright/tests/`.
3. Document notable states or skipped cases in this file.
4. Run `npm run check:pw-coverage` to confirm UI changes are paired with coverage.
5. Run `npm run test:e2e` before committing (required by `/commit` automation).
# UI Playwright Coverage

This repository now tracks UI test coverage as a source-of-truth artifact that connects user-visible functionality with the Playwright specs responsible for covering it.

## Coverage Matrix

The machine-readable matrix lives at `playwright/tests/coverage-map.json`. Each entry includes:

- `description`: user journey or invariant being tested
- `components`: primary React components or hooks exercised
- `states`: UI states / data permutations that must be validated
- `specFile`: the Playwright spec expected to implement coverage for the entry

### Current entries

| Feature key | Spec | Highlights |
| --- | --- | --- |
| `recordsLifecycle` | `records-lifecycle.spec.ts` | Empty vs seeded datastore, uploads (drag/drop + manual), multi-select delete, quota banner |
| `recordDetails` | `record-details.spec.ts` | Detail drawer open/close, badge transitions, file links, destructive actions |
| `chatPanel` | `chat-panel.spec.ts` | Message persistence, encrypted history, upload retries, recent records |
| `settingsAndKeys` | `settings-keys.spec.ts` | Floating settings entry point, key regen/export/import, Supabase toggle |
| `storageAndSchema` | `storage-schema.spec.ts` | Seed helpers, schema migrations, quota calculation, worker/sync health |

### Adding a new entry

1. Update `playwright/tests/coverage-map.json` with the new feature key and spec pointer.
2. Extend this document with a short description, linking any design docs.
3. Commit the spec (or update an existing spec) so `/commit` enforcement can detect the new coverage.

## Workflow expectations

- Every frontend change must either map to an existing coverage entry or add a new entry.
- Specs must reference the relevant coverage key (e.g., via `test.describe('recordsLifecycle', ...)`) to aid traceability.
- The `/commit` command will verify that coverage entries are updated when UI-affecting files change.

Additional automation and enforcement steps live in `scripts/check-playwright-coverage.ts` and the `/commit` command itself (see repo root `commit.md`).

