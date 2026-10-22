# Integrations matrix

Neotoma is cross-platform by design. This page is the single canonical index of every host, harness, and framework Neotoma integrates with, and the status of each integration.

The public-facing version of this page lives at [neotoma.io/integrations](https://neotoma.io/integrations).

> **Source of truth for installable targets:** `src/cli/setup.ts` (the `harnessMap` in `getSkillsTarget`). If this matrix disagrees with the CLI, the CLI wins.

## Legend

- **Stable** — supported in production; covered by setup docs and (where applicable) `neotoma setup --tool <name>`.
- **Preview** — works end-to-end but the install path is manual or partially documented.
- **Experimental** — early integration; expect rough edges.
- **Not yet supported** — see the roadmap section below.

## Supported (MCP)

MCP is the primary integration protocol. Every host below speaks MCP either over local stdio, remote HTTP, or both.

| Host | Modes | Install | Setup guide | Status |
| --- | --- | --- | --- | --- |
| Cursor | stdio, remote HTTP | `neotoma setup --tool cursor --yes` | [mcp_cursor_setup.md](../developer/mcp_cursor_setup.md) | Stable |
| Claude Code | stdio, remote HTTP | `neotoma setup --tool claude-code --yes` or `npm run sync:mcp` | [mcp_claude_code_setup.md](../developer/mcp_claude_code_setup.md) | Stable |
| Claude Desktop | local, remote MCP, desktop connector | `neotoma setup --tool claude-desktop --yes` | [neotoma-with-claude-connect-desktop](https://neotoma.io/neotoma-with-claude-connect-desktop), [remote MCP](https://neotoma.io/neotoma-with-claude-connect-remote-mcp) | Stable |
| ChatGPT | MCP App (connector), Custom GPT Actions (OpenAPI) | Manual HTTPS + OAuth | [chatgpt_apps_setup.md](../developer/chatgpt_apps_setup.md), [chatgpt_actions_setup.md](../developer/chatgpt_actions_setup.md) | Stable |
| Codex CLI | stdio, remote HTTP (OAuth) | `neotoma setup --tool codex --yes` | [neotoma-with-codex](https://neotoma.io/neotoma-with-codex), [stdio](https://neotoma.io/neotoma-with-codex-connect-local-stdio), [remote](https://neotoma.io/neotoma-with-codex-connect-remote-http-oauth) | Stable |
| OpenClaw | Native plugin (`kind: memory`) + MCP | `neotoma setup --tool openclaw --yes` | [mcp_openclaw_setup.md](../developer/mcp_openclaw_setup.md), [openclaw.md](openclaw.md) | Stable |
| IronClaw | MCP | `neotoma setup --tool ironclaw --yes` | [mcp_ironclaw_setup.md](../developer/mcp_ironclaw_setup.md) | Stable |
| Smithery | External URL registry | Manual registration | [smithery_external_url.md](smithery_external_url.md) | Stable |
| Windsurf | MCP | `neotoma setup --tool windsurf --yes` | [mcp_windsurf_setup.md](../developer/mcp_windsurf_setup.md) | Stable |
| Continue | MCP | `neotoma setup --tool continue --yes` | [mcp_continue_setup.md](../developer/mcp_continue_setup.md) | Stable |
| VS Code (Copilot Chat) | MCP | `neotoma setup --tool vscode --yes` | [mcp_vscode_setup.md](../developer/mcp_vscode_setup.md) | Stable |
| Letta | MCP (streamable HTTP, SSE, stdio) | Manual SDK setup | [mcp_letta_setup.md](../developer/mcp_letta_setup.md) | Stable |

## Supported (hooks)

Hooks are the reliability floor — guaranteed capture, retrieval injection, compaction awareness, and persistence safety nets that compose with MCP. MCP remains the quality ceiling for agent-driven structured writes.

| Harness | Package | Guide | Status |
| --- | --- | --- | --- |
| Claude Code | [`packages/claude-code-plugin`](../../packages/claude-code-plugin) | [hooks/claude_code.md](hooks/claude_code.md) | Stable |
| Cursor | [`packages/cursor-hooks`](../../packages/cursor-hooks) | [hooks/cursor.md](hooks/cursor.md) | Stable |
| OpenCode | [`packages/opencode-plugin`](../../packages/opencode-plugin) | [hooks/opencode.md](hooks/opencode.md) | Stable |
| Codex CLI | [`packages/codex-hooks`](../../packages/codex-hooks) | [hooks/codex_cli.md](hooks/codex_cli.md) | Stable |
| Claude Agent SDK | [`packages/claude-agent-sdk-adapter`](../../packages/claude-agent-sdk-adapter) | [hooks/claude_agent_sdk.md](hooks/claude_agent_sdk.md) | Stable |

## Client libraries

For applications that embed Neotoma directly (no host/harness in the loop):

| Language | Package | Source |
| --- | --- | --- |
| TypeScript | `@neotoma/client` | [`packages/client`](../../packages/client) |
| Python | `neotoma-client` | [`packages/client-python`](../../packages/client-python) |

## Not yet supported (roadmap)

The hosts and frameworks below are commonly requested or named by competing memory products. They are not yet supported. The "What it would take" column is descriptive — actual prioritization depends on engineering capacity.

| Host / framework | Why it matters | What it would take |
| --- | --- | --- |
| LangGraph | Common agent-graph orchestration framework | Either an MCP-compatible memory node, or a Python adapter on top of `packages/client-python`. Likely a small wrapper plus an example notebook. |
| CrewAI | Multi-agent orchestration | A Python adapter that exposes Neotoma `store` / `retrieve_*` actions as CrewAI tools. Same shape as the OpenClaw native plugin. |
| Hermes | Named by competing memory products | Confirm the specific framework being referenced (the name is overloaded) before scoping. |

**Want one of these prioritized?** Open an issue at [github.com/Lemonbrand/neotoma-feedback](https://github.com/Lemonbrand/neotoma-feedback) describing your use case.

## How to add a new host

A new host integration usually needs three things:

1. **A setup path.** For MCP hosts that use stdio or remote HTTP, this is typically an entry in `src/cli/setup.ts` (`harnessMap`) plus a `docs/developer/mcp_<host>_setup.md` guide. For hosts that use lifecycle hooks, this is a new package under `packages/` (mirroring `packages/cursor-hooks` or `packages/opencode-plugin`).
2. **A public setup page.** Add `docs/site/pages/en/neotoma-with-<host>.mdx` with a sidecar `.meta.json` matching the format used by existing `neotoma-with-*` pages.
3. **A row in this matrix.** Update both this file and `docs/site/pages/en/integrations.mdx`.

The CLI's `harnessMap` is the source of truth for supported `--tool` targets. Keep this matrix synchronized with it.

## Related

- [Public integrations page](https://neotoma.io/integrations) — buyer-facing version
- [MCP specification](../specs/MCP_SPEC.md) — protocol details
- [CLI reference](../developer/cli_reference.md) — `neotoma setup`, `neotoma mcp config`, `neotoma cli config`
- [Hooks index](hooks/README.md) — hooks contract and per-harness guides
