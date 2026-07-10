# Neotoma onboarding — the elicitation script

**Status:** draft (reconstructed 2026-06-18 after a worktree recycle destroyed the original file)
**Companion to:** `docs/onboarding_elicitation_flow.md` (the why + the five beats)
**Neotoma:** plan `ent_7e1101aeea5ab3844b0be003`.
**Decisions baked in:** embedded Neotoma-powered web chat (the agent dogfoods Neotoma); harness handoff = all three, **Claude Code first**; **fork early** on active-vs-latent (Beat -1 router).

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

---

## Beat 2 — Surface the wall (induce the pain) — LATENT branch only

Constant shape; tailor the first clause per archetype.
> Here's why you haven't already handed this off — and it's not that the AI isn't smart enough. The moment a session ends, the agent forgets. Every person, every preference, every decision you walked it through — gone. Next week it starts from zero and you can't trust it won't contradict last time. That's not an intelligence problem. It's that the agent has **nowhere durable and trustworthy to keep what it learns.** So you quietly concluded it can't be trusted with [their thing] — and you were right, *until that foundation exists.*

Tailoring: A "...forgets who you talked to, what you promised"; B "...forgets which record is real, overwrites the right detail with a wrong one"; C "...forgets which account is which, double-counts, can't show its work"; D "...re-reads the same stale note, can't tell what's current"; E "...forgets which routine applies, and which it already ran"; F "...can't tell you what it knew when it acted"; G "...has no memory of what it already checked, so it misses the same things twice."

---

## Beat 3 — Show the foundation (live, self-demonstrating)

> Here's the thing — while we've been talking, I've been keeping notes the way Neotoma does. Look:

Render the user's own session graph, live, tailored to their archetype (relationships → `contact` nodes with `last_touch`/`commitment`; provenance → an action node with the context it read). Every node clickable, every field showing where it came from.

> This is what your agent reads *before* it acts and writes *after*. Typed records. Every fact traceable. Nothing overwritten in secret — corrections stack, history stays. Some people call it memory; honestly that undersells it — it's more like the nervous system your agents run on. It's the reason an agent can finally be trusted with [their thing]: it can show its work, like anyone you'd delegate to.

**Local-first reassurance (surfaced here, not buried):**
> And this lives on *your* machine, not ours. You can open any of it, change it, or delete it. We never see it.

---

## Beat 4 — Start it now (the handoff)

**4a — Pick the harness.** `[ Claude Code ] [ Cursor ] [ ChatGPT / Claude desktop ]`

**4b — Generate the tailored handoff:** a single copy-paste block that (1) installs+connects Neotoma via `ensure-neotoma`; (2) seeds the session graph from Beats 0–3 into the real local instance; (3) runs the first instance of their delegation live; (4) shows the nodes it wrote; (5) demonstrates the keystone — "start a fresh session and ask it — watch it remember."

**Harness priority — all three, Claude Code first:**
- **Claude Code** (reference, write first): one-line install + MCP config; agent self-installs and runs the first delegation in-terminal.
- **Cursor** (transform): same contract, IDE-native MCP config; lean on the anti-black-box graph view for this crowd.
- **ChatGPT / Claude desktop** (transform): MCP connector; lowest friction, broadest audience, lightest agentic loop — set expectations.

The Beat-4 first-delegation logic per archetype should be a **reusable skill** the handoff invokes, not bespoke copy. These skills double as the wedge-activation menu; **sequence them by out-of-network acute-pain ranking**, not by in-room hunch (F and H rank high on that axis and are strong build-first candidates).

---

## Build notes

- **Embedded agent surface:** a Neotoma-powered chat widget on neotoma.io; session graph flagged ephemeral until Beat 4 promotes it. Confirm the pre-install web-session privacy posture.
- **Per-archetype first-delegation skills:** each archetype needs a small runnable "first instance" (relationships → cold-contact + draft; finances → drop-a-statement + reconcile; provenance → replay a stored decision; etc.).
- **Measure the light-up:** instrument Beat-2→3→4 against the tester engagement-status taxonomy (`ent_5b5471fe58e1e99945109ff3`). If Beat 3 doesn't produce forward motion, the script is wrong — fix the script, not the page. Self-select must clear an engagement bar before counting as active_user.
- **Fallback for the non-technical:** users who stall at install still got the light-up and the live graph — capture an email and send the tailored setup; don't lose them at the harness gate.
