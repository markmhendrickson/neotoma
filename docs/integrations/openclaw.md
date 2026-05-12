# OpenClaw native plugin integration

> Audience: contributors changing how Neotoma plugs into OpenClaw, and operators reading the wiring before flipping `plugins.slots.memory = "neotoma"` in their OpenClaw config.

This document describes the **plugin entry** that ships with the Neotoma npm package and how OpenClaw consumes it. For end-user installation steps (`openclaw plugins install neotoma`, environment, troubleshooting), see [`docs/developer/mcp_openclaw_setup.md`](../developer/mcp_openclaw_setup.md) and [`docs/site/pages/en/neotoma-with-openclaw.mdx`](../site/pages/en/neotoma-with-openclaw.mdx).

## Scope

Neotoma exposes two complementary surfaces to OpenClaw:

1. **MCP transport** — the standard OpenClaw → Neotoma MCP server connection (stdio or HTTP). Documented in [`docs/developer/mcp_openclaw_setup.md`](../developer/mcp_openclaw_setup.md).
2. **Native plugin entry** — a first-class OpenClaw plugin that registers every Neotoma MCP tool as an OpenClaw agent tool, plus session-aware lifecycle hooks that honor Neotoma's store-first contract. **This document covers (2).** Use the native entry when you want Neotoma to participate in the OpenClaw `plugins.slots.memory` slot without running a separate MCP server alongside.

## Plugin entry: `src/openclaw_entry.ts`

The entry exports a `neotomaPlugin` object whose shape matches the OpenClaw native plugin contract (`id`, `name`, `description`, `register`). OpenClaw wraps the export with `definePluginEntry` from `openclaw/plugin-sdk/plugin-entry` at load time.

```ts
const neotomaPlugin = {
  id: "neotoma",
  name: "Neotoma",
  description:
    "Structured personal data memory with append-only observations, schema evolution, and provenance tracking",
  register(api: PluginApi) { /* tool + hook registration */ },
};
export default neotomaPlugin;
```

The package manifest declares **`kind: "memory"`** so OpenClaw treats Neotoma as a memory provider, which makes it assignable via:

```yaml
plugins:
  slots:
    memory: "neotoma"
```

When the memory slot is set to `neotoma`, OpenClaw routes its memory-shaped calls (e.g. recall, store, summarize) through the registered Neotoma tools rather than its built-in memory.

## Tool registration

`register(api)` enumerates `buildToolDefinitions()` (the same source that drives the MCP server in `src/server.ts`) and calls `api.registerTool({ name, description, parameters, execute })` for each one. The exposed surface therefore tracks the MCP tool catalog automatically — there is no separate OpenClaw-only allow-list.

Each `execute` call:

1. Ensures the server is initialized via `ensureServer(pluginConfig)` (lazy, idempotent — `serverInstance` is cached across calls).
2. Resolves the local dev user (`ensureLocalDevUser`) so MCP tools that infer `user_id` from authentication have one to work against.
3. Forwards the call through `NeotomaServer.executeToolForCli(toolName, params, userId)`, returning the standard MCP `{ content: [{ type: "text", text: … }] }` shape.

A small subset of tool names is also held in `NEOTOMA_RELEVANT_TOOL_NAMES` (`submit_issue`, `get_issue_status`, `store`, `store_structured`, `store_unstructured`, `retrieve_entities`, `retrieve_entity_by_identifier`, `create_relationship`, `list_entity_types`, `list_timeline_events`). That set is consulted by the `after_tool_call` hook to count Neotoma-relevant invocations vs failures on the session row; it does not filter what OpenClaw can call.

## Configuration injection (`applyConfig`)

OpenClaw passes the plugin's user-facing config (set in `openclaw config`) as `api.config`. The entry maps four optional fields onto the corresponding env vars **before** the server is constructed:

| Plugin config | Env var |
|--|--|
| `dataDir` | `NEOTOMA_DATA_DIR` |
| `environment` | `NEOTOMA_ENV` |
| `openaiApiKey` | `OPENAI_API_KEY` |
| `encryptionEnabled` | `NEOTOMA_ENCRYPTION_ENABLED` (`"true"` / `"false"`) |

It also sets `NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1` so importing `NeotomaServer` does not spin up the HTTP listener (the plugin only needs the in-process executor).

