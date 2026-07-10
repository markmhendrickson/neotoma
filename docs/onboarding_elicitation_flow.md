# Neotoma onboarding — the pre-install elicitation flow

**Status:** spec / draft (reconstructed 2026-06-18 after a worktree recycle destroyed the original file)
**Surface:** neotoma.io, **pre-install** (the light-up must precede the commitment)
**Neotoma:** plan `ent_7e1101aeea5ab3844b0be003`; source feedback `ent_c15d5afc61ac03d3293e7a29` (latent demand), `ent_934087f6b3279173d0893823` (adoption blockers), `ent_d4d44f0d63a1a5a6d61e3a19` (latent vs active maps to ICP), `ent_2e38b1d3120a27e1f415a7a7` (archetype gap).

---

## Why this exists

Most prospects haven't hit Neotoma's memory pain because they've **pre-emptively not attempted** the delegation that would create it — they already sense that chats are ephemeral, so they never try to hand recurring work to an agent, and so never feel the wall. The pain is real but **unfelt**.

The one thing that reliably converts is a 5-minute conversation where Mark asks "what recurring thing do you wish you could hand off?", names it back as a concrete delegation, surfaces the data-foundation gap that's been blocking it, and walks them through doing it. They **light up** — near-universally, by Mark's account.

That conversation currently only happens when Mark is in the room. **This flow productizes it.** It is not "here is what Neotoma is." It is the interview, run by an agent, that *induces* the pain by getting the user to attempt the delegation they assumed was impossible — and positions Neotoma as the thing on the other side of the wall.

This also dissolves the wedge-tension problem: we don't pick a wedge to market. The elicitation makes **the user name their own wedge** in their first five minutes, and we scaffold against whichever they named.

---

## The framing that makes the category click

From the calls, the verbatim reframe that landed hardest (Simon, May 6): **"maybe don't even call it memory — that's underselling what it is."** The category that clicks is **a nervous system / state layer your agents read and write** — and the reason prospects haven't delegated these tasks is the **auditability/trust threshold**: *"agents become economically useful once they are auditable and loggable, like any other human."*

So the flow does **not** lead with "memory." It leads with **delegation you've been holding back**, and reveals the data foundation (call it memory or not) as the thing that makes the delegation trustworthy.

---

## Two demand states → the flow must fork early

Evaluation-data analysis (feedback `ent_d4d44f0d63a1a5a6d61e3a19`) showed the audience splits cleanly on a **builder-vs-operator** axis that maps onto demand state:

- **LATENT operators** run Claude conversationally and haven't attempted delegation. They need the **full pain-induction** (Beats 0–2). This is the segment the elicitation is really for.
- **ACTIVE builders** already run agents and have hit the pain vividly (often with a build-in-house workaround). Beats 0–2 are friction for them — they want **try-fast → substrate proof → the graph**. Route them to Beat 3/4.

