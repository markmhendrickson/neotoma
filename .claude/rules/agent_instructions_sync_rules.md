---
description: "MCP/CLI instruction parity: when either mcp/instructions.md or cli_agent_instructions.md changes, apply equivalent change to the other."
globs: ["docs/developer/mcp/instructions.md", "docs/developer/cli_agent_instructions.md"]
---

<!-- Source: docs/developer/agent_instructions_sync_rules.mdc -->


# Agent Instructions Sync Rule

## Purpose

Ensures behavioral instructions stay in sync across the two agent instruction files. When either file is updated, the equivalent change must be applied to the other.

## Scope

The two files governed by this rule:

- `docs/developer/mcp/instructions.md` — loaded at runtime by `getMcpInteractionInstructions()` in `src/server.ts`; sent verbatim to MCP clients
- `docs/developer/cli_agent_instructions.md` — source of truth for CLI agent rules; applied to `.claude/rules/neotoma_cli.mdc`, `.claude/rules/`, and `.codex/` by `neotoma cli-instructions check`

Both files are organized under the same ten bracket-labelled sections in the same turn-lifecycle order: `[TURN LIFECYCLE]`, `[STORE RECIPES]` (+ subsections `user-phase`, `attachment`, `screenshot/image`, `chat details and fallbacks`), `[RETRIEVAL]`, `[PROVENANCE]`, `[TASKS & COMMITMENTS]`, `[ENTITY TYPES & SCHEMA]`, `[COMMUNICATION & DISPLAY]`, `[CONVENTIONS]`, `[ERRORS & RECOVERY]`, `[ONBOARDING]`. The anchor table below uses section-qualified rule names so each atomic rule maps 1:1 between the two files.

For the broader architectural touchpoints that surround instruction changes (OpenAPI spec updates, contract mappings, error envelopes, release discipline), see `docs/architecture/change_guardrails_rules.mdc`.

This rule does NOT cover:
- The auto-injected active-env section in `.claude/rules/neotoma_cli.mdc` (managed by CLI session startup)
- Per-tool descriptions in `docs/developer/mcp/tool_descriptions.yaml`
- Format differences between the two files (the MCP file uses a plain-text code block; the CLI file uses structured markdown sections; both use the same section labels)
- CLI-only operational sections in `docs/developer/cli_agent_instructions.md` preamble (`## CLI startup protocol`, `## Store command quick reference`, `## Relationship creation`, `## Pre-check before storing`, `## Retrieval command quick reference`) — these do not have MCP equivalents

## Trigger Patterns

Apply this rule whenever:
- Any behavioral instruction is added, changed, or removed in either file
- A new atomic rule is introduced in either file (add a new row to the table below)
- An atomic rule is split further or merged (update the matching rows in both files and adjust the table)
- Wording of an existing rule is corrected or clarified in one file

## Behavioral Sections That Must Stay in Parity

Each atomic rule below exists in both files with transport-appropriate wording. One row per atomic rule so individual mismatches are easy to spot in review. MCP anchors are bracket-labelled section lines in the fenced block of `docs/developer/mcp/instructions.md`; CLI anchors are markdown headings / bullet prefixes in `docs/developer/cli_agent_instructions.md`.

### [TURN LIFECYCLE]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 1 | Turn order (5 steps, do-not-respond-first) | `[TURN LIFECYCLE]` lead rule | `### [TURN LIFECYCLE]` → **Turn order (MANDATORY)** bullet |
| 2 | Step 1 — Bounded retrieval | `Step 1 — Bounded retrieval` | **Step 1 — Bounded retrieval** bullet |
| 3 | Step 2 — User-phase store | `Step 2 — User-phase store` | **Step 2 — User-phase store (MANDATORY in chat)** bullet |
| 4 | Step 3 — Other actions / host IDE tool exemption | `Step 3 — Other actions` | **Step 3 — Other actions** bullet |
| 5 | Step 4 — Compose reply | `Step 4 — Compose reply` | **Step 4 — Compose reply** bullet |
| 6 | Step 5a — Closing store shape | `Step 5a — Closing store shape` | **Step 5a — Closing store shape** bullet |
| 7 | Step 5b — Closing store relationship (PART_OF to same conversation) | `Step 5b — Closing store relationship` | **Step 5b — Closing store relationship** bullet |
| 8 | Step 5c — Closing store skip / forbidden clauses | `Step 5c — Closing store skip/forbidden` | **Step 5c — Closing store skip/forbidden** bullet |
| 9 | Rapid-fire / edit-heavy sessions (batch cadence, closing-store invariant) | `Rapid-fire and edit-heavy sessions` | **Rapid-fire and edit-heavy sessions** bullet |
| 10 | Backfill after persistence gap / /learn | `Backfill` | **Backfill** bullet |

