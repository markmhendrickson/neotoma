---
name: store-neotoma
description: Review chat, preview exact Neotoma payloads, then store conversation, dual agent_message rows per turn (user + assistant, PART_OF conversation), and attachments after user confirmation.
triggers:
  - store_neotoma
  - /store_neotoma
  - store chat in neotoma
  - persist chat to neotoma
  - review and store conversation
---

# store-neotoma

## Purpose

Define the workflow for reviewing chat, building a Neotoma store preview, and executing storage after user confirmation. Neotoma is the only data store; there is no Parquet migration phase.

**Canonical location:** `foundation/.cursor/skills/store-neotoma/SKILL.md` (foundation git submodule). Consumer repos may symlink or copy this into `.cursor/skills/store-neotoma/` via `setup_cursor_copies` / `setup_cursor_rules`.

## Scope

Applies when the user asks to store the current chat in Neotoma. Covers preview, user revisions, confirmation, storage, and relationships. Excludes one-off store operations without preview.

Reviews the current chat conversation, builds a preview of records to store in Neotoma, waits for user confirmation (or revision input), then stores conversation, **two `agent_message` entities per logical turn** (`role: "user"` and `role: "assistant"`), each with `PART_OF` → conversation — the canonical shape from Neotoma MCP live chat instructions — plus attachments.

Preview-before-execute: On first run, this workflow MUST preview what will be stored and MUST NOT execute storage until the user confirms. User input (corrections, scope changes, exclusions) MUST be applied to revise the preview.

## Prerequisites

- Chat transcript available in agent context (user and agent messages).
- Neotoma MCP available.
- Load `.cursor/rules/conversation_tracking.mdc` and `.cursor/rules/neotoma_access_policy.mdc` for entity schemas and access rules. `conversation_tracking` defines dual-message + `PART_OF`; do not use merged `role_user`/`role_agent` on a single `agent_message`.

## Phase 0: Preview (MANDATORY — Execute First)

### Step 0.1 — Extract and build preview

Parse all user and agent messages in the conversation. For each **logical turn** (user message + following assistant reply):

- **User row (preview + store):** `entity_type: agent_message`, `role: "user"`, `content` = exact user text, `turn_key` (stable per turn), optional `turn_number` (1-based), `timestamp`, `files_modified`, `tools_used`, `platform`, `model`, `neotoma_operations` (inferred from the turn).
- **Assistant row (preview + store):** `entity_type: agent_message`, `role: "assistant"`, `content` = exact assistant text shown in chat, `turn_key` e.g. same base + `:assistant`, optional same `turn_number` / `timestamp` for sorting.
- Topics: extract from user questions, entity types discussed, file paths, domain keywords (finance, admin, health, work).
- Decisions: extract when agent states an approach, user confirms a choice, or implementation strategy is chosen.
- Action items: tasks to create, follow-ups mentioned.
- `files_modified`: file paths from tool calls, @-mentions, or explicit file references (typically attributed to the **user** message for that turn).
- `neotoma_operations`: inferred from agent tool-call patterns (`store_structured`, `correct`, `create_relationship`).

Identify attachments. All of the following must be included:
- User-uploaded files (images, screenshots, files attached or pasted in any message, including turn 1). Use whatever path or content the platform provides.
- @-mentioned file paths.
- Attachment references and file URLs in message text.

Build preview structure:

- Conversation: full payload with every property and exact value to be stored (see Step 0.2).
- Messages: **two** exact `agent_message` payloads per turn (user and assistant), each with every property and exact value to be stored, plus distinct `idempotency_key` / `turn_key` per row. Include `PART_OF` targets (conversation `entity_id` after conversation is created).
- Attachments: list of files to store with path, type, and any store payload (`file_path` or `file_content`).
- Derived entities (optional): tasks, contacts, events, transactions, notes, or other entity types the turn implies. Show exact raw payloads for user approval.

### Step 0.2 — Display preview

Show structured preview to the user with clear sections. Include tables with the exact properties and exact raw values of every structured object that will be sent to Neotoma, so the user can approve precise payloads before proceeding.

Required sections:
1. Conversation entity (exact payload).
2. Agent_message entities (exact payloads — **pairs** per turn: user then assistant).
3. Attachments (all user-uploaded files, @-mentioned paths, file URLs).
4. Relationships to create.
5. Derived entities (exact payloads for any non-chat entities implied by the conversation).

End the preview with:
- Confirm to proceed, or provide input to revise.
- Revisions can include exclusions, title/topics changes, and "how to store" preferences (field names, exclusions, formats).

### Step 0.3 — Wait for user response

