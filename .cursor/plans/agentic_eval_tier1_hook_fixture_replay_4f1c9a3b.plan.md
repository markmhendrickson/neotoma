---
name: Agentic Eval — Tier 1 — Hook Fixture Replay Matrix
overview: |
  Turn the existing per-harness hook-fixture tests into a uniform,
  matrix-driven Tier-1 eval suite that exercises every hook package
  (cursor, claude-code, opencode, codex, claude-agent-sdk) against the
  same scripted scenarios under multiple model regimes (small / medium /
  strong) without ever calling a real LLM. The fixture format becomes
  the single source of truth for "given hook payloads X, the harness
  must record observations Y in Neotoma." This is the cheap, fast,
  always-on regression layer beneath Tier 2 (real-LLM replay) and
  Tier 3 (production-as-eval scorecard).
todos:
  - id: tier1-fixture-format-spec
    content: Define the fixture format (`tests/fixtures/agentic_eval/<scenario>.json`) — `meta` (id, description, harnesses, models), `events` (sequence of hook payloads with synthetic timestamps), `assertions` (DB-state predicates: `store_structured_calls >= N`, `entity_exists`, `relationship_exists`, `turn_compliance.status`), `expected_followup` for stop-hook outputs. Document the schema in `docs/developer/agentic_eval_fixture_format.md`.
    status: pending
  - id: tier1-shared-runner-harness-adapters
    content: Build a shared TypeScript runner (`tests/helpers/agentic_eval_runner.ts`) that takes a fixture + a per-harness adapter (driver) and (1) sets up an isolated tmp NEOTOMA_DATA_DIR + ephemeral local Neotoma server, (2) feeds events into the harness's hook scripts in-order, (3) runs the assertion set against the resulting SQLite DB, (4) returns a structured pass/fail report. Provide adapters for cursor-hooks, claude-code-plugin, codex-hooks; stub adapters for opencode-plugin and claude-agent-sdk-adapter where the host process is not directly invocable but their hook bodies can be imported.
    status: pending
  - id: tier1-seed-scenarios
    content: "Seed five canonical scenarios covering the Neotoma turn lifecycle: (a) `single_turn_with_extracted_entity` (user prompt mentions a person; assert `contact` stored + `REFERS_TO` from user message), (b) `multi_tool_then_reply` (Read → Grep → reply; assert `conversation_message` user + assistant + PART_OF), (c) `tool_failure_recovery` (failing tool; assert hint stored, no compliance backfill), (d) `agent_skips_store` (no `store_structured` calls; assert `turn_compliance{status:'backfilled_by_hook'}` emitted by stop hook), (e) `attachment_with_extracted_entities` (image/file attached; assert file entity + EMBEDS edge)."
    status: pending
  - id: tier1-model-matrix
    content: Add a `models[]` axis to each fixture so a single scenario runs once per model regime. Mock each via the synthetic `model` field on hook payloads — `composer-2` (small), `gpt-5.5-fast` (small), `claude-haiku-4` (small), `claude-sonnet-4.5` (strong), `gpt-5.5-medium` (strong). Different assertion sets per regime are allowed (e.g. small-model scenarios may legitimately include compact-reminder injection assertions that strong-model runs do not).
    status: pending
  - id: tier1-snapshot-mode
    content: Add a snapshot mode where the runner serializes the resulting DB (sorted entities + observations + relationships, scrubbed of timestamps and ids) to `tests/__snapshots__/agentic_eval/<scenario>__<harness>__<model>.snap.json`. CI runs in compare mode; an env flag (`UPDATE_AGENTIC_EVAL_SNAPSHOTS=1`) regenerates. This catches subtle regressions the hand-written assertions miss.
    status: pending
  - id: tier1-vitest-integration
    content: Wire a single `tests/integration/agentic_eval_matrix.test.ts` that discovers all fixtures, expands the harness × model matrix, and emits one `it()` per cell. Wire the suite into `npm test` at lower priority (or behind a `NEOTOMA_AGENTIC_EVAL=1` flag if perf is a concern) so failures surface in the normal CI pipeline.
    status: pending
  - id: tier1-failure-report
    content: On failure, runner prints the diff between expected vs actual DB state in a focused way — "Expected `store_structured_calls >= 1`, got 0; expected `turn_compliance` observation present, got none" — plus the path to the rendered snapshot diff. Avoid dumping the entire SQLite contents.
    status: pending
  - id: tier1-docs-and-cli-shortcut
    content: Document the fixture format and the runner in `docs/subsystems/agentic_eval.md`. Add `npm run eval:tier1 [-- --filter <scenario>]` as a developer-friendly entry point that bypasses vitest's default config and runs only the agentic-eval matrix.
    status: pending
isProject: false
---

## Context

[`tests/integration/cursor_hook_stop_backfill.test.ts`](tests/integration/cursor_hook_stop_backfill.test.ts) and [`tests/integration/hook_failure_hint.test.ts`](tests/integration/hook_failure_hint.test.ts) already prove that the Cursor stop hook's compliance backfill works as designed. They are also the only tests of their kind: hand-rolled, Cursor-only, and not extensible to the other four harness packages without copy-paste.