### [STORE RECIPES]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 11 | No schema exploration (MUST NOT list/glob/read descriptor files) | `[STORE RECIPES]` lead rule | `### [STORE RECIPES]` → **No schema exploration** bullet |
| 12 | Relationship batching in one store request | `Relationship batching` | **Relationship batching** bullet |
| 13 | Turn identity (scoped `turn_key`, unique `conversation_id`) | `Turn identity` | **Turn identity** bullet |
| 14 | Fallback IDs when host has no conversation_id/turn_id | `Fallback IDs` | **Fallback IDs** bullet |

#### [STORE RECIPES] user-phase

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 15 | Shape (entities list, response indices) | `[STORE RECIPES] user-phase` → `Shape` | `#### [STORE RECIPES] user-phase` → **Shape (MCP)** + **Shape (CLI)** bullets |
| 16 | Relationships (PART_OF + REFERS_TO) | `Relationships` | **Relationships** bullet |
| 17 | Extraction (descriptive entity_type, no schema lookup) | `Extraction` | **Extraction** bullet |
| 18 | `idempotency_key` format | `idempotency_key:` | **idempotency_key** bullet |
| 18a | Human-readable chat naming (`agent_message.canonical_name`, `conversation.title`, and canonical-name scope) | `Naming` + `Canonical-name scope` | **Naming** + **Canonical-name scope** bullets |

#### [STORE RECIPES] attachment

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 19 | Step 1 — Parse by file type | `[STORE RECIPES] attachment` → `Step 1 — Parse` | `#### [STORE RECIPES] attachment` → **Step 1 — Parse** bullet |
| 20 | Step 2 — Extract (snake_case fields, no invention) | `Step 2 — Extract` | **Step 2 — Extract** bullet |
| 21 | Step 3 — Store (entities + file_path/file_content in one call) | `Step 3 — Store` | **Step 3 — Store (MCP)** + **Step 3 — Store (CLI)** bullets |
| 22 | Step 4 — EMBEDS (message→asset_entity_id) | `Step 4 — EMBEDS` | **Step 4 — EMBEDS (MCP)** + **Step 4 — EMBEDS (CLI)** bullets |

#### [STORE RECIPES] screenshot/image

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 23 | Screenshot/image extraction + store + EMBEDS | `[STORE RECIPES] screenshot/image` | `#### [STORE RECIPES] screenshot/image` → **When the user provides a screenshot or image** bullet |

#### [STORE RECIPES] chat details and fallbacks

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 24 | Overwriting between branches / SUPERSEDES / relationship types | `[STORE RECIPES] chat details and fallbacks` → `Overwriting between branches` | `#### [STORE RECIPES] chat details and fallbacks` → **Chat details** bullet |
| 25 | Fallback when inline relationships not supported | `Fallback when inline relationships are not supported` | **Fallback when inline relationships not supported** bullet |
| 26 | `create_relationship` quick reference (out-of-store targets) | `create_relationship quick reference` | Covered by **Relationship creation** preamble section + chat-details fallback bullet |

### [RETRIEVAL]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 27 | Proactive retrieval (after persistence, before reply) | (covered by `Step 1 — Bounded retrieval` and [RETRIEVAL] `Query shape`) | `### [RETRIEVAL]` → **Proactive retrieval** bullet |
| 28 | Query shape (identifier vs category) | `[RETRIEVAL]` → `Query shape` | **Query shape** bullet |
| 29 | Retrieval guardrails and answer grounding | `Guardrails and answer grounding` | **Retrieval guardrails and answer grounding** bullet |
| 30 | Publication-recency semantics | `Publication-recency` | **Publication-recency semantics** bullet |
| 31 | Data discovery preview (passive + active sources, tiers) | (not in MCP block; CLI-only expansion of onboarding bootstrap) | **Data discovery preview** bullet |
| 32 | Entity-type cardinality (getStats first) | `Entity-type cardinality` | **Entity-type cardinality** bullet |
| 33 | Bounded completeness pass | `Bounded completeness` | **Bounded completeness** bullet |

