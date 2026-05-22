# Agentic Eval — Three-Tier Framework

Neotoma's agentic test framework verifies that agents (and the harness
hooks that surround them) actually obey the Neotoma turn lifecycle
contract: bounded retrieval → user-phase store → tool work → closing
assistant store. The framework is split into three tiers, each with its
own cost / fidelity trade-off.

| Tier | Purpose | LLM cost | Source of truth | When it runs |
|------|---------|----------|-----------------|--------------|
| 1    | Hook-level fixture replay (THIS doc). LLM-free regression suite. Asserts "given hook events X, harness records DB state Y." | $0 | Synthetic hook payloads + captured `/store` traffic | Every PR via `npm test` |
| 2    | Real-LLM replay. Drives an actual LLM through scripted scenarios against an isolated Neotoma. Validates that the *agent* behaves correctly given real model nondeterminism. | per-call | Real LLM transcript + Neotoma DB | Nightly + on demand |
| 3    | Production-as-eval scorecard. Aggregates `turn_compliance` observations from live deployments into a daily compliance dashboard. | $0 | Production Neotoma | Continuous |

This document covers Tier 1 only. Tier 2 and Tier 3 each have their own
plan and document.

## Tier 1 — Hook fixture replay matrix

### Architecture

```
tests/fixtures/agentic_eval/<scenario>.json
            │
            ▼
tests/helpers/agentic_eval/runner.ts            ← discovers fixtures, expands harness × model
            │
            ├── adapters/cursor_hooks.ts        ← spawn node packages/cursor-hooks/dist/<hook>.js
            ├── adapters/python_hooks.ts        ← spawn python3 packages/<pkg>/hooks/<hook>.py
            ├── adapters/typescript_module_stubs.ts  ← stub for opencode-plugin / claude-agent-sdk
            │
            ▼
tests/helpers/agentic_eval/mock_neotoma_server.ts  ← in-process HTTP server, per-cell namespacing
            │
            ▼
assertions.ts + snapshot.ts + failure_report.ts
            │
            ▼
tests/integration/agentic_eval_matrix.test.ts   ← one vitest it() per cell
```

Per-cell isolation is achieved by mounting the full Neotoma API under
`/cell/<cellId>/` so a single shared mock server can serve many
concurrent cells without state collisions.

### Why a mock server, not the real Neotoma server

Tier 1 runs hundreds of cells per CI run; spinning up a real Neotoma
SQLite-backed server per cell would dominate test time. The mock server
is a thin HTTP fake that records every request and returns deterministic
responses so the hook's post-store logic (id pickling, PART_OF link
creation, follow-up generation) executes naturally.

### IMPORTANT: async spawn (not `spawnSync`)

The mock server runs in the same Node process as the test runner. If the
adapter used `spawnSync`, it would block the event loop and the mock
server could not accept the hook's HTTP requests, leading to a deadlock.
All adapters MUST use the async `runChildProcess` helper in
[`tests/helpers/agentic_eval/adapters/run_child.ts`](../../tests/helpers/agentic_eval/adapters/run_child.ts).

### Running

```bash
# Run the full matrix
npm run eval:tier1

# Run a single fixture (substring match against meta.id)
NEOTOMA_AGENTIC_EVAL_FILTER=agent_skips_store npm run eval:tier1

# Regenerate snapshots after intentional behavior changes
UPDATE_AGENTIC_EVAL_SNAPSHOTS=1 npm run eval:tier1

# Tier 1 also runs as part of the standard test suite
npm test -- tests/integration/agentic_eval_matrix.test.ts
```

### Authoring a new fixture

1. Add `tests/fixtures/agentic_eval/<scenario>.json` following the
   schema in [agentic_eval_fixture_format.md](../developer/agentic_eval_fixture_format.md).
2. Run `UPDATE_AGENTIC_EVAL_SNAPSHOTS=1 npm run eval:tier1` to capture
   the snapshot.
3. Inspect the new files under
   `tests/__snapshots__/agentic_eval/<scenario>__<harness>__<model>.snap.json`
   and confirm the captured request log is what the hook *should* be
   emitting.
4. Commit the fixture and snapshots in the same PR.

### Failure debugging

The runner emits a focused failure message per cell:

```
[agentic-eval] FAIL agent_skips_store × cursor-hooks × composer-2

  [turn_compliance] Expected a turn_compliance observation with status="backfilled_by_hook", got none.
  [request_count]   Expected /store request count >= 4, got 2.

Captured requests:
  /store: 2

Snapshot diff (tests/__snapshots__/agentic_eval/agent_skips_store__cursor-hooks__composer-2.snap.json):
  - "missed_steps": [
  -   "user_phase_store"
  - ]
  + (missing)
```

