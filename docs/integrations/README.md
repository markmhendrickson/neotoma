---
title: Integrations
summary: Neotoma is cross-platform by design. One memory graph across every agent host you use — no platform lock-in, no separate state per tool.
audience: user
---

# Integrations

Neotoma is cross-platform by design. One memory graph across every agent host you use — no platform lock-in, no separate state per tool.

This page is the single index of every host, harness, and framework Neotoma integrates with today, and the status of each.

## Supported via MCP

MCP is the primary integration protocol. Every host below speaks MCP over local stdio, remote HTTP, or both.

| Host | Modes | Install | Setup guide |
| --- | --- | --- | --- |
| Cursor | stdio, remote HTTP | `neotoma setup --tool cursor --yes` | [neotoma-with-cursor](/neotoma-with-cursor) |
| Claude Code | stdio, remote HTTP | `neotoma setup --tool claude-code --yes` | [neotoma-with-claude-code](/neotoma-with-claude-code) |
| Claude Desktop | local, remote MCP | `neotoma setup --tool claude-desktop --yes` | [desktop](/neotoma-with-claude-connect-desktop) · [remote MCP](/neotoma-with-claude-connect-remote-mcp) |
| ChatGPT | MCP App, Custom GPT Actions | Manual HTTPS + OAuth | [neotoma-with-chatgpt](/neotoma-with-chatgpt) · [remote MCP](/neotoma-with-chatgpt-connect-remote-mcp) · [custom GPT](/neotoma-with-chatgpt-connect-custom-gpt) |
| Codex CLI | stdio, remote HTTP (OAuth) | `neotoma setup --tool codex --yes` | [neotoma-with-codex](/neotoma-with-codex) · [stdio](/neotoma-with-codex-connect-local-stdio) · [remote HTTP](/neotoma-with-codex-connect-remote-http-oauth) |
| OpenClaw | Native plugin + MCP | `neotoma setup --tool openclaw --yes` | [neotoma-with-openclaw](/neotoma-with-openclaw) · [stdio](/neotoma-with-openclaw-connect-local-stdio) · [remote HTTP](/neotoma-with-openclaw-connect-remote-http) |
| IronClaw | MCP | `neotoma setup --tool ironclaw --yes` | [neotoma-with-ironclaw](/neotoma-with-ironclaw) |
| Windsurf | MCP | `neotoma setup --tool windsurf --yes` | [neotoma-with-windsurf](/neotoma-with-windsurf) |
| Continue | MCP | `neotoma setup --tool continue --yes` | [neotoma-with-continue](/neotoma-with-continue) |
| VS Code (Copilot Chat) | MCP | `neotoma setup --tool vscode --yes` | [neotoma-with-vscode](/neotoma-with-vscode) |
| Letta | MCP (streamable HTTP, SSE, stdio) | Manual SDK setup | [neotoma-with-letta](/neotoma-with-letta) |

## Supported via hooks

Hooks integrate with harnesses that expose lifecycle events. They provide guaranteed capture, retrieval injection, and persistence safety nets — the reliability floor that composes with MCP's quality ceiling.

| Harness | Setup guide |
| --- | --- |
| Claude Code | [neotoma-with-claude-code](/neotoma-with-claude-code) |
| Cursor | [neotoma-with-cursor](/neotoma-with-cursor) |
| OpenCode | [neotoma-with-opencode](/neotoma-with-opencode) |
| Codex CLI | [neotoma-with-codex](/neotoma-with-codex) |
| Claude Agent SDK | [neotoma-with-claude-agent-sdk](/neotoma-with-claude-agent-sdk) |

## Client libraries

Embed Neotoma directly in your application:

| Language | Package |
| --- | --- |
| TypeScript | `@neotoma/client` |
| Python | `neotoma-client` |

## Not yet supported

These hosts are commonly requested. They are not yet supported. The "What it would take" column is descriptive, not committal — open a feature request if you want one prioritized.

| Host / framework | What it would take |
| --- | --- |
| LangGraph | A Python adapter on top of the Neotoma Python client, exposing `store` and `retrieve_*` as LangGraph memory nodes. |
| CrewAI | A Python adapter that exposes Neotoma actions as CrewAI tools, similar in shape to the OpenClaw native plugin. |
| Hermes | Confirm the specific framework being referenced (the name is overloaded) before scoping. |

**Want one of these prioritized?** Open an issue at [github.com/Lemonbrand/neotoma-feedback](https://github.com/Lemonbrand/neotoma-feedback) describing your use case.

## Related

- [MCP reference](/mcp) — protocol details and transport modes
- [CLI reference](/cli) — `neotoma setup`, `neotoma mcp config`
- [Install](/install) — get started
