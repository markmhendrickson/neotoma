# Neotoma plugin for Claude

This directory is the Neotoma **Claude plugin**. It ships:

- a **bundled MCP connector** to Neotoma (see the surface table: what it points at depends on the app);
- three **onboarding skills** that work before Neotoma is connected: `setup`, `check`, `recover`;
- **starter commands** generated from the server's MCP prompts;
- **lifecycle hooks** (Python) for Claude Code and Cowork.

## Connector, skills, and starter commands

### One Neotoma connector per surface

`plugin.json` declares one HTTP MCP server, `neotoma`, whose URL is the plugin option **Neotoma MCP URL** (`${user_config.neotoma_mcp_url}`). The option defaults to the public sandbox, `https://sandbox.neotoma.io/mcp`. The sandbox is **shared and temporary**: other people can see what is stored there, and it gets wiped. Claude's apps treat a connector URL that uses a setting differently ([platform support](https://claude.com/docs/plugins/platform-support)). The goal on every surface is exactly **one** working Neotoma connector:

| Surface | The plugin's connector | To try the sandbox | To use your own Neotoma |
| --- | --- | --- | --- |
| **Claude Code** | Loads, using the **Neotoma MCP URL** setting (default: the sandbox) | Nothing to do | Local server: run `neotoma hooks install --tool claude-code`. It sets the URL and turns off the plugin's connector if you already have your own Neotoma MCP entry. Otherwise run `/plugin`, open **neotoma**, choose **Configure options**, set **Neotoma MCP URL**, then run `/reload-plugins`. |
| **Cowork** | Loads, **always the sandbox** (Cowork does not ask for plugin settings) | Connect it on **Customize › Plugins › Neotoma › Connectors** | In **Customize › Connectors**, click **Add custom connector** and enter your `/mcp` URL. Then **disconnect** the plugin's connector on the plugin's **Connectors** tab. |
| **Chat** | **Not loaded** (Chat ignores a connector whose URL uses a setting) | In **Customize › Connectors**, click **Add custom connector** and enter `https://sandbox.neotoma.io/mcp` | Same, with your own `/mcp` URL |

The `setup`, `check` and `recover` skills follow this table. `check` fails when it sees two Neotoma connectors.

Why the connector URL uses a setting rather than a fixed URL: a fixed URL would let Chat list the connector, but Claude Code users could then no longer point it, and the hooks, at their own Neotoma through the setting or the CLI. Chat users add one custom connector instead.

### Upgrading from 0.1.x (breaking change)

Plugin 0.1.x hooks always wrote to `http://127.0.0.1:3080` and bundled no connector. From 0.2.0, the plugin brings its own connector, which defaults to the public sandbox. To keep everything on your own Neotoma:

```bash
neotoma hooks install --tool claude-code
```

This sets **Neotoma MCP URL** to your configured Neotoma, so the connector and hooks agree. If Claude Code already has your own Neotoma MCP entry, it also turns off the plugin's duplicate connector (`disabledMcpServers` in `~/.claude/settings.json`). Until you run it, the hooks keep capturing where they did: `NEOTOMA_BASE_URL` if you set it, or your Neotoma CLI config. A "Neotoma:" status line at session start tells you that the bundled connector points somewhere else. Claude Code does not auto-update third-party marketplaces by default, so update the plugin with `/plugin` first.

### Onboarding skills

| Skill | What it does |
| --- | --- |
| `setup` | Step by step: check that "Code execution and file creation" is on (skills need it), connect exactly one Neotoma (branching by surface, with the URL to paste), pick ONE workflow, propose bundles from evidence, enable only what the user confirms, store a first record and read it back. |
| `check` | Health check: connected, exactly one connector, which Neotoma answered, read-back works, lifecycle capture status. Writes nothing. |
| `recover` | What to do, per surface, when the connector is missing, duplicated, unreachable, or signed out. |

There are deliberately no generic "store" or "retrieve" skills: that behaviour comes from the live MCP server instructions.

### Starter commands and MCP prompts

The Neotoma server exposes five MCP prompts, and the plugin mirrors them as commands (`/neotoma:<name>`). Which text Claude shows on a prompt's chip, the name or the title, is not yet confirmed on a live connector page.

