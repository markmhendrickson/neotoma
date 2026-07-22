# Neotoma onboarding — the elicitation script

**Status:** draft (reconstructed 2026-06-18 after a worktree recycle destroyed the original file)
**Companion to:** `docs/onboarding_elicitation_flow.md` (the why + the five beats)
**Neotoma:** plan `ent_7e1101aeea5ab3844b0be003`.
**Decisions baked in:** embedded Neotoma-powered web chat (the agent dogfoods Neotoma); harness handoff = **Claude Code only at launch** (Cursor + desktop roadmapped, not yet spec'd); **fork early** on active-vs-latent (Beat -1 router).

This is the actual conversation — the productized version of the in-room interview that gets prospects to "light up." Conducted by an agent on neotoma.io, **pre-install**.

---

## The dogfooding mechanic (what makes this different from every other onboarding)

The elicitation agent **runs on Neotoma itself.** As the user talks, the agent stores what it learns as real Neotoma entities in an ephemeral, throwaway session graph: the user → a `contact`; the people they mention → `contact`s; the recurring task → a `task`/`process`; their company → an `organization`.

So at Beat 3 the agent shows the user *their own session graph*, live: **"while we've been talking, I've been writing this down — here's what I now know."** They watch their own words become typed, inspectable nodes.

That single move resolves three of the eight blockers at once: **black box** (they watch the box being filled transparently), **a-ha** (the demo happened to them, with their content, in minutes), and **over-intellectualizing** (no "how it works" explanation was needed).

The throwaway graph is what the Beat-4 install script seeds into their real local instance, so nothing they said is lost.

---

## Beat -1 — Router (active vs latent)

One cheap read before Beat 0: *"Are you already running AI agents on recurring work — or do you already have some memory/notes hack for them?"*
- **Yes / has a workaround → ACTIVE.** Skip pain-induction; jump to Beat 3 (prove the substrate) then Beat 4. Their chip menu includes archetype 7 (catch-what-my-agent-misses) and can surface the fleet/enterprise lane.
- **No / uses Claude conversationally → LATENT.** Run the full five beats below.

---

## Beat 0 — Open with the attempt

**Agent (first message, no product framing):**
> Before I tell you anything about Neotoma — what's one recurring thing you do, weekly or monthly, that you wish you could just hand to an AI and trust got done right? Don't worry about whether AI can actually do it yet. Just name the thing.

**Below the input, as clickable chips (latent-operator menu):**
- Keep up with people I've lost touch with
- Keep one clean file on everyone/everything I work with
- Stay on top of my finances / bookkeeping
- Keep my notes and research from going stale
- Make sure the right routine runs at the right time
- Be able to prove what my agent did and why *(personal-provenance flavor)*

*(Active-builder menu adds: "Catch what my coding/research agent misses.")*

**Handling:** free-text → classify to nearest archetype; chip → jump to that archetype's Beat 1; silently store the user `contact` + a `task`/`process` stub.

### Beat 0 — no usable input

Trigger: free-text submitted blank, or classifies to none of the 7 archetypes below a confidence threshold `[BLOCKED: needs classifier confidence threshold from Bombycilla]`.

**Agent (first re-prompt — narrows, does not repeat the open ask):**
> No worries if nothing's jumping out — pick whichever of these is closest, even if it's not exact:

Re-surface the chips (do not re-show the free-text prompt verbatim).

**Second failure** (still nothing, or an explicit refusal like "I don't know" or the user closing the input): do not prompt a third time. Route to the shared **soft-exit state** (see Beat 4 — stall fallback, below) — capture email if offered, otherwise let the user browse the site with no hard block.

---

## Beat 1 — Name it back as a concrete, scoped delegation

Reflect the vague input into a **specific, bounded weekly job**. One refinement round max.

### A — "Keep my relationships warm" *(strongest)*
> So: every week, something tells you who's gone quiet, who you owe a follow-up, and — when you've got a trip coming up — who's worth seeing while you're there. And it drafts the reach-out in your voice, using what it already knows about that person. That the shape of it?

### B — "One true record per first-class object"
> So: instead of the same person, company, or deal smeared across your phone, LinkedIn, CRM, and inbox — one clean, current record per thing, that your agent reads before it acts. And it never silently overwrites; the old version is still there. That it?

### C — "Finances / bookkeeping off a trusted ledger"
> So: every transfer, charge, and invoice lands in one ledger your agent can act from — reconcile the month, flag what's off, draft what needs sending — without you re-explaining your accounts each time. That the one?

### D — "Stop my knowledge going stale"
> So: your notes, meeting takeaways, and research stop rotting in Obsidian or Notion — they stay queryable and current, so "what do we know about X" gives the live answer, not a six-month-old fragment. That it?

### E — "Right routine fires at the right moment"
> So: you've got a growing set of routines — weekly planning, pipeline review, newsletter prep — and you want the right one to fire in the right context automatically, instead of you remembering which to run. That it?

### F — "Prove what my agent did and why"
> So: when your agent takes an action or makes a call, you want to be able to go back and see exactly what it knew and why it decided that — a trail you can replay or hand to anyone who asks. That it?

*(Anchors: Andre Serrano "retrieve why did you open that position"; AgentMint signed receipts.)*

### G (active-builder) — "Catch what my agent misses"
> So: you delegate real work — code, research, inputs — and you want a second pass that catches what the first agent missed, tracking its own progress so you can actually trust the output. That it?

*(Anchor: whoabuddy "I can see the missing pieces but the agent can't see it itself.")*

### "Other" — user named something off-list
Reflect it back in the same shape (recurring + bounded + "your agent reads context first, acts, you stay in the loop") and store it as a new `process`. The archetypes are seeds, not a cage.

### If the user doesn't nod after the first reflection

Trigger: the user's response to the reflection is a correction, not a confirmation.

Behavior: incorporate the correction into a second, final reflection ("Got it — closer to this, then?") — this is explicitly the *last* one. Proceed regardless of whether the second reflection gets a clean "yes." **Two reflections max; the second is terminal; the flow proceeds after it either way.**

---

## Beat 2 — Surface the wall (induce the pain) — LATENT branch only

Constant shape; tailor the first clause per archetype.
> Here's why you haven't already handed this off — and it's not that the AI isn't smart enough. The moment a session ends, the agent forgets. Every person, every preference, every decision you walked it through — gone. Next week it starts from zero and you can't trust it won't contradict last time. That's not an intelligence problem. It's that the agent has **nowhere durable and trustworthy to keep what it learns.** So you quietly concluded it can't be trusted with [their thing] — and you were right, *until that foundation exists.*

Tailoring: A "...forgets who you talked to, what you promised"; B "...forgets which record is real, overwrites the right detail with a wrong one"; C "...forgets which account is which, double-counts, can't show its work"; D "...re-reads the same stale note, can't tell what's current"; E "...forgets which routine applies, and which it already ran"; F "...can't tell you what it knew when it acted"; G "...has no memory of what it already checked, so it misses the same things twice."

---

## Beat 3 — Show the foundation (live, self-demonstrating)

> Here's the thing — while we've been talking, I've been keeping notes the way Neotoma does. Look:

Render the user's own session graph, live, tailored to their archetype (relationships → `contact` nodes with `last_touch`/`commitment`; provenance → an action node with the context it read). Every node clickable, every field showing where it came from — clicking a node opens `retrieve_entity_snapshot`-shaped detail with field provenance (source, observed-at, and the conversational turn that produced it).

> This is what your agent reads *before* it acts and writes *after*. Typed records. Every fact traceable. Nothing overwritten in secret — corrections stack, history stays. Some people call it memory; honestly that undersells it — it's more like the nervous system your agents run on. It's the reason an agent can finally be trusted with [their thing]: it can show its work, like anyone you'd delegate to.

**Local-first reassurance (surfaced here, not buried):**
> And this lives on *your* machine, not ours. You can open any of it, change it, or delete it. We never see it.

### Beat 3 — if the write didn't happen

This is the highest-severity failure path in the flow: Beat 3 is the single moment the flow's trust is built or broken, so a silent failure here is worse than not attempting the demo at all.

Trigger conditions (name explicitly):
- (i) Neotoma unreachable at session start
- (ii) write attempted but zero nodes captured (user gave too little to extract)
- (iii) write succeeded but render/fetch for display fails

**Agent copy** (stays inside the flow's own honesty contract — no generic "something went wrong"):
> I'll be straight with you — the notes I was taking didn't save the way they should have. That's actually the exact problem Neotoma exists to fix: right now, nothing durable happened. Let me show you what it should look like instead.

Then fall back to a **pre-recorded/static example graph** (a canned screenshot or fixture, not live data) so Beat 3's trust-building payload still lands.

**Rule:** Beat 4 must not start until Beat 3 has either shown live data or shown the explicit fixture-fallback copy above. Do not silently proceed to Beat 4 as if Beat 3 succeeded — that reintroduces the exact "black box" distrust this mechanic exists to dispel.

---

## Beat 4 — Start it now (the handoff)

**4a — Pick the harness.** Ships **Claude-Code-only at launch** — render a single `[ Claude Code ]` action, not a three-way picker. Cursor and ChatGPT/Claude desktop are roadmapped transforms, not yet spec'd; do not surface them in the UI until they are.

**4b — Generate the tailored handoff:** a single copy-paste block that:
1. Installs+connects Neotoma via `ensure-neotoma`. See "If `ensure-neotoma` fails" below — this step is not a silent CLI call, the conversational agent narrates success or failure.
2. Seeds the session graph from Beats 0–3 into the real local instance.
3. Runs the first instance of their delegation live.
4. Shows the nodes it wrote.
5. Demonstrates the keystone — "start a fresh session and ask it — watch it remember."

**If `ensure-neotoma` fails:**

Failure classes the conversational agent needs distinct copy for (per the flow's own "capable agent + no durable, trustworthy state = trust-breaker" thesis — a vague "install failed" here is the same trust-breaker the whole flow was built to dispel): missing Claude Code entirely, permission/auth issue, network failure, existing conflicting Neotoma install.

This is **not** a silent CLI failure — the same conversational agent running Beats 0–3 narrates the failure back in its own voice, matching the honesty register established in Beat 3.

**Agent copy direction:**
> That install hit a snag — [specific reason]. Here's what to try: [specific remediation]. Or, I can email you the setup instead and you can run it when it's smoother.

The "email you the setup instead" clause routes into the same stall-fallback mechanic defined below — one mechanic, referenced from both places, not duplicated.

If `ensure-neotoma`'s actual error surface (exit codes / message taxonomy) isn't yet defined, `[BLOCKED: needs Bombycilla to confirm ensure-neotoma's error taxonomy]` — the requirement to narrate failures stays even while the taxonomy is pending.

**Harness priority — Claude Code ships first; Cursor and desktop are roadmap:**
- **Claude Code** (reference, write first; only harness at launch): one-line install + MCP config; agent self-installs and runs the first delegation in-terminal.
- **Cursor** (transform — roadmapped, not yet spec'd): same contract, IDE-native MCP config; lean on the anti-black-box graph view for this crowd.
- **ChatGPT / Claude desktop** (transform — roadmapped, not yet spec'd): MCP connector; lowest friction, broadest audience, lightest agentic loop — set expectations.

The Beat-4 first-delegation logic per archetype should be a **reusable skill** the handoff invokes, not bespoke copy. These skills double as the wedge-activation menu; **sequence them by out-of-network acute-pain ranking**, not by in-room hunch (F and H rank high on that axis and are strong build-first candidates).

### Beat 4 — stall fallback

This is the same soft-exit target as the Beat 0 refusal case — one shared fallback mechanic, not two divergent ones.

Trigger condition (named, not implicit): no forward action (no click on the harness button, no paste-confirmation) within a defined idle window, or an explicit "I can't do this" / "this is too technical" response. `[BLOCKED: needs product decision from Pavo on stall timeout — proposed default 90 seconds of no input]`.

**Agent copy** (acknowledges the light-up already happened — does not reframe this as failure):
> That's totally fine — you don't need to touch a terminal for this to be real. Drop your email and I'll send the setup, already configured for what we just talked about, so you can run it whenever.

**Handoff mechanic:** `[COPY: email capture input + confirmation microcopy]` inline field, plus: stores a `task` entity (type: tailored-setup-send) tied to the session graph, triggers an async email with the Beat-4b script pre-filled. `[BLOCKED: needs Bombycilla spec for async email delivery]` if that pipeline doesn't exist yet — keep the requirement explicit rather than implicit.

---

## Build notes

- **Embedded agent surface:** a Neotoma-powered chat widget on neotoma.io; session graph flagged ephemeral until Beat 4 promotes it. Confirm the pre-install web-session privacy posture.
- **Per-archetype first-delegation skills:** each archetype needs a small runnable "first instance" (relationships → cold-contact + draft; finances → drop-a-statement + reconcile; provenance → replay a stored decision; etc.).
- **Measure the light-up:** instrument Beat-2→3→4 against the tester engagement-status taxonomy (`ent_5b5471fe58e1e99945109ff3`). If Beat 3 doesn't produce forward motion, the script is wrong — fix the script, not the page. Self-select must clear an engagement bar before counting as active_user.
- **Fallback for the non-technical:** see "Beat 4 — stall fallback" above for the full spec (trigger, copy, handoff mechanic) — users who stall at install still got the light-up and the live graph.