Each failure block names the predicate that failed, the expected vs
actual values, and (if snapshot mode triggered the failure) a localized
diff. The full request log is intentionally NOT dumped — drill into the
snapshot file directly when you need it.

### Coverage today (Phase 1)

- **Implemented adapters**: `cursor-hooks`, `claude-code-plugin`, `codex-hooks`.
- **Stub adapters**: `opencode-plugin`, `claude-agent-sdk-adapter`.
  Cells for these harnesses currently `it.skip()` with a clear reason.
- **Seeded scenarios**: `agent_skips_store`, `single_turn_with_extracted_entity`,
  `multi_tool_then_reply`, `tool_failure_recovery`,
  `attachment_with_extracted_entities`.
- **Model matrix**: `composer-2`, `gpt-5.5-fast`, `claude-haiku-4` (small);
  `claude-sonnet-4.5`, `gpt-5.5-medium` (strong).

### Out of scope

- Real LLM behavior — that's Tier 2.
- Latency / performance regressions — separate suite.
- Cross-process MCP transport eval — covered by `tests/integration/mcp_*.test.ts`.
- UI / Inspector eval — separate `inspector/src/**/*.test.ts` suite.

## Tier 2 — Real-LLM replay harness

Tier 2 lives in [`packages/eval-harness/`](../../packages/eval-harness/) and
drives **real LLMs** (Claude via `@anthropic-ai/claude-agent-sdk`, OpenAI via
`@openai/agents`, optionally local OSS models via Ollama) against an
**isolated Neotoma server** (fresh SQLite DB, random port, full teardown
after assertions). Every run produces a structured pass/fail report keyed
on `provider × model × instruction_profile × hooks_enabled` cells so
Tier 3's scorecard can ingest historical eval data.

### Running locally

```bash
cd packages/eval-harness
npm install
npm run build

# Replay-mode is the default — no API key required, no network.
node dist/cli.js run

# Filter scenarios / providers.
node dist/cli.js run --scenario simple_user_message --provider claude

# Capture / refresh cassettes against live APIs (requires keys, $1.00 cap).
ANTHROPIC_API_KEY=... node dist/cli.js run --mode record --max-spend-usd 1.0

# CI surfaces.
node dist/cli.js run --reporter junit --output tmp/eval-tier2/junit.xml
node dist/cli.js run --reporter json --output tmp/eval-tier2/report.json
```

### Architecture

```
scenarios/*.scenario.yaml
        │
        ▼
runner ─► startIsolatedNeotomaServer ─► child neotoma server
        ─► driver (claude | openai | stub)
                  ├── replay mode: walk cassette; re-apply MCP/host tool calls
                  └── record mode: live SDK call; persist cassette
        ─► assertions (HTTP queries against the post-turn DB)
        ─► reporters (tty | json | junit)
```

### Scenario YAML format

A scenario is a single YAML file at
`packages/eval-harness/scenarios/<id>.scenario.yaml`:

```yaml
meta:
  id: simple_user_message_with_extracted_contact
  description: ...
system_prompt: ...optional...
user_prompt: |
  Quick note: I just had coffee with Sara Lin from Acme Corp ...
host_tools:
  - name: Read
    responses:
      '{"path":"docs/specs/A.md"}':
        output: "# Plan A\n..."
    default:
      error: "Read stub: no canned response for that path"
models:
  - provider: stub      # replay-only, never goes live
    model: replay-only
  - provider: claude
    model: claude-haiku-4-20250929
instruction_profile: auto    # full | compact | auto
hooks_enabled: true
driver_options:
  temperature: 0
  max_tokens: 2048
expected:
  - type: store_structured.calls
    op: gte
    value: 1
  - type: entity.exists
    entity_type: contact
    where:
      canonical_name: "Sara Lin"
  - type: relationship.exists
    relationship_type: PART_OF
  - type: turn_compliance.backfilled
    value: false
```

Supported predicates (see `packages/eval-harness/src/assertions.ts`):
`store_structured.calls`, `entity.exists`, `entity.count`,
`observation.with_field`, `relationship.exists`, `relationship.count`,
`reply_text.contains`, `turn_compliance.backfilled`,
`instruction_profile.served`, `host_tool.invocations`. Each predicate
returns a structured `{ pass, expected, actual, message }` and the
failure message is what the TTY/JUnit reporter surfaces.

