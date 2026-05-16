---
title: "Agentic Eval — Tier 1 Fixture Format"
summary: "This document specifies the JSON fixture format consumed by the `tests/helpers/agentic_eval/runner.ts` runner. Each fixture describes a single agentic scenario as a sequence of synthetic hook events plus a set of declarative assertions a..."
---

# Agentic Eval — Tier 1 Fixture Format

This document specifies the JSON fixture format consumed by the
`tests/helpers/agentic_eval/runner.ts` runner. Each fixture describes a
single agentic scenario as a sequence of synthetic hook events plus a
set of declarative assertions about the resulting Neotoma writes. The
runner expands a fixture into a `harness × model` matrix and runs every
cell as one vitest `it()`.

Tier 1 is **LLM-free**. No fixture ever calls a real model; the `model`
field is just a string the harness uses for branching logic (small vs
strong model heuristics).

See [docs/subsystems/agentic_eval.md](../subsystems/agentic_eval.md)
for an overview of the three-tier eval framework.

## File location

`tests/fixtures/agentic_eval/<scenario_id>.json`

The `scenario_id` MUST match the `meta.id` field below and MUST be
lowercase snake_case. The runner discovers fixtures by glob.

## Top-level shape

```jsonc
{
  "meta": {
    "id": "single_turn_with_extracted_entity",
    "description": "User mentions a named contact; harness must store the contact and link it from the user message.",
    "harnesses": ["cursor-hooks", "claude-code-plugin", "codex-hooks", "opencode-plugin", "claude-agent-sdk-adapter"],
    "models": ["composer-2", "claude-sonnet-4"]
  },
  "events": [
    { "hook": "sessionStart",       "payload": { "user_prompt_preview": "Tell me about Sara." } },
    { "hook": "beforeSubmitPrompt", "payload": { "prompt": "Tell me about Sara from Acme." } },
    { "hook": "postToolUse",        "payload": { "tool_name": "store", "tool_input": { "entities": [{ "entity_type": "contact", "name": "Sara" }] } } },
    { "hook": "stop",               "payload": { "text": "Sara works at Acme." } }
  ],
  "assertions": {
    "default": [
      { "type": "request_count", "endpoint": "/store",                  "op": "gte", "value": 2 },
      { "type": "request_count", "endpoint": "/create_relationship",    "op": "gte", "value": 0 },
      { "type": "entity_stored", "entity_type": "conversation_message", "where": { "role": "user" } },
      { "type": "entity_stored", "entity_type": "conversation_message", "where": { "role": "assistant" } }
    ],
    "by_model": {
      "composer-2": [
        { "type": "request_count", "endpoint": "/session/profile", "op": "gte", "value": 1 }
      ]
    },
    "by_harness": {
      "claude-code-plugin": []
    }
  },
  "expected_outputs": {
    "stop": [
      { "field": "followup_message", "presence": "absent" }
    ]
  }
}
```

## Field reference

### `meta`

| field          | type       | required | description                                                                                                                                   |
|----------------|------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `id`           | `string`   | yes      | Lowercase snake_case identifier; must equal the filename without extension.                                                                   |
| `description`  | `string`   | yes      | One-line human-readable description shown in test names.                                                                                       |
| `harnesses`    | `string[]` | yes      | One or more of `cursor-hooks`, `claude-code-plugin`, `codex-hooks`, `opencode-plugin`, `claude-agent-sdk-adapter`. Empty array = run all.       |
| `models`       | `string[]` | yes      | One or more synthetic model strings. Conventionally `composer-2`, `gpt-5.5-fast`, `claude-haiku-4` (small) or `claude-sonnet-4`, `gpt-5.5-medium` (strong). |
| `tags`         | `string[]` | no       | Free-form tags (e.g. `compliance`, `attachment`). Used by `--filter`.                                                                          |

### `events[]`

Each event represents one hook invocation. The runner translates the
canonical event into each harness's specific payload shape via the
per-harness adapter.

| field      | type     | required | description                                                                                                                       |
|------------|----------|----------|-----------------------------------------------------------------------------------------------------------------------------------|
| `hook`     | `string` | yes      | Canonical hook name. One of: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `postToolUseFailure`, `stop`.                     |
| `payload`  | `object` | yes      | Canonical payload (see below). Adapters fill in harness-specific keys (`sessionId` vs `session_id`, etc.) automatically.            |
| `harnesses`| `string[]` | no     | Restrict this event to specific harnesses. Default: all harnesses in `meta.harnesses`. Useful for harness-specific surfaces.        |