### [PROVENANCE]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 34 | Source provenance required (file: combined store; API: data_source + api_response_data) | `[PROVENANCE]` → `Source provenance (required)` | `### [PROVENANCE]` → **Source provenance (required)** bullet |
| 35 | Three-layer analysis of a named entity | `Three-layer analysis of a named entity` | **Three-layer analysis of a named entity** bullet |
| 36 | Reuse pre-existing sources (retrieve + link) | `Reuse pre-existing sources` | **Reuse pre-existing sources** bullet |
| 37 | Source content retrieval via `GET /sources/:id/content` | `Source content retrieval` | **Source content retrieval** bullet |
| 38 | Unstructured payload retention (host-only copies insufficient) | `Unstructured payload retention` | **Unstructured payload retention** bullet |
| 39 | Synthesized deliverables stored as structured entity | `Synthesized deliverables` | **Synthesized deliverables** bullet |
| 40 | Analysis/briefing durability (note/report/research entity) | `Analysis/briefing durability` | **Analysis/briefing durability** bullet |
| 41 | Session-derived chat artifacts (link provenance same turn) | `Session-derived chat artifacts` | **Session-derived chat artifacts** bullet |

### [TASKS & COMMITMENTS]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 42 | Base task rule (intent / obligation / future action) | `[TASKS & COMMITMENTS]` → `Base rule` | `### [TASKS & COMMITMENTS]` → **Base rule** bullet |
| 43 | Outreach / reply-drafting commitment task | `Outreach and reply-drafting` | **Outreach and reply-drafting** bullet |
| 44 | Scheduling cues in correspondence | `Scheduling cues in correspondence` | **Scheduling cues in correspondence** bullet |

### [ENTITY TYPES & SCHEMA]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 45 | Schema-agnostic for chat (descriptive entity_type, arbitrary fields) | `[ENTITY TYPES & SCHEMA]` → `Schema-agnostic for chat` | `### [ENTITY TYPES & SCHEMA]` → **Schema-agnostic for chat** + **Entity types (general)** bullets |
| 46 | Entity-type reuse check (singular/plural, synonyms, prefix variants) | `Entity-type reuse check` | **Entity-type reuse check** bullet |
| 47 | Schema evolution (`update_schema_incremental`, fields_to_remove) | `Schema evolution` | **Schema evolution** bullet |
| 48 | Entity-type consistency within a workflow | `Entity-type consistency within a workflow` | **Entity-type consistency within a workflow** bullet |
| 49 | Instruction scope (keep general / workflow-level; /learn) | `Instruction scope (for /learn and future edits)` | **Instruction scope** bullet |

### [COMMUNICATION & DISPLAY]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 50 | Silent storage default (+ memory-language confirmation exception) | `[COMMUNICATION & DISPLAY]` → `Silent storage default` | `### [COMMUNICATION & DISPLAY]` → **Silent storage default** bullet |
| 51 | Proactive storage (store first, then respond) | `Proactive storage` | **Proactive storage** bullet |
| 52 | External tool store-first | `External tool store-first` | **External tool store-first** bullet |
| 53 | User identity (store as contact/person same turn) | `User identity` | **User identity** bullet |
| 54 | Extract-all (people, tasks, events, …, places; container+asset EMBEDS) | `Extract-all` | **Extract-all** bullet |
| 55 | No-data bootstrap / onboarding discovery entry | (covered by `[ONBOARDING]` Discovery flow) | **No-data bootstrap and onboarding discovery** bullet |
| 56 | Display rule — section render (🧠 Neotoma heading + HR, bookkeeping carve-out) | `Display rule — section render` | **Display rule — section render** bullet |
| 57 | Display rule — groups (Created / Updated / Retrieved, non-empty only) | `Display rule — groups` | **Display rule — groups** bullet |
| 58 | Display rule — store disambiguation (store→Created/Updated, never Retrieved) | `Display rule — store disambiguation` | **Display rule — store disambiguation** bullet |
| 59 | Display rule — bullet format (emoji + label + (`entity_type`)) | `Display rule — bullet format` | **Display rule — bullet format** bullet |
| 60 | Display rule — empty state (Suggestions sub-section) | `Display rule — empty state` | **Display rule — empty state** bullet |
| 61 | Display rule — override scope (overrides silent-storage + no-emoji) | `Display rule — override scope` | **Display rule — override scope** bullet |
| 62 | Weekly value surfacing (first-of-day / returning user) | `Weekly value surfacing` | **Weekly value surfacing** bullet |