### Cassettes

Each `(scenario, provider, model)` triple has one cassette under
`packages/eval-harness/cassettes/`:

```
<scenario>__<provider>__<model>.cassette.json
```

In replay mode the driver walks the cassette's `tool_calls[]` and
re-applies each call — Neotoma MCP tools (**`store`**,
`create_relationship`, etc.) hit the isolated server live so post-turn
graph state is reproduced exactly; host-tool calls (Read/Grep/Write) go
through the registry of canned stubs declared in the scenario.

Replay mode is **byte-identical across runs** because the driver never
touches the network. Record mode overwrites the cassette and stamps
`meta.recorded_at` so we can warn when a cassette is older than 30 days
(the runner emits a warning to stderr when it detects staleness).

### Live mode safety rails

- `--max-spend-usd` defaults to `$1.00` for `record` mode and to `$0` for
  `replay`. The runner aborts the matrix if the running estimate
  (from posted prices × token usage) crosses the cap.
- `replay` mode rejects any `--max-spend-usd > 0` (the network must
  never be touched in replay).
- Drivers refuse to run live without the relevant API key
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

### WRIT benchmark alignment

The [`writ/`](../../writ/) submodule (77 scenarios, 16 categories) tests
**state-layer** integrity — whether stored data survives updates,
preserves history, and maintains provenance across multi-session
timelines. Tier 2 tests **agent-layer** compliance — whether the agent
follows the turn lifecycle contract on each individual turn. New Tier 2
scenarios carry `writ:<category>` tags in `meta.tags[]` so the
integrated runner (`packages/eval-combined/`) can cross-reference scores.

### Hybrid scenario seeding

Scenarios carry optional metadata describing how they were derived:

| Field | Purpose |
|-------|---------|
| `seed_strategy` | `generated`, `real_derived`, or `hybrid_amplified` |
| `source_transcript_ref` | Neotoma entity ID of the source transcript |
| `source_pattern` | Human-readable description of the failure pattern |
| `privacy_transform` | How PII was transformed for the committed scenario |
| `seed_entities[]` | Entities pre-seeded into the isolated DB before the driver runs |

Scenarios that need pre-existing DB state (retrieval, dedup) use
`seed_entities[]` — the runner POSTs these to the isolated server's
`/store` endpoint before running the driver.

### Seeded scenarios

| Scenario id | Focus | WRIT category |
| --- | --- | --- |
| `simple_user_message_with_extracted_contact` | Baseline: contact extraction + PART_OF / REFERS_TO edges | — |
| `multi_tool_research_then_synthesis` | Multi-tool: 3× Read → 1× synthesized `research` entity | — |
| `agent_under_load_skips_store` | Compliance: small model skips, stop-hook backfill | — |
| `compliance_followup_loop` | Compliance: re-stores after hook-emitted follow-up reminder | — |
| `attachment_extraction` | Attachment: `file_asset` + extracted `receipt` + `EMBEDS` | — |
| `closing_assistant_store` | Turn lifecycle: closing store not skipped for factual answers | `extraction_drift` |
| `greeting_must_still_store` | Turn lifecycle: store-first even for greetings | — |
| `tool_use_after_store_ordering` | Turn lifecycle: store before host tools | — |
| `multiple_entity_extraction` | Extract-all: multiple people + event from one message | `entity`, `extraction_drift` |
| `task_extraction_with_deadline` | Tasks: create task with due_date + linked contact | `constraint`, `work_state` |
| `user_identity_extraction` | User identity: store as contact/person | `entity` |
| `outreach_commitment_creates_task` | Tasks: outreach commitment → follow-up task | `constraint`, `work_state` |
| `scheduling_cue_creates_task` | Tasks: scheduling cue → task | `constraint`, `work_state` |
| `file_source_provenance` | Provenance: file-derived entities carry `source_file` | `provenance` |
| `external_tool_provenance` | Provenance: API-sourced entities carry `data_source` | `provenance`, `trust_hierarchy` |
| `schema_agnostic_novel_entity` | Schema: novel entity type stored without pre-lookup | `entity` |
| `compact_profile_still_stores` | Profile: compact profile still obeys store-first | — |
| `display_rule_neotoma_section` | Display: reply renders Neotoma section | `extraction_drift` |
| `relationship_graph_completeness` | Relationships: every entity has REFERS_TO edge | `entity`, `provenance` |
| `bounded_retrieval_for_known_entity` | Retrieval: reuse existing entity, no duplicate | `abstention`, `entity` |
| `retrieval_grounds_answer_no_hallucination` | Retrieval: ground answer in stored facts | `abstention` |
| `entity_type_reuse_no_duplicate_type` | Schema: use established type, no proliferation | `entity` |
| `store_failure_retry` | Errors: retry once on store failure | `failure_injection` |
| `store_failure_surfaces_error` | Errors: surface error to user, do not silently skip | `failure_injection` |

