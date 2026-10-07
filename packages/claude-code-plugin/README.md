# Neotoma plugin for Claude

This directory is the Neotoma **Claude plugin**. It ships:

- a **bundled MCP connector** to Neotoma (the public sandbox by default, or your own instance);
- three **onboarding skills** that work before Neotoma is connected: `setup`, `check`, `recover`;
- **starter commands** that mirror the server's MCP prompts;
- **Claude Code lifecycle hooks** (Python).

## Connector, skills, and starter commands

### Connector

`plugin.json` declares one HTTP MCP server, `neotoma`, whose URL comes from the plugin option **Neotoma MCP URL** (`userConfig.neotoma_mcp_url`). The default is the public sandbox, `https://sandbox.neotoma.io/mcp`. The sandbox is **shared and ephemeral**: do not store personal data there.

To use your own Neotoma in Claude Code, set the option (`/plugin` › neotoma › configure, or `/config`) to your server's `/mcp` URL, for example `http://127.0.0.1:3080/mcp`, then run `/reload-plugins`.

**claude.ai Chat ignores `${user_config}` connector URLs.** Chat users who want their own server add a **custom connector** (Settings › Connectors) with the server's `/mcp` URL, instead of relying on the plugin option.

### Onboarding skills

| Skill | What it does |
| --- | --- |
| `setup` | Step by step: check that "Code execution and file creation" is on (skills need it), connect, pick ONE workflow, propose bundles from evidence, enable only what the user confirms, store a first record and read it back. |
| `check` | Health check: connected, which Neotoma answered, read-back works. Writes nothing. |
| `recover` | What to do when the connector fails or sign-in expires. |

There are deliberately no generic "store" or "retrieve" skills: that behaviour comes from the live MCP server instructions.

### Starter commands and MCP prompts

The Neotoma server exposes five MCP prompts. Claude shows each prompt's name as a chip on the connector page; the plugin mirrors them as commands (`/neotoma:<name>`):

| Prompt / command | Does |
| --- | --- |
| `set-up-neotoma` | Runs the `setup` skill. Optional `workflow`. |
| `what-do-you-remember-about` | Looks up a person, project, or topic. Optional `topic`. |
| `remember-this` | Stores something and reads it back. Optional `content`. |
| `what-changed-recently` | Summarises recent changes. Optional `since`. |
| `check-neotoma` | Runs the `check` skill. |

The prompt text lives in `src/mcp_prompts.ts`; `tests/unit/mcp_prompts.test.ts` keeps the command files and the prompt names in step.

## Lifecycle hooks

The hooks part of this package is the **Claude Code** marketplace plugin (`plugin.json` + Python hooks). The **same package** also contains a **Cursor** hook map (`.cursor/hooks.json` → `packages/cursor-hooks`) so one checkout can wire both editors; lifecycle names and implementations differ per harness, but the intent matches: baseline capture, retrieval injection where the API supports it, and a stop-turn safety net. **MCP and CLI** stay the portable Neotoma surface for any agent.

It pairs with the Neotoma MCP server for agent-driven structured storage — hooks are the "reliability floor" (lifecycle-visible capture and markers), while MCP is the "quality ceiling" (rich, schema-typed extraction the agent performs deliberately).

## Harness compatibility

| Surface | What this repo wires | Notes |
| --- | --- | --- |
| **MCP / CLI** | Works in any agent or editor | Harness-agnostic; same store/retrieve contract everywhere. |
| **Claude Code** | `plugin.json` → `hooks/*.py` | Includes `PreCompact` for compaction markers. |
| **Cursor** | `.cursor/hooks.json` → `cursor-hooks` dist | Uses Cursor hook names (`sessionStart`, `beforeSubmitPrompt`, …); includes `postToolUseFailure`. Compaction hooks follow whatever Cursor exposes. |

## What it does (Claude Code hooks)

| Hook | Purpose |
| --- | --- |
| `SessionStart` | Records the Claude Code session as a `conversation` entity. |
| `UserPromptSubmit` | Injects retrieval context (recent timeline + `@identifier` matches) via `additionalContext`, and captures the user message as `agent_message`. |
| `PostToolUse` | Logs a `tool_invocation` observation for every tool call — passive observability. |
| `PreCompact` | Snapshots a `context_event` marker before Claude Code summarizes the context window. |
| `Stop` | Persists the assistant's final reply as an `agent_message` safety net. |

The plugin deliberately does not do LLM-based entity extraction from chat or tool output. That stays in the agent's hands via MCP, preserving Neotoma's "no inference" guarantee.

## Install

### From GitHub (recommended)

The repo root ships `.claude-plugin/marketplace.json`, so the `owner/repo` form resolves:

```bash
# In Claude Code
/plugin marketplace add markmhendrickson/neotoma
/plugin install neotoma@neotoma-marketplace
```

In the Claude apps, use **Customize › Plugins › Add marketplace** with `markmhendrickson/neotoma`.

### Local development

The `claude plugin install` CLI only resolves **marketplace** plugins (`name@marketplace`), not `.` or `./packages/...` paths. This package ships `.claude-plugin/marketplace.json` (`neotoma-marketplace`); register the directory, then install:

```bash
git clone https://github.com/markmhendrickson/neotoma
cd neotoma
claude plugin marketplace add "$(pwd)/packages/claude-code-plugin"
claude plugin install neotoma@neotoma-marketplace
```

## Prerequisites (hooks)

The connector, skills, and commands need nothing extra. The hooks need:

1. A running Neotoma server (default: `http://127.0.0.1:3080`). See [install.md](https://github.com/markmhendrickson/neotoma/blob/main/install.md).
2. The `neotoma-client` Python package: `pip install neotoma-client`.

## Configuration (hooks)

The hooks read environment variables, not the plugin's **Neotoma MCP URL** option:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | `http://127.0.0.1:3080` | Neotoma API root. |
| `NEOTOMA_TOKEN` | `dev-local` | Auth token for the Neotoma API. |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, `silent`. |

All hooks are best-effort: a failure in the plugin never blocks your turn. Errors are logged to stderr and the agent continues.

## Relationship to the MCP server

You can run both at once — they are designed to coexist:

- **MCP** handles structured, agent-driven writes: the agent calls `store_structured` with typed entities and schema-inferred fields.
- **Hooks** handle the lifecycle events MCP cannot see: session start, prompt arrival, compaction, stop. They also guarantee a baseline capture if the agent forgets to call MCP.

Idempotency keys are shared across both layers so nothing is double-counted.

## License

MIT
