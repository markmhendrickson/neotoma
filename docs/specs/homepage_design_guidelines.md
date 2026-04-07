# Neotoma Homepage Design

## Goals, Principles, and Constraints (with focus on Hero)

This document summarizes the design intent for the **Neotoma homepage**, especially the **hero section**, based on strategic positioning decisions discussed during the developer release phase.

The homepage must communicate that Neotoma is **infrastructure**, not a consumer AI tool, and that its core innovation is a **memory invariant governing deterministic state evolution for long-running agents**.

The goal is not to maximize mass appeal, but to make the **right builders immediately recognize the problem and the architectural solution**.

---

## 1. Primary Goal of the Homepage

The homepage exists to help a technically sophisticated visitor answer three questions within ~10 seconds:

1. **What category of system is this?**
2. **Who is this for?**
3. **What invariant or guarantee does it introduce?**

If successful, a serious builder should think:

> "This is not another RAG memory tool.  
> This is about deterministic state for agents."

The homepage should not try to persuade broadly or entertain.  
It should allow **recognition by the correct audience**.

---

## 2. Hero Section Purpose

The hero is responsible for establishing four things immediately:

1. The **failure mode** in current systems
2. The **memory invariant** Neotoma introduces
3. The **target user (ICP)**
4. The **architectural abstraction layer**

Everything else on the homepage supports these.

The hero must make the category shift visible:

- Retrieval memory → context lookup  
- Deterministic memory → state governance

---

## 3. Core Hero Structure

The hero should follow a tight, scannable structure:

1. Headline
2. Subheadline
3. Failure bullets
4. System properties
5. Invariant declaration
6. Category contrast
7. ICP qualifier
8. Primary and secondary CTAs

Each block should be visually distinct and quickly readable.

---

## 4. Headline Principle

The headline should **name the failure mode**, not describe the product.

Example pattern:

> Your production agent has amnesia.

The purpose is to create recognition in builders who have already experienced this failure.

Avoid:

- product descriptions
- aspirational language
- marketing framing

The headline should feel like **an operational diagnosis**.

---

## 5. Subheadline Principle

The subheadline should express the **architectural layer**.

Example structure:

> Deterministic, inspectable memory for long-running agents.

Key rules:

- emphasize **state and determinism**
- avoid generic "AI memory" phrasing
- keep it concise

This line should clarify that the system governs **state evolution**, not just storage.

---

## 6. Failure Bullets

Immediately after the headline, the hero should show **the consequences of lacking a memory invariant**.

Example pattern:

Without a memory invariant:

- Context drifts across sessions
- Facts conflict across tools
- Decisions execute without a reproducible trail

These bullets create urgency without hype.  
They anchor the product in **real operational failures**.

---

## 7. System Property Block

The hero should show the system properties that Neotoma enforces.

Example format:

Neotoma makes memory:

- Versioned
- Schema-bound
- Replayable
- Auditable

These are not features.  
They are **system guarantees**.

---

## 8. Invariant Declaration

The invariant must be explicit.

Example:

> Invariant: Memory evolves deterministically.  
> Every state change is versioned and replayable.

Negative constraints strengthen the invariant:

- No silent mutation
- No implicit overwrite

This section is the **conceptual center of the page**.

---

## 9. Category Contrast

The homepage must clearly distinguish Neotoma from common memory approaches.

A short contrast statement works best:

> RAG retrieves documents.  
> Neotoma enforces state evolution.

This prevents the product from being perceived as another RAG wrapper or context store.

---

## 10. ICP Qualification

The hero should explicitly narrow the audience.

Example:

> For builders running long-lived agents in production.  
> Not for note-taking. Not for casual prompts.

Exclusion signals seriousness and prevents category confusion.

---

## 11. CTA Principles

The call-to-action hierarchy should reflect how builders adopt infrastructure.

- **Primary CTA:** View invariant + architecture (or View guarantee + architecture)
- **Secondary CTA:** Install in 5 minutes (reversible)

Builders typically want to **understand architecture before installation**.  
The hero should respect this behavior.

---