### Assertion types

Supported predicates in `packages/eval-harness/src/assertions.ts`:

| Predicate | Purpose |
|-----------|---------|
| `store_structured.calls` | Count of unified **`store`** invocations (from `/stats`; predicate name retained) |
| `entity.exists` | At least one entity of given type exists |
| `entity.count` | Entity count matches op/value |
| `observation.with_field` | At least one observation carries the named field |
| `relationship.exists` | At least one relationship of given type exists |
| `relationship.count` | Relationship count matches op/value |
| `reply_text.contains` | Assistant reply contains substring or matches regex |
| `turn_compliance.backfilled` | Whether the stop hook backfilled compliance |
| `instruction_profile.served` | Whether the requested profile was served |
| `host_tool.invocations` | Host tool invocation count |

### Combined runner (WRIT + Tier 2)

`packages/eval-combined/` provides a single CLI that runs both WRIT and
Tier 2 against a shared isolated Neotoma instance, then produces a
**layered coverage matrix** showing per-category scores at both layers.

```bash
npx tsx packages/eval-combined/src/cli.ts run --output tty
npx tsx packages/eval-combined/src/cli.ts run --output md > coverage.md
npx tsx packages/eval-combined/src/cli.ts run --output json > coverage.json
npx tsx packages/eval-combined/src/cli.ts run --tier2-only
npx tsx packages/eval-combined/src/cli.ts run --writ-only --categories provenance,entity
```

The layered matrix surfaces diagnostics like: "For provenance, agents
write the fields correctly (100% Tier 2) but the state layer loses some
chains over time (80% WRIT)" — telling you exactly where to invest.

### CI

- [`.github/workflows/agentic_eval_tier2.yml`](../../.github/workflows/agentic_eval_tier2.yml)
  runs the harness in **replay mode** on every PR that touches the
  harness, the server factory, or the instruction-profile services. No
  API keys are needed; the report is uploaded as a JUnit artifact.
- [`.github/workflows/agentic_eval_tier2_nightly_record.yml`](../../.github/workflows/agentic_eval_tier2_nightly_record.yml)
  runs in **record mode** nightly (06:30 UTC), refreshes any drifted
  cassettes against live APIs, and opens an automated PR if anything
  changed. Reviewer skims the JSON diff for unexpected reasoning shifts.

### Troubleshooting

- *Replay cell fails with "no cassette" — record one*: run
  `node dist/cli.js run --mode record --scenario <id>` once with
  `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) set, then commit the
  resulting `.cassette.json` file.
- *Server doesn't come up*: increase log level with
  `NEOTOMA_LOG_LEVEL=debug NEOTOMA_EVAL_VERBOSE=1` and check the
  isolated server's stderr tail in the runner output.
- *Assertion fails on `store_structured.calls` (unified store counter)*: the runner reads from
  `/stats`. If the counter is missing the runner reports the predicate
  as inconclusive — verify
  [`docs/subsystems/instruction_profile.md`](./instruction_profile.md)
  is current.
- *Cassette stale warning*: `meta.recorded_at` is older than 30 days.
  Re-record after auditing the model + hook behavior on which the
  cassette was last captured.

### Out of scope (Tier 2)

- Multi-turn (≥ 10 turn) long-horizon dialogue evaluation.
- Human-in-the-loop scoring.
- Load testing / latency budgets.
- Cross-process IDE harness behavior — already covered by Tier 1.

## Tier 3 — Production-as-eval compliance scorecard

Tier 3 turns every production turn into an eval datapoint. The harness
hooks already emit a `turn_compliance` observation per turn whenever
they had to backfill a missed Neotoma write; Tier 3 aggregates those
observations into a per-(model × harness × profile) backfill rate and
surfaces the result through a CLI, an admin HTTP endpoint, an Inspector
dashboard, an optional Prometheus exporter, and an `issue`
alerting layer. There is **no LLM cost** — Tier 3 reads what the fleet
already wrote.

### Architecture

```
                                                          ┌─────────────────────┐
                                                          │ neotoma compliance  │
                                                          │ scorecard | export  │
                                                          │ backfill | alert-… │
                                                          └─────────────────────┘
                                                                    │
