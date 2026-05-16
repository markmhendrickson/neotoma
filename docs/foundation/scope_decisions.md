---
title: Neotoma Scope Decisions
summary: "This document records explicit in-scope / out-of-scope decisions for Neotoma's product surface, so that absences from the roadmap are understood as deliberate choices rather than gaps."
---

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
- User-facing push notifications, reminders, or strategy-level "should I notify?" decisions. **Note:** Substrate-level event emission and webhook delivery to registered agent consumers ARE in scope — see [SD-002](#sd-002-substrate-event-emission-and-webhook-delivery) for the boundary between strategy-level notifications (rejected here) and substrate-level signaling (accepted there).

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

---

## SD-002: Substrate Event Emission and Webhook Delivery

**Date:** 2026-05-07
**Status:** Decided — **In scope**

### Question

Should Neotoma emit events after writes and deliver them to registered consumers (agents, daemons, peer instances) via webhooks and SSE?

### Decision

**Yes.** Event emission and webhook delivery are **in scope** as substrate-level primitives. They report state transitions to registered consumers without deciding what to do about them.

### Rationale

1. **Substrate observability is a substrate concern.** A database that records changes but cannot report them forces every consumer to poll. PostgreSQL has `LISTEN/NOTIFY` and WAL streaming for the same reason: reporting state transitions is part of being a substrate, not a strategy-layer addition. See `philosophy.md` §5.9 (Signal Without Strategy) for the full architectural invariant.

2. **The boundary stays sharp.** Substrate-level signaling reports what changed. Consuming layers decide which signals matter and what to do about them. Removing the feature would mean the substrate has less observability into its own state transitions; it would not affect any user-facing behavior.

3. **Existing infrastructure already supports this.** Inbound webhook ingestion (`POST /github/webhook`), AAuth-signed remote POST (`neotoma_client.ts`), and conversation threading already exist. Outbound emission generalizes the pattern.

4. **Best-effort delivery only.** The substrate does not promise at-least-once, exactly-once, or in-order delivery. Consumers catch up via state queries (`list_recent_changes`, snapshot reads). The substrate MUST NOT add retry queues, dead-letter queues, ordered guarantees, or exactly-once semantics — those are strategy-layer concerns.

### Distinction from SD-001

SD-001 correctly rejects "reminders, notifications, task management, personality, chat" as strategy-layer concerns that violate the state layer boundary. SD-002 is compatible with SD-001:

| SD-001 (out of scope) | SD-002 (in scope) |
|---|---|
| User-facing push notifications | Agent-facing webhook delivery |
| Reminders and scheduling | Event emission (fire-and-forget) |
| Task management | Subscription registration |
| Strategy-level "should I notify?" | Infrastructure-level "entity changed, deliver to subscribers" |

The test: if removing the feature would mean the substrate has less observability into its own state transitions, it's substrate. If removing it would mean the user misses a reminder, it's strategy.

### What Stays In Scope

- Outbound event emission after every successful `store()` / `correct()` / `create_relationship()`.
- Subscription registration with entity-type and event-type filters.
- Webhook delivery to registered HTTPS endpoints (best-effort).
- SSE delivery to active subscriber channels (best-effort).
- Cross-instance peer push via the same webhook delivery mechanism.

### What Stays Out of Scope

- Retry queues, dead-letter queues, exactly-once or at-least-once delivery guarantees.
- Ordered delivery across event types or entities.
- Filtering, prioritization, or transformation of events based on consumer-specific logic.
- Any strategy-layer decision about whether an event "matters."
- Any user-facing surface (push notifications, alerts, badges) — those remain SD-001 territory.

### Revisit Conditions

Reopen if:
1. Event emission begins to include filtering, prioritization, or decision logic that belongs in consuming layers.
2. Field evidence shows best-effort delivery is insufficient for production agent fleets and a stronger guarantee is needed at the substrate layer (the default response should still be "fix it in the consumer," not "weaken substrate boundaries").

### Related Documents

- [`philosophy.md`](philosophy.md) §5.9 Signal Without Strategy — full architectural invariant
- [`core_identity.md`](core_identity.md) — Substrate Signaling subsection
- [`layered_architecture.md`](layered_architecture.md) — outbound signaling flow
- [SD-001](#sd-001-non-technical-gui-and-zero-config-install) — distinguishes user-facing notifications (rejected) from substrate-level signaling (accepted here)
- [`../subsystems/peer_sync.md`](../subsystems/peer_sync.md) — cross-instance `/sync/webhook`, peer config, bounded batch sync
- `docs/private/strategy/nervous_system_plans/02_subscription_webhook_delivery.md` — implementation plan
