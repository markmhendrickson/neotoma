# Agent CLI Configuration

_(User-level settings for Claude Code, OpenAI Codex, and Cursor Agent CLI)_

## Scope

This document describes how Neotoma keeps agent and CLI behavior in **user-level** config so only your personal settings apply. Project-level config in the repo is minimal or absent so it does not override your choices.

## Configuration strategy

- **Permissions and approval behavior** live in your user config, not in the repo.
- **Project config** (when present) is minimal and does not override approval, sandbox, or permissions.
- Same approach across Claude Code, OpenAI Codex, and Cursor Agent CLI.
- **MCP servers:** `.cursor/mcp.json` is the single source of truth. All CLIs that support project MCP config see the same servers after sync.

## MCP: one source, all CLIs

MCP servers are defined once in **`.cursor/mcp.json`** (Cursor IDE). To make them available to Claude Code and Codex in this project:

1. **Add or edit servers** in `.cursor/mcp.json` only.
2. **Sync to other configs:** run `npm run sync:mcp` from the repo root.

The sync script updates:

- **`.mcp.json`** — Claude Code (and any tool that reads project `.mcp.json`) gets the same `mcpServers` as Cursor. Existing entries in `.mcp.json` are kept; Cursor’s list is merged in.
- **`.codex/config.toml`** — Appends `[mcp_servers.<id>]` for each stdio server in `.cursor/mcp.json` so Codex sees the same servers.

Run `npm run sync:mcp` after changing `.cursor/mcp.json` (or add it to your workflow). Cursor Agent CLI uses Cursor’s MCP config when running in a project that has `.cursor/mcp.json`.

### Transport: stdio for local, HTTP for remote

For local usage (Cursor, Claude Code, Codex on the same machine as the Neotoma repo), use **stdio** in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "neotoma-dev": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio.sh"
    },
    "neotoma-prod": {
      "command": "/absolute/path/to/neotoma/scripts/run_neotoma_mcp_stdio_prod.sh"
    }
  }
}
```

Replace `/absolute/path/to/neotoma` with your repo path. Run `npm run build:server` before first use. Stdio lets the client spawn the server, so after sleep you only need to toggle the MCP server off/on; no separate HTTP process to restart.

For remote access (tunnel, ChatGPT, deployed server), use HTTP URLs instead. See [mcp_cursor_setup.md](mcp_cursor_setup.md) for the transport comparison and HTTP config.

---

## Claude Code

**User config (all projects):** `~/.claude/settings.json`

Set permissions and default mode there. Example:

```json
{
  "alwaysThinkingEnabled": false,
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash", "Edit(/**)", "Read(/**)", "Grep", "Glob", "mcp__parquet", "mcp__neotoma-prod"],
    "deny": ["Read(.env)", "Read(.env.*)", "Read(docs/private/**)", "Edit(.env)", "Edit(.env.*)", "Bash(rm -rf *)", "Bash(git push --force *)"]
  }
}
```

**In this repo:** `.claude/settings.json` has no `permissions` block, so your user config applies. Rules and entrypoint live in `.claude/CLAUDE.md` and `.claude/rules/`.

**Restart Claude Code** after changing `~/.claude/settings.json`.

---

## OpenAI Codex

**User config (all projects):** `~/.codex/config.toml`  
**Project config:** `.codex/config.toml` (comments only; no overrides)

Set model, approval policy, sandbox, and MCP in your user config. Example snippet:

```toml
# ~/.codex/config.toml
model = "gpt-5.2"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

Precedence: CLI / profile > project `.codex/config.toml` > user `~/.codex/config.toml`. This repo’s `.codex/config.toml` only documents that; it does not set options, so user config applies.

References: [Config basics](https://developers.openai.com/codex/config-basic), [Config reference](https://developers.openai.com/codex/config-reference).

---

## Cursor Agent CLI

**User config (all projects):** `~/.cursor/cli-config.json`

Cursor Agent CLI does not use a project-level CLI config file. All CLI agent behavior is controlled from `~/.cursor/cli-config.json`.

Configure model, approval, and other CLI options there. See [Cursor CLI configuration](https://docs.cursor.com/cli/reference/configuration).

**Note:** `.cursor/` in this repo holds **IDE** context (rules, commands, MCP), not the Agent CLI config. The CLI reads only from `~/.cursor/cli-config.json`.

---

## Summary

| Tool              | User config                 | Project config in repo        | MCP source        |
|-------------------|-----------------------------|-------------------------------|-------------------|
| Claude Code       | `~/.claude/settings.json`   | `.claude/settings.json` (no permissions) | `.mcp.json` (synced from `.cursor/mcp.json`) |
| OpenAI Codex      | `~/.codex/config.toml`      | `.codex/config.toml` (comments + synced `[mcp_servers]`) | Synced from `.cursor/mcp.json` |
| Cursor IDE / CLI  | `~/.cursor/cli-config.json` (CLI only) | `.cursor/mcp.json` (MCP) | `.cursor/mcp.json` (canonical) |

Use the user config paths above so the same behavior applies in every project. For MCP, edit `.cursor/mcp.json` and run `npm run sync:mcp` so all CLIs see the same servers.

## Related documents

- [Getting started](getting_started.md) — Local environment and first contribution
- [CLI overview](cli_overview.md) — Neotoma CLI usage
- [MCP Cursor setup](mcp_cursor_setup.md) — Cursor IDE MCP integration
- [MCP Claude Code setup](mcp_claude_code_setup.md) — Claude Code MCP integration