turn_compliance entities (written by stop hooks)                    │
            │                                                       │
            ▼                                                       │
┌────────────────────────────┐    ┌──────────────────────────┐     │
│ services/compliance/       │◀──▶│ services/compliance/     │◀────┘
│ scorecard.ts               │    │ renderer.ts              │
│ (single source of truth)   │    │ table | json | csv | md  │
└────────────────────────────┘    └──────────────────────────┘
            │
            ├──▶ services/compliance/routes.ts        → GET /admin/compliance/scorecard
            │                                         → GET /admin/compliance/metrics (Prometheus)
            ├──▶ services/compliance/alerting.ts      → issue{labels:["compliance_drift"]}
            ├──▶ services/compliance/historical_backfill.ts (estimates from old conversation_message data)
            └──▶ inspector/src/pages/compliance.tsx   → /inspector/compliance dashboard
```

### Headline metric

`backfill_rate = backfilled_turns / total_turns` per cell. Lower is
better. A cell is `model × harness × profile` by default; the CLI lets
operators override via `--group-by`.

### CLI

```bash
# 7-day scorecard, default model+harness grouping, table output
neotoma compliance scorecard --since 7d --min-turns 50

# 24-hour drift, JSON for piping into a dashboard
neotoma compliance scorecard --since 24h --format json

# Markdown for a PR comment / digest email
neotoma compliance scorecard --since 7d --format markdown --output report.md

# Bulk dump for a warehouse import
neotoma compliance export --since 30d --format jsonl --output compliance_30d.jsonl

# Re-derive estimates for old turns (run once after hook install)
neotoma compliance backfill --since 90d --dry-run
neotoma compliance backfill --since 90d

# Evaluate alert thresholds without emitting issues
neotoma compliance alert-check --threshold 0.30 --window 24h --min-turns 100 --dry-run
```

### HTTP admin surface

- `GET /admin/compliance/scorecard?since=7d&group_by=model+harness` —
  JSON identical to `neotoma compliance scorecard --format json`.
- `GET /admin/compliance/metrics` — Prometheus text format, opt-in
  via `NEOTOMA_COMPLIANCE_METRICS_ENABLED=1`. Sample metric:
  `neotoma_compliance_backfill_rate{model="composer-2",harness="cursor-hooks"} 0.42`.

Both endpoints are gated by AAuth `software` or `hardware` tier so
anonymous requests cannot scrape per-model performance data.

### Inspector dashboard

`/inspector/compliance` consumes the same JSON, renders a per-cell
backfill rate table with a sparkline-style daily heatmap, and shows the
top missed steps for the window. Filtering by `--since` and
`--group-by` is exposed via the toolbar.

### Alerting

When any (model × harness) cell with `≥ NEOTOMA_COMPLIANCE_BACKFILL_ALERT_MIN_TURNS`
turns has a backfill rate above `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_THRESHOLD`
sustained over `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_WINDOW`, the
`runComplianceAlertCheck()` function emits an `issue` entity (or equivalent operator-chosen type) for triage:

```json
{
  "entity_type": "issue",
  "title": "Compliance drift: composer-2 × cursor-hooks",
  "body": "Backfill rate exceeded threshold; see metadata.",
  "labels": ["compliance_drift", "neotoma-issue"],
  "metadata": {
    "model": "composer-2",
    "harness": "cursor-hooks",
    "rate": 0.42,
    "threshold": 0.30,
    "window": "24h",
    "cell_total_turns": 3142,
    "top_missed_steps": [{ "step": "user_phase_store", "count": 891 }]
  }
}
```

The idempotency key is `compliance-drift-<model>-<harness>-<YYYY-MM-DD>`,
so re-running on the same day amends the existing entity rather than
spawning duplicates. Pipe `runComplianceAlertCheck` from a cron job
(or a CI workflow) to feed alarms into the existing agent feedback
triage queue.

### Tuning the threshold

| Tier of model      | Recommended threshold | Reason                                                 |
|--------------------|-----------------------|--------------------------------------------------------|
| Top-tier (Sonnet 4, Opus, GPT-5.5) | `0.05` | These models should not need hook backfill.            |
| Mid-tier (Haiku, Composer fast)    | `0.20` | Some skipped turns are normal under load.              |
| Small / cheap (Composer-2 small)   | `0.40` | Compliance is statistically lower; only alert on regressions. |

Set `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_THRESHOLD` per fleet. Operators
running multiple harnesses can use the per-cell scorecard data to set
harness-specific thresholds via custom monitoring on
`/admin/compliance/metrics`.

### Triage flowchart — interpreting a high backfill rate

```
high backfill rate?
    │
    ├── Has the rate been high since hook install?
    │       └── Yes → small model under-complies. Use a stronger
    │                  model OR make the compact instruction set
    │                  more permissive (see weak-model plan).
    │
    ├── Did the rate spike recently?
    │       ├── Was a new harness/model deployed → revert or roll
    │       │   forward; correlate with `instruction_profile` counters
    │       │   to confirm the right profile was served.
    │       └── No deployment? Inspect `top_missed_steps`:
    │             • `user_phase_store` / missing **`store`** → agent is skipping memory entirely.
    │             • `agent_message_part_of` → assistant message stored but
    │                                          not linked. Likely a Tier 2
    │                                          regression or missing
    │                                          relationship batching.
    │             • `assistant_reply_in_turn` → hook is firing late.
    │
    └── Cell volume too small for confidence?
            └── Raise `--min-turns` and check the parent cell first.