### [CONVENTIONS]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 63 | Transport precedence (neotoma vs neotoma-dev) | `[CONVENTIONS]` → `Transport precedence` | `### [CONVENTIONS]` → **Transport precedence** bullet |
| 64 | Avoid `get_authenticated_user` unless needed | `Avoid get_authenticated_user` | **Avoid fetching authenticated user** bullet |
| 65 | Pre-check before storing (duplicate avoidance) | `Pre-check before storing` | **Pre-check before storing** bullet |
| 66 | Include all fields from source | `Include all fields from source when storing` | **Include all fields from source** bullet |
| 67 | Structured vs unstructured path (when to include file, original_filename) | `Structured vs unstructured path` | **Structured vs unstructured path** bullet |
| 68 | Omit `user_id` (inferred) | `Omit user_id` | **Structured vs unstructured path** bullet (trailing clause) |
| 69 | CLI parity (`entities search` / `store` option aliases) | `CLI parity` | **CLI parity** bullet |
| 70 | CLI backup transport (prefer API transport when reconciling with MCP) | `CLI backup transport` | **CLI backup transport** bullet |
| 71 | Summarization after store (follow display rule) | `Summarization after MCP actions` | **Summarization after store** bullet |
| 72 | Update check at session start | `Update check` | **Update check** bullet |
| 72a | Duplicate repair on demand (list_potential_duplicates / `entities find-duplicates` → confirm → merge_entities; post-hoc only) | `Duplicate repair (on demand)` | **Duplicate repair (on demand)** bullet |
| 72b | User scope resolution for read verbs (`--user-id` flag > `NEOTOMA_USER_ID` env var > authenticated user; reject empty/whitespace env) | n/a (CLI-only; MCP infers `user_id` from auth) | **User scope (`--user-id` / `NEOTOMA_USER_ID`)** bullet |
| 72c | Ingest source transport (`file_path` for localhost; auto-upload `file_content` for non-localhost; `--source-upload` / `--source-content` force upload; CLI enforces ~7.5 MB upload cap) | n/a (CLI-only; MCP stores files via `store_structured` attachment recipe) | **Ingest source transport (`--source-upload` / `--source-content`)** bullet |
| 72d | Commit-mode store silent-failure guard: when `/store` returns `entities_created=0` with no resolved entities and `replayed != true`, CLI emits stderr warning (flatten `attributes`, check user scope, check schema). | n/a (CLI-only UX; MCP clients surface error envelopes directly) | **Silent-failure guard** bullet |

### [ERRORS & RECOVERY]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 73 | Store retry policy (retry once, surface error, do not silently skip) | `[ERRORS & RECOVERY]` → `Store retry policy` | `### [ERRORS & RECOVERY]` → **Store retry policy** bullet |
| 74 | SQLite corruption → `neotoma storage recover-db` flow | `SQLite corruption` | **SQLite corruption** bullet |
| 75 | `getStats` unreachable (state explicitly, no substitution) | `getStats unreachable` | **getStats unreachable** bullet |

### [ONBOARDING]

| # | Behavior | MCP anchor | CLI anchor |
|---|---|---|---|
| 76 | Discovery flow (8-step no-data bootstrap) | `[ONBOARDING]` → `Discovery flow` | `### [ONBOARDING]` → **Discovery flow** bullet |
| 77 | Output rule (Installation Aha: timeline with provenance first) | `Output rule (Installation Aha)` | **Onboarding output rule (Installation Aha)** bullet |
| 78 | Chat transcript discovery (ChatGPT/Slack/Claude/meeting exports) | `Chat transcript discovery` | **Chat transcript discovery** bullet |

