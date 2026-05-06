---
name: remember-calendar
description: Import calendar events and scheduling commitments into persistent memory. Configure a calendar MCP for live sync.
triggers:
  - remember my calendar
  - import calendar events
  - save my schedule
  - import calendar
  - calendar memory
  - remember calendar
  - import ics
  - import google calendar
---

# Remember Calendar

Import calendar events into Neotoma memory — either from a live calendar MCP or from ICS file exports. Extracts scheduling commitments, attendees, and recurring patterns.

## When to use

When the user wants to persist calendar events, scheduling commitments, and associated contacts into durable memory.

## Prerequisites

Run the `ensure-neotoma` skill first if Neotoma is not yet installed or configured in your current harness.

## Supported sources

| Source | Format | Method |
|--------|--------|--------|
| Google Calendar | Live API | Google Calendar MCP |
| Apple Calendar | ICS export | File read |
| Outlook | ICS export | File read |
| Any calendar | `.ics` files | File read |

## Workflow

### Phase 0: Verify Neotoma

Confirm Neotoma MCP is connected (call `get_session_identity`).

### Phase 1: Identify source

1. Check if a calendar MCP is configured (e.g. `list_events` tool available).
2. If no MCP, ask the user for an ICS file path.
3. For MCP: ask for a time range (default: past 30 days + next 30 days).
4. For ICS: read the file to determine the date range available.

### Phase 2: Retrieve and preview

1. **Calendar MCP**: use `list_events` to retrieve events in the specified range.
2. **ICS file**: parse the iCalendar format to extract events.
3. Present a preview: event count, date range, recurring vs one-time, top attendees.
4. Ask for confirmation.

### Phase 3: Extract entities

For each event:

1. **Event**: create an `event` entity with `title`, `start_time`, `end_time`, `location`, `description`, `recurrence`.
2. **Contacts**: extract attendees as `contact` entities (deduplicate against existing contacts).
3. **Tasks**: for events with action-oriented titles or descriptions, create associated tasks.
4. **Places**: extract locations as `place` entities when they are specific venues.

For MCP sources, hydrate via the detail endpoint (`get_event`) before persisting, and set `data_source` per event with the event ID.

### Phase 4: Store with provenance

- For MCP-sourced events: set `data_source` per entity with the calendar event ID.
- For ICS files: use the combined store path (entities + file_path) to preserve the raw ICS.
- Batch REFERS_TO relationships from events to attendee contacts.

### Phase 5: Report results

Summarize:
- Events imported (count, date range)
- Contacts extracted
- Upcoming commitments highlighted
- Offer to set up recurring sync or import a different date range.

## Do not

- Import without user confirmation.
- Create duplicate events — check by title + start_time before storing.
- Create duplicate contacts — deduplicate by email first.
