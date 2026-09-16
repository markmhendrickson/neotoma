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

## Skill stage-contract scenarios

Six stub/replay scenarios cover the ateles `build-landing-page` skill stage
contract (neotoma#2418; unblocks ateles#1026 qa). They live **only** in this
package (`eval:scenarios` / `eval_scenarios` CI lane) — do **not** look for
them under `npm run eval:tier1` or `tests/fixtures/agentic_eval/*.json`.
Clone shape from `scenarios/correct_overrides_snapshot.scenario.yaml`. Isolation
uses a RUN token in declared fields (not an undeclared `run_marker`, which
`/store` routes to `raw_fragments` where `where:` can never match).

| `meta.id` | Fail mode caught |
|---|---|
| `build_landing_page_eight_stage_happy_path` | A stage skips its store, writes to an undeclared field, drops a link, or re-derives an upstream artifact instead of consuming it |
| `build_landing_page_upstream_reuse_no_duplicate` | A settled ICP re-derived instead of read — including under a different name |
| `build_landing_page_json_string_decision_register` | JSON-string register read as an object (the false zero) → empty/invented persona |
| `build_landing_page_readback_fail_closed` | Proceeding after an unverified write (empty `rendered_page` = pass) |
| `build_landing_page_stage8_correct_verify` | A rebuild that recreates the page under a new id, or returns success while the body never moves |
| `build_landing_page_missing_context_blocks` | An ICP invented when nothing settled it — including under a different name |

**Scope every count, then add an unscoped one where absence is the claim.** A
`where:` on the RUN token proves the *marked* artifact is right. It cannot fail
on an artifact invented under another name, and an agent that invents an ICP
names it after the product, never after the run token. So the scenarios whose
pass condition is "nothing was invented" or "nothing was duplicated" pair each
marker-scoped count with an unscoped `eq 0` / `eq 1`, plus an
`mcp_tool.invocations` assert on the store payload. Both of those scenarios
passed the renaming mutation before that pairing existed.

**Empty is sometimes the PASS.** In `readback_fail_closed` and
`missing_context_blocks` the absence of a `rendered_page` (and of an invented
`target_persona`) is the asserted success condition. Do not "fix" a failure
there by making the run produce entities.

**The build stage does not assert `publish_rendered_page == 0`.** It once did.
ateles#1026 (head `57494466`) settled that `correct` on `html_body` and
`publish_rendered_page` do different jobs and neither is banned, so the
scenario asserts the *effect* — body updated in place against the seeded id,
one page under the marker, markers moved. The rationale is in the scenario
file; `tests/unit/build_landing_page_scenarios_bind.test.ts` fails if it is
re-added.

```bash
# From packages/eval-harness after npm run build:
node dist/cli.js run --scenario build_landing_page

# From repo root (eval_scenarios lane — not eval:tier1):
npm run eval:scenarios -- --scenario build_landing_page_eight_stage_happy_path
npm run eval:scenarios -- --scenario build_landing_page

# Missing cassette: record once, then commit under cassettes/
node dist/cli.js run --mode record --scenario build_landing_page_eight_stage_happy_path
```

## Adding a scenario

1. Drop a YAML file in `scenarios/<id>.scenario.yaml`.
2. Run `node dist/cli.js run --mode record --scenario <id>` once with
   the relevant API key to capture the cassette.
3. Commit the new cassette under `cassettes/`.
4. Verify replay succeeds: `node dist/cli.js run --scenario <id>`.

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
