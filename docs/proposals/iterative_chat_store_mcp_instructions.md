---
title: "Iterative Chat Store via MCP Instructions"
status: "in_progress"
source_plan: "chat_review_neotoma_store_command_7681eed3.plan.md (ateles)"
migrated_date: "2026-02-17"
priority: "p2"
estimated_effort: "MCP instruction and tool-description updates; optional conversation/turn entity schema and store flow."
---

# Iterative Chat Store via MCP Instructions

## Implementation status (Option A)

Option A implemented 2026-02-17: iterative chat store instructions added to `docs/developer/mcp/instructions.md`, `store` and `store_structured` descriptions updated in `docs/developer/mcp/tool_descriptions.yaml`, and fallback instructions synced in `src/server.ts`. Option B (conversation/turn contract) and Option C (unstructured turn envelope) remain for future work.

## Proposal Context

**Source:** Akin to the ateles Cursor command plan `chat_review_neotoma_store_command_7681eed3.plan.md` (review chat, preview, confirm, then store conversation + messages + attachments in Neotoma), but **iterative**: store the chat and each turn as the agent makes each turn, so the user does not have to manually run an "end of chat" command.

**Relevance:** Users and agents benefit from conversation and turn data in Neotoma for recall, audit, and downstream workflows. An end-of-session command is easy to forget and creates a single point of failure; iterative storage removes that dependency.

**Architecture Alignment:** Complements existing proactive-storage MCP instructions and structured/unstructured store paths. Does not require raw-first ingestion; can work with current store API.

---

## Additive Behavior: Structured and Unstructured Data Per Turn

Implementing iterative chat store **adds** conversation and turn structure; it does **not** replace existing storage behavior. The agent continues to store all of the following in the same turn:

| What | How | Unchanged by this proposal? |
|------|-----|-----------------------------|
| **Raw chat history** | Conversation entity + agent_message (or equivalent) per turn, with relationships using Neotoma’s supported types only (e.g. message PART_OF conversation; see relationship types in MCP spec). | **New:** this is what we add. |
| **Structured data from the turn** | Entities extracted from the message (people, tasks, events, contacts, locations, etc.) via `store` / `store_structured`. Existing instructions already say: "Extract and store all relevant entities... Store first, then respond." | **Unchanged.** Agent still stores structured entities from each turn. |
| **Unstructured data from the turn** | (1) Attachments: files the user or agent references; stored via unstructured path (`file_content` + `mime_type` or `file_path`), then linked (e.g. EMBEDS) to the message or conversation. (2) Option C only: the turn itself as an unstructured envelope (`application/x-neotoma-conversation-turn`) for full provenance. | **Unchanged** for attachments; **optional addition** for turn envelope. |

So after implementation, in each turn the agent will:

1. **Create or update the conversation** and **store the current turn** as an agent_message linked to it (the new iterative-chat-store behavior).
2. **Continue to extract and store structured entities** from the turn (contacts, tasks, events, etc.) and create relationships as today.
3. **Continue to store any attachments** via the unstructured path and link them (e.g. EMBEDS) to the message or conversation.
4. **Optionally** store the turn as an unstructured envelope for provenance (if Option C is adopted).

No existing instruction that tells the agent to "store entities from the conversation" or "store attachments" is removed or weakened.

---

## Comparison: Raw-First Ingestion vs Iterative Chat Store

| Aspect | Raw-First Ingestion Architecture | Iterative Chat Store (this proposal) |
|--------|----------------------------------|-------------------------------------|
| **Primary goal** | Decouple ingestion from interpretation: store raw bytes first, interpret and curate later. Reduce schema friction and failure modes at ingest. | Persist the **conversation and each turn** in Neotoma as the chat progresses, without requiring a manual "store chat" command at the end. |
| **Trigger** | User/agent uploads a file or submits content; ingest runs at submission time. | Each agent turn (or each user+agent exchange): agent stores conversation + current turn (and optionally prior turns not yet stored). |
| **What gets stored** | Raw bytes (any type), then interpretations, then curated truth. Focus on **content** and **provenance chain**. | **Conversation** entity, **agent_message** (or equivalent) per turn, attachments, relationships using supported types only (PART_OF for message→conversation, EMBEDS for attachments). Focus on **session structure** and **turn-level artifacts**. |
| **User interaction** | None required for raw ingest; optional for curation. | None required; storage is proactive and iterative. Contrast with ateles command: preview → user confirms → then store once. |
| **MCP surface** | New or revised tools: `ingest`, `interpret`, `curate`, `ingest_structured`. | No new tools required for MVP: **MCP instructions** (and optionally tool descriptions) updated to tell agents to create/update a **conversation** and store **each turn** (and attachments) as they go. |
| **Complements** | Iterative chat store can use raw-first later: e.g. store each turn as raw, then interpret. | Raw-first can absorb "turn as unstructured blob" (see all-storage-unstructured plan) so iterative store could write turn envelopes into raw layer. |
| **Determinism** | Ingestion is deterministic (hash-based); interpretation and curation are explicit. | Store calls are deterministic per idempotency; conversation and message entities are explicit. |

**Summary:** Raw-first is about **how** ingestion works (raw → interpret → curate). Iterative chat store is about **when** and **what** to store (conversation + turns, as you go). They are orthogonal and can be combined.

---

## Relationship to Ateles Chat Review Store Command

The ateles plan defines a **command** `/review_chat_store_neotoma` that:

1. Parses the full chat in context and builds a preview (conversation, messages, attachments, Parquet migration).
2. Displays the preview and **waits for user confirmation** (or revision).
3. On confirmation, stores conversation, messages, attachments, and runs migration.

**This proposal** keeps the same **target state** (conversation + messages + attachments in Neotoma) but changes the **flow**:

