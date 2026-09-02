---
name: where
description: Present-tense orientation — where everything stands right now, answered from what is already in context plus one scoped read of this session's Neotoma tasks, so work that aged out of the window is still reported. What is running, what just landed, what is waiting on the operator and why it is theirs, and one recommended next step per workstream with an explicit stop-or-continue call. Verifies nothing and writes nothing; stored task state is reported as stored, and every perishable claim is marked as-of and unverified. The cheap sibling of /status, for the "where are we" asked several times an hour. User-level (~/.claude/skills/where/), available in every repo.
triggers:
  - /where
  - where are we
  - where do things stand
  - what's running
  - quick status
user_invocable: true
supported_harnesses:
  - claude-code
  - cursor
---

# where

## Purpose

Answer "where are we right now" in the time it takes to read a short message.

`/where` reads the present tense, including work still in flight. It answers from what is already
in the context window, plus **one scoped read of this session's `task` entities** — no transcript
reconstruction, no verification pass, no writes. That is the entire point: the operator asks this
question several times an hour, and a reconstruction that reads twenty thousand transcript lines
cannot be the answer to a question asked that often. One entity query can.

**Brevity is the feature, not a side effect.** A `/where` that runs as long as a `/status` has
failed even if every line in it is true.

## The trio, by cost — not by lifecycle position

All three of these are distinct, and picking the wrong one is the failure this section exists
to prevent. They are ordered by **cost and confidence**, not by where they sit in a session's life:

| Skill | Coverage | Verification | Writes | When |
|---|---|---|---|---|
| **`/where`** | in-context, plus one scoped `task` read | **none** — everything unverified; stored task state is read, not checked | **none** | orientation, any time, often |
| **`/status`** | whole lineage, reconstructed from transcripts | every factual claim checked against its system of record | one `session_digest` | when the read-out must be trustworthy |
| **`/end`** | whole session | audits storage and modeling | files tasks, persists entities, refreshes hubs | the actual close-out |

**`/status` does NOT close a session.** It is read-only for domain data and is designed to run
at any point mid-session; its single permitted write is bookkeeping about itself. `/end` is the
closing skill — it files, persists, and audits. Do not describe `/status` as a close-out, in this
skill or in a report; a session that believes it is will reach for the wrong tool at the wrong
moment.

**Both `/where` and `/status` orient the operator, at very different cost. Neither closes anything.**

`/end` does not depend on `/where` or `/status` having run — it does its own whole-session
reconstruction in its Phase 0. So skipping straight from a string of `/where` calls to `/end`
loses nothing structural. What it loses is verification: `/status` is the only one of the three
that checks claims against systems of record while the tool results are still in context.

**Escalate from `/where` to `/status` when the read-out is about to be trusted rather than
merely read** — a handoff to another session or person, a decision with a cost, anything that
will be repeated as fact, or when a perishable claim below has aged past the point where you
would bet on it.

## The verification boundary — the rule that makes this skill safe

`/where` **verifies nothing**. That is what makes it cheap, and it is exactly why it must never
present unverified state as fact.

State claims as beliefs with an age, not as findings:

- **Say "as of" and mean it.** Anything perishable carries when it was last actually observed:
  "as of my last check ~40 minutes ago", "when the agent last reported", "at the top of this
  session". If you cannot say when a thing was last observed, say that instead of implying it is current.
- **Perishable by default.** PR and CI states, agent progress, whether someone replied, whether
  a draft is still unsent, whether a daemon is running, whether a tree is clean, and **every count**
  are perishable. Treat them as perishable even when they feel settled.
- **Immutable claims may stand plainly.** A merged PR, a commit that exists, a filed issue number,
  an entity that was created — these cannot un-happen, so they need no hedge.
- **Never upgrade a snapshot into a standing state.** "PR #N was blocked on you" describes one
  reading at one moment; "PR #N is blocked on you" asserts a condition that may have ended
  minutes later. A snapshot read as a standing state is a real, repeated failure mode here — it
  has reported swarm work as stalled while the swarm was actively working it.
- **Head the report with its own limits, in one line**, so nobody has to infer them:
  *"Unverified — from context plus stored task state as written, not checked against GitHub/Gmail. Run `/status` for a verified read-out."*
  Naming the task read in the header is required: it tells the operator which claims come from a
  record rather than the window, without implying anything was checked against a system of record.