## 12. Visual Design Principles

The visual design should reinforce **infrastructure inspection**, not product marketing.

Good visual signals:

- version graphs
- state timelines
- replay indicators
- state diffs

Avoid:

- playful consumer graphics
- meme-like visuals
- flashy marketing styles

The interface preview should communicate **deterministic state inspection**.

---

## 12.1 Color Direction

Homepage color direction uses a violet and emerald system:

- Violet anchors brand and primary interaction
- Emerald highlights healthy state and successful progression
- Neutrals stay cool and low-chroma to keep diagrams readable

Use the canonical palette in `docs/specs/neotoma_color_palette.md` for hex values and token mapping.

---

## 13. Language Constraints

Use **engineering language**.

Preferred vocabulary:

- deterministic
- replayable
- versioned
- auditable
- schema-bound
- state evolution

Avoid:

- smart
- intelligent
- powerful
- magical
- revolutionary

The tone should feel **technical, calm, and declarative**.

---

## 14. Category Framing

The homepage must move the conversation from:

- **Product comparison** → **Guarantee comparison**

The correct comparison axis is:

- Memory Model → Guarantees

Examples of models:

- Retrieval memory (RAG)
- File-based memory
- Deterministic memory (Neotoma)

This framing avoids red-ocean product comparisons.

---

## 15. Distribution Reality

The homepage should not optimize for viral sharing.

Expected early signals:

- low public engagement
- thoughtful private discussions
- direct messages from builders
- technical questions

Infrastructure tools often spread through **trusted builder networks**, not social media amplification.

The homepage should reflect that seriousness.

---

## 16. Constraints

The homepage must avoid the following pitfalls:

### Consumer Framing

Do not position Neotoma as:

- personal memory
- note storage
- productivity software

### Feature-Led Messaging

Do not lead with integrations, UI, or capabilities.  
Lead with **invariants and guarantees**.

### Category Drift

Do not describe Neotoma as an "AI memory tool."  
It is a **deterministic state layer**.

### Over-Promising

All claims must be technically defensible.  
Infra audiences punish exaggeration.

---

## 17. Success Criteria

The homepage succeeds if a serious builder quickly concludes:

- This is about deterministic state.
- This prevents memory drift.
- This is infrastructure, not a tool.
- This might solve problems I have seen.

The page fails if the reaction is:

> "Interesting AI memory tool."

---

## 18. Strategic Outcome

If the homepage works correctly, the category discussion changes from:

- "How should agents store memory?"

to:

- "What guarantees does agent memory provide?"

At that point, Neotoma becomes the reference implementation for **deterministic agent memory infrastructure**.

---

## Assessment: Current Homepage vs Guidelines

*Last assessed: 2026-04-07 after gap-closure pass (curiosity-gap isolation, integrity-first proof, transformation beat, category-level guarantees copy).*

### Current slide structure (8 sections)