## Agent Actions

### When modifying either file

1. **Identify the changed behavior** — find the matching atomic row (or rows) in the anchor table above.
2. **Locate the equivalent anchor in the other file** — use the MCP anchor / CLI anchor columns. If the change is a new atomic rule, add a new numbered row in the correct section of the table.
3. **Apply the equivalent change** — reword for the transport (MCP tool calls vs CLI commands) but preserve the behavioral intent exactly. Keep the section label and, when possible, the sub-rule label identical between files.
4. **Verify both files are updated before completing the task** — a row-level diff of the anchor table is the primary review aid.

### Wording conventions

The MCP file is a dense plain-text block inside one fenced code block (loaded by `getMcpInteractionInstructions()` and sent verbatim); the CLI file uses structured markdown with transport-branched wording (`**MCP:** ... **CLI:** ...`). Translate between them:

- MCP action names (`store_structured`, `create_relationship`) → CLI equivalents (`neotoma --servers=start store --json='...'`, `neotoma --servers=start relationships create ...`)
- MCP retrieval actions (`retrieve_entity_by_identifier`, `retrieve_entities`, `list_timeline_events`, `retrieve_related_entities`, `retrieve_graph_neighborhood`, `list_observations`) → CLI retrieval equivalents (`neotoma --servers=start entities search/list`, timeline/event query commands, `relationships list`, `observations list`)
- MCP `list_entity_types` → CLI `neotoma --servers=start schemas list --search <keyword>`
- MCP `npm_check_update` → CLI `neotoma --servers=start --help` / update notifier
- Inline `relationships: [...]` in MCP store → separate `relationships create` call in CLI (or inline `relationships` array via `neotoma store` when supported)
- MCP response path `structured.entities[N].entity_id` / `unstructured.asset_entity_id` → CLI response path `entities[N].entity_id` / file entity id printed by the store response

### Files to update

When `docs/developer/mcp/instructions.md` changes:
- Update `docs/developer/cli_agent_instructions.md` (source of truth for CLI)
- The `.claude/rules/neotoma_cli.mdc` Rule section is regenerated from the CLI source doc on next CLI session start or when `neotoma cli-instructions check` is run; if an immediate update is needed, run that command.

When `docs/developer/cli_agent_instructions.md` changes:
- Update `docs/developer/mcp/instructions.md`
- Run `neotoma cli-instructions check` to refresh `.claude/rules/neotoma_cli.mdc`, `.claude/rules/neotoma_cli.mdc`, and `.codex/neotoma_cli.md` (also any user-level applied paths).

## Constraints

- MUST update both files when behavioral instructions change in either one
- MUST keep the section-label order identical between files (ten labels: `[TURN LIFECYCLE]`, `[STORE RECIPES]` (+ subsections), `[RETRIEVAL]`, `[PROVENANCE]`, `[TASKS & COMMITMENTS]`, `[ENTITY TYPES & SCHEMA]`, `[COMMUNICATION & DISPLAY]`, `[CONVENTIONS]`, `[ERRORS & RECOVERY]`, `[ONBOARDING]`)
- MUST NOT change the behavioral intent when translating between transports — only the commands differ
- MUST NOT add CLI-specific operational sections (e.g. `--servers=start` protocol, `--json=` syntax warning, active-env block, `## Store command quick reference`, `## Relationship creation`, `## Pre-check before storing`, `## Retrieval command quick reference`) to `mcp/instructions.md`
- MUST NOT add MCP-specific internals (e.g. `source_index`/`target_index` for inline relationships, `file_content+mime_type` parameter names, `unstructured.asset_entity_id` paths) to the CLI file beyond what is needed for behavioral equivalence
- MUST add or update rows in the anchor table above when atomic rules are added, split, merged, or removed
- MUST verify both files are updated before marking the task complete

## Related Documents

- `docs/developer/mcp/instructions.md` — MCP instruction source
- `docs/developer/cli_agent_instructions.md` — CLI instruction source
- `.claude/rules/neotoma_cli.mdc` — applied CLI rule file (auto-updated by CLI session startup or `neotoma cli-instructions check`)
- `docs/developer/agent_cli_configuration.md` — CLI/MCP strategy overview