So a **Beat -1 router** reads "are you already running agents / do you already have a memory hack?" and branches:
- active → skip to Beat 3/4 (prove the substrate; don't induce pain they already feel);
- latent → run the full elicitation below.

Key finding to hold onto: **demand-readiness beats ICP-fit as a conversion predictor.** Every confirmed active_user came through prior felt pain; the highest-*fit* personas (Isaac@Daydream, Nick Talwar) are latent and haven't adopted. Meet people where their demand state is, not where their ICP score says they should be.

---

## The archetypes (mined from real evaluator data — use these, not invented ones)

Each is phrased as the user's own "I wish I could hand this off." Ranked by frequency of a visible light-up across evaluation data, filtered to **individual-operator-generalizable**.

**Operator-world archetypes (both cohorts):**
1. **"Keep my relationships warm for me."** — Who to reconnect with, who's gone cold, who to see on this trip, did I follow up, what did we discuss three months ago. *(Strongest.)*
2. **"Keep one true file on every person/company I deal with."** — One canonical, deduped record an agent reads first. *Reframe B broadly:* one true record per **first-class object** — person **or** deal **or** position (3 people independently extended it to deals/trades/diligence).
3. **"Run my finances/bookkeeping off a ledger I trust."** — Every transfer, charge, invoice captured so an agent can reconcile and act. *(Mark's dogfooding is the live demo.)*
4. **"Stop my knowledge going stale."** — Research, notes, org context queryable and current instead of rotting in Obsidian/Notion.
5. **"Make sure the right routine runs at the right moment."** — Organize recurring workflows/skills so the correct one fires in context. *(Power-user tier.)*

**Agent-system archetypes (added from broader evaluator data, feedback `ent_2e38b1d3120a27e1f415a7a7`):**
6. **"Prove what my agent did and why."** — A defensible, auditable trail of agent decisions/actions. ~5 people, highest buying intensity (compliance is a budget line). The **personal** flavor ("let me replay what my agent decided") generalizes to operators, so it belongs in the consumer flow; the regulated flavor (HIPAA/SOC receipts) is the enterprise upsell.
7. **"Catch what my agent misses."** — Memory as a verification substrate: a second agent (or the same agent's tracked state) catches what the first missed. ~4 people; the **bridge archetype both cohorts want**. Deliverable is *trustworthy output*, not a knowledge base.

**Builder/enterprise lane — excluded from the consumer front door:** "operate/deploy my agent fleet" (observability; Simon's highest-WTP signal), "agent-to-agent context exchange," and "org shared brain / institutional memory" (multi-writer governance; largest uncaptured cluster, natural B2B lane). Surface these only on the active-builder branch or a separate enterprise track.

---

## The flow (five beats — mirrors Mark's in-room conversation)

Conducted by a conversational agent on neotoma.io. Target: **under 5 minutes to the light-up; under 10 to a started delegation.** (Beat -1 router precedes this for active users, who skip to Beat 3.)

### Beat 0 — Open with the attempt, not the product
> "What's a recurring thing you do — weekly, monthly — that you wish you could just hand off to an AI and trust got done? Don't worry yet about whether AI can actually do it. Just name it."

- Free-text input. The archetypes appear as **clickable starters** *below* the input (not above), so a user who can name their own thing does, and a blank user gets primed by real examples. Chip menu branches by cohort: latent operators see 1–5 + personal-6; active builders additionally see 7 (catch-what-my-agent-misses) and can surface the fleet/enterprise lane.
- Do **not** explain Neotoma yet.

### Beat 1 — Name it back as a concrete, scoped delegation
Reflect the input into a specific, bounded job. One refinement round max — get to a sentence the user nods at. (See `onboarding_elicitation_script.md` for per-archetype reflections.)

### Beat 2 — Surface the wall (induce the pain)
Make the unfelt pain felt. Constant shape: *capable agent + no durable, trustworthy state = the reason you've never bothered to hand this off.* Tailor the first clause per archetype.

### Beat 3 — Show the foundation (the live, self-demonstrating reveal)
Because the elicitation agent **dogfoods Neotoma**, show the user *their own session graph*, recorded live: "while we've been talking, I've been keeping notes the way Neotoma does — look." Typed nodes, every fact traceable, nothing overwritten silently. Then the reframe: "some people call it memory; it's really the nervous system your agents run on." Surface local-first reassurance here (answers the data-sharing hesitancy from the CRM calls).

### Beat 4 — Start it now (manufacture the egg)
Hand off into a tailored setup + first delegation so the attempt happens this session. Generate a **one-line install + tailored first-delegation script** for the chosen harness (all three, **Claude Code first** as the canonical artifact; Cursor + desktop are transforms). The script: installs+connects Neotoma (agent runs `ensure-neotoma`), seeds the session graph into the real local instance, runs the first delegation live, shows the nodes it wrote, then demonstrates the **keystone cross-session recall a-ha** — now meaningful because they have something they want recalled.

---

## How this re-orders the broader adoption work

| Stage | What it is | Note |
|---|---|---|
| **0 (this doc)** | Pre-install elicitation that induces the pain | The productized in-room conversation |
| 1 | Cross-session recall a-ha + visible node | Lives inside Beat 4 |
| 2 | Agents narrate memory use every turn | Retention engine; ships to existing users immediately |
| 3 | Homepage rewrite | Downstream of a proven flow |

---

## The discipline (from the operator's own diagnosis)

The audience doesn't want to think; they want to use AI more effectively. **If the elicitation can't produce a light-up in five minutes, more copy won't fix it — the interview script is wrong.** Fix the flow, delete the paragraph. Instrument the Beat-2→3→4 transition against the tester engagement-status taxonomy (`ent_5b5471fe58e1e99945109ff3`); an out-of-network self-select must clear an engagement bar before it counts as an activation (vanity-activation guard).
