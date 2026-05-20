# Neotoma + Cursor (hooks)

## Install

```bash
# From the project where Cursor runs
npm install --save-dev @neotoma/cursor-hooks @neotoma/client
npx @neotoma/cursor-hooks install
```

The installer merges Neotoma entries into `.cursor/hooks.json`, preserving anything already there. Uninstall with `npx @neotoma/cursor-hooks --uninstall`.

## Hooks wired

| Event | Behavior |
| --- | --- |
| `sessionStart` | Initialise per-turn state, inject the compact reminder, and seed recent timeline retrievals. |
| `beforeSubmitPrompt` | User message capture and identifier-retrieval warmup. (Cursor drops `additional_context` from this hook; reminders/hints are surfaced via `sessionStart` and `postToolUse` instead.) |
| `postToolUse` | `tool_invocation` observation, per-turn Neotoma reminder when no store has happened yet, and the failure-hint surfacing path (see [Failure-signal accumulator](#failure-signal-accumulator) below). |
| `postToolUseFailure` | Captures a `tool_invocation_failure` entity for Neotoma-relevant tools and bumps a per-`(tool, error_class)` counter on disk. |
| `stop` | Assistant `conversation_message` safety net, compliance backfill with bounded root-cause classification (`instruction_diagnostics`, `diagnosis_confidence`, `recommended_repairs`), and a classifier-driven `followup_message` for non-compliant turns. See [Diagnosing skipped-store turns](#diagnosing-skipped-store-turns-instruction_diagnostics) below. |

Every hook above also accretes onto a single `conversation_turn` keyed by `(session_id, turn_id)` (idempotency key `conversation-{sessionId}-{turnId}-turn`). The legacy `turn_compliance` entity remains as a registered alias so historical rows continue to surface under `/turns`. See [`docs/subsystems/conversation_turn.md`](../../subsystems/conversation_turn.md).

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug` through `silent`. |
| `NEOTOMA_HOOK_STATE_DIR` | `~/.neotoma/hook-state` | Where the hook layer keeps per-turn / per-session state files (failure counters, turn compliance state, profile markers). |
| `NEOTOMA_HOOK_FEEDBACK_HINT` | `on` | Set to `off` to disable the one-shot failure hint. |
| `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD` | `2` | Number of failures (per tool + error class, per session) before a hint is surfaced. |
| `NEOTOMA_HOOK_COMPLIANCE_PASSES` | (unset) | `off`/`false`/`0` disables hook-driven compliance re-prompts (`followup_message`) regardless of `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP`. Unset or `on`/`true`/`1` uses the follow-up env below. |
| `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP` | `auto` | `auto`/`on` returns `followup_message` on every skipped-store turn when compliance passes are allowed; `off` suppresses. |
| `NEOTOMA_HOOK_SMALL_MODEL_PATTERNS` | (see source) | Comma-separated regex list overriding the built-in small-model detection. |
| `NEOTOMA_HOOK_SMALL_MODEL_DETECTED` | (unset) | Test override forcing small-model behavior on/off. |
| `NEOTOMA_HOOK_DETECTED_MODEL` | (unset) | Override the model id seen by the hook layer. |
| `NEOTOMA_LOCAL_BUILD` | (auto) | `1`/`0` to override the heuristic that decides whether `recommended_repairs` should mention repo-owned remediation paths. |
| `NEOTOMA_HOOK_CONNECTION_ID` | (unset) | Optional MCP connection id forwarded to `setProfile` so the server flips the right session's instruction profile. |

## Failure-signal accumulator

`postToolUseFailure` (and the failure branch of `postToolUse`) classifies the failed call into a coarse `error_class`, scrubs PII out of the message, and persists a `tool_invocation_failure` entity with redacted `error_message_redacted`, `invocation_shape`, and `hit_count_session`. A small JSON file under `NEOTOMA_HOOK_STATE_DIR` (`failures-<session>.json`) holds the per-`(tool, error_class)` counter so the hook can offer a one-shot, prompt-local nudge once the threshold trips: it surfaces a single `Neotoma hook note: …` line via `additional_context` recommending the agent file `submit_issue` if the failure is blocking. The hook NEVER calls `submit_issue` itself — that is the agent's contract. Counters TTL out after 24h.

## Diagnosing skipped-store turns (`instruction_diagnostics`)

When the stop hook detects a skipped store with material content, it runs `diagnoseSkippedStore()` to classify the likely root cause. The classification, confidence, reason, signals, and recommended repairs are persisted on the `conversation_turn` entity via `instruction_diagnostics` and surfaced in the `followup_message` when confidence is high or medium.

| Classification | Typical signal | Suggested fix |
| --- | --- | --- |
| `tooling_unavailable_or_failed` | Transport errors (ECONNREFUSED, fetch_failed) or `neotoma_tool_failures > 0` | Verify Neotoma is running and reachable; tail server logs. |
| `hook_state_incomplete` | No reminders injected, no tools observed | Re-run the hooks installer; verify `.cursor/hooks.json` and `NEOTOMA_HOOK_STATE_DIR`. |
| `instruction_delivery_missing_or_stale` | Tools ran but no compact reminder was injected | Reconnect MCP client; confirm `docs/developer/mcp/instructions.md` is reachable from `src/server.ts`. |
| `agent_ignored_available_instructions` | Reminders injected, tooling reachable, but no MCP **`store`** call | Add/extend Tier 1 fixtures; check the postToolUse reminder gate and compact instructions. |
| `false_positive_or_no_material_content` | Turn ended without assistant text | Usually safe to ignore; backfill still captured the graph. |

For local repo builds (`NEOTOMA_LOCAL_BUILD=1` or auto-detected), `recommended_repairs` references repo-owned paths (install scripts, eval commands, instruction files). For published builds, repairs reference user-facing actions (reconnect MCP, set env vars, file feedback).

## Coexistence with MCP

Cursor's MCP integration still handles structured writes initiated by the agent. Hooks add the passive floor — nothing gets lost if the agent forgets to call a tool.