- **Never claim coverage.** `/where` sees the context window plus the scoped task read. If the
  session has compacted, say so in a clause: earlier work may be missing from this read-out except
  where a task recorded it. The task read narrows this gap; it does not close it, and saying it
  does would be the coverage claim this rule forbids.

If a specific claim genuinely matters right now and is cheap to check — one `gh pr view`, one
entity read — check that one thing and mark it verified while leaving the rest as-is. Do not let
this grow into a verification pass; the moment you are batching checks by system, you are running
`/status` and should say so.

## The one query — this session's tasks

`/where` answers from context, with **one exception**: a single scoped read of the `task` entities
this session is associated with. Context decays; the tasks the session filed do not. On a long
compacted session that gap is this skill's worst blind spot — the durable record of the work sits
in Neotoma while the report is composed from a decaying window.

This is a read, not a verification pass, and one entity query is not what makes `/status` expensive
— whole-lineage transcript reconstruction is. Adding this query does not turn `/where` into
`/status`. It stays one query: if you are batching reads by system, you have left `/where`.

### Scope: the ids this session touched, then one bounded sweep

**Primary scope — tasks whose entity ids appear in this session's context.** Free (no query to
find them), precise, and it is the only signal that actually distinguishes this session's work from
the swarm's. Read those ids directly.

**Secondary scope — one `retrieve_entities` on `task` with `created_since` session start**, then
kept ONLY where the row is `blocked`, `awaiting_approval`, or names the operator as owner. This is
the half that recovers what compaction dropped. It is a sweep, so treat everything it returns as
*candidates* and drop any row this session has no evidence of touching.

**Every wider scope was tested against a real session and fails on volume:**

| Candidate scope | Returns | Verdict |
|---|---|---|
| tasks created since session start | **136** in one day | backlog dump — the length discipline forbids it |
| …narrowed to blocked + awaiting-approval | **33** | still not one screen, and mostly other agents' |
| tasks `PART_OF` the bound plan | **727 relationships** on the swarm plan | the plan is a decade of work, not a session |
| tasks linked to the session's `conversation` | **0 of 136** populate `conversation_id` | the field is declared but nothing writes it |

The last row is the important one: `task.conversation_id` **exists on the schema and is
universally unpopulated**, so a conversation join looks principled and silently returns nothing.
Do not build on it. `session_digest.tasks_claimed` is the real session→work link, but it is
`/status`'s write and only exists once `/status` has run — `/where` must work before that and
**must not write one**.

### Volume: summarize by state, name only what is blocked or the operator's

Never list every task. Give **one line of counts** — "6 filed today, 2 blocked on you, 1 done" —
and then name only the rows that need a human: blocked, awaiting approval, or operator-owned.
A task that is filed and moving needs no line of its own; it is inside the count.

If the counts themselves are large, that is the finding. Say "31 tasks filed across the swarm
today, 2 of them yours" and name the two. A count plus the exceptions fits on one screen; a list
does not.

### Labelling stored state — reuse the two tiers, do not invent a third

Stored task state is **read, not verified**, and it is stale in its own particular way: a status is
what someone last wrote, not what is running. There is no execution tracking, so a task can read
`in_progress` with nothing behind it.

This needs no new confidence tier — it is the existing perishable rule applied to a new source.
Attribute the state to the record and mark it as-of:

- **Say where it came from and when it was written**: "the task says blocked on you, as stored"
  or "filed as in-progress, last written ~2h ago". Never "task X is blocked", which asserts a
  condition rather than reporting a row.
- **`in_progress` / `EXECUTING` is a claim, not a heartbeat.** If you report one, say so in a
  clause: "stored as executing — that records a write, not a running process."
- **Immutable task facts may stand plainly** — that a task exists, its title, that it was created.
  Those cannot un-happen.

The header still says the report is unverified: reading a stored status is not checking GitHub or
Gmail, and PR/CI state remains unverified exactly as before.

## What to report — four sections, in this order

Order is deliberate: the present, then the recent past, then the operator's queue, then the ask.

**1. RUNNING NOW** — dispatched agents and background work, one line each: what it is doing and
who owns it. Include when it was dispatched or last reported. If nothing is running, say so in
one line rather than dropping the section.

**2. JUST LANDED** — what completed since the last `/where` or `/status` in this session. Bound
it: this is a delta, not a session history. If nothing has landed since the last one, say that —
it is real information.