| Prompt / command | Does |
| --- | --- |
| `set-up-neotoma` | Runs the `setup` skill. Optional `workflow`. |
| `what-do-you-remember-about` | Looks up a person, project, or topic. Optional `topic`. |
| `remember-this` | Stores something and reads it back, after a sandbox check. Optional `content`. |
| `what-changed-recently` | Summarises recent changes. Optional `since`. |
| `check-neotoma` | Runs the `check` skill. |

`commands/*.md` are generated from `src/mcp_prompts.ts` (`npx tsx scripts/generate_claude_plugin_commands.ts`). `tests/unit/mcp_prompts.test.ts` fails if a command's content drifts from its prompt. In Chat, commands load as skills, so the `/` menu shows both, for example `neotoma:setup` and `neotoma:set-up-neotoma`.

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
# Point the connector and hooks at your Neotoma instead of the public sandbox:
echo '{"neotoma_mcp_url":"http://127.0.0.1:3080/mcp"}' | claude plugin configure neotoma@neotoma-marketplace --values-stdin
```

`neotoma hooks install --tool claude-code` does all of this for you. The repo-root and package-local catalogs share the marketplace name `neotoma-marketplace` on purpose: they list the same plugin, so the install id is the same from either source. Register only one of them.

## Prerequisites (hooks)

The connector, skills, and commands need nothing extra. The hooks need:

1. Your own running Neotoma server: the plugin's **Neotoma MCP URL**, `NEOTOMA_BASE_URL`, or a local Neotoma CLI config (hooks stay off on the public sandbox). See [install.md](https://github.com/markmhendrickson/neotoma/blob/main/install.md).
2. The `neotoma-client` Python package: `pip install neotoma-client`.

## Configuration (hooks)

The hooks resolve their Neotoma in this order:

1. the plugin option **Neotoma MCP URL**, when set to something other than the default (Claude Code exports it as `CLAUDE_PLUGIN_OPTION_NEOTOMA_MCP_URL`; a trailing `/mcp` is dropped). This is also the bundled connector's URL, so hooks and connector agree;
2. `NEOTOMA_BASE_URL`, when explicitly set;
3. an existing Neotoma CLI config (`~/.config/neotoma/config.json`): its `base_url`, else `http://127.0.0.1:3080`, which is what 0.1.x used;
4. the plugin default, the public sandbox.

Steps 2 and 3 keep an existing local setup capturing after an upgrade. When they point somewhere other than the bundled connector, a "Neotoma:" status line at session start says so and gives the command that makes them agree (`neotoma hooks install --tool claude-code`).

**The hooks never capture into the public sandbox.** On the sandbox, the session-start status line says capture is off. Sandbox hostname variants (letter case, a trailing dot, no scheme, the hosting platform's alias) count as the sandbox.

**Token.** `NEOTOMA_TOKEN` is sent only to the Neotoma it belongs to. That is the origin of `NEOTOMA_BASE_URL` when that is set, otherwise only a loopback server, and never over plain `http` to a non-local host. To capture into your own remote Neotoma, set the plugin option, plus `NEOTOMA_BASE_URL` with the same origin and `NEOTOMA_TOKEN`. The connector signs in on its own.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEOTOMA_BASE_URL` | unset | API root (see the order above). Also scopes `NEOTOMA_TOKEN`. |
| `NEOTOMA_TOKEN` | unset | Auth token, sent only to its own origin (see above). |
| `NEOTOMA_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, `silent`. |

All hooks are best-effort: a failure in the plugin never blocks your turn. Errors are logged to stderr and the agent continues.

## Relationship to the MCP server

You can run both at once — they are designed to coexist:

- **MCP** handles structured, agent-driven writes: the agent calls `store_structured` with typed entities and schema-inferred fields.
- **Hooks** handle the lifecycle events MCP cannot see: session start, prompt arrival, compaction, stop. They also guarantee a baseline capture if the agent forgets to call MCP.

Idempotency keys are shared across both layers so nothing is double-counted.

## License

MIT
