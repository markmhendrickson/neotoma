# Chat transcript ingestion

## Purpose

Chat transcripts are one of the highest-value ingestion sources for Neotoma. They encode decision flow, commitments, task assignments, negotiations, evolving ideas, and references to external artifacts -- with natural timestamps and entity references. This document covers supported formats, parsing approach, entity extraction, and UX guidelines for transcript import.

## Why transcripts matter

Most file types contain moderate informational density. Chat transcripts are different because they naturally encode:

- **Decisions** -- explicit choices made during conversations
- **Commitments** -- promises, deadlines, action items
- **Causal sequences** -- how one decision led to another
- **Entity references** -- people, projects, clients mentioned by name
- **Timestamps** -- when each exchange happened

This makes transcripts ideal for Neotoma's state model. A single conversation can produce multiple timeline events, entity references, and relationship links.

Example from a conversation:

```
Feb 12 -- Client asked for pricing revision
Feb 15 -- Sent revised proposal
Feb 18 -- Client agreed to updated scope
```

This is already a timeline of state evolution, extracted from a single conversation thread.

## Supported formats

### ChatGPT export (JSON)

ChatGPT data exports (Settings > Data controls > Export) produce a `conversations.json` file containing all conversations with messages, timestamps, and metadata.

**Structure:** Array of conversation objects, each containing an array of messages with `author.role`, `content.parts`, and `create_time`.

**What to extract:** Messages with timestamps, author roles (user/assistant), decision points, entity references, commitments.

### Claude conversation history

Claude exports conversations as markdown or structured text. When using the Claude Memory tool, files under `/memories` may also contain conversation-derived context.

**What to extract:** Messages with role attribution, entity references, decisions, and any structured memory entries.

### Slack exports

Slack workspace exports produce a directory structure with JSON files per channel per day.

**Structure:** `channel_name/YYYY-MM-DD.json` with message arrays containing `user`, `text`, `ts` (Unix timestamp).

**What to extract:** Messages with timestamps, user attribution, channel context, thread structure, entity references (people, projects, links).

### Discord exports

Discord data packages contain JSON message archives per channel.

**Structure:** Similar to Slack -- messages with `author`, `content`, `timestamp`.

**What to extract:** Messages with timestamps, author, entity references, decision language.

### Meeting transcripts

Meeting transcripts from Otter.ai, Zoom, Google Meet, or similar tools. Common formats: VTT, SRT, TXT, or markdown with speaker labels and timestamps.

**What to extract:** Speaker-attributed statements, timestamps, decision language, action items, entity references.

### Generic markdown/text transcripts

Any markdown or text file that contains timestamped conversation content with speaker labels.

**What to extract:** Messages with timestamps (if present), speaker attribution, entity references, decision and commitment language.

## Ingestion workflow

### Agent-driven flow (recommended)

During onboarding or normal conversation, the agent suggests transcript ingestion when relevant:

```
I detected that you may have chat transcripts available from AI tools or
messaging platforms. These can contain high-value context such as decisions,
commitments, and project discussions.

Would you like to import any of the following?
- ChatGPT export (conversations.json)
- Slack channel exports
- Claude conversation history
- Meeting transcripts
```

### CLI flow

```bash
neotoma ingest-transcript <path> [options]

Options:
  --source <type>    Source platform: chatgpt, claude, slack, discord, meeting, other
  --preview          Show extracted entities and timeline before storing
  --limit <n>        Process only the N most recent conversations
  --filter <term>    Only process conversations containing this term
```

### Processing pipeline

1. **Parse** -- Read the transcript file and extract messages with timestamps, authors, and content
2. **Segment** -- Group messages into logical conversation threads (by channel, date, or topic)
3. **Extract entities** -- Identify people, companies, projects, and other named entities from message content
4. **Extract events** -- Identify decisions, commitments, deadlines, and other timestamped events
5. **Preview** -- Show the user what was detected before storing
6. **Store** -- Create observations with provenance linking back to the source transcript

### Storage model

Each transcript produces:

- **Source** -- The raw transcript file, stored via the unstructured path with provenance
- **Observations** -- Individual facts extracted from messages, each with:
  - `source_type`: the platform (chatgpt, slack, claude, etc.)
  - `timestamp`: when the message was sent
  - `author`: who said it
  - `content`: the message text
- **Entities** -- People, companies, projects detected across messages
- **Timeline events** -- Decisions, commitments, milestones extracted from content
- **Relationships** -- REFERS_TO links from messages to entities, PART_OF links from messages to conversations

## UX guidelines

### Explain the benefit

Users will only grant access to transcripts if they understand the value. Frame it clearly:

```
Chat transcripts are often one of the best sources for reconstructing
timelines of decisions and commitments. Importing them allows Neotoma
to reconstruct project evolution, client commitments, and design decisions.
```

### Always preview before storing

After parsing, show the user what will be stored:

```
Detected possible entities:
- Acme Corp (mentioned 12 times across 3 conversations)
- Neotoma developer release (mentioned 8 times)
- Zurich insurance contract (mentioned 5 times)

Possible timeline events:
- Feb 12 -- pricing discussion (ChatGPT conversation)
- Feb 15 -- proposal revision (Slack #acme channel)
- Feb 18 -- contract confirmation (ChatGPT conversation)
```

### Scoped confirmation

Let the user choose:
- Import all detected conversations
- Import specific conversations or channels
- Import only conversations mentioning specific entities
- Skip transcript import entirely

### Privacy constraints

- All transcript ingestion is local-first and user-approved
- No automatic platform scraping
- No full ingestion without preview
- Transcripts produce structured events, not raw vector documents
- Sensitive conversations can be excluded at any point

## What not to do

- **No automatic platform scraping** -- respect platform terms and user privacy
- **No full ingestion without preview** -- users must see what will be processed
- **No treating chats as raw vector documents** -- Neotoma extracts structured events, not embeddings
- **No storing without provenance** -- every extracted fact must link to its source message

## Related documents

- [`install.md`](../../install.md) -- agent install workflow (Stage 3 covers transcript discovery)
- [`docs/developer/agent_onboarding_confirmation.md`](agent_onboarding_confirmation.md) -- full onboarding flow
- [`docs/foundation/what_to_store.md`](../foundation/what_to_store.md) -- storage decision rubric
- [`docs/foundation/file_ranking_heuristic.md`](../foundation/file_ranking_heuristic.md) -- file scoring (transcripts rank #1)
