---
name: scrape-chatgpt-workout
description: "Scrape a ChatGPT Fitness GPT conversation and backfill workout sessions into Neotoma. Use when user says \"scrape chatgpt workout\", \"import chatgpt fitness\", \"backfill workouts from chatgpt\", or provides a ChatGPT conversation URL. Can be invoked via /scrape-chatgpt-workout."
triggers:
  - scrape chatgpt workout
  - import chatgpt fitness
  - backfill workouts from chatgpt
  - scrape-chatgpt-workout
---

# Scrape ChatGPT Workout

Capture a ChatGPT Fitness GPT conversation stream, reconstruct workout sessions from both assistant summaries and raw user messages, then store as `workout_session` entities in Neotoma.

## When to Use

- User says "scrape chatgpt workout", "import chatgpt fitness", "backfill workouts from chatgpt"
- User provides a ChatGPT conversation URL (chatgpt.com/…/c/…)
- User wants to backfill historical workout sessions from a ChatGPT fitness log

## Prerequisites

- Claude in Chrome extension connected (required for fetch interception)
- ChatGPT tab open and logged in
- Neotoma MCP available

## Overview

The skill has two phases:

1. **Capture** — Install a fetch interceptor in the ChatGPT tab, trigger conversation API re-fetch, buffer the full streaming response (~4MB for a long conversation)
2. **Reconstruct & Store** — Parse the captured mapping tree, reconstruct sessions from assistant summaries + raw user messages, store each session to Neotoma

---

## Phase 0: Cache Check

Before touching the browser, check whether a `conversation` entity for this chat already exists in Neotoma:

```
retrieve_entities(entity_type="conversation", search="chatgpt-fitness-gpt-254868b9")
```

Or by URL pattern:

```
retrieve_entity_by_identifier(identifier="254868b9-73d0-8329-b395-c48b6b8a8fef", entity_type="conversation")
```

If a matching entity exists **and** a linked `file_asset` (the JSONL transcript) is present, retrieve the file URL and load the messages from it instead of re-scraping. This allows re-analysis without re-opening the ChatGPT tab.

```
retrieve_file_url(entity_id="<file_asset_entity_id>")
# -> download JSONL and parse into _allMessages equivalent
```

**Store the `conversation_entity_id` in a variable now** -- it is needed in Phase 3 Step 3.3 to wire provenance relationships. If no entity is found here, the id will be obtained after Phase 4 stores the conversation.

Only proceed to Phase 1 if no cached transcript is found, or if the user explicitly requests a fresh capture.

---

## Phase 1: Capture

### Step 1.1 -- Confirm tab

Use `tabs_context_mcp` to confirm the ChatGPT conversation tab is open. If not, ask the user to navigate to the conversation URL first.

The target URL pattern: `https://chatgpt.com/g/*/c/*` or `https://chatgpt.com/c/*`

### Step 1.2 -- Read conversation data from React fiber state

> **Warning: The fetch interceptor approach no longer works on the current ChatGPT frontend.** React Router v6 data loaders capture the `fetch` reference before injected scripts run, so `window.fetch` wrapping happens too late. Read directly from React fiber state instead.

Walk the React fiber tree to find the conversation node map:

```javascript
function searchFiber(fiber, depth) {
  if (!fiber || depth > 120) return;
  let s = fiber.memoizedState, si = 0;
  while (s && si < 25) {
    if (s.memoizedState && typeof s.memoizedState === 'object' &&
        s.memoizedState.current?.value &&
        JSON.stringify(s.memoizedState).includes('create_time')) {
      window._bestState = s.memoizedState;
      return;
    }
    s = s.next; si++;
  }
  try { searchFiber(fiber.child, depth + 1); } catch(e) {}
  try { searchFiber(fiber.sibling, depth + 1); } catch(e) {}
}

const rootKey = Object.keys(document.getElementById('__next') || document.body)
  .find(k => k.startsWith('__reactFiber'));
searchFiber((document.getElementById('__next') || document.body)[rootKey], 0);
window._bestState ? 'found' : 'not found'
```

The conversation data is at `window._bestState.current.value[1]` -- an array of node objects, each with a `messages` array.

### Step 1.3 -- Verify data is present

```javascript
const nodes = window._bestState?.current?.value?.[1];
nodes ? `${nodes.length} nodes` : 'no data -- try reloading the conversation tab'
```

If nodes are not found, ask the user to reload the ChatGPT tab and try again.

---

## Phase 2: Parse

### Step 2.1 -- Extract all messages from fiber nodes

```javascript
const nodes = window._bestState.current.value[1];
const allMsgs = [];
const seen = new Set();
for (const node of nodes) {
  for (const msg of (node.messages || [])) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    const text = msg.content?.parts?.find(p => typeof p === 'string' && p.length > 5);
    if (!text || !msg.create_time) continue;
    allMsgs.push({
      id: msg.id,
      role: msg.author?.role,
      time: msg.create_time,
      date: new Date(msg.create_time * 1000).toISOString().slice(0, 10),
      text
    });
  }
}
allMsgs.sort((a, b) => a.time - b.time);
window._allMessages = allMsgs;
`${allMsgs.length} messages, ${new Set(allMsgs.map(m=>m.date)).size} days`
```