- If user confirms ("proceed", "confirm", "yes", "go ahead", or equivalent): proceed to Phase 1. If the user previously provided "how to store" input, retain it for post-store neotoma-learn.
- If user provides input: apply it to preview and/or payloads:
  - Exclude turns (e.g. "skip turn 3").
  - Change title or topics.
  - Add or remove derived entities.
  - Correct any field.
  - How to store (e.g. "use conversation_id without date prefix", "store topics as JSON string"). Do not request reverting to merged single-row `role_user`/`role_agent`; dual messages are canonical.
- Re-display the revised preview (including updated exact payload tables), then wait again.
- Repeat until user confirms.

## Phase 1: Storage (After Confirmation)

### Step 1.1 — Create conversation entity

Generate `conversation_id` if not yet final. Store via Neotoma MCP:

- `entity_type: conversation`
- `conversation_id`, `title`, `turn_count`, `start_timestamp`, `last_updated`
- `topics`, `decisions`, `action_items`
- `platform: cursor`, `status: active`, `summary`

Use `store_structured` (or equivalent MCP action).

### Step 1.2 — Create agent_message entities per turn (dual rows)

For each turn (respecting exclusions from preview), create **two** stored messages linked to the **same** conversation:

1. **User message:** `entity_type: agent_message`, `role: "user"`, `content` (full text), `turn_key`, optional `turn_number`, `timestamp`, `files_modified`, `tools_used`, `platform`, `model`, `neotoma_operations` as previewed.
2. **Assistant message:** `entity_type: agent_message`, `role: "assistant"`, `content` (full text), `turn_key` (distinct from user row), optional same `turn_number` / `timestamp`.

Store via Neotoma MCP (`store_structured`), batching multiple entities and `relationships` in one request when supported. For each row, ensure **`PART_OF` from that `agent_message` → conversation** (conversation `entity_id` from Step 1.1 response). Use **distinct** `idempotency_key` values per message (e.g. suffix `-user` / `-assistant` per turn).

### Step 1.3 — Handle attachments

For each file in the attachments list with an accessible path:

- Store file via Neotoma using `file_path` (or `file_content` if required).
- Create image/media entity if file is an image.
- Attempt `create_relationship(EMBEDS, user_agent_message_entity_id, file_entity_id)` for attachments on the user turn (or conversation-level link if turn-level linking is unavailable).
- If EMBEDS fails (known issue), log and continue.

### Step 1.4 — Create relationships

- For **each** `agent_message` (user and assistant): `create_relationship(PART_OF, agent_message_entity_id, conversation_entity_id)` if not already created in the same batched `store_structured` call.
- For tasks, contacts, projects, execution plans, and other discussed entities: `conversation --[REFERS_TO]--> entity`, or `agent_message --[REFERS_TO]--> entity` for turn-level links.

### Step 1.5 — If user provided "how to store" input: invoke neotoma-learn skill

- If during Phase 0 the user provided input on how to store objects (field renames, exclusions, format preferences), after Phase 1 invoke the `neotoma-learn` skill with that input as the scenario/description (for example "When storing conversation from /store_neotoma: use conversation_id without date prefix"). Do not use neotoma-learn to undo dual-message storage; that shape is canonical.
- If the user gave no "how to store" input, skip this step.

## Output and Reporting

After execution, report:
- Storage summary: `conversation_id`, **agent_message count** (expect ~2× turn count when both sides exist), attachments stored, relationship count, derived entity count.
- Per `.cursor/rules/persistence.mdc`, show stored entities via retrieve/list observation actions where relevant.
- Render the mandatory `🧠 Neotoma` turn report per `.cursor/rules/neotoma_turn_lifecycle.mdc`.

## Error Handling

- Neotoma MCP failures: retry once, then report and continue where possible.
- EMBEDS relationship failure: log and continue.

## References

- `execution/scripts/migrate_neotoma_chat_dual_messages.py` — One-off migration for legacy merged `role_user`/`role_agent` rows and inverted `PART_OF` edges; use `--cli` with the `neotoma` binary when HTTP bearer is rejected (dry-run by default, `--execute` to apply). Path is relative to repos that include `execution/` (e.g. ateles); omit or locate equivalent in other layouts.
- `.cursor/rules/conversation_tracking.mdc` — Entity model and fields.
- `.cursor/rules/neotoma_access_policy.mdc` — Canonical Neotoma-only access rules.
- `.cursor/rules/neotoma_turn_lifecycle.mdc` — Turn lifecycle and turn report contract.
- `.cursor/rules/confirmation_requirements.mdc` — Preview/confirm pattern.
- `.cursor/skills/neotoma-learn/SKILL.md` — Update Neotoma MCP instructions after user provides "how to store" input (repo-local skill where present; not bundled in foundation-only checkouts).
