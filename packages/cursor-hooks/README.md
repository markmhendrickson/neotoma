# Neotoma for Cursor

Hooks that integrate [Neotoma](https://neotoma.io) into Cursor. Pairs with the Neotoma MCP server for agent-driven structured storage — the hooks are the "reliability floor" (capture, retrieval injection, safety net) and MCP is the "quality ceiling" (agent-driven, schema-typed writes).

## What it does

| Cursor hook | Purpose |
| --- | --- |
| `sessionStart` | Plants a compact "must-do" reminder via `additional_context` (the surface Cursor honors at session boot) and seeds a small recent-timeline retrieval. Also flips the Neotoma server's per-session instruction profile to `compact` for small/fast models. |
| `beforeSubmitPrompt` | Captures the user message as a `conversation_message` and warms up `@identifier` retrievals. (Cursor drops `additional_context` from this hook, so injection moved to `sessionStart` and `postToolUse`.) |
| `postToolUse` | Logs a `tool_invocation` observation for each tool call — passive observability. Also injects per-turn reminders + one-shot failure hints via `additional_context` when no Neotoma store has happened yet. |
| `postToolUseFailure` | When a Neotoma-relevant tool call fails, persists a structured `tool_invocation_failure` entity (with PII-scrubbed `error_message_redacted`) and bumps a session-local failure counter. NEVER calls `submit_issue` directly. |
| `stop` | Persists the assistant's final reply as a safety net, backfills the conversation graph + `conversation_turn` row when the agent skipped the user-phase store, and emits a `followup_message` requesting a single compliance pass (`loop_limit: 1`) unless follow-up is disabled. |

No LLM-based extraction runs in the hook layer — that stays with the agent via MCP. The hooks observe friction (`tool_invocation_failure`) and surface a one-shot hint suggesting the agent consider `submit_issue`, but never call it themselves; PII redaction remains the agent's responsibility per the MCP issue reporting contract.

## Install

```bash
# From the project where you want Cursor to use Neotoma
npm install --save-dev @neotoma/cursor-hooks @neotoma/client
npx @neotoma/cursor-hooks install
```

This writes Neotoma entries into `.cursor/hooks.json` in the current directory, merging with anything already there. To remove:

```bash
npx @neotoma/cursor-hooks --uninstall
```

## Prerequisites

1. A running Neotoma server (default `http://127.0.0.1:3080`). See the main Neotoma install guide.
2. Node 18+.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | Neotoma API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error` \| `silent`. |
| `NEOTOMA_HOOK_FEEDBACK_HINT` | `on` | Set to `off` to disable the one-shot failure hint surfaced by `postToolUse`. |
| `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD` | `2` | Minimum repeated-failure count for `(tool, error_class)` before a hint is surfaced. |
| `NEOTOMA_HOOK_STATE_DIR` | `~/.neotoma/hook-state` | Directory used for per-session failure counters and per-turn compliance state. Override per-test for isolation. |
| `NEOTOMA_HOOK_COMPLIANCE_PASSES` | (unset) | Master switch for hook-driven compliance re-prompts. `off` \| `false` \| `0` disables `stop` → `followup_message` regardless of `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP`. Unset or `on` \| `true` \| `1` defers to `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP`. |
| `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP` | `auto` | `on` \| `off` \| `auto` (default `auto` behaves like `on` for every model). Controls whether `stop` returns `followup_message` when `NEOTOMA_HOOK_COMPLIANCE_PASSES` is not off. |
| `NEOTOMA_HOOK_SMALL_MODEL_PATTERNS` | (built-in list) | Comma-separated regex list overriding the small-model detection patterns (case-insensitive). |
| `NEOTOMA_HOOK_SMALL_MODEL_DETECTED` | (set by `sessionStart`) | Internal hint so downstream hooks avoid re-detecting per call. |
| `NEOTOMA_HOOK_DETECTED_MODEL` | (set by host) | Optional model id forwarded to `postToolUse` when Cursor's payload omits `model`. |
| `NEOTOMA_LOCAL_BUILD` | (auto) | `1`/`true` or `0`/`false` to override the auto-detected "running inside the Neotoma repo checkout" classification used by the stop-hook root-cause classifier. |
| `NEOTOMA_HOOK_CONNECTION_ID` | (unset) | Optional connection id forwarded to `/session/profile` when flipping the per-session instruction profile. |

All hooks are best-effort — any failure is logged to stderr and the agent continues.

### `tool_invocation_failure` entity

When a Neotoma-relevant tool call fails, `postToolUseFailure` persists a `tool_invocation_failure` entity with these fields:

- `tool_name`, `error_class` (e.g. `fetch_failed`, `ECONNREFUSED`, `ERR_*`, `HTTP_4xx`)
- `error_message_redacted` (light PII scrub: emails, tokens, UUIDs, phone numbers, home directory)
- `invocation_shape` (top-level keys of the tool input — never values)
- `turn_key`, `observed_at`, `hit_count_session`

These observations feed the issue reporting system. The agent decides — independently — whether to call `submit_issue`. The hook MUST NOT.

## Build

```bash
npm install
npm run build
```

Emits compiled hooks to `dist/`. The installer points Cursor at those files.

## License

MIT