### Step 2.3 -- Group into session candidates

For each date, collect:
- **Assistant summaries**: assistant messages containing `kg x`, `x`, set data, or session structure
- **User raw logs**: user messages containing weights, reps, exercise names

```javascript
const workoutRe = /(\d+(?:\.\d+)?)\s*(?:kg)?\s*[x]\s*\d+|\d+\s*kg|sets|reps|warm.?up/i;
const sessionByDate = {};

for (const m of window._allMessages) {
  if (!sessionByDate[m.date]) sessionByDate[m.date] = { user: [], assistant: [] };
  if (workoutRe.test(m.text)) {
    sessionByDate[m.date][m.role === 'user' ? 'user' : 'assistant'].push(m);
  }
}

window._sessionByDate = sessionByDate;
Object.keys(sessionByDate).sort().join(', ')
```

### Step 2.4 -- Reconstruct each session

For each date with data, build a session payload by combining:

1. **From assistant summaries** (longest message per day): extract session type, exercise names, and `weight x reps` pairs using both markdown table format and bullet-point PR format
2. **From user messages**: extract any explicit set data not captured in summaries, using message order as set sequence within each exercise

**Backfill from user messages** (sets not in assistant summary):

For each user message on a given date that contains explicit `weight kg` or `weight x reps` patterns:
- Match against known exercise names from the assistant summary (fuzzy: lowercased substring match)
- If matched: append as additional sets to that exercise
- If unmatched: create a new exercise entry with `source: 'user_message'` and include the raw message text as `notes`

**Known GPT summary gaps -- always backfill from user messages:**

1. **Warmup sets are routinely omitted** from GPT summaries. User messages like "Warmup 8x 80kg", "Warmup 40kg bench" must be captured as `set_type: "warmup"`.

2. **Supersets cause interleaved messages** -- user alternates between two exercises mid-set. When detected, attribute messages to the correct exercise by context and annotate both exercises with `notes: "superset with <partner>"`.

3. **Set corrections** -- user sometimes sends weight/reps, then immediately corrects. Always apply the correction; discard the original value.

4. **Failure callouts** -- "failure", "1 less than failure" in user messages indicate RPE-to-failure sets. Store as `set_type: "working"` with `notes: "failure"`.

**Session type inference** (from assistant messages):
- Scan for `Session N - <type>`, `(Push|Pull|Upper|Lower|Legs|Arms|Chest|Back|Full Body)`
- Fall back to dominant muscle group from exercise names

### Step 2.5 -- Compact and extract (Chrome extension size limit workaround)

Since the Chrome extension truncates large JS return values, extract session data in date-keyed slices. Store on `window._parsedSessions` for sequential reading:

```javascript
window._parsedSessions = Object.entries(window._sessionByDate).map(([date, msgs]) => {
  const longestAssistant = msgs.assistant.sort((a,b) => b.text.length - a.text.length)[0];
  const exercises = longestAssistant ? parseAssistantSummary(longestAssistant.text) : [];
  // backfill from user messages here (see step 2.4)
  return { date, time: longestAssistant?.time, exercises, userMsgCount: msgs.user.length };
});
window._parsedSessions.length + ' sessions parsed'
```

Read back in slices if needed:
```javascript
window._parsedSessions.slice(0, 5)  // adjust range per call
```

---

## Phase 3: Store to Neotoma

**Before starting this phase:** ensure `conversation_entity_id` is set. If it was obtained in Phase 0 (cache hit), use that value. If this is a fresh capture, run Phase 4 first to store the `conversation` entity and capture its `entity_id`, then return to Phase 3.

### Step 3.1 -- Check for existing sessions

Before storing, query Neotoma for existing `workout_session` entities on the same dates to avoid duplicates:

```
retrieve_entities(entity_type="workout_session", search="Metropolitan Sagrada")
```

Compare `started_at` dates. Skip any date already present with `source: chatgpt_fitness_gpt`.

### Step 3.2 -- Store each session

For each parsed session, call `mcp__mcpsrv_neotoma__store` with:

```json
{
  "entity_type": "workout_session",
  "canonical_name": "<YYYY-MM-DD> <SessionType> @ Metropolitan Sagrada Familia",
  "title": "<SessionType> Session -- <D Mon YYYY>",
  "session_type": "<inferred type>",
  "started_at": "<ISO timestamp>Z",
  "location_name": "Metropolitan Sagrada Familia",
  "source": "chatgpt_fitness_gpt",
  "exercises": [],
  "notes": "<optional: raw user messages that could not be mapped to exercises>"
}
```

Use `idempotency_key: "chatgpt-workout-<YYYY-MM-DD>"` to make stores safe to re-run.

Set `observation_source: "import"`.

Store in parallel batches of 4 where possible.

