---
name: Agentic Eval — Tier 2 — Real-LLM Replay Harness
overview: |
  Build a real-LLM eval harness for Neotoma agentic behaviors. Each
  scenario spins up an isolated in-process Neotoma server backed by a
  tmp SQLite DB, drives a real LLM (Claude via claude-agent-sdk,
  OpenAI via the OpenAI Agents SDK, optionally local OSS models via
  Ollama) through a scripted user prompt + tool whitelist, and after
  the agent finishes asserts on Neotoma DB state — store_structured
  calls, conversation_message rows, PART_OF/REFERS_TO edges,
  turn_compliance observations. Cassette mode replays recorded
  responses to keep CI cheap; live mode drives real APIs for periodic
  regression. The harness is the load-bearing eval for "did the
  layered compliance work actually move the backfill rate on small
  models" before we ship the next compliance change.
todos:
  - id: tier2-package-scaffold
    content: Create `packages/eval-harness/` (TypeScript) with `src/runner.ts` (scenario executor), `src/drivers/` (per-LLM-provider drivers), `src/assertions.ts` (DB-state predicates), `src/cassette.ts` (record/replay), `scenarios/` (YAML scenario files), and a `package.json` with `@neotoma/eval-harness` workspace name. Add `bin/neotoma-eval` for direct CLI invocation.
    status: pending
  - id: tier2-isolated-server-fixture
    content: Implement `startIsolatedNeotomaServer({ port?, dataDir? })` that spins up a clean Neotoma server (in-process via the existing `src/server.ts` factory) on a random port with a fresh SQLite DB and a fresh `NEOTOMA_DATA_DIR`. Returns `{ baseUrl, token, dataDir, instructionProfileCounters, stop() }`. The server must accept hooks-style `clientInfo` so we can drive the small-model code path.
    status: pending
  - id: tier2-claude-agent-sdk-driver
    content: Implement `drivers/claude_agent_sdk.ts` that uses `@anthropic-ai/claude-agent-sdk` (the same lib `packages/claude-agent-sdk-adapter` already wraps) to run a single agent turn. The driver wires the local Neotoma MCP server, registers Read/Write/Grep host tool stubs, supplies the scenario's user prompt, and waits for the assistant's final reply. Returns `{ assistantText, toolCalls[], elapsedMs }`.
    status: pending
  - id: tier2-openai-agents-driver
    content: Implement `drivers/openai_agents.ts` that does the same for OpenAI's Agents SDK / Responses API with MCP support. Goal is one driver per provider so cross-provider matrix runs share scenarios. Drivers MUST conform to a `LLMDriver` interface so adding a third (e.g. local Ollama, Mistral, Gemini) is bounded.
    status: pending
  - id: tier2-scenario-format
    content: "Define the YAML scenario format (`scenarios/*.scenario.yaml`): `id`, `description`, `system_prompt` (optional override), `user_prompt`, `host_tools[]` (Read/Write/Grep stubs with canned responses), `models[]` (which model + provider to run), `instruction_profile` (full|compact|auto), `expected[]` (DB-state assertions: `store_structured.calls >= 1`, `entity.exists(type='contact', name='Sara')`, `relationship.exists(type='REFERS_TO')`, `turn_compliance.backfilled === false`). Document in `docs/subsystems/agentic_eval.md`."
    status: pending
  - id: tier2-host-tool-stubs
    content: Implement deterministic stubs for the Read/Grep/Write host tools the agent can call. Stubs return canned content from the scenario file so the agent observes a stable environment across runs. Stubs also count invocations and surface that count in the post-run report.
    status: pending
  - id: tier2-assertion-engine
    content: Implement `assertions.ts` as small composable predicates that run against the post-turn SQLite DB via the existing `@neotoma/client`. Each predicate returns `{ pass: boolean, expected, actual, message }`. Provide `entity.exists`, `entity.count`, `observation.with_field`, `relationship.exists`, `turn_compliance.backfilled`, `instruction_profile.served` (from `/stats`).
    status: pending
  - id: tier2-cassette-mode
    content: "Implement record/replay (cassette) mode. In `record` mode the driver writes every LLM response (incl. tool-call deltas) to `cassettes/<scenario>__<provider>__<model>.cassette.json`. In `replay` mode the driver returns those responses without hitting the network. CI runs in `replay` (cheap, deterministic); a nightly `npm run eval:tier2 -- --mode=record` updates cassettes against live APIs. Surface a clear warning when an assertion fails in replay mode and the cassette is older than N days."
    status: pending
  - id: tier2-seed-scenarios
    content: "Seed five high-signal scenarios: (a) `simple_user_message_with_extracted_contact` — assert `contact` stored + linked; (b) `multi_tool_research_then_synthesis` — agent reads three files, writes a synthesized note entity; (c) `agent_under_load_skips_store` — minimal user prompt, assert `turn_compliance.backfilled` only when small-model + compliance hooks active; (d) `compliance_followup_loop` — small model that skipped, hooks emit `followup_message`, second pass should succeed; (e) `attachment_extraction` — image attached, agent must store image entity + EMBEDS edge."
    status: pending
  - id: tier2-matrix-axes
    content: "Implement the matrix expansion: `provider × model × instruction_profile × hooks_enabled` per scenario. Default matrix is small (4 cells) but configurable. Output a structured pass/fail report (JSON) with per-cell counts so Tier 3's scorecard can ingest it as historical data, not just live observations."
    status: pending
  - id: tier2-cli-and-output
    content: "Wire `neotoma-eval run [--scenario X] [--provider Y] [--mode record|replay] [--reporter junit|json|tty]`. Default reporter is human-friendly (✓/✗ per cell with the failing assertion message). Add `--reporter junit` for CI surfaces."
    status: pending
  - id: tier2-budget-and-safety-rails
    content: Live-mode runs hit billable APIs. Add a `--max-spend-usd` budget guard (rough estimate from token counts × posted prices) that aborts the run if the matrix exceeds the budget. Default `1.00` for `record` mode, `0` for `replay` (replay must never call the network). Document API key requirements (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) in `.env.example`.
    status: pending
  - id: tier2-ci-wiring
    content: Add a GitHub Actions workflow (`.github/workflows/agentic_eval_tier2.yml`) that runs the harness in `replay` mode on every PR (no API keys needed) and posts the JUnit report. Add a separate scheduled workflow that runs in `record` mode nightly and opens a PR if cassettes drift.
    status: pending
  - id: tier2-docs
    content: "Document the harness in `docs/subsystems/agentic_eval.md`: scenario authoring, when to run live vs replay, cassette refresh, troubleshooting. Add a section to `docs/integrations/hooks/*` linking to Tier-2 scenarios that cover each harness's compliance behavior."
    status: pending
