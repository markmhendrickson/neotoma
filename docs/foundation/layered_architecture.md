# Neotoma as the State Layer

## Core architectural model

Neotoma is the **state layer**: a deterministic, event-sourced, reducer-driven world model. Anything sitting above Neotoma is an **operational layer** — agents, pipelines, orchestration systems, custom applications. The boundary is a single, simple invariant:

- **State Layer (Neotoma):** stores state, signals state changes, enforces determinism and immutability. Never decides, infers, or acts.
- **Operational Layer(s):** read truth and write back via observations. May reason, plan, decide, and execute side effects. The artifacts of those activities (plans, decisions, constraints, preferences, rules) are themselves state and live in Neotoma.

```
┌───────────────────────────────────────────────┐
│              Operational Layers               │
│    Agents, pipelines, orchestrators, apps     │
│    Reads truth → reasons / plans / acts       │
│    Writes results back as observations        │
└───────────────────────────▲───────────────────┘
                            │ Reads via MCP / API
                            │ Writes via observations
                            ▼
┌───────────────────────────────────────────────┐
│            Neotoma — State Layer              │
│   Event-sourced, reducer-driven, deterministic│
│   Observations → Reducers → Snapshots         │
│   Substrate signals (best-effort) emitted     │
└───────────────────────────────────────────────┘
```

## 1. State Layer definition

Neotoma:

- Stores observations (immutable, append-only) and computes entity snapshots through deterministic reducers
- Generates hash-based, content-addressed entity and event IDs
- Exposes structured access through MCP, CLI, and OpenAPI surfaces
- Emits substrate signals to registered consumers after every successful write (best-effort, fire-and-forget)
- Enforces schema-first ingestion, full provenance, and immutability of recorded truth

The state layer never:

- Implements strategy, execution, or inference logic
- Subscribes to its own signals or runs its own decision loops
- Mutates state outside the observation → reducer → snapshot pipeline

## 2. Operational layers

An operational layer is anything that consumes truth from Neotoma and produces new state by writing observations. Examples:

- **Agents** (Claude, Cursor, ChatGPT, Codex, OpenClaw, IronClaw, custom agents) reading and writing through MCP
- **Pipelines and orchestrators** (LangChain, CrewAI, custom workflow engines) coordinating multi-step work
- **Custom applications** that compose Neotoma into domain-specific products (CRM, financial systems, research tools)

Operational layers are not architecturally subdivided by Neotoma. They may be purely reactive or fully autonomous; they may reason and plan or just execute; they may run locally, on a server, or as a hosted service. Neotoma does not prescribe how they are structured — it only defines the contract for reading and writing state.

## 3. Strategy artifacts as state

A common point of confusion: where do plans, decisions, rules, preferences, and constraints live?

**They live in Neotoma as entities.** The act of strategizing happens in operational layers; the *artifacts* of strategizing are inert state stored in Neotoma:

- A plan an agent produces is a `plan` entity (or whatever schema applies).
- A decision an operator records is a `decision` entity with provenance.
- A constraint, rule, or preference is a `preference` / `rule` / `constraint` entity.
- An execution log entry from an agent action is an `agent_session` / `action` entity.

This is what "your strategy is state, Neotoma stores it" means. The state layer does not reason about the plan; it stores the plan. Operational layers read and act on it.

## 4. Layer boundary (single invariant)

**Operational layers MAY read truth and MUST write through observations only.** The state layer never decides, infers, or acts.

Truth updates flow only through:

1. Observations submitted via MCP / API by an operational layer
2. Reducers processing observations into entity snapshots
3. Updated memory graph
4. Substrate signals reporting the change to registered consumers

Operational layers MUST NOT write to underlying tables directly, mutate observations, or skip the reducer pipeline. The state layer MUST NOT subscribe to its own signals, prioritize signals, or take action based on them.

## 5. Substrate signaling

After every successful write, the state layer emits a structured event describing what changed. Operational layers MAY register webhook or SSE subscriptions to receive these events. Delivery is best-effort: no retry queues, no dead-letter queues, no exactly-once or in-order guarantees. Consumers are responsible for catch-up via state queries.

This is substrate-level infrastructure (analogous to a database's WAL, LISTEN/NOTIFY, or change data capture) — not strategy. The state layer reports what changed; consumers decide what to do about it. See [`philosophy.md`](philosophy.md) §5.9 (Signal Without Strategy) for the full invariant and [`scope_decisions.md`](scope_decisions.md) SD-002 for the scope boundary.

**Inbound vs. outbound disambiguation:** outbound state-change signals are derived REPORTS of completed writes; they flow OUT of the substrate, do not pass through reducers, and do not themselves cause state changes. Inbound observations are CAUSES of state changes that flow INTO the substrate from operational layers and are processed by reducers.

## 6. Composability

Any operational system can build on Neotoma. The same state layer supports:

- A personal agentic OS (cross-tool memory across Claude, Cursor, ChatGPT)
- A financial portfolio agent (e.g. Agentic Portfolio as an example operational system that reads truth, evaluates priorities, and emits decisions)
- A wallet-execution agent (e.g. Agentic Wallet as an example operational system that takes commands, performs side effects, and writes results back as observations)
- A multi-agent pipeline that hands off between subagents
- A team-shared knowledge graph

Agentic Portfolio and Agentic Wallet are illustrative examples of operational systems built on Neotoma; they are not architectural layers Neotoma prescribes.

The composability claim is stronger than "two layers cleanly separated": *any* operational system can build on the state layer, because the state layer makes no assumptions about what the operational system does. Read-only boundaries, the observation → reducer pattern, and MCP-based protocol access are the only contract.

## Event flow

```
Inbound signals (email, file uploads, API responses, agent writes, ...)
        │
        ▼
   Operational layer (agent / pipeline / app)
        │ writes via observation
        ▼
 ┌──────────────────────────────────────────┐
 │  Neotoma state layer                     │
 │  Observations → Reducers → Snapshots     │
 │                       │                  │
 │                       ▼                  │
 │               Substrate signal           │
 │               (webhook / SSE)            │
 └──────────────────────────┬───────────────┘
                            │ best-effort
                            ▼
              Operational layer subscriber
              (decides whether and how to react)
```

## Cross-references

- [`core_identity.md`](core_identity.md) — what Neotoma is and is not
- [`philosophy.md`](philosophy.md) — invariants and the substrate signaling rule (§5.9)
- [`composability_analysis.md`](composability_analysis.md) — full composability rationale
- [`scope_decisions.md`](scope_decisions.md) — scope boundaries (SD-002 substrate vs. strategy)
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — platform-level architecture
