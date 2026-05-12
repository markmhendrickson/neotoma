---
name: remember-conversations
description: Import chat history from ChatGPT exports, Claude history, Slack archives, or shared conversation URLs into persistent memory.
triggers:
  - remember my conversations
  - import chat history
  - save my chats
  - import chatgpt history
  - import claude conversations
  - import slack messages
  - remember conversations
  - conversation memory
---

# Remember Conversations

Import conversation history into Neotoma memory. Supports ChatGPT JSON exports, Claude history files, Slack archive exports, and shared conversation URLs.

## When to use

When the user wants to persist past AI conversations, chat transcripts, or messaging archives into durable memory — preserving decisions, commitments, and context that would otherwise be lost.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Supported sources

| Source | Format | Method |
|--------|--------|--------|
| ChatGPT | JSON export (`conversations.json`) | File read |
| Claude | Conversation history files | File read |
| Slack | Archive export (ZIP with JSON channels) | File read |
| Shared URLs | ChatGPT/Claude share links | Web scraper MCP or fetch |
| Meeting transcripts | VTT, SRT, TXT, MD files | File read |

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Identify source

1. Ask the user what to import:
   - ChatGPT export file path
   - Claude conversation history directory
   - Slack export archive path
   - A shared conversation URL
   - A transcript file
2. Detect the format from the file extension or content structure.

### Phase 2: Parse and preview

1. Read the file or fetch the URL.
2. Parse conversations into a structured list: title, date, message count, participants.
3. Present a preview: total conversations, date range, highlights.
4. Ask the user to confirm which conversations to import (all, or selected by title/date).

### Phase 3: Extract entities

For each conversation:

1. Store the conversation as a `conversation` entity with title and date.
2. Store each substantive message as a `conversation_message` entity linked via PART_OF.
3. Extract embedded entities:
   - **Decisions**: conclusions, choices, architectural decisions
   - **Tasks**: commitments, action items, follow-ups
   - **Contacts**: people mentioned or participating
   - **Events**: scheduled meetings, deadlines
4. Set `source_file` to the original filename for file-based imports.
5. Use the combined store path (entities + file) so the raw export is preserved as a source.

### Phase 4: Reconstruct timeline

After importing, reconstruct a timeline of key events from the conversations:
- Decisions made (with date and conversation source)
- Tasks committed to (with assignee and deadline if available)
- People involved (with context of the relationship)

Present the timeline to the user with provenance: each event traced to a specific conversation and message.

### Phase 5: Report results

Summarize:
- Conversations imported
- Entities extracted by type
- Timeline events reconstructed
- Offer follow-up queries ("What decisions did I make about X?")

## Do not

- Import without user confirmation.
- Store raw conversation content in chat replies beyond what answering requires.
- Create duplicate conversation entities — check by title and date before storing.