isProject: false
---

## Context

[Tier 1](.cursor/plans/agentic_eval_tier1_hook_fixture_replay_4f1c9a3b.plan.md) tests "given hook events X, Neotoma records Y" — but it never asks the LLM anything. The actual claim of the [weak-model compliance plan](.cursor/plans/weak_model_neotoma_compliance_366fdfaf.plan.md) is **behavioral**: small models on the compact instruction profile + per-turn reminders should backfill less often than small models on full-mode-only. We cannot verify that without driving real LLMs.

Existing assets we can lean on:

- [`packages/claude-agent-sdk-adapter`](packages/claude-agent-sdk-adapter) already wraps `@anthropic-ai/claude-agent-sdk` for hook integration; the same SDK is the natural test driver.
- [`src/server.ts`](src/server.ts) exposes a server factory we already use in tests; spinning up an isolated instance per scenario is cheap.
- The compliance counters (`globalProfileCounters`, `turn_compliance` observations) make grading deterministic — no LLM-as-judge.

## Architecture

```mermaid
flowchart LR
    Scn["scenarios/*.yaml"] --> Run["runner.ts"]
    Run --> Srv["startIsolatedNeotomaServer\n(tmp DB + random port)"]
    Run --> Drv["driver: claude-agent-sdk\n  /  openai-agents\n  / ollama"]
    Drv -->|MCP| Srv
    Drv -->|host tools| Stub["host tool stubs"]
    Drv --> LLM["live API (record)\nor cassette (replay)"]
    Run --> Asn["assertions vs SQLite + /stats"]
    Asn --> Rpt["JUnit / JSON / TTY"]
```