- **No single "end of chat" command.** The agent is instructed to store the conversation and each turn **as it makes each turn** (or at a defined cadence, e.g. after each user message).
- **No mandatory preview/confirm** for the whole chat; storage is incremental. Optional: allow a "preview/confirm for this turn" or "do not store this turn" via user preference or instruction.
- **Parquet migration** can remain a separate, explicit step (e.g. same command or a different one) when the user wants it; it is not required for iterative conversation storage.

---

## Proposed MCP Instruction Additions (Iterative Chat Store)

Add or extend instructions so that agents:

1. **Create or update a conversation entity** at the start of a session (or when first storing in that chat), and link it to the session/thread identifier used by the client.
2. **After each assistant turn**, store that turn as an **agent_message** (or equivalent) entity linked to the conversation (relationship: **message PART_OF conversation**; use only Neotoma-supported relationship types), and store any new attachments referenced in the turn.
3. **Use a stable conversation_id** (e.g. from client context or generated once per chat) so all turns in the same chat attach to the same conversation.
4. **Do not wait for the user to say "save" or run a command;** perform this storage in the same turn as the response, when the agent has the conversation and latest message in context.

Optional refinements:

- **Batching:** If the client does not expose full history each turn, instruct the agent to store "since last stored" (e.g. delta) when history is available.
- **Unstructured turn artifact:** If the "conversation-turn envelope" (see `.cursor/plans/all-storage-unstructured_provenance_df0b7a8f.plan.md`) is implemented, instruct agents to store each turn as that envelope (unstructured) for full provenance, in addition to or instead of structured message entities.
- **User opt-out:** Document a way for the user to disable iterative chat storage (e.g. "do not store this conversation" or a client setting) so agents can skip conversation/turn store when requested.

---

## Implementation Options

### Option A: Instructions and tool descriptions only (minimal)

- **Update** `docs/developer/mcp/instructions.md`: add a short block (e.g. 2–4 bullets) for iterative conversation and turn storage as above.
- **Update** `docs/developer/mcp/tool_descriptions.yaml` (and any in-code descriptions): mention that `store` / `store_structured` should be used to persist conversation and agent_message entities each turn when in a chat context.
- **No schema or server changes.** Relies on existing entity types (e.g. conversation, agent_message) and relationships if they exist; otherwise agents store with descriptive types and the system infers schema.

### Option B: Instructions + conversation/turn contract

- Same as Option A, plus:
- **Define** a small contract (in MCP_SPEC or vocabulary): conversation entity (minimal fields: e.g. conversation_id, title or placeholder, turn_count), agent_message (turn_number, role, content truncation, optional attachment refs), and relationship types using only Neotoma’s supported set (PART_OF for message→conversation, REFERS_TO for conversation/message→topic, EMBEDS for attachments, SUPERSEDES for reverted turns). No custom types (e.g. "contains_message"); use PART_OF and optionally a mapping layer for display labels.
- **Optional:** Add a dedicated MCP action (e.g. `store_conversation_turn`) that accepts conversation_id, turn payload, and attachment refs and creates conversation + message + relationships in one call. Reduces instruction complexity and keeps behavior consistent.

### Option C: Iterative + unstructured turn envelope

- Same as Option B, plus:
- **Adopt** the conversation-turn envelope from the all-storage-unstructured plan (`application/x-neotoma-conversation-turn`): agent stores each turn as that unstructured blob (with turn_id, conversation_id, content, attachment_source_ids) so Neotoma keeps the raw artifact and runs interpretation server-side.
- Instructions tell agents to store **both** (a) the turn as unstructured envelope (for provenance) and (b) structured conversation + agent_message (for query and UX), or only one path depending on product choice.

---

## Reverts and chat forks (follow-on proposal)

Option A does not define turn identity, idempotency for messages, or branch/fork semantics. Reverts and forks are therefore best-effort: duplicate messages, mixed branches, or inconsistent dedupe can occur. A separate proposal covers the fix: **`docs/proposals/conversation_turn_identity_reverts_forks.md`** (conversation turn identity, idempotency_key convention, and handling reverts/forks when the MCP host exposes branch_id/turn_id).

---

## What's In Scope

- MCP instruction and tool-description changes to encourage iterative storage of conversation and turns.
- Optional: lightweight contract for conversation and agent_message entities and relationships.
- Optional: dedicated `store_conversation_turn`-style action or use of unstructured turn envelope.

## What's Out of Scope

- Changing raw-first ingestion architecture (separate proposal).
- Changing interpretation or curation flow (separate proposals).
- Parquet migration (can stay as a separate command or step).
- Mandatory preview/confirm UI for each turn (can be a later opt-in).

---

## Success Criteria

- Agents using Neotoma MCP store conversation and each turn as the chat progresses, without the user running an end-of-chat store command.
- A single conversation entity is reused for the whole chat; turns are linked to it.
- Attachments referenced in turns are stored and linked using supported relationship types (EMBEDS). Message→conversation uses PART_OF; no custom types (see `conversation_turn_identity_reverts_forks.md` for relationship-type alignment).
- **Structured and unstructured storage per turn is unchanged:** agents still store extracted entities (people, tasks, events, etc.) and attachments from each turn in addition to the conversation and message structure.
- User can opt out of iterative chat storage when desired (documented or configurable).

---

## References

- Raw-first ingestion: `docs/proposals/raw-first-ingestion-architecture.md`
- Ateles chat review store command: `../ateles` / `~/.cursor/plans/chat_review_neotoma_store_command_7681eed3.plan.md`
- All-storage-unstructured (turn envelope): `.cursor/plans/all-storage-unstructured_provenance_df0b7a8f.plan.md`
- MCP instructions: `docs/developer/mcp/instructions.md`
- MCP spec: `docs/specs/MCP_SPEC.md`
