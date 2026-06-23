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

# remember-calendar — Neotoma ↔ Google Calendar Sync

## Purpose

Keep Neotoma `event` entities and Google Calendar in sync. The canonical record is Neotoma; Google Calendar is the display layer. Each event routes to a calendar based on its type, following the operator's routing config (retrieved at runtime — see below).

## Calendar routing (retrieve at runtime, never hardcode)

Calendar IDs and the personal routing rules are operator-specific, so they are **not** in this skill. At runtime, retrieve the `calendar_routing_config` entity named `operator-calendar-routing` from Neotoma and follow its `routing` table: each entry gives a `calendar_id` and the `use_when` conditions that select it, with one entry flagged `is_default` for the uncertain case. Use the `is_default` calendar when classification is ambiguous. After creating or updating an event, write back the fields named in the config's `writeback_fields` using its `writeback_idempotency_pattern`.

If the config entity is missing, stop and surface that rather than guessing a calendar.

## Trigger conditions (proactive)

Apply this skill **without being asked** whenever:

1. A new `event` entity is stored in Neotoma and it lacks a `google_event_id` field
2. An event entity is corrected (date/time/location changed) and it has a `google_event_id` — update the GCal event
3. The user shares a message, screenshot, or invitation containing event details
4. A task is created with a due_date and a clear venue/meeting (create a calendar block)

## Execution steps

### Step 1 — Classify the event

Read the event `name`, `description`, `location`, and any linked `contact` entities. Match them against the `use_when` conditions in the routing config to select the target calendar. When no entry clearly matches, use the `is_default` calendar.

### Step 2 — Determine status

- If the event is confirmed: `status: confirmed`
- If pending an RSVP, decision, or discussion: `status: tentative`
- Default to `tentative` when uncertain

### Step 3 — Create or update the GCal event

**Create:**
```bash
gws calendar events insert \
  --params '{"calendarId":"<calendar_id>"}' \
  --json '{
    "summary": "<event name>",
    "description": "<full description with price, RSVP info, contacts>",
    "location": "<venue>",
    "start": {"dateTime": "<ISO8601>", "timeZone": "Europe/Madrid"},
    "end": {"dateTime": "<ISO8601>", "timeZone": "Europe/Madrid"},
    "status": "<confirmed|tentative>"
  }'
```

If only a date is known (no time): use `"date": "YYYY-MM-DD"` instead of `dateTime`.

**Update existing event:**
```bash
gws calendar events patch \
  --params '{"calendarId":"<calendar_id>","eventId":"<google_event_id>"}' \
  --json '{ ...changed fields only... }'
```

**Default time estimates when not specified:**
- Lunch/dinner event with no end time → add 3 hours
- Conference/talk → add 2 hours
- All-day cultural event → use `date` (all-day)

### Step 4 — Store GCal IDs back to Neotoma

After creating the event, correct the Neotoma entity with the config's `writeback_fields` (typically `google_event_id`, `google_calendar_id` used, and `google_event_url` from the GCal `htmlLink`). Use the config's `writeback_idempotency_pattern` (e.g. `gcal-link-<entity_id>-<YYYY-MM-DD>`).

### Step 5 — Report

> 📅 Added to **<calendar>**: *[Event name]* — [Date], [Time], [Location] ([confirmed|tentative])

## Idempotency

Before creating a new GCal event, check whether the Neotoma event entity already has a `google_event_id`. If it does, skip creation and offer to update instead.

## Timezone

Always use `Europe/Madrid`. Never UTC.

## Joint-decision events

When an event requires a joint decision with another person, set status to `tentative` and note in the GCal description that it needs confirmation before it is final.

## Bulk sync

When invoked as `/remember-calendar` with no arguments, scan Neotoma for `event` entities missing `google_event_id` created in the last 30 days and process each in order. Report a summary table at the end.
