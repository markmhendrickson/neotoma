# What changes on your system

Installation, initialization, and host connection can affect different machines and configuration files.

Applies to published v0.26.0 (`b6ae615`) and the release claims check on October 27th, 2026. Check the version and host path you actually use. A remote client connecting to an already operated instance does not need the Neotoma CLI installed on the client machine.

## Choose the effect you intend

Installing the npm package adds a global CLI binary on the machine where you run it. `neotoma init` creates local configuration and development and production database profiles. A host setup, native plugin, or SDK adapter may then change that host's configuration or capture later events. Those are separate choices: merely connecting an authenticated remote client does not initialize a local Neotoma record.

Before running a command, choose the [connection guide](https://neotoma.io/install/) for your host. It distinguishes local stdio, authenticated remote MCP, native plugin, manual configuration, SDK adapter, and registry paths. Review the command and its permissions before running it; a completed setup command does not prove the host can read the intended instance or that optional capture works.

## Files and permissions for a local installation

`npm install -g neotoma@0.26.0` adds the CLI binary. `neotoma init` creates a config directory, two local SQLite databases (development and production profiles), and an environment file. By default, init also adds a Neotoma entry to Cursor's MCP configuration. Run `neotoma init --interactive` to choose each step.

The following inventory describes the local paths and effects exposed by the documented install and Claude Code setup flow. Other hosts use their own guide and can affect different host files. The paths and reset behavior are not a promise that a remote client writes to its own machine.

| Created or changed | Path | Scope | `neotoma reset` behavior |
| --- | --- | --- | --- |
| Global npm package | Global `node_modules` | Global | `npm uninstall -g neotoma` runs only when reset is called from inside a Neotoma repository. |
| Config directory | `~/.config/neotoma/` | User | Backed up, then removed. |
| Environment file | `~/.config/neotoma/.env` or `<project>/.env` | User or project | Backed up, then removed. |
| SQLite databases, development and production profiles | `<data-dir>/neotoma.db`, `<data-dir>/neotoma.prod.db` | Local | Backed up, then removed. |
| Data directories for both profiles | `<data-dir>/sources/`, `<data-dir>/logs/` (development); `<data-dir>/sources_prod/`, `<data-dir>/logs_prod/` (production) | Local | Backed up, then removed unless `NEOTOMA_DATA_DIR` protects the configured directory. |
| Event logs for both profiles | `<data-dir>/logs/events.log` (development), `<data-dir>/logs/events.prod.log` (production) by default; `NEOTOMA_EVENT_LOG_PATH` or `NEOTOMA_EVENT_LOG_DIR` can override the location | Local | Check the resolved path before reset or backup; a protected data directory is not removed. |
| MCP entries `neotoma-dev` and `neotoma`, with separate databases; init adds one Cursor entry by default | `~/.cursor/mcp.json`, `.mcp.json`, `claude.json`, or selected host configuration | User or project | User-level Neotoma entries are stripped; project .mcp.json entries can remain when reset runs outside a Neotoma repository. |
| CLI instruction files for Claude Code, Cursor, and Codex | `.cursor/rules/`, `.claude/rules/`, and the Codex equivalent | Project | Can remain when reset runs outside a Neotoma repository; remove manually. |
| Claude Code plugin with five hooks, when `claude` is on `PATH` | The Claude plugin location | User | Not listed among what reset removes. |
| Twelve Claude Code skills, when `~/.claude` exists | `~/.claude/skills/` | User | Not listed among what reset removes. |
| Claude Code allow rules `Bash(neotoma:*)` and `Bash(npm install -g neotoma:*)` | `.claude/settings.local.json` by default; `~/.claude/settings.json` with `--scope both` | Project or user | Not listed among what reset removes. |
| Cursor command allowlist `neotoma *` and global npm install | `.cursor/allowlist.json` | Project | Not listed among what reset removes. `neotoma *` permits any Neotoma subcommand, including reset. |
| Codex command approval `neotoma *` and global npm install | `~/.codex/config.toml` | User | Not listed among what reset removes. `neotoma *` permits any Neotoma subcommand, including reset. |

The Claude Code setup example `neotoma setup --tool claude-code --yes` writes two MCP entries and CLI instruction files for Claude Code, Cursor, and Codex in the project. Its permission step writes the two **Claude Code** allow rules shown above; Cursor and Codex permission rules are written by their respective selected setup targets. The Claude `Bash(neotoma:*)` rule can permit any Neotoma command without another host prompt, including destructive commands such as `neotoma reset`; the Cursor and Codex `neotoma *` rules have the same broad subcommand reach. Reset itself can proceed without interactive confirmation: outside the production environment, that is its default unless `--interactive` requests a prompt; a prompt also depends on terminal and output mode. `--skip-permissions` writes no allow rules. Setup also installs user-level skills when `~/.claude` exists and, when `claude` is on `PATH`, runs the Claude Code plugin marketplace and install commands. Without `claude` on `PATH`, it can exit with code 1 after writing the other changes. Inspect the resulting files and host permissions rather than treating the exit code as a complete effect report.

## Capture and network behavior

MCP connection lets the host make agent-driven calls. Hooks, plugins, and SDK adapters are separate capture paths: after activation, they may record later supported events automatically. Check their own configuration and captured-event readback; a successful MCP retrieval does not prove capture, and plugin registration does not prove MCP access.

There is no product telemetry in this documented flow. The interactive CLI checks the npm registry for a newer version about once a day; `--no-update-check` or `NO_UPDATE_NOTIFIER=1` disables that check. The stdio MCP server checks when a session starts and about every six hours afterward; `NO_UPDATE_NOTIFIER=1` disables that check, while the CLI flag does not. An agent can separately call `npm_check_update`, which makes the same registry request and is not disabled by `NO_UPDATE_NOTIFIER`. The request carries the package name; the registry also sees ordinary connection metadata such as the network address.

## Reset and verify

`neotoma reset` backs up local state to a timestamped directory before removing it. It runs `npm uninstall -g neotoma` only when run from inside a Neotoma repository; elsewhere it skips the global uninstall. If `.env` sets `NEOTOMA_DATA_DIR`, that directory is protected and not removed. Plugin, skill, and allow-rule rows above are not listed among reset removals; inspect and remove them separately if that is your intention.

After local setup, inspect the affected host configuration and run a read-only retrieval of a known entity on the intended instance and profile. An empty successful query proves transport, not that you reached the expected record. Before any data import or permission expansion, review the selected source, scope, and effect. Return to [Install options](https://neotoma.io/install/) or the relevant connection guide to choose the next step.
