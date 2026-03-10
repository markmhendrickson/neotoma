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

*Last assessed: 2026-03-05 after foundations audit restructuring.*

### Current slide structure (7 slides)

1. Hero (#intro) — headline, failure bullets, guarantee pills, invariant, CTAs, proof points
2. Memory Guarantees (#memory-guarantees) — 9-row comparison table (retrieval vs file vs Neotoma)
3. Architecture + Foundations (#architecture) — three foundations cards (privacy, deterministic, cross-platform) + pipeline diagram
4. Quick Start (#quick-start) — merged install prompt + post-install simulation
5. Who Is It For (#who-is-it-for) — 3 ICP cards
6. Interfaces (#interfaces) — MCP/CLI/API summary cards with links
7. Learn More (#learn-more) — repo, docs index, blog posts

### Fulfilled well

| Guideline | Current state |
|-----------|----------------|
| **§1 Primary goal** | Page answers category (deterministic state layer via guarantees table + architecture), who it's for (ICP cards), and what guarantee (three foundations + guarantee pills). |
| **§2 Hero purpose** | Failure mode (headline + bullets), memory guarantee (pills + invariant line), ICP (qualifier line), abstraction (subheadline). All four present. |
| **§3 Core hero structure** | Headline, subheadline, failure bullets, system properties (pills), invariant declaration, ICP qualifier, CTAs, proof points. Visually distinct blocks. |
| **§4 Headline** | "Your production agent has amnesia." — Names failure mode; operational diagnosis. |
| **§5 Subheadline** | "Neotoma enforces deterministic, inspectable memory for long-running agents." — State/determinism, concise. |
| **§6 Failure bullets** | "Without a memory invariant" + three bullets. Real operational failures. |
| **§7 System property block** | "Neotoma makes memory" + Versioned, Schema-bound, Replayable, Auditable. |
| **§8 Invariant declaration** | Hero contains "Memory evolves deterministically. No silent mutation." as standalone monospace line. Reinforced in architecture slide. |
| **§9 Category contrast** | Hero contains "RAG retrieves documents. Neotoma enforces state evolution." Guarantees table (slide 2) provides full category map comparing retrieval, file-based, and Neotoma. |
| **§10 ICP qualification** | "For AI-native operators, high-context knowledge workers, and builders of agentic systems." with ICP detail cards in slide 5. |
| **§11 CTA principles** | Primary: "View guarantees" (in-page #memory-guarantees). Secondary: "Install in 5 minutes." Inspection before install. |
| **§13 Language** | Engineering language throughout: deterministic, replayable, versioned, auditable, schema-bound, provenance. |
| **§14 Category framing** | Guarantees table compares memory models by guarantee properties, not vendors vs features. Architecture slide leads with three foundations. |
| **§16 Constraints** | No consumer framing; no "AI memory tool"; lead with guarantees; no over-promise. Developer preview banner moved to persistent nav header. |
| **§17 Success criteria** | Page supports "deterministic state," "prevents drift," "infrastructure" recognition by builders. |

### Partially fulfilled

| Guideline | Gap | Notes |
|-----------|-----|--------|
| **§12 Visual design** | Right-side illustration emphasizes failure, not inspection. | ForgetfulAgentIllustration reinforces the problem; a future iteration could add state-timeline or replay visuals. Demo videos (separate workstream) would address this when ready. |

### New elements added in restructuring

- **Persistent header nav** (SiteHeaderNav) with shadcn NavigationMenu, developer preview badge, and links to key sections and subpages.
- **Memory Guarantees table** (slide 2) comparing memory model categories across 9 guarantee properties.
- **Three Foundations block** (slide 3) with privacy-first, deterministic, and cross-platform cards.
- **Proof points** in hero: version, release count, MIT license, GitHub/npm links.
- **Tool coexistence guides**: /neotoma-with-cursor, /neotoma-with-claude, /neotoma-with-codex.
- **Documentation index page** (/docs) organizing all subpages by category.
- **Merged Quick Start slide** combining install prompt and post-install flow.
- **"How agents remember" content** moved to Architecture subpage.

### Summary

The homepage now explicitly surfaces all three differentiating foundations (privacy-first, deterministic, cross-platform) and includes a guarantee comparison table for instant category recognition. The slide count reduced from 8 to 7 by merging install + quick start and moving internal implementation detail (agent loop) to a subpage. Navigation was restored via a persistent header with NavigationMenu. Proof points and an open-source signal reinforce developer trust.