## Session lifecycle hooks

The entry installs four OpenClaw hooks via `api.on?.(...)`. All hooks honor the Neotoma **store-first** contract from [`docs/developer/mcp/instructions.md`](../developer/mcp/instructions.md) `[TURN LIFECYCLE]`: each hook batches one or two `store` calls before the host turn proceeds, and all calls carry deterministic `idempotency_key`s derived from `(sessionId, turnId, suffix)`.

### `session.start`

Persists a `conversation` row for the OpenClaw session (`conversation_id = event.sessionId`, harness = `openclaw`, optional `resumed_from`) and an initial `conversation_turn` with `hookEvent: "session_start"`. Idempotency key: `conversation-<sessionId>-session-start`.

### `session.end`

Stores a `context_event` row (event = `session_end`, message count, duration, transcript-archived flag, next session pointers) plus a closing `conversation_turn` with `status` set to the OpenClaw end reason. Idempotency key: `conversation-<sessionId>-session-end-event`.

### `message_received` / `message_sent`

Writes the user / assistant `conversation_message` exactly as the OpenClaw host produced it, with `turn_key = "<sessionId>:<turnId>"` (or `…:<turnId>:reply` for assistant replies), `sender_kind` set to `user` / `assistant`, and an embedded `conversation` row using the same `sessionId`. The message text is scrubbed of obvious secrets (`<EMAIL>`, `<TOKEN>`, `<UUID>`, `<HOME>`) and clamped at `MAX_HOOK_MESSAGE_CHARS` (120 KB) before storage, with a `content_truncated: true` flag preserved on the row when the cap fires. Relationships emitted in the same call: `PART_OF` from the message to the conversation.

### `after_tool_call`

Records a `tool_invocation` observation on the session's `conversation_turn` so the Inspector can see which agent tools ran in this turn, plus error classification (`ERR_*`, system codes like `ECONNREFUSED`, `HTTP_<code>`, or `generic_error`) for failures.

## Provenance fields

Every store call from this entry carries a common provenance block via `harnessProvenance`:

```ts
{
  data_source: "openclaw-hook",
  harness: "openclaw",
  cwd: process.cwd(),
  hook_event: "<session_start|session_end|message_received|message_sent|after_tool_call>",
}
```

This lets the Inspector and `list_recent_changes` distinguish OpenClaw-authored rows from other harnesses (Cursor, Claude Code, Codex) and pinpoint which hook produced a row when triaging.

## Safety / boundaries

- The plugin **never** spawns the Neotoma HTTP listener; it runs the same `NeotomaServer` class in-process with `NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1`. Operators who want HTTP behavior alongside the plugin should still run `npm run dev:server` (or the prod LaunchAgent) separately and let other harnesses connect to that.
- All writes go through `executeToolForCli` and respect the same auth, attribution, and schema invariants as MCP / HTTP. The plugin does not bypass `assertGuestWriteAllowed` or any of the gates listed in [`docs/security/threat_model.md`](../security/threat_model.md).
- Hook failures are logged via `api.logger?.warn(...)` and swallowed; OpenClaw's host turn always proceeds. The store-first contract is **best-effort** at the hook level because OpenClaw cannot block on hook errors without stalling the user — this is consistent with the Neotoma stop-hook compliance pattern documented in [`docs/developer/mcp/instructions.md`](../developer/mcp/instructions.md) `[QA REFLECTION] Compliance-pass diagnosis`.

## Related

- [`docs/developer/mcp_openclaw_setup.md`](../developer/mcp_openclaw_setup.md) — end-user installation, environment, troubleshooting.
- [`docs/site/pages/en/neotoma-with-openclaw.mdx`](../site/pages/en/neotoma-with-openclaw.mdx) — public site landing for OpenClaw integration.
- [`docs/developer/mcp/instructions.md`](../developer/mcp/instructions.md) — the canonical store-first / turn-lifecycle contract the hooks implement.
- [`src/tool_definitions.ts`](../../src/tool_definitions.ts) — single source of truth for which MCP tools are exposed (the OpenClaw plugin enumerates this same list).
- [`src/server.ts`](../../src/server.ts) — `NeotomaServer.executeToolForCli` is the in-process executor the hooks call.
