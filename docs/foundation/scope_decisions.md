# Neotoma Scope Decisions

This document records explicit in-scope / out-of-scope decisions for Neotoma's product surface, so that absences from the roadmap are understood as deliberate choices rather than gaps.

Each decision records: the question, the decision, the date, the rationale, the target persona implied, and the conditions under which the decision should be revisited.

---

## SD-001: Non-Technical GUI and Zero-Config Install

**Date:** 2026-04-09
**Status:** Decided — **Out of scope for MVP and post-MVP through at least v0.5.x**

### Question

Should Neotoma ship a non-technical graphical management UI and a zero-configuration install experience targeted at non-developer end users, as external category voices (e.g., Penfield Labs' April 2026 post "What an AI Memory System Should Look Like in 2026") have argued is necessary for a memory system to reach mainstream users?

### Decision

**No.** Non-technical GUI and zero-config install are **out of scope** for the current release trajectory. Neotoma remains a developer-facing / power-user-facing state layer distributed via MCP, installed and configured by the user (or their agent) on their own machine.

### Rationale

1. **ICP is not the non-technical consumer.** Per `docs/icp/primary_icp.md`, Neotoma's target user is the personal agentic OS builder/operator across three operational modes (debugging, building, operating). This ICP does not need a graphical management UI; they already operate in terminals, config files, and MCP clients.

2. **The non-technical consumer market is already contested.** Penfield, provider-native memory (ChatGPT, Claude, Gemini), and eventual OS-level memory (Apple, Google) are all pursuing the non-technical user. Competing there would require surrendering Neotoma's defensible differentiators (privacy-first local-first, determinism, verifiability) because those differentiators are not legible to non-technical users and slow down the zero-config install story.

3. **Privacy-first and local-first are at odds with zero-config.** Zero-config install for non-technical users typically means "sign up and we handle the server." Neotoma's architecture is the opposite: the user runs it, the user owns the data, nothing leaves the machine. Closing the install gap without violating this principle is a large, separate product effort — not an incremental UI addition.

4. **Scope discipline protects the State Layer boundary.** A consumer GUI would pressure Neotoma to include strategy and execution concerns (reminders, notifications, task management, personality, chat) that violate the core identity (`core_identity.md` §"What Neotoma Is NOT"). The architectural invariant is clearer when the product surface stays narrow.

5. **Power users and agents are the right install vector today.** MCP adapters, per-client install flows, and agent-driven setup are the right primitives for Neotoma's ICP. Agent-assisted install ("your agent installs and configures Neotoma for you") is a more interesting zero-config story than a consumer installer, and it aligns with the state-layer-beneath-agents positioning.

### Target Persona (Explicit)

Neotoma targets the **personal agentic OS builder/operator**, not the general consumer. This persona:
- Is comfortable with terminals, config files, environment variables, and MCP client setup.
- Runs multiple AI tools (Claude Desktop, Claude Code, Cursor, ChatGPT) and feels the cross-tool memory tax.
- Cares about verifiability, provenance, and data sovereignty enough to trade convenience for them.
- Will accept a more involved install in exchange for local-first guarantees.

Absence of a non-technical GUI is a **feature for this persona**, not a defect. It signals that Neotoma is a serious substrate, not a consumer app.

### What Stays In Scope

- Per-client MCP install instructions and adapters (match Penfield's distribution surface).
- Agent-assisted install flows ("ask your agent to install Neotoma").
- CLI tooling and clear error messages for manual install.
- Structured data and docs that are agent-evaluatable (per AEO section of `product_positioning.md` §7.5).
- A *technical* inspector / admin UI for power users to browse the graph, observations, and provenance — this is distinct from a consumer GUI and serves the ICP.

### What Stays Out of Scope

- Consumer-style onboarding wizards, account creation, or sign-up flows.
- Graphical memory management targeted at non-technical users.
- One-click installers that hide architecture from the user.
- Cloud-hosted turnkey offerings.
- Personality customization, chat UI, or other consumer-assistant features.

### Revisit Conditions

Reopen this decision if any of the following become true:

1. Field evidence shows the ICP is bottlenecked by install friction rather than category confusion.
2. A credible agent-assisted install pattern emerges that is genuinely zero-config without violating privacy-first.
3. Neotoma's commercial model shifts in a direction that requires broader reach than the builder/operator ICP can provide.
4. A partner or distribution channel emerges that solves the consumer UX problem without Neotoma owning it.

### Related Documents

- [`core_identity.md`](core_identity.md) — What Neotoma is and is not
- [`product_positioning.md`](product_positioning.md) — Positioning, differentiation, and ICP framing
- [`../icp/primary_icp.md`](../icp/primary_icp.md) — Primary ICP definition
- [`../private/competitive/penfield_competitive_analysis.md`](../private/competitive/penfield_competitive_analysis.md) — Competitor pursuing the consumer gap
- [`../private/insights/penfield_ai_memory_2026_relevance_analysis.md`](../private/insights/penfield_ai_memory_2026_relevance_analysis.md) — Origin of this decision prompt
