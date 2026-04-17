# Neotoma hook integrations

This directory documents how Neotoma plugs into AI agent harnesses as a set of **lifecycle hooks**, in addition to the existing MCP integration. Hooks are the reliability floor for capture, retrieval injection, compaction awareness, and persistence safety; MCP remains the quality ceiling for agent-driven, schema-typed writes.

Read [`../../reference/architecture/option_c_hooks_architecture.md`](../../reference/architecture/option_c_hooks_architecture.md) (or the plan at `docs/proposals/revised_neotoma_hooks_plan.md`) first if you want the full rationale.

## When hooks are offered

Hooks are not installed as part of `neotoma setup`. They are proposed after the first successful timeline reconstruction during activation -- see [**Activation step 6.5: Offer lifecycle hooks**](../../../install.md#activation-step-65-offer-lifecycle-hooks-opt-in) in the install guide. The activation agent reads `doctor.hooks` (from `neotoma doctor --json`), offers install only when `eligible_for_offer === true`, and never proceeds without an explicit "yes". This page is the reference for per-harness behavior; the install guide is the workflow.

The CLI entry point is `neotoma hooks install --tool <cursor|claude-code|codex|opencode|claude-agent-sdk>`. Run `neotoma hooks status --json` to see the same block the activation agent consults.

## Packages

| Harness | Package | Description |
| --- | --- | --- |
| Claude Code | `packages/claude-code-plugin` | Claude Code plugin (marketplace-distributable) with SessionStart, UserPromptSubmit, PostToolUse, PreCompact, Stop hooks. |
| Cursor | `packages/cursor-hooks` | `hooks.json` entries + installer for Cursor. |
| OpenCode | `packages/opencode-plugin` | TypeScript plugin using OpenCode's plugin API (session, message, tool, compaction events). |
| Codex CLI | `packages/codex-hooks` | `~/.codex/config.toml` snippet + hook scripts for session start, notify, session end. |
| Claude Agent SDK | `packages/claude-agent-sdk-adapter` | Reference adapter returning hook callbacks you mount via `options.hooks`. |
| TypeScript client | `packages/client` | Shared `@neotoma/client` used by all TS hooks. |
| Python client | `packages/client-python` | Shared `neotoma-client` used by Python hooks. |

## What every hook does

Each integration implements the same five capabilities, adjusted for what its harness exposes:

1. **Session anchor** — create/update a `conversation` entity at session start.
2. **User prompt capture** — record every user message as `agent_message` with `turn_key = {session_id}:{turn_id}`.
3. **Retrieval injection** — on each prompt, call `retrieveEntityByIdentifier` for any `@identifier` mentions and `listTimelineEvents` for a recent window, and return the result as `additionalContext`. Reliability floor for recall.
4. **Tool invocation capture** — write a `tool_invocation` observation for each tool call, preserving name/input/output summary. No inference.
5. **Compaction + Stop safety net** — write a `context_event` around compaction and an assistant `agent_message` at stop if the agent did not.

Deep entity extraction is never done in a hook — that remains the agent's job via MCP, preserving Neotoma's "no inference" invariant.

## Guides

- [Claude Code](./claude_code.md)
- [Cursor](./cursor.md)
- [OpenCode](./opencode.md)
- [Codex CLI](./codex_cli.md)
- [Claude Agent SDK](./claude_agent_sdk.md)
