# Neotoma Developer Release
## Principles, Goals, and Constraints

This document captures the strategic intent behind the Neotoma developer release. It defines how the project should be positioned, who it is for, and what constraints should govern design, messaging, and product decisions.

The purpose of this document is to prevent drift toward generic "AI memory tool" framing and to maintain the correct abstraction layer: deterministic state infrastructure for long-running agents.

---

# 1. Core Thesis

Modern agents fail because state is not governed.

Most "AI memory" systems provide retrieval, not state integrity.

Retrieval answers:

> What information might be relevant?

Neotoma answers:

> What is the authoritative state of the system, and how did it evolve?

The developer release introduces a memory invariant:

- Memory evolves deterministically.
- Every state change is versioned and replayable.
- No silent mutation.
- No implicit overwrite.

Neotoma is therefore not a note-taking system, RAG wrapper, or context store.
It is a deterministic state layer for long-running agents.

---

# 2. Target User (ICP)

The developer release is intentionally narrow.

Primary ICP:

Builders running long-lived agents in production.

Characteristics:

- Running agents that persist across sessions
- Coordinating state across tools
- Managing evolving context over time
- Experiencing drift, conflicts, or unreproducible decisions
- Comfortable with infrastructure-level abstractions

Typical environments:

- Claude Code
- Cursor
- Codex workflows
- Agent orchestration frameworks
- Production automation systems

Not the target user:

- Prompt hobbyists
- Casual AI users
- Note-taking workflows
- Productivity tooling
- Personal knowledge management

Required signal:

Not for note-taking. Not for casual prompts.

---

# 3. Strategic Framing

The developer release must shift the conversation from tools to guarantees.

Bad framing:

- AI memory tool
- Better context system
- Persistent chat memory

Correct framing:

- Deterministic memory
- State integrity layer
- Memory invariant
- Versioned state evolution

Key contrast statement:

RAG retrieves documents.
Neotoma enforces state evolution.

This contrast avoids the crowded "AI memory tool" category.

---

# 4. Positioning Principles

## 4.1 Declare, Don't Persuade

Tone must be architectural and declarative.

Avoid:

- Marketing persuasion
- Hype language
- Growth-style framing

Prefer:

- Invariants
- Guarantees
- Constraints
- System properties

Builders should feel they are encountering infrastructure, not a product pitch.

## 4.2 Compete on Guarantees, Not Features

Most memory tools compete on:

- Embeddings
- Retrieval quality
- UX
- Integrations

Neotoma competes on:

- Determinism
- Replayability
- Auditability
- Schema constraints

The comparison axis should be:

Memory model -> guarantees

Not:

Product -> features

## 4.3 Avoid Red-Ocean Competition

The AI memory space is noisy and crowded.

Entering directly creates:

- Confusion
- Comparison fatigue
- Skepticism

Instead define a different abstraction layer:

Retrieval memory
vs
Deterministic memory

## 4.4 Narrow ICP Over Broad Appeal

The developer release prioritizes:

- Signal
- Clarity
- Technical depth

Over:

- Mass adoption
- Viral distribution
- Broad accessibility

Correct reaction:

> This looks serious but maybe not for me.

Incorrect reaction:

> This looks like another AI memory tool.

---

# 5. Product Principles

## 5.1 Deterministic State Evolution

All memory changes must be:

- Versioned
- Inspectable
- Replayable

This enables reproducible state, timeline reconstruction, and audit trails.

## 5.2 No Silent Mutation

State should never change implicitly.

Every mutation must produce:

- A recorded version change
- A traceable operation
- A replayable timeline event

## 5.3 Schema-Bound State

Memory should not be arbitrary text blobs.

State should evolve through:

- Schema constraints
- Structured records
- Validated transitions

This prevents semantic drift, contradictory facts, and state corruption.

## 5.4 Inspectability

Users must be able to inspect state, inspect history, and replay transitions.

This is the opposite of hidden context.

---

# 6. UX Principles

The interface should feel like infrastructure inspection, not productivity software.

Good signals:

- Version graphs
- Timeline replay
- State diffs
- Deterministic mode indicators

Avoid:

- Playful consumer UI
- Meme-like graphics
- Viral landing page styles

---

# 7. Communication Principles

## 7.1 Minimalism

Builders scan quickly.

Hero sections should contain:

- One strong claim
- Three failure bullets
- One invariant
- One contrast statement

Avoid long explanations above the fold.

## 7.2 Technical Precision

Preferred terms:

- deterministic
- versioned
- replayable
- auditable
- schema-bound
- state evolution

Avoid:

- smart
- powerful
- intelligent
- magical

## 7.3 Comparison Through Models

When comparing with other approaches, compare memory models, not vendors.

Correct:

Memory model -> guarantees

Incorrect:

Vendor -> features

---

# 8. Developer Release Goals

This release is not about scale.

Primary goals:

1. Validate the memory invariant concept
2. Attract builders with real agent state problems
3. Generate architectural feedback
4. Prove the deterministic model works in real workflows

Success signals:

- Thoughtful feedback from experienced builders
- Side-channel discussions among trusted contacts
- Architectural questions
- Requests for deeper documentation

Not success signals:

- Social media engagement
- Large signup numbers
- Viral traction

---

# 9. Distribution Expectations

Expected pattern:

Low public engagement
+
High private interest

Signals include:

- Direct messages
- Group chats
- Technical discussions
- Installation experiments

These are higher-quality signals than public metrics for this stage.

---

# 10. Constraints

## 10.1 Consumer Framing

Do not position Neotoma as:

- Personal memory
- Note storage
- Productivity tooling

## 10.2 Over-Promising

Avoid claims that cannot be defended.

All guarantees should be technically precise.

## 10.3 Feature Creep

Keep the release focused on the memory invariant.

Additional features are acceptable only if they reinforce:

- Determinism
- Replayability
- Inspectability

---

# 11. Strategic Outcome

If successful, the release should cause builders to think:

Agent memory is not about retrieval.
It is about state integrity.

And:

Neotoma is the first system treating agent memory like infrastructure.

Then the next phase is:

- Proving the invariant
- Expanding architecture
- Demonstrating production use cases