**3. WAITING ON THE OPERATOR** — each item, plus **why it is theirs to decide rather than yours**.
The reason is the load-bearing half: "needs your approval" says nothing, while "this sends mail to
an external contact, which is consent-gated" or "both options are defensible and the tradeoff is
yours" tells them what kind of judgment is wanted. Carry enough context to actually decide — the
options and what each implies — never a label they would have to look up. If nothing is waiting,
one line saying so.

**4. NEXT STEP PER WORKSTREAM** — one recommended next step for each active workstream, each with
an explicit **stop or continue** call: is this session continuing on it, or stopping and handing
it back? Both halves are required. A recommendation with no stop-or-continue leaves the operator
to guess whether they need to reply, which is the thing this section exists to remove.

Where a workstream genuinely cannot be advanced by the agent, say so plainly — "no next step,
this is yours" is a valid and useful entry.

### Which sections the task data feeds

It feeds **three of the four, and not the fourth**:

- **WAITING ON THE OPERATOR — the primary use.** A task stored `blocked` or `awaiting_approval`
  with the operator as owner *is* an operator-queue item, and it is the one this skill previously
  could not see at all once it aged out of context. Carry the task's own `blocked_reason` as the
  why, since the record already states it. If the stored reason does not explain why the decision
  is the operator's rather than the agent's, say that plainly instead of dressing it up — a
  routing label like "no route/owner" is not a reason a human can act on.
- **JUST LANDED** — tasks whose stored status moved to `done` are the cheapest available record
  of what completed, and they survive compaction where the conversation does not.
- **NEXT STEP PER WORKSTREAM** — an open task is the workstream's own statement of its next step.
  Prefer it over one reconstructed from memory; it was written when the context was fresh.

**Not RUNNING NOW.** A stored status is not a running process, and there is no execution tracking
behind it — a task reading `in_progress` may have nothing running. RUNNING NOW stays sourced from
what this session actually dispatched and observed. Putting stored task rows there would
manufacture exactly the false "work is in flight" reading the perishable rule exists to prevent.

## Naming and linking tasks, PRs, and issues

Name the related `task` entities and link them by name, so the operator can open the record
rather than reconstruct it. Link form: `[<task title>](<base>/#/entities/<entity_id>)` — the
`#/entities/<id>` route is the canonical address for any entity in the Ateles app.

**Resolve `<base>` from the app's `deployment_configuration` entity; do not hardcode a host.**
Retrieve `deployment_configuration` from Neotoma and use the entry for the task dashboard. If no
such entry exists — as of this writing the dashboard is a local dev server with no deployment
entity — fall back to the local dev origin and say in a clause that the link is local-only. Never
invent a hostname, and never write a client-identifying host into a public repo.

Link the task, not a bare id. `ent_…` on its own is not something the operator can act on.

**The same rule applies to PRs and issues: give the title, never a bare number.** `#714` requires
the operator to go look up what it is; `[make Neotoma a hard dependency](…)` does not. Link form:
`[<pr or issue title>](https://github.com/<owner>/<repo>/pull/<n>)`. Truncate a long title rather
than dropping it — a shortened title still identifies the change, a number identifies nothing.

This is the same defect as a bare `ent_…`: an identifier the reader has to resolve before the
report means anything, which converts a read-out into an errand.

## Length discipline — and what gets cut first

Target well under a minute to read. Four short sections, a handful of lines each. If it does not
fit on one screen, it is too long.

When it does not fit, cut in this order — first to go, first listed:

1. **Mechanics** — how a thing was done, what was tried, tool-by-tool narration. Always the first cut.
2. **Task rows that are neither blocked nor the operator's** — collapse them into the count line.
   The count survives; the enumeration does not.
3. **JUST LANDED detail** — collapse to titles; the operator saw most of it happen.
4. **Completed workstreams** — a workstream with nothing running and nothing waiting gets one line or none.
5. **RUNNING NOW detail** — collapse to "agent X on Y" and drop the elaboration.

Never cut, at any length: **WAITING ON THE OPERATOR**, the **stop-or-continue** call on each next
step, and the **unverified header**. Those three are why the report exists. If the report is still
too long after cutting everything above, there are genuinely too many open workstreams — say that
in one line, which is itself the most useful thing in the report.

## What was deliberately dropped from `/status` — do not re-add these