```

When reviewing backfill-heavy cells, group the scorecard by `instruction_diagnostics.classification` (persisted on each `conversation_turn` entity by the stop hook). This tells you whether the root cause is tooling failures, missing instruction delivery, agent non-compliance, or incomplete hook wiring — each of which has a different remediation path. See `docs/integrations/hooks/cursor.md` for the full classification table.

### Privacy

Per-cell aggregations (model, harness, profile, missed_steps) are safe.
Raw per-turn dumps (entity ids, conversation ids) are intentionally
excluded from `compliance scorecard` and `compliance export`. Operators
who need that level of detail must use the lower-level entity tooling
(`neotoma entities list`) with a written audit log, not the scorecard.

### Survivorship bias

Only deployments with hooks installed report `turn_compliance`
observations. Users without hooks invisibly fail and do not appear in
the scorecard. The scorecard is therefore a **lower bound** on real
non-compliance; the real fleet is at least this bad.

### Environment variables

| Var                                                | Default | Purpose                                                           |
|----------------------------------------------------|---------|-------------------------------------------------------------------|
| `NEOTOMA_COMPLIANCE_METRICS_ENABLED`               | `0`     | When `1`, exposes the Prometheus endpoint.                        |
| `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_THRESHOLD`      | `0.30`  | Backfill rate above which an alert fires (0..1).                  |
| `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_WINDOW`         | `24h`   | Window applied to the scorecard for alert evaluation.             |
| `NEOTOMA_COMPLIANCE_BACKFILL_ALERT_MIN_TURNS`      | `100`   | Minimum turns per cell before the cell is alert-eligible.         |

### Out of scope (Tier 3)

- Automated remediation (e.g. forcing the compact profile when a cell
  crosses a threshold). The scorecard *surfaces*; operators decide.
- Replacing Tier 1 / Tier 2 — production data has too much variance to
  attribute drift to a specific commit.
- Per-user scorecards in single-tenant view. Scoping is by `user_id` at
  the storage layer; the rendered cards always aggregate.

## Cross-references

- Plan: [`.cursor/plans/agentic_eval_tier1_hook_fixture_replay_4f1c9a3b.plan.md`](../../.cursor/plans/agentic_eval_tier1_hook_fixture_replay_4f1c9a3b.plan.md)
- Fixture format: [`docs/developer/agentic_eval_fixture_format.md`](../developer/agentic_eval_fixture_format.md)
- Tier 2 plan: [`.cursor/plans/agentic_eval_tier2_real_llm_replay_8d2e7f15.plan.md`](../../.cursor/plans/agentic_eval_tier2_real_llm_replay_8d2e7f15.plan.md)
- Tier 2 package: [`packages/eval-harness/`](../../packages/eval-harness/)
- Tier 3 plan: [`.cursor/plans/agentic_eval_tier3_compliance_scorecard_2a6b4c0e.plan.md`](../../.cursor/plans/agentic_eval_tier3_compliance_scorecard_2a6b4c0e.plan.md)
- Scenario expansion plan: [`.cursor/plans/eval_scenario_expansion_69e53394.plan.md`](../../.cursor/plans/eval_scenario_expansion_69e53394.plan.md)
- Combined runner (WRIT + Tier 2): [`packages/eval-combined/`](../../packages/eval-combined/)
- WRIT benchmark submodule: [`writ/`](../../writ/)