The [weak-model Neotoma compliance work](.cursor/plans/weak_model_neotoma_compliance_366fdfaf.plan.md) shipped a uniform compliance signal (`turn_compliance` observations + `instruction_profile` counters) across all harnesses. That makes it cheap to write **one** runner that drives **any** harness through **the same** scenarios and asserts on **the same** Neotoma DB state.

Tier 1 is deliberately LLM-free. Its only goal is "given hook events X, the harness records DB state Y." Real-LLM behavior (does Composer 2 actually skip the store?) is Tier 2's job.

## Architecture

```mermaid
flowchart TD
    Fix["fixtures/agentic_eval/*.json"] --> Runner["agentic_eval_runner.ts"]
    Runner --> Adp1["adapter: cursor-hooks"]
    Runner --> Adp2["adapter: claude-code-plugin"]
    Runner --> Adp3["adapter: codex-hooks"]
    Runner --> Adp4["adapter: opencode-plugin (stub)"]
    Runner --> Adp5["adapter: claude-agent-sdk-adapter (stub)"]
    Adp1 --> NS["isolated Neotoma server (tmp DB)"]
    Adp2 --> NS
    Adp3 --> NS
    Adp4 --> NS
    Adp5 --> NS
    NS --> SQL["SQLite assertions"]
    NS --> Snap["snapshot diff"]
    SQL --> Report
    Snap --> Report
```

## Confirmed invariants

1. **No real LLM calls.** Every hook payload is synthesized from the fixture; `model` is just a string for branching logic.
2. **Per-scenario tmp data dir.** The runner sets `NEOTOMA_DATA_DIR=$(mktemp -d)` and starts an in-process Neotoma server bound to a random port; nothing leaks across scenarios.
3. **Ground truth is the DB, not stdout.** Assertions are SQL/graph queries via the local Neotoma client; we do not regex on hook stdout. (Hook stdout is JSON-validated only.)
4. **Snapshot files are reviewed.** Snapshots live in-tree and are diff-reviewed; treating them as throwaway defeats the regression-test purpose.
5. **Same fixture file drives all harnesses.** Per-harness branches in the assertion set are allowed but must be explicit (`assertions: { default: [...], "claude-code-plugin": [...] }`), not silent.

## Implementation plan

### Phase 1 — Format + runner skeleton
Implement the fixture spec (`tier1-fixture-format-spec`) and the runner shell (`tier1-shared-runner-harness-adapters`) with one cursor-hooks adapter wired end-to-end. Validate by porting `cursor_hook_stop_backfill.test.ts` to a single fixture file; the new runner should reproduce its pass/fail behavior exactly.

### Phase 2 — Seed matrix + multi-harness adapters
Add the five canonical scenarios (`tier1-seed-scenarios`) and the four remaining harness adapters. opencode-plugin and claude-agent-sdk-adapter are TypeScript modules; for those, the adapter imports the hook handlers and invokes them directly (no child process). claude-code-plugin and codex-hooks are Python; their adapters spawn `python3 hooks/<name>.py` with stdin/stdout JSON.

### Phase 3 — Model matrix + snapshots
Layer the model axis (`tier1-model-matrix`) and snapshot mode (`tier1-snapshot-mode`). Snapshots are bucketed `<scenario>__<harness>__<model>.snap.json` so a single scenario change does not blow up unrelated cells.

### Phase 4 — Vitest wiring + reporting
Plug the matrix into vitest (`tier1-vitest-integration`) and the failure renderer (`tier1-failure-report`). Goal: a developer who breaks a hook sees one focused failure with "did not store conversation_message in turn X" rather than a SQLite dump.

### Phase 5 — Docs + entry points
Document the format and add the `npm run eval:tier1` shortcut (`tier1-docs-and-cli-shortcut`). Once this lands, every new hook PR should add or update a fixture rather than a hand-rolled `*_test.ts`.

## Tests

- The runner itself is tested via a synthetic adapter that records calls in-memory.
- Snapshot golden files are committed; CI fails on drift.
- Existing hook tests stay until their fixtures are migrated, then are deleted in the same PR.

## Risks and non-goals

- **Not testing real LLM behavior.** Tier 1 cannot tell us whether Composer 2 actually calls `store_structured`. That's Tier 2's job.
- **Not a benchmark.** No timing assertions, no performance regression guards. Latency lives in a separate suite.
- **Snapshot drift.** Cosmetic schema changes (e.g. adding a new auto-derived field) will require a snapshot regen pass; we accept that maintenance cost for the regression coverage.
- **Python ↔ TypeScript adapters add friction.** The runner shells out to Python for two harnesses; on CI we depend on `python3` being available. Documented in the format spec.
- **Out of scope:** any UI / Inspector eval; any cross-process MCP transport eval (covered by separate MCP transport tests).
