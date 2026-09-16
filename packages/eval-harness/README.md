# @neotoma/eval-harness

Tier 2 real-LLM eval harness for Neotoma agentic behaviors.

For each scenario, the harness:

1. Spins up an **isolated Neotoma server** in a child process (fresh
   SQLite DB, random port, full teardown after assertions).
2. Drives a **real LLM** through one agent turn (Claude via
   `@anthropic-ai/claude-agent-sdk`, OpenAI via `@openai/agents`,
   optionally a stub driver for replay-only cells).
3. Asserts on the post-turn Neotoma graph state — `store_structured`
   call counts, `entity.exists`, `relationship.exists`,
   `turn_compliance.backfilled`, and so on.
4. Records a **cassette** so subsequent CI runs can replay the same
   tool-call sequence offline (no API spend, no flake).

See [`docs/subsystems/agentic_eval.md`](../../docs/subsystems/agentic_eval.md)
for the full scenario format, predicate reference, and CI wiring.

## Quick start

```bash
cd packages/eval-harness
npm install
npm run build

# Replay-mode (default; no API key required, no network).
node dist/cli.js run

# Filter / focus.
node dist/cli.js run --scenario simple_user_message --provider claude

# Re-record cassettes against live APIs (gated by --max-spend-usd).
ANTHROPIC_API_KEY=... node dist/cli.js run --mode record --max-spend-usd 1.00

# CI-friendly output.
node dist/cli.js run --reporter junit --output tmp/junit.xml
node dist/cli.js run --reporter json  --output tmp/report.json
```

## Layout

```
src/
  types.ts             # LLMDriver interface + scenario / cell types
  scenario.ts          # YAML scenario loader
  host_tools.ts        # Deterministic Read/Grep/Write stubs
  cassette.ts          # Record/replay format + staleness check
  isolated_server.ts   # startIsolatedNeotomaServer (child process)
  assertions.ts        # Composable predicates against post-turn DB
  drivers/
    base.ts            # Shared replay engine (re-applies tool calls)
    claude_agent_sdk.ts
    openai_agents.ts
    stub.ts            # Replay-only driver for local development
    index.ts           # Driver registry
  runner.ts            # Matrix expansion + cell orchestration
  reporters.ts         # tty | json | junit
  cli.ts               # `neotoma-eval run` entry point

scenarios/             # One `*.scenario.yaml` per behavior
cassettes/             # Committed JSON cassettes (regenerated nightly)
```

## Adding a scenario

1. Drop a YAML file in `scenarios/<id>.scenario.yaml`.
2. Run `node dist/cli.js run --mode record --scenario <id>` once with
   the relevant API key to capture the cassette.
3. Commit the new cassette under `cassettes/`.
4. Verify replay succeeds: `node dist/cli.js run --scenario <id>`.

## Skill stage-contract scenarios

`build_landing_page_*` covers the ateles `build-landing-page` skill's stage
contract — every stage stores ONE entity in a DECLARED field, reads the write
back, and links it. Six ids, all in the `eval_scenarios` lane:

| `meta.id` | Fail mode it catches |
|---|---|
| `build_landing_page_eight_stage_happy_path` | A stage skips its store, writes to an undeclared field (raw_fragments), or drops a stage link |
| `build_landing_page_upstream_reuse_no_duplicate` | A stage re-derives a settled ICP instead of reading it, storing a second persona |
| `build_landing_page_json_string_decision_register` | A JSON-string decision register read as an object — the false zero — so the ICP is derived, not parsed |
| `build_landing_page_readback_fail_closed` | A 2xx treated as evidence; the run builds a page on a stage whose value never reached the snapshot |
| `build_landing_page_stage8_correct_verify` | A rebuild that recreates the page under a new id, or returns success while the body never moves |
| `build_landing_page_missing_context_blocks` | An ICP invented when nothing settled it, and a page built on it |

Run them:

```bash
npm run eval:scenarios -- --scenario build_landing_page
npm run eval:scenarios -- --scenario build_landing_page_eight_stage_happy_path
```

**These ids live in `eval:scenarios`, NOT `eval:tier1`.** `eval:tier1` runs the
Tier-1 hook-lifecycle fixtures under `tests/fixtures/agentic_eval/*.json` and
matches none of these ids — looking for them there returns zero hits and a
"green" run that covers nothing. Do not add Tier-1 JSON fixtures as a
substitute.

Two conventions these scenarios follow, and a new one should too:

- **Isolation by DECLARED field.** Each scenario stamps one opaque RUN token
  into a declared field per entity type (`target_persona.name`, `cta.name`,
  `analysis.title`, `design_system.design_system_name`, `rendered_page.title`),
  and every `entity.count` and negative-existence assertion carries a matching
  `where:`. An undeclared marker field would be routed to `raw_fragments` and
  never reach the snapshot, so `where:` would match nothing; an unscoped count
  is a silent wrong green.
- **Empty is sometimes the PASS.** In `readback_fail_closed` and
  `missing_context_blocks`, the absence of a `rendered_page` (and of an
  invented `target_persona`) is the asserted success condition. Do not "fix" a
  failure there by making the run produce entities.

Missing a cassette? Replay skips the cell rather than failing it, so record
one and commit it:

```bash
node dist/cli.js run --mode record --scenario <id>
```

## Adding a driver

Implement the `LLMDriver` interface from `src/types.ts`:

```ts
export interface LLMDriver {
  readonly id: ProviderId;
  readonly capabilities: { live: boolean; replay: boolean };
  preflight(mode: RunMode): { ok: boolean; reason?: string };
  runOnce(invocation: DriverInvocation): Promise<DriverResult>;
}
```

Register it via `registerDriver(driver)` from `src/drivers/index.ts`.
The shared `replayCassetteAgainstServer` helper handles replay mode for
free; you only need to wire the live SDK call for record mode.
