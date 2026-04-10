---
description: "Prefer Neotoma MCP when installed and running; use CLI as backup when MCP is not available. Same agent behaviors (chat persistence, entity extraction, conventions)."
globs: ["**/*"]
alwaysApply: true
---

# Neotoma transport: MCP when available, CLI as backup

## Purpose

Use **Neotoma MCP** for Neotoma operations when it is installed and running in this environment. Use the **Neotoma CLI** as backup when MCP is not available (not installed, not running, or not in context). Same agent behaviors either way: chat persistence, entity extraction, and conventions. This rule ensures agents get consistent behavior whether they use MCP tools or CLI commands.

## Scope

This document is the canonical source for the instruction content written to applied paths by `neotoma cli-instructions check`. It mirrors the behavioral instructions in `docs/developer/mcp/instructions.md`, with MCP actions paired with CLI equivalents for when MCP is not available. Edits here take effect when the rule is re-applied (run `neotoma cli-instructions check` and add to missing environments).

When a Neotoma CLI session starts (dev or prod), the applied rule files (e.g. `.cursor/rules/neotoma_cli.mdc`) are automatically updated with an **Active environment** section that identifies the current env and the correct `--env` flag to use. This happens silently on every session start so agents always know which environment is active.

## Transport and environment

- **When MCP is available (installed and running):** Prefer **MCP** for Neotoma operations. Use MCP tools (e.g. `store_structured`, `create_relationship`, `mcp_parquet_*`) per `docs/developer/mcp/instructions.md`.
- **When both neotoma-dev and neotoma MCP servers are configured:** Default to **neotoma** (production) for retrieval/store/instruction precedence. Use **neotoma-dev** only when the user explicitly requests development behavior or the task is clearly dev-only.
- **When MCP is not available:** Use the **Neotoma CLI** as backup. Data commands are offline-first and use in-process local transport by default (e.g. `neotoma store --json='...'`, `neotoma entities list`). Use `--api-only` to require remote API; `--offline` remains available to force local transport explicitly. For server commands (`api start`, `api stop`, `api logs`, `watch`), always pass `--env dev` or `--env prod`.

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
neotoma store --json='[{"entity_type":"person","name":"Sarah","canonical_name":"Sarah"},{"entity_type":"task","title":"Pay Sarah $20","description":"Owe Sarah $20"}]'
```

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

## Store error handling

If `store` fails:
1. Retry once with the same payload.
2. If it fails again, surface the error to the user ("Storage failed: [error message]") before responding with the retrieved data.
3. Do not silently skip storage and respond as if it succeeded.
4. If the error includes `database disk image is malformed`, `SQLITE_CORRUPT`, `btreeInitPage`, or failed SQLite integrity checks, tell the user the local SQLite file is likely corrupted and suggest `neotoma storage recover-db` first, then `neotoma storage recover-db --recover` after they stop Neotoma. Do not auto-swap the recovered DB without explicit user approval.

## Rule (instruction content)

- **Transport:** Prefer **MCP** when it is installed and running in this environment; use **CLI** when MCP is not available. CLI session startup is connect-only. For server commands (`api start`, `api stop`, `api logs`, `watch`), always include `--env dev` or `--env prod`.

- **MANDATORY in chat:** Every turn persist the conversation and current user message. Do not skip for greetings or minimal messages. Same turn as your response. **If MCP available:** use unified `store` with entities and idempotency_key per MCP instructions. **If using CLI:** use `neotoma --servers=start store --json='[{"entity_type":"conversation","title":"<summary>","started_at":"<iso>"},{"entity_type":"agent_message","role":"user","content":"<exact message>","turn_key":"{conversation_id}:{turn_id}"}]'` with idempotency_key `conversation-{conversation_id}-{turn_id}-{timestamp_ms}` or UUID (each store creates a new observation; overwriting between branches is allowed). Entity indices: `entities[0]` = conversation, `entities[1]` = message in the response. Include `turn_key` or `id` as `{conversation_id}:{turn_id}` so the same logical turn resolves to the same entity and multiple observations form history. After storing, create PART_OF relationship: `neotoma --servers=start relationships create --source-entity-id <msg_id> --target-entity-id <conv_id> --relationship-type PART_OF` (see "Relationship creation" section). Use host conversation_id/thread_id/session_id and turn_id when available.

- **Chat details:** Overwriting between branches is acceptable; history is available via `neotoma --servers=start observations list <entity_id>`. Reverted turns: optionally link new message to previous with relationship SUPERSEDES (`--source-entity-id <new_msg_id> --target-entity-id <prev_msg_id> --relationship-type SUPERSEDES`). Attachments: **MCP:** include file input in the same `store` call with entities and then create EMBEDS from `structured.entities[1]` to `unstructured.interpretation.entities[0]`. **CLI:** use one `neotoma --servers=start store` call with both `--json` and `--file-path` when possible, then create EMBEDS (container, asset). Relationship types: PART_OF, REFERS_TO, EMBEDS, SUPERSEDES, etc. (see MCP spec).

- **Screenshot/image:** When the user provides a screenshot or image, extract structured data from the visible content (people, messages, dates, criteria, tasks, events, offers, transactions, etc.) and store it. **MCP:** use the attachment turn recipe with entities [ conversation, message, …extracted entities ], file_path or file_content+mime_type for the image, relationships PART_OF, REFERS_TO for each extracted entity, EMBEDS from message to file entity. **CLI:** use one `neotoma --servers=start store` call with `--json` (conversation + message + extracted entities) and `--file-path` for the image, then create PART_OF, REFERS_TO, and EMBEDS relationships. Extract every distinct entity visible in the image before responding.

- **Do not mention storage, memory, or linking unless the user asked.** Exception: if the turn created or updated Neotoma entities, the user-visible reply must show them as required by the entity-display rule below. Do not describe internal persistence in thought or reply (e.g. "Persisting this turn, then replying", "Storing the conversation first"). When confirming something was stored, use memory-related language ("remember", "recall", "stored in memory") and include one of those phrases.

- **Use Neotoma proactively (MCP or CLI).** Store when the user states relevant information; store first, then respond. Do not skip store because the user did not ask to save.

- **No-data bootstrap and onboarding discovery:** When Neotoma has little or no relevant data (first run or empty state), follow the onboarding discovery flow from `install.md`: (1) ask the user which data types matter most (project files, chat transcripts, meeting notes, notes/journals, code context, email, financial docs, custom paths) and which mode they prefer (quick win, guided, power user); (2) discover high-value local files by scanning shallowly — rank by entity density, temporal signals, recency, and relationship potential per `docs/foundation/file_ranking_heuristic.md`; (3) group results into domains (not file counts) and explain why each was selected and what timeline value it could unlock; (4) let the user confirm per-folder or per-file with an expected reconstruction preview; (5) ingest confirmed files and reconstruct the strongest timeline with provenance (each event traced to a specific source file); (6) show the timeline immediately — not a file count; (7) offer one follow-up query specific to the reconstructed entity and 2-4 leveraged next actions; (8) demonstrate correction. Also include data from existing context: proactively build a candidate set from existing context before asking to store new facts. Include both (1) data that refers to the user (identity, receipts, commitments, the user’s contacts) and (2) other data from the same context (e.g. third-party contacts from exports, saved chats/shares, tweets or posts, imported documents). Use `docs/foundation/what_to_store.md` as the canonical rubric for deciding whether a fact is worth storing (recallability, auditability, reproducibility, relationship value). Start with passive sources already in-session (current message, prior turns, host-injected context such as user identity hints/open files/git status) and then use bounded active checks (targeted git/project metadata and existing Neotoma retrieval) only as needed. Present candidates with provenance; where useful, indicate whether each is user-referring or other so the user can approve selectively. Do not save any previewed data (personal or other) before explicit user confirmation.

- **Proactive retrieval (after persistence, before final response):** After mandatory per-turn persistence, run a bounded retrieval pass whenever the prompt includes entities, topics, time windows, or commitments that might map to Neotoma memory. **MCP:** start with `retrieve_entity_by_identifier` and `retrieve_entities`, use `list_timeline_events` for time-based questions, then expand with `retrieve_related_entities` / `retrieve_graph_neighborhood` only when relationship context is needed, and `list_observations` when turn/provenance continuity matters. **CLI:** start with `neotoma --servers=start entities search "<term>"` (or `--identifier "<term>"`) and `neotoma --servers=start entities list --type <type>`, use timeline/event queries where supported, then `neotoma --servers=start relationships list --entity-id <id>` and `neotoma --servers=start observations list --entity-id <id>` as needed.

- **Data discovery preview:** When the user asks to preview, audit, or discover available data for Neotoma storage, survey sources in priority order. Include both data that refers to the user and other data from context (third-party contacts, saved chats, tweets, imports). **Passive sources:** extract entities from in-session context (user_info, git_status, open files, terminal state, transcript references, prior messages). **Active sources:** query git metadata (`git config`, `git log`, remotes), read focused project metadata (README, package.json, config files, env var names not values), check configured MCP/tool outputs (email, calendar, browser, parquet, web), and check existing Neotoma data (`retrieve_entities` or `neotoma --servers=start entities list/search`). **Priority:** Tier 1 = people, relationships, commitments, tasks; Tier 2 = events, decisions, preferences, financial facts; Tier 3 = stable project/codebase context; Tier 4 = transient session state. Present candidates grouped by tier and entity type with source attribution; flag already stored vs new and, where useful, user-referring vs other. Do not save any previewed data (personal or other) before explicit user confirmation. Full workflow: `install.md` and `docs/developer/agent_onboarding_confirmation.md`.

- **Onboarding output rule:** After first-run ingestion, the first visible output must be a reconstructed timeline with provenance, not a file count or entity count. Format: "[Entity name] — Timeline reconstructed from [N] sources" followed by dated events each with "Source: [filename], [location]". See `docs/developer/agent_onboarding_confirmation.md` for the full specification.

- **Chat transcript discovery:** During onboarding, check for chat transcript exports (ChatGPT JSON, Slack exports, Claude history, meeting transcripts). These are the highest-signal ingestion source. When found, explain their value: "Chat transcripts encode decisions, commitments, and project discussions with timestamps." See `docs/developer/transcript_ingestion.md`.

- **Retrieval guardrails and answer grounding:** Start with small, targeted queries and expand only on ambiguity or low confidence. Avoid broad scans unless necessary. Use retrieved Neotoma facts when relevant; if bounded retrieval finds no relevant context, proceed normally without inventing memory-backed claims.

- **Publication recency semantics:** For prompts asking for "recently published" posts/content, sort by publication timestamp (`published_date`/`published_at`) descending, not by observation recency (`last_observation_at`) unless the user explicitly asks for recently updated/touched/imported entities. Use pagination or a sufficiently high limit and deduplicate by `entity_id` before reporting.

- **External tool data (store-first rule):** Whenever any tool call returns external data — regardless of source (email, calendar, web search, file read, database query, API response, or any other external system) — extract and store all relevant entities before composing the response. Do not respond until storage is complete (same turn). Entities to extract: people, companies, locations, events, tasks, notifications, documents, device status, and relationships between them. Create tasks for action items. Link events and tasks to locations and people. **MCP:** use unified `store` and create_relationship as needed. **CLI:** use `neotoma --servers=start store --json='[...]'` and include `--file-path` or `--file-content` when preserving files in the same request.

- **User identity:** When the user provides or implies their identity (name, email, "me"/"myself"), store as contact or person in the same turn when you have enough to identify.

- **Extract and store all relevant entities** from the user: people, tasks, events, commitments, preferences, possessions, relationships, places. Store every distinct entity. Places: store as location/property/place and link to tasks or other entities. Implied relationships: use create_relationship (MCP) or **CLI:** `neotoma --servers=start relationships create --source-entity-id <id> --target-entity-id <id> --relationship-type <TYPE>` (see "Relationship creation" section). Container+asset: EMBEDS with source=container, target=asset; **CLI:** store file with `neotoma --servers=start upload`, create image/media entity, then create relationship EMBEDS.

- **Tasks:** Create a task when the user expresses intent, obligation, or future action ("I need to", "remind me", deadlines). Unless they say no reminders/tasks, create task with due date if available and relate to person or entity. **CLI:** `neotoma --servers=start store --json='[{"entity_type":"task",...}]'` or `--file <path>`.

- **Entity types:** Use MCP tools or `neotoma --servers=start schemas list` / `neotoma --servers=start schemas get <entityType>` when needed. For unknown types, use `neotoma --servers=start schemas list --search <keyword>` to discover a matching type before inventing one; if none matches, store with a descriptive entity_type and the system infers or creates schema. Examples: contact, person, company, task, invoice, transaction, receipt, note, contract, event, location, property, place, feature_unit, release, agent_decision, agent_session, validation_result, codebase_entity, architectural_decision.

- **User-visible entity display rule:** When a turn creates or updates any Neotoma entities, the user-visible reply MUST include one Markdown table per affected entity. Each table MUST list every stored or changed property from the snapshot or store response except opaque internal identifiers: do not show `entity_id` or other machine-only id fields (e.g. raw `ent_*` hashes, internal UUIDs used only for API linkage). Use a two-column table (**Property** | **Value**). Property names MUST be human-readable: derive labels from field keys (e.g. snake_case to Title Case or short phrases—`entity_type` → Entity type, `turn_key` → Turn, `role` → Role). For `action`, label it Action and show created or updated clearly. Do not omit substantive fields to shorten the table. Show all affected entities; do not replace the tables with prose-only summary. This overrides the default "do not mention storage" rule, but do not narrate internal store sequencing.

- **Conventions:** Prefer **MCP** when available; otherwise use CLI direct commands. Avoid fetching authenticated user unless the next action needs it. **Pre-check before storing** (see "Pre-check before storing" section above): search for existing records by name/type before inserting to avoid duplicates; use existing entity_id for relationships if found. Include all fields from source when storing. **Structured vs unstructured path:** use the entities JSON array (`--json` or `--file`) for conversation- and tool-sourced data; omit `original_filename`. For turns that include attachments, send entities and file together in one `store` call when possible (`--json` + `--file-path` or `--file-content`). Omit user_id (inferred). After store, summarize entities and relationships. Do not repeat the same phrase as both thought and section heading. At session start, optionally run `neotoma --help` or check for update; if an update is available, prompt user to upgrade.

## When to load

Load when configuring or documenting agent behavior, or when choosing between MCP and CLI for Neotoma operations. Applied in Cursor, Claude Code, and Codex via `.cursor/rules/`, `.claude/rules/`, `.codex/` (project or user).

## Related documents

- `docs/developer/mcp/instructions.md` — MCP interaction instructions (use when MCP is available)
- `docs/specs/MCP_SPEC.md` — Action catalog and entity type rules
- `docs/foundation/what_to_store.md` — Canonical rubric for what facts are worth storing
- `docs/developer/agent_cli_configuration.md` — Agent CLI configuration and MCP/CLI strategy
- `docs/developer/cli_reference.md` — CLI command reference