1. Hero (#intro) — headline ("Your agents forget. Neotoma makes them remember."), curiosity gap line, summary with rotating record types, CTAs, rotating testimonials, proof strip
2. Before / After (#outcomes) — concrete demo comparing agent responses with and without Neotoma
3. How It's Used (#how-i-use-it) — founder story blockquote with usage stats (1,000+ contacts, 600 tasks, 170 entity types)
4. Who This Is For (#who) — three ICP mode cards with identity-led titles and role transformation language
5. Memory Guarantees (#memory-guarantees) — six guarantee preview cards, each pairing a failure mode with the guarantee that prevents it
6. Record Types (#record-types) — typed entity guides (contacts, tasks, transactions, contracts, decisions, events)
7. Evaluate (#evaluate) — agent-driven evaluation prompt + link to /evaluate
8. Common Questions (#common-questions) — FAQ accordion

### Fulfilled well

| Guideline | Current state |
|-----------|----------------|
| **§1 Primary goal** | Page answers category ("The state layer for AI agents" in proof strip), who it's for (identity-framed ICP cards), and what guarantee (guarantee cards with failure/save pairing). |
| **§2 Hero purpose** | Failure mode (headline + curiosity gap), memory guarantee (summary shifts to "truth, not guesses"), ICP (identity-led who section), abstraction (state layer tagline). |
| **§3 Core hero structure** | Headline, curiosity gap, summary with rotating types, CTAs, testimonials, proof strip. Visually distinct blocks. |
| **§4 Headline** | "Your agents forget. Neotoma makes them remember." — Names failure mode accessibly; curiosity gap line below adds the Unexpected hook ("None of them can prove it hasn't been silently corrupted"). |
| **§5 Subheadline** | Summary shifts payoff from convenience ("stop re-explaining") to trust ("works from truth, not guesses"). Category signal via "versioned, auditable state." |
| **§6 Failure bullets** | Rotating testimonials include failure-mode framing; "Who" section body connects chronic tax to acute risk ("agent acts confidently on wrong state"). |
| **§8 Invariant declaration** | Curiosity gap line establishes the integrity differentiator above the fold. Guarantee cards reinforce with concrete failure/save pairs. |
| **§9 Category contrast** | Proof strip: "The state layer for AI agents" (replaces generic "Cross-tool memory"). Guarantees section heading: "state integrity, not just storage." |
| **§10 ICP qualification** | Identity-led card titles: "You're the context janitor," "You're babysitting inference variance," "You're the log archaeologist." Section heading: "pay the tax for missing state." |
| **§11 CTA principles** | Primary: "Ask your agent to evaluate." Secondary: "Install in 5 minutes." Evaluation-first, install-second. |
| **§13 Language** | Engineering language throughout: deterministic, versioned, auditable, state layer, provenance, schema-bound. "Memory" replaced with "state layer" in tagline and subcopy. |
| **§14 Category framing** | Guarantee cards compare failure modes to guarantees. Full guarantee comparison page linked. |
| **§16 Constraints** | No consumer framing; tagline signals infrastructure ("state layer"); no over-promise. |
| **§17 Success criteria** | Page supports "deterministic state," "prevents drift," "infrastructure," and "state layer" recognition. Founder story grounds claims in daily production use. |

### Partially fulfilled

| Guideline | Gap | Notes |
|-----------|-----|--------|
| **§12 Visual design** | Right-side illustration emphasizes failure, not inspection. | ForgetfulAgentIllustration reinforces the problem; a future iteration could add state-timeline or replay visuals. Demo videos (separate workstream) would address this when ready. |

### New elements added in positioning overhaul

- **Curiosity gap line** after headline: "Most memory tools help agents retrieve information. None of them can prove it hasn't been silently corrupted."
- **"How It's Used" section** (#how-i-use-it): Founder blockquote with concrete usage stats, linking to full blog post. Provides the Sinatra test / social proof from daily production use.
- **Identity-led ICP card titles**: "You're the context janitor," "You're babysitting inference variance," "You're the log archaeologist" — surfacing the `escaping` role from ICP profiles.
- **Failure-mode lines on guarantee cards**: Each guarantee now pairs a concrete failure scenario with the guarantee that prevents it (failure → save pattern from Made to Stick audit).
- **Tagline shift**: "Cross-tool memory for AI agents" → "The state layer for AI agents" in hero proof strip and footer.
- **Summary payoff shift**: "stop re-explaining your world" → "works from truth, not guesses" — moves emotional register from convenience to trust.
- **Who section body**: Connects chronic tax to acute risk ("The real risk is when your agent acts confidently on wrong state").
- **SEO metadata**: Description updated to lead with "Deterministic, versioned state for AI agents that can't afford to guess."

### Summary

The positioning overhaul shifts the homepage from "convenient cross-tool memory" to "foundational state layer for reliable AI agents." The changes are informed by three inputs: the updated primary ICP document (which defines the archetype as someone paying a state integrity tax), a positioning critique (identifying under-claiming as the core issue), and a Made to Stick audit (identifying missing Unexpected and Emotional elements). The overhaul preserves the existing headline (Simple, recognizable) while adding a curiosity gap, founder credibility, identity-level ICP language, and failure-mode grounding on guarantee cards.
