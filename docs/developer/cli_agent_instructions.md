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

| Situation                           | Action                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP tools visible in the session    | Follow MCP `instructions` / tool surface only for Neotoma behavior.                                                                                                                                                                                                                                                        |
| MCP not available                   | Run `neotoma instructions print` (same body as the MCP fenced block), or open `docs/developer/mcp/instructions.md` in the Neotoma package / checkout.                                                                                                                                                                      |
| Install / MCP / configuration tasks | Read `install.md` (repo root) **first**. It is the canonical CLI-driven setup sequence covering `neotoma auth keygen`, `neotoma mcp config`, LaunchAgent install, transport presets, and data-directory configuration. Do not substitute shell introspection or manual JSON/plist edits for the CLI commands it documents. |

Skill auto-loading at session start: on every MCP `initialize`, the harness detects and registers available workspace skills (`.claude/skills/`, `.cursor/skills/`, `.codex/skills/`); this is idempotent and applies every session. Full normative rule lives in the MCP fenced block (`docs/developer/mcp/instructions.md`); this is a transport-layer pointer only.

Index and dual-host notes: `docs/developer/agent_instructions.md`.

Peer sync (peers, `/sync/webhook`, env `NEOTOMA_PUBLIC_BASE_URL` / `NEOTOMA_LOCAL_PEER_ID`, `get_peer_status` remote_health): `docs/subsystems/peer_sync.md`. CLI `neotoma compat` uses the same semver rules as `remote_health.compatible`.

Instance skills / scripts (CLI-only, no MCP tool — materialization writes to the invoking machine's local filesystem, which has no server-side equivalent): `neotoma skills sync --include-instance-skills` additionally fetches `enabled` `skill` entities from the connected instance and materializes them into harnesses alongside package skills (package skills always win on name collision). `--include-instance-scripts` (implies the above) additionally fetches each skill's `EMBEDS`'d script attachments and writes them under `<skill>/scripts/`, gated by a hash-pin consent manifest (`~/.neotoma/instance-skills/approvals.json`) — an unapproved or changed script hash is refused and reported, never silently written; `--approve` records the current hash as approved. See `docs/developer/cli_reference.md` (Skills section) for full flag semantics and `docs/skills/skill_strategy.md` for the design.

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

## Relationship creation guidance (canonical)

For when and how to link a newly stored entity to existing entities (pre-store candidate discovery, `retrieve_related_entities`, canonical relationship examples, direction convention), see `docs/developer/mcp/instructions.md` [RELATIONSHIP CREATION].

## Pre-check before storing (CLI backup)

Before storing a new entity, check for an existing record to avoid duplicates:

```bash
neotoma entities search "Holly Blondin" --entity-type contact
neotoma entities list --type contact
```

If a matching entity exists, use its `entity_id` for relationship creation instead of creating a duplicate. Only store if no match is found.

## Schema audit (CLI backup)

The per-store `unknown_fields` signal (see the canonical "Full data fidelity" rule in `docs/developer/mcp/instructions.md`) repairs one write. To triage the _accumulated_ stranded backlog — fields stored to `raw_fragments` but excluded from the snapshot until a schema declares them — run the aggregate audit:

```bash
neotoma schemas audit-fragments                 # all entity types
neotoma schemas audit-fragments contact         # one entity type
```

It is read-only (declares nothing) and reports, per type, the undeclared `fragment_key`s with occurrence / affected-entity counts and a `schema_missing` flag. Use it before drafting `neotoma schemas update` (`update_schema_incremental`) / `register_schema` work to pick the high-occurrence fields to promote first.

## Retrieval command quick reference (CLI backup)

When MCP is not available and prompt context may depend on prior memory:

```bash
# Identifier lookup
neotoma entities search "Acme Corp"

# Type-scoped queries — also covers named entity-type asks ("newest plans",
# "my tasks", "recent notes", "open issues"). See MCP instructions
# "Named entity-type routing" for the full behavioral rule.
neotoma entities list --type plan
neotoma entities list --type task
neotoma entities list --type event

# History/provenance lookup
neotoma observations list --entity-id <entity_id>

# Relationship expansion (when needed)
neotoma relationships list --entity-id <entity_id>
```

Use narrow queries first, then expand only if needed.

**Entity-id identifiers:** when the identifier is a literal entity_id (`ent_<hex>`), `entities search` / `retrieve_entity_by_identifier` short-circuits to a direct primary-key lookup and returns that entity exclusively (`match_mode: "direct"`) — it does not run name/text matching that would surface tangential rows mentioning the id. If no entity has that id for the caller, the response is `{ entities: [], total: 0, match_mode: "none", hint: … }` where `hint` points to `retrieve_entity_snapshot`; treat that as an explicit not-found for the id. For a known exact id, `retrieve_entity_snapshot` (`neotoma entities snapshot <entity_id>`) is the canonical direct fetch.

**Named entity-type routing:** see `docs/developer/mcp/instructions.md` (search "Named entity-type routing"). The CLI form is `neotoma entities list --type <entity_type>`. Run `neotoma instructions print` to see the canonical behavioral rule.

## Inspector link origin (CLI backup)

When rendering Neotoma Inspector links from CLI-backed memory operations, first run `neotoma auth session` (or call `GET /session`) and use `origins.inspector_origin` when it is present. If the session response has no `origins.inspector_origin`, do not guess `sandbox.neotoma.io`, localhost, or any other default host; render unlinked entity labels/ids instead. This mirrors the MCP display rule and prevents wrong-instance links.

## Install verification

After running `neotoma setup --tool <harness> --yes`, two plain-text lines always appear on stdout (after the JSON report, if `--json` is active):

1. **Install-verification line** — grep for `Neotoma installed at` to confirm install succeeded. Format: `Neotoma installed at <path> (resolved via <manager>; v<version>; data_dir=<dir>; mcp=<transport>)`.
2. **Privacy/transport summary** — `Transport: local stdio MCP (no network egress). ...` Answers the first question from privacy-conscious users about where data goes.

If the install-verification line is absent, check `neotoma status --json` (the `doctor` alias still works) for `neotoma.path_fix_hint` and surface it to the user.

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
