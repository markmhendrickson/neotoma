---
title: Inspector — Conversations
summary: View stored conversation entities and the messages, agents, and references they include.
category: development
subcategory: ui
order: 70
audience: developer
visibility: public
tags: [inspector, conversations]
---

# Inspector — Conversations

The Conversations screen (`/inspector/conversations`) is a specialized view
over the `conversation` and `conversation_message` entity types.

## What you see

- **Conversation list.** Filterable by harness, repository, agent, and time
  range. Each row shows title, message count, and last-seen time.
- **Conversation detail.** Messages in chronological order, with role
  (user/assistant), sender kind, and outgoing `REFERS_TO` relationships to
  entities extracted from the turn.
- **Attachments.** Files, images, and other media linked to messages.

## Why this exists

Conversations are how Neotoma binds an agent turn to the entities it touched,
making per-turn provenance recoverable later. The MCP `store` workflow always
emits a `conversation` entity plus a `conversation_message` per role, with a
`PART_OF` edge from each message to the conversation. The Inspector view is
the human-readable surface for that subsystem.

## Related

- `docs/subsystems/conversations.md`
- `docs/developer/mcp/instructions.md` — the turn lifecycle protocol agents follow.
