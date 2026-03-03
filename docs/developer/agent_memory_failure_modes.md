# Agent Memory Failure Modes

Neotoma is designed to prevent high-impact failure modes that are common in agent memory systems.
This page summarizes those failures, why they are dangerous, and what Neotoma does to reduce them.

## High-Impact Failure Modes

| Failure mode | What goes wrong in practice | Why this is critical | How Neotoma addresses it |
| --- | --- | --- | --- |
| Lost commitments | Agents forget promises, tasks, or deadlines between sessions. | Missed obligations, breached trust, and delayed work. | Persistent structured storage for tasks, events, and related entities. |
| Contradictory state | Different tools or sessions hold conflicting "truth." | Duplicate actions, incorrect decisions, user confusion. | Deterministic reducers over immutable observations to produce consistent snapshots. |
| Silent memory drift | Values change over time without clear visibility into when or why. | Hard-to-debug behavior and repeated mistakes. | Immutable observation history with provenance for every field. |
| Non-replayable decisions | Teams cannot reconstruct what the agent knew when it acted. | Audit and incident-response gaps, especially in regulated workflows. | Replayable state from timestamped observations and snapshots. |
| Duplicate entities | The same person, company, or object appears under multiple records. | Fragmented context and incorrect downstream automation. | Entity resolution and merge workflows to converge identity. |
| Unsafe auto-storage | Sensitive facts are saved without explicit user intent. | Privacy and compliance risk. | Confirmation-first onboarding and explicit approval requirements before save actions. |
| Tool-to-tool context loss | Context does not carry from one client/tool to another. | Repeated user effort and inconsistent outcomes. | Shared truth layer accessed via MCP, CLI, and API. |
| Weak correction loop | Incorrect extracted data persists without reliable correction path. | Long-lived bad memory that pollutes future actions. | Correction and reinterpretation flows with full provenance trail. |
| Opaque relationship logic | Links between entities are missing or unreliable. | Broken workflows that depend on graph structure. | Typed relationship model and snapshot-based relationship retrieval. |
| Unbounded schema drift | Field shapes mutate unpredictably across entities over time. | Query instability and brittle integrations. | Schema governance through entity types, recommendations, and incremental updates. |

## Most Acute Consequences

The most severe operational outcomes tend to be:

- Missed commitments and deadlines.
- Duplicate or contradictory actions across sessions.
- Broken handoffs between users, agents, and tools.
- Compliance and audit failures when teams cannot reconstruct decision context.

## Design Principles Behind These Controls

- Determinism: same inputs produce same outputs.
- Immutability: source observations are append-only.
- Provenance: every value traces back to source observations.
- Contract-first interfaces across API, MCP, and CLI.
- Human confirmation before sensitive onboarding saves.