Each of these is what makes `/status` expensive. They are absent on purpose, and re-adding any
one of them turns `/where` into a slower `/status` with none of its guarantees.

- **Whole-lineage transcript reconstruction** (globbing `.jsonl` files, building a skeleton across
  forks, stating coverage). This is the single largest cost — thousands of lines read per run. Dropped:
  `/where` answers from context and says so. **Consequence, stated honestly:** work that has aged
  out of context is invisible here, *except* what the one task query recovers (see "The one query").
  That query is a deliberate, bounded exception to the context-only rule — it reads the durable
  record rather than reconstructing the transcript. Everything else that aged out is still invisible,
  and the unverified header is what discloses it.
- **The verification pass** (batched `gh`/`gws`/graph/`git` checks, `immutable` vs `perishable`
  tagging, the verification scorecard). Dropped: nothing is verified, and everything perishable is
  marked as-of instead.
- **The `session_digest` write.** Dropped, and this one is a hard constraint rather than a
  preference: the digest's idempotency key is stable per session lineage, so a second skill writing
  it would fight `/status` over the same key. `/where` writes nothing at all.
- **Cross-session checks** (`list_sessions`, `search_session_transcripts` for every remaining item).
  Dropped: too slow for a question asked hourly. **Consequence:** `/where` may name a next step
  another session already owns. When a next step is about to be *started* rather than merely named,
  check first — or run `/status`.
- **Spin-out task chips** (`spawn_task`, KEEP-HERE/SPIN-OUT classification). Dropped: scoping a
  session's attention is a session-boundary decision, not an hourly one.
- **The numbered "reply all or pick" closing list.** Dropped in favour of the per-workstream
  stop-or-continue call, which carries the same authorization question at a quarter of the length.
- **`verbose` / `project` modes.** Dropped: a mode that makes `/where` longer defeats it. If the
  plan's state is wanted, that is `/status project`.

## Constraints

- MUST answer from context plus the ONE scoped `task` read described in "The one query". MUST NOT
  reconstruct the transcript lineage, and MUST NOT read session `.jsonl` files. MUST NOT expand the
  task read into a verification pass or a second system's batch of checks.
- MUST scope tasks to the ids this session touched, plus one bounded since-session-start sweep kept
  only where blocked, awaiting approval, or operator-owned. MUST NOT scope by the bound plan
  (727 relationships on the swarm plan) or by `task.conversation_id` (declared, universally unset).
- MUST summarize tasks by state in one count line and name only what is blocked or operator-owned.
  MUST NOT enumerate every task.
- MUST attribute stored task state to the record and mark it as-of ("as stored", "filed as"), and
  MUST NOT present a stored `in_progress` as evidence that anything is running. MUST NOT source
  RUNNING NOW from stored task status.
- MUST NOT write anything — no `session_digest`, no domain entities, no task filing, no plan
  corrections, no memory writes, and no correction to a task it read. `/where` is write-free,
  without exception; reading a task never licenses updating it, however stale the row looks.
- MUST head the report with a one-line unverified disclosure naming `/status` as the verified
  alternative.
- MUST mark every perishable claim as-of with when it was last observed, and MUST NOT restate a
  snapshot as a standing state. MUST NOT present any unverified claim as fact.
- MUST state, in a clause, when the session has compacted and earlier work may be missing.
- MUST include all four sections, using one line to say "nothing" rather than dropping a section.
- MUST give, for each operator-waiting item, why it is the operator's decision rather than the
  agent's — and enough context to decide, never a label to look up.
- MUST give one next step per active workstream, each with an explicit stop-or-continue call.
- MUST name related `task` entities and link them by name via `#/entities/<id>`, resolving the base
  URL from `deployment_configuration` and never hardcoding a host.
- MUST give the TITLE of every PR and issue mentioned, linked, never a bare number.
- MUST stay well under a minute to read, cutting in the documented order. MUST NOT cut the
  operator-waiting section, the stop-or-continue calls, or the unverified header at any length.
- MUST NOT describe `/status` as closing a session — `/end` is the closing skill; `/status` and
  `/where` both orient, at different cost.
- MUST NOT act on a next step in the same turn. `/where` reports and stops.
- If a filed `task` is created in the same turn by *other* work (never by `/where` itself), that
  work sets `action_type` and `confidence` on it, and uses `notes`/`description` — `body` and
  `owning_agent` are NOT declared on the task schema and are silently dropped into `raw_fragments`.