Canonical payload keys (adapter-translated to each harness's native shape):

- `prompt` — user prompt text (used by `beforeSubmitPrompt` / equivalent).
- `text` — assistant final reply (used by `stop` / equivalent).
- `tool_name`, `tool_input`, `tool_output` — tool call details (used by `postToolUse`).
- `tool_error` — error message (used by `postToolUseFailure`).
- `attachments[]` — `{ name, mime_type, content_b64 }` for attachment events.
- `loop_count` — Cursor stop hook iteration counter.

The runner injects `sessionId`, `turnId`, and `model` automatically — fixtures should NOT set them.

### `assertions`

The `assertions` object contains three keyed sub-objects: `default[]`,
`by_model{ <model>: [...] }`, and `by_harness{ <harness>: [...] }`.
The runner concatenates all matching predicates for a cell.

Each predicate has a `type` discriminator:

| type                | required fields                                                                            | description                                                                                       |
|---------------------|--------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `request_count`     | `endpoint`, `op` (`eq`\|`gte`\|`lte`), `value`                                             | Asserts the captured request count for that endpoint matches the comparison.                       |
| `entity_stored`     | `entity_type`, optional `where: {field: value}`                                            | Asserts at least one `/store` request created/observed an entity of that type matching `where`.   |
| `relationship_stored` | `relationship_type`, optional `source_entity_type`, optional `target_entity_type`        | Asserts at least one `/create_relationship` matches.                                              |
| `turn_compliance`   | `status` (`backfilled_by_hook`\|`absent`), optional `missed_includes: string[]`            | Asserts the presence/absence of a `turn_compliance` observation.                                  |
| `request_field_eq`  | `endpoint`, `path: string` (dot path), `value`                                             | Inspects the most recent payload to that endpoint and asserts a field matches.                    |
| `no_writes`         | (no extra fields)                                                                          | Asserts the harness made zero `/store` and `/create_relationship` calls. Useful for failure paths.|
| `turn_diagnosis`    | optional `classification`, `confidence`, `local_build`, `reminder_injected`, `recommends_includes` | Asserts the `conversation_turn` entity carries `instruction_diagnostics` fields matching the given values. `recommends_includes` checks that at least one `recommended_repairs` entry contains the substring. |

### `expected_outputs`

Predicates evaluated against each hook's stdout JSON. Currently only
the `stop` hook on `cursor-hooks` returns structured output
(`{ followup_message?: string }`); other harnesses have empty stop output.

Two equivalent shapes are accepted:

**Flat shape** — applies to every cell:

```jsonc
"expected_outputs": {
  "stop": [
    { "field": "followup_message", "presence": "absent" }
  ]
}
```

**Structured shape** — model- or harness-specific overrides; the runner
unions `default` ∪ `by_model[<model>]` ∪ `by_harness[<harness>]` per
cell:

```jsonc
"expected_outputs": {
  "default":   { "stop": [ { "field": "transcript_token_count", "presence": "absent" } ] },
  "by_model": {
    "composer-2":     { "stop": [ { "field": "followup_message", "presence": "present", "matches": "Neotoma compliance pass" } ] },
    "claude-sonnet-4.5": { "stop": [ { "field": "followup_message", "presence": "absent" } ] }
  },
  "by_harness": {
    "claude-code-plugin": { "stop": [ ] }
  }
}
```

| field       | values                                  |
|-------------|-----------------------------------------|
| `field`     | name of a field in the hook's stdout    |
| `presence`  | `present` \| `absent`                   |
| `matches`   | RegExp source string (string match)     |

## Harness-specific notes

### cursor-hooks

- Hook scripts are compiled JavaScript at `packages/cursor-hooks/dist/<name>.js`. The adapter spawns `node <script>` and pipes the canonical event JSON-translated into Cursor's native shape.
- `sessionStart` writes `additional_context` only — no DB write attempts.
- `stop` may return `followup_message`; `expected_outputs.stop` checks it.
- `loop_count > 0` suppresses follow-up; fixtures testing the cap MUST set `loop_count: 1` on the stop event payload.

### claude-code-plugin / codex-hooks (Python)

- Hooks are Python scripts; the adapter spawns `python3 packages/<pkg>/hooks/<name>.py` with a JSON payload on stdin.
- Codex CLI does not support context injection at user-prompt time; `sessionStart`-equivalent events on `codex-hooks` are no-ops by design (the adapter records the skip in the event log).

### opencode-plugin / claude-agent-sdk-adapter (TypeScript modules)

- These harnesses ship as importable modules rather than CLI scripts. The adapter imports the hook factory directly and invokes the relevant handler with a synthetic context object.
- Both adapters are marked `stub` in Phase 1 and may not implement every event type. Unsupported events surface as `it.skip()` cells with a clear reason rather than failing.

## Example: minimal fixture

```json
{
  "meta": {
    "id": "agent_skips_store",
    "description": "Agent finishes a turn without calling MCP store; the stop hook must backfill a turn_compliance observation.",
    "harnesses": ["cursor-hooks"],
    "models": ["composer-2"],
    "tags": ["compliance"]
  },
  "events": [
    { "hook": "beforeSubmitPrompt", "payload": { "prompt": "What time is it?" } },
    { "hook": "stop", "payload": { "text": "I cannot tell you the time." } }
  ],
  "assertions": {
    "default": [
      { "type": "turn_compliance", "status": "backfilled_by_hook", "missed_includes": ["user_phase_store"] }
    ]
  },
  "expected_outputs": {
    "stop": [
      { "field": "followup_message", "presence": "present", "matches": "Neotoma compliance pass" }
    ]
  }
}
```

## Snapshot mode

When the runner is invoked with `UPDATE_AGENTIC_EVAL_SNAPSHOTS=1`, it
writes a sorted, scrubbed JSON serialization of the captured request log
to `tests/__snapshots__/agentic_eval/<scenario>__<harness>__<model>.snap.json`.
Snapshots are committed and reviewed; CI runs in compare mode.

The serializer:

- sorts entities and relationships by `entity_type` + `canonical_name`,
- replaces ids (`entity_id`, `observation_id`) with stable placeholders (`<id:1>`, `<id:2>`),
- replaces timestamps with `<ts>`,
- drops volatile fields (`computed_at`, `last_observation_at`, server-assigned hashes).

## Stability contract

The `meta`, `events`, `assertions`, and `expected_outputs` schemas are
stable. New predicate types may be added; existing predicates will not
have required fields removed. Snapshot serialization format may evolve;
when it does, regenerate all snapshots in one PR and call it out in the
release notes.
