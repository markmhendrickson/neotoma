---
title: "agent_message — renamed to `conversation_message`"
summary: "As of Phase 2 of the message entity redesign (April 2026), the canonical entity type for chat turns is [`conversation_message`](../conversation_message/). The `agent_message` entity_type remains a registered alias so pre-v0.6 payloads co..."
---

# agent_message — renamed to `conversation_message`

As of Phase 2 of the message entity redesign (April 2026), the canonical entity type for chat turns is [`conversation_message`](../conversation_message/). The `agent_message` entity_type remains a registered alias so pre-v0.6 payloads continue to round-trip, but new writes resolve to `conversation_message` via the alias resolver in `src/services/interpretation.ts`.

Historical rows stored with `entity_type = 'agent_message'` are not automatically migrated. Run `neotoma migrate message-rename` (opt-in) to rewrite them to `conversation_message`; otherwise Read paths that filter by entity_type (e.g. `retrieve_entities --type conversation_message`) will only return rows written after the rename.

The JSON snapshots in this folder are kept for historical reference only; see the sibling `conversation_message/` folder for the current schema.