## Confirmed invariants

1. **One Neotoma per scenario.** Tmp DB, tmp port, full teardown after assertions. Never share state across scenarios — assertions must be deterministic.
2. **Drivers are interchangeable.** A `LLMDriver` interface lets new providers slot in without touching scenarios. Provider differences (e.g. tool-call schemas) live entirely in the driver.
3. **Replay is the default in CI.** Live API calls are billable + flaky. CI runs in replay mode against committed cassettes; nightly scheduled jobs refresh cassettes.
4. **Assertions are graph queries, not regex on output.** Use `@neotoma/client` against the tmp DB; never grep stdout.
5. **Budget guard is mandatory in live mode.** A scenario that explodes token usage cannot silently bill us out.
6. **Matrix is opt-in.** Default per-scenario matrix is one cell (whatever the scenario file declares). Operators expand the matrix with `--models claude-opus-4,claude-haiku-4`.
7. **Scenarios are reviewable diffs.** YAML, hand-readable, kept in-tree. Cassettes are in-tree but treated as binary blobs — diffs are summary-only.

## Implementation plan

### Phase 1 — Scaffold + isolated server
Land `packages/eval-harness/` skeleton (`tier2-package-scaffold`) and `startIsolatedNeotomaServer` (`tier2-isolated-server-fixture`). Validate by writing a hello-world scenario that just `await fetch(baseUrl + '/healthcheck')` and asserts the response — no LLM yet.

### Phase 2 — Claude Agent SDK driver + first scenario
Wire the Anthropic driver (`tier2-claude-agent-sdk-driver`) and the scenario YAML format (`tier2-scenario-format`). Ship one end-to-end scenario (`simple_user_message_with_extracted_contact`) running live, recording its first cassette by hand. This proves the round-trip.

### Phase 3 — Assertion engine + host tool stubs
Implement composable assertions (`tier2-assertion-engine`) and host tool stubs (`tier2-host-tool-stubs`). Goal: assertion failures point at the specific predicate that broke, not "scenario failed."

### Phase 4 — Cassette mode + matrix
Add record/replay (`tier2-cassette-mode`) and the matrix axes (`tier2-matrix-axes`). At this point the harness can run any cell offline; nightly live runs refresh cassettes.

### Phase 5 — Drivers, scenarios, CLI
Add the OpenAI Agents driver (`tier2-openai-agents-driver`), seed the remaining four scenarios (`tier2-seed-scenarios`), wire the CLI + reporters (`tier2-cli-and-output`).

### Phase 6 — Safety + CI + docs
Budget guard (`tier2-budget-and-safety-rails`), GitHub Actions wiring (`tier2-ci-wiring`), and docs (`tier2-docs`). After this phase, every weak-model compliance change must include a Tier-2 scenario or expanded matrix.

## Tests

- Unit-test the assertion engine with synthetic SQLite fixtures (no LLM, no server).
- Unit-test the cassette layer: `record` writes the expected JSON; `replay` reproduces tool-call deltas in-order.
- Integration test the full pipeline with the Anthropic driver pinned to replay mode against a committed cassette — guarantees CI never goes live by accident.
- Smoke-test the OpenAI driver under the same replay invariant.

## Risks and non-goals

- **API cost.** Live runs cost money. The budget guard is mandatory; CI must default to replay.
- **Cassette rot.** Provider response shapes evolve; cassettes can drift. The nightly refresh + auto-PR mitigates but does not eliminate maintenance.
- **Determinism.** Even with cassettes, model temperature > 0 produces tool-call ordering variance. Drivers force `temperature: 0` and a fixed seed where supported.
- **Tool stubs ≠ real tools.** The agent's behavior on a fake `Read` may diverge from real disk I/O. Acceptable: the eval is a regression suite, not an end-to-end product test.
- **Out of scope:** load testing, multi-turn long-horizon scenarios (≥ 10 turns), human-in-the-loop scoring. Those go in a separate suite.
- **Not a replacement for Tier 3.** Live production data has variance Tier 2 cannot synthesize. The two are complementary.