Collect every `entity_id` returned from each store call into a `session_entity_ids` list for use in Step 3.3.

### Step 3.3 -- Link sessions to source conversation

After all sessions are stored, batch-create `REFERS_TO` relationships from every `workout_session` back to the `conversation` entity. Use the `conversation_entity_id` obtained in Phase 0 (cache hit) or Phase 4 (fresh store):

```
create_relationships([
  { relationship_type: "REFERS_TO", source_entity_id: <session_entity_id>, target_entity_id: <conversation_entity_id> },
  ... one entry per session ...
])
```

This wires provenance so the graph is traversable in both directions: conversation to sessions and session to source conversation.

If `conversation_entity_id` is not yet available (Phase 4 has not run), complete Phase 4 first and then execute this step.

### Step 3.5 -- Report

After all stores complete, output:
- Total sessions stored vs skipped (duplicates)
- Sessions with full exercise data vs timestamp-only
- Any user messages that contained set data but could not be mapped to exercises (list with date + raw text)
- Dates with no workout data found in the conversation

---

## Phase 4: Store Raw Transcript

After capture and before or after storing workout sessions, persist the raw message array to Neotoma as a `conversation` entity with a linked JSONL file. This enables re-analysis without re-scraping.

**On a fresh capture (no Phase 0 cache hit), run Phase 4 before Phase 3** so that the `conversation_entity_id` is available when Step 3.3 wires the provenance relationships.

### Step 4.1 -- Write JSONL to disk

Extract messages in batches of 100 (the Chrome extension blocks larger chunks from chatgpt.com):

```javascript
// Batch N (0-indexed), 100 per batch
const batch = window._allMessages.slice(N*100, (N+1)*100).map(m => ({
  role: m.role,
  time: Math.round(m.time),
  date: m.date,
  text: m.text.slice(0, 2000)
}));
JSON.stringify(batch)
```

Write each parsed array as JSONL lines to `/tmp/chatgpt-fitness-transcript.jsonl` (one JSON object per line, no array wrapper).

### Step 4.2 -- Store to Neotoma

```json
{
  "entity_type": "conversation",
  "canonical_name": "ChatGPT Fitness GPT -- <location> (<Mon YYYY>-<Mon YYYY>)",
  "title": "Fitness -- Track lifting progression (ChatGPT Fitness GPT)",
  "source": "chatgpt",
  "platform": "chatgpt",
  "url": "<full ChatGPT conversation URL>",
  "conversation_id": "<uuid from URL>",
  "started_at": "<ISO timestamp of first message>",
  "ended_at": "<ISO timestamp of last message>",
  "message_count": 0,
  "topic": "weightlifting progression tracking"
}
```

Use `idempotency_key: "chatgpt-fitness-gpt-conversation-<conv_id_prefix>"`.

Include `file_path: "/tmp/chatgpt-fitness-transcript.jsonl"` and `mime_type: "application/jsonl"` in the same store call to attach the raw JSONL as a `file_asset`.

Set `interpretation.source_ref: "unstructured"` with `interpretation_config.extractor_type: "scrape-chatgpt-workout"`.

**Store the returned `entity_id` as `conversation_entity_id`** -- it is required by Phase 3 Step 3.3 to create the provenance relationships.

**Source field note:** `source` on the `conversation` entity should reflect the platform origin (`"chatgpt"`), not the skill name. The skill/harness identity belongs in `interpretation_config.extractor_type`.

---

## Data Quality Notes

- **Assistant summaries capture PR-zone sets** -- top sets and back-off sets are reliably present; intermediate warmup sets may be omitted
- **User messages are the ground truth** for sets that GPT did not explicitly echo back in a summary
- **Session timestamps** come from the message `create_time` field (Unix seconds); use the first assistant message of each day as `started_at` approximation
- **Location** defaults to Metropolitan Sagrada Familia unless the conversation mentions another gym
- **Bodyweight exercises** (pull-ups, dips): store `weight_kg: 0` and add a `notes` field with `"bodyweight"`

## Constraints

- Do NOT use `window.location.href` to navigate -- it reloads the page and clears in-memory state
- **The fetch interceptor approach no longer works** -- use the React fiber state approach (Phase 1.2) instead.
- The Chrome extension blocks large return values from chatgpt.com JS tool. Extract messages in batches of 100 at a time for the Phase 4 JSONL export.
- Never store `source_device` field -- it causes `unknown_fields_count` errors in workout_session schema v1.1.0
- `source` on `conversation` entity = platform origin (`"chatgpt"`); harness identity goes in `interpretation_config.extractor_type`
- **MUST run Phase 4 before Phase 3 on a fresh capture** -- `conversation_entity_id` must exist before Step 3.3 can create provenance relationships
- **MUST collect all session `entity_id` values** from Step 3.2 store responses before calling `create_relationships` in Step 3.3

## Related Skills

- `/store-neotoma` -- general Neotoma storage workflow
- `/import-audio` -- audio import + transcription pattern (reference for multi-step capture workflows)
