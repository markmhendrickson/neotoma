---
description: "Prefer Neotoma MCP when installed and running; use CLI as backup when MCP is not available. Pointers to canonical MCP instructions; CLI cheat sheet only."
globs: ["**/*"]
alwaysApply: true
---

# Neotoma transport: MCP when available, CLI as backup

## Purpose

Use **Neotoma MCP** for Neotoma operations when it is installed and running in this environment. Use the **Neotoma CLI** as backup when MCP is not available (not installed, not running, or not in context). Behavioral rules (turn order, store recipes, retrieval, provenance, display, QA, onboarding, errors) live in **one** place: the fenced block in `docs/developer/mcp/instructions.md`, shipped with the package and sent to MCP clients.

**This file is the harness layer only** (transport, env, CLI examples). It is written to applied paths by `neotoma cli config --yes` (deprecated alias: `neotoma cli-instructions check`). It must **not** duplicate the full MCP instruction block, so agents that load both MCP instructions and this rule do not see two copies of the same contract.

When a Neotoma CLI session starts (dev or prod), applied rule files (e.g. `.cursor/rules/neotoma_cli.mdc`) are updated with an **Active environment** section (current env and `--env` flag). That happens on session start.

## Canonical behavioral instructions (read these for semantics)

| Situation | Action |
|-----------|--------|
| MCP tools visible in the session | Follow MCP `instructions` / tool surface only for Neotoma behavior. |
| MCP not available | Run `neotoma instructions print` (same body as the MCP fenced block), or open `docs/developer/mcp/instructions.md` in the Neotoma package / checkout. |

Index and dual-host notes: `docs/developer/agent_instructions.md`.

Peer sync (peers, `/sync/webhook`, env `NEOTOMA_PUBLIC_BASE_URL` / `NEOTOMA_LOCAL_PEER_ID`, `get_peer_status` remote_health): `docs/subsystems/peer_sync.md`. CLI `neotoma compat` uses the same semver rules as `remote_health.compatible`.

## Transport and environment

- **When MCP is available (installed and running):** Prefer **MCP** for Neotoma operations (**`store`**, `create_relationship`, retrieval tools, etc.) per the MCP instruction block. Deprecated aliases `store_structured` / `store_unstructured` still work but map to the same **`store`** handler.
- **When both neotoma-dev and neotoma MCP servers are configured:** Default to **neotoma** (production) for retrieval/store/instruction precedence. Use **neotoma-dev** only when the user explicitly requests development behavior or the task is clearly dev-only.
- **When MCP is not available:** Use the **Neotoma CLI** as backup. Data commands are offline-first with in-process local transport by default. Use `--api-only` to require remote API; `--offline` forces local transport. For server commands (`api start`, `api stop`, `api logs`, `watch`), always pass `--env dev` or `--env prod`.

## CLI startup protocol (use-existing)

CLI uses connect-only startup for interactive sessions. It does not auto-start servers on session start. On no-args startup, it discovers running local API instances from session ports, defaults (`3080`, `3180`), remembered ports, and optional configured ports. If multiple instances are healthy, it applies `--env` as a preference and then prompts for explicit selection.

```bash
neotoma store --json='[...]'
neotoma entities list --type contact
neotoma schemas list
```

For server commands (`api start`, `api stop`, `api logs`, `watch`), pass `--env dev` or `--env prod`. For data commands, use `--base-url` for a specific target port, `--offline` to force local transport, or `--api-only` to disable fallback.

**`neotoma dev` / `neotoma prod` are environment shorthands.** They inject `--env dev` or `--env prod` for that invocation.

> **`--json=` syntax warning:** Always write `--json='[...]'` with **no space** between `--json` and `=`. The form `--json '[...]'` (space before the value) can fail silently in shell. For payloads longer than a few hundred characters, write entities to a temp file and use `--file <path>` instead.

## Store command quick reference (CLI backup)

When using the CLI (MCP not available):

```bash
neotoma store --json='[{"entity_type":"person","name":"Sarah"},{"entity_type":"task","title":"Pay Sarah $20","description":"Owe Sarah $20"}]'
```

Each object in the array must be **flat** (all fields alongside `entity_type`). Do **not** wrap rows in a root **`attributes`** object — that pre-v0.5 shape is rejected with **`ERR_STORE_RESOLUTION_FAILED`**; see **`docs/developer/mcp/instructions.md`** [STORE RECIPES] (first bullets after the tool-parameter line).

For long payloads, use `neotoma store --file <path>` with a JSON file containing the entities array.

## Relationship creation (CLI backup)

After storing entities, create relationships with:

```bash
neotoma relationships create --source-entity-id <entity_id> --target-entity-id <entity_id> --relationship-type PART_OF
neotoma relationships create --source-entity-id <msg_id> --target-entity-id <conv_id> --relationship-type PART_OF
neotoma relationships create --source-entity-id <container_id> --target-entity-id <asset_id> --relationship-type EMBEDS
```

Entity IDs are returned in the `store` response (`entities[].entity_id`). If `relationships create` fails or is unavailable, check `neotoma relationships --help` for current syntax.

## Pre-check before storing (CLI backup)

Before storing a new entity, check for an existing record to avoid duplicates:

```bash
neotoma entities search "Holly Blondin" --entity-type contact
neotoma entities list --type contact
```

If a matching entity exists, use its `entity_id` for relationship creation instead of creating a duplicate. Only store if no match is found.

## Retrieval command quick reference (CLI backup)

When MCP is not available and prompt context may depend on prior memory:

```bash
# Identifier lookup
neotoma entities search "Acme Corp"

# Type-based lookup
neotoma entities list --type task
neotoma entities list --type event

# History/provenance lookup
neotoma observations list --entity-id <entity_id>

# Relationship expansion (when needed)
neotoma relationships list --entity-id <entity_id>
```

Use narrow queries first, then expand only if needed.

## When to load

Load when configuring or documenting agent behavior, or when choosing between MCP and CLI for Neotoma operations. Applied in Cursor, Claude Code, and Codex via `.cursor/rules/`, `.claude/rules/`, `.codex/` (project or user).

## Related documents

- `docs/developer/agent_instructions.md` — Canonical map (MCP block, `instructions print`, dual-host)
- `docs/developer/mcp/instructions.md` — MCP interaction instructions (fenced block is source of truth)
- `docs/developer/agent_instructions_sync_rules.mdc` — Maintainer contract for editing instructions
- `docs/specs/MCP_SPEC.md` — Action catalog and entity type rules
- `docs/foundation/what_to_store.md` — Canonical rubric for what facts are worth storing
- `docs/developer/agent_cli_configuration.md` — Agent CLI configuration and MCP/CLI strategy
- `docs/developer/cli_reference.md` — CLI command reference
