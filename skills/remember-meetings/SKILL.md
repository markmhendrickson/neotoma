---
name: remember-meetings
description: Import meeting transcripts and extract decisions, action items, attendees, and commitments into persistent memory.
triggers:
  - remember my meetings
  - import meeting notes
  - save meeting transcript
  - import meeting transcripts
  - remember meetings
  - meeting memory
  - import zoom transcript
  - import otter notes
---

# Remember Meetings

Ingest meeting transcripts and extract structured entities — decisions, action items, attendees, and commitments — into Neotoma memory with full provenance.

## When to use

When the user has meeting transcripts (from Zoom, Otter, Google Meet, or manual notes) and wants to capture the decisions, action items, and participants in durable memory.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Supported formats

| Format | Extension | Source |
|--------|-----------|--------|
| WebVTT | `.vtt` | Zoom, Google Meet |
| SubRip | `.srt` | Zoom, various |
| Plain text | `.txt` | Otter, manual |
| Markdown | `.md` | Manual, meeting notes apps |
| JSON | `.json` | Structured exports |

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Identify transcripts

1. Ask the user for the transcript file(s) or directory.
2. Detect the format from the file extension.
3. If a calendar MCP is available, optionally cross-reference with calendar events to enrich metadata (meeting title, attendees, time).

### Phase 2: Parse and preview

1. Read each transcript file.
2. Parse speaker turns, timestamps, and content.
3. Present a preview: meeting date, duration, participants detected, key topics.
4. Ask the user to confirm before processing.

### Phase 3: Extract entities

For each meeting:

1. **Event**: create a meeting event entity with title, date, duration, attendees.
2. **Contacts**: extract attendees as contacts (name, role if mentioned).
3. **Decisions**: identify conclusions, agreements, choices made during the meeting.
4. **Tasks**: extract action items with assignee, description, and deadline if stated.
5. **Notes**: capture key discussion points that don't fit other entity types.

Set `source_file` to the transcript filename. Include `source_quote` on each extracted entity with the verbatim transcript snippet that supports it.

### Phase 4: Store with provenance

Use the combined store path — entities array plus `file_path` for the raw transcript — in a single `store` call so the original transcript is preserved as a source.

Link all extracted entities to the meeting event via REFERS_TO. Link the file to the user message via EMBEDS.

### Phase 5: Report results

Summarize:
- Meetings processed
- Entities extracted by type (decisions, tasks, contacts)
- Key action items with owners
- Offer to set reminders for tasks with due dates.

## Do not

- Process transcripts without user confirmation.
- Invent entities not supported by the transcript content.
- Skip the raw transcript file preservation — always use the combined store path.
