# Neotoma Layered Architecture
## Core Architectural Model
Neotoma is designed as a **Truth Layer** that can support multiple upper layers implementing agent-driven data processing and action execution.
Neotoma is the **truth layer**:
- Event-sourced
- Reducer-driven
- Deterministic world model
- All agents read from it, none write to it directly
Above Neotoma sit two layers:
### A. Strategy Layer (General Strategy Engine)
This layer:
- Reads the current world state
- Evaluates priorities, constraints, risk, commitments, time, and financial posture
- Plans _what_ should happen next
- Outputs **Decisions** + **Commands** (intents)
- NEVER mutates truth or performs side effects
Strategy is pure cognition:
- State in → Decisions out
- Declarative, testable, deterministic
### B. Execution Layer (Agentic Wallet + Domain Agents)
This layer:
- Takes commands from the Strategy Layer
- Performs side effects using **external adapters** (email, scheduling APIs, financial services, messaging systems, etc.)
- Emits **Domain Events** describing what happened
- Domain Events are validated → Reducers → Updated world state
Execution is pure effect:
- Commands in → Events out
- All truth updates flow through reducers
## Example: Financial System Architecture
One important example is a financial system built on Neotoma:
```
┌───────────────────────────────────────────────┐
│      Execution Layer (Agentic Wallet +        │
│           Domain Agents)                      │
│   Takes Commands → Side Effects → Events      │
└───────────────────────────────▲──────────────┘
                                │ Reads Only
                                │ Receives Commands
                                ▼
┌───────────────────────────────────────────────┐
│      Strategy Layer (Agentic Portfolio        │
│      is an example instance)                   │
│   Reads State → Evaluates → Commands          │
└───────────────────────────────▲──────────────┘
                                │ Reads Only
                                ▼
┌───────────────────────────────────────────────┐
│               Neotoma (Truth Layer)           │
│   Event-sourced, Reducer-driven,              │
│   Domain Events → State Updates               │
└───────────────────────────────────────────────┘
```
**Note:** Agentic Portfolio is an example instance of the Strategy Layer. Agentic Wallet is part of the Execution Layer alongside domain agents. Many other agent-driven layers are possible. Neotoma is a general-purpose Truth Layer substrate, not limited to financial use cases.
## Event Flow & State Management
The closed loop of autonomy:
```
Inbound Signals (email, WhatsApp, calendar, financial data)
↓
Normalization → ActionItems
↓
Neotoma State (event log + reducers)
↓
Strategy Tick (General Strategy Engine)
↓
Decisions + Commands
↓
Execution Agents
↓
Domain Events (what actually happened)
↓
Reducers → Updated State
↓
Next Tick
```
## Layer Boundaries (Critical Invariant)
**Truth Layer (Neotoma):**
- Ingests, extracts, structures, stores
- Provides deterministic truth via event-sourced, reducer-driven model
- Processes Domain Events through reducers to update state
- MUST NOT implement strategy or execution logic
- MUST NOT mutate state directly (only via reducers processing Domain Events)
**Strategy Layer (Examples: Agentic Portfolio, General Strategy Engine):**
- Consume Neotoma truth (read-only)
- Evaluate priorities, constraints, risk, commitments
- Output Decisions + Commands
- MUST NOT mutate truth or perform side effects
- Pure cognition: State in → Decisions out
**Execution Layer (Examples: Agentic Wallet, Domain Agents):**
- Take commands from Strategy Layer
- Perform side effects using external adapters
- Emit Domain Events describing what happened
- MUST NOT mutate Neotoma truth directly (only via Domain Events → Reducers)
- Pure effect: Commands in → Events out
**Upper layers MAY read from Neotoma but MUST NEVER write or modify truth directly.**
**Truth updates flow only through:**
1. Domain Events emitted by Execution Layer
2. Reducers processing Domain Events
3. Updated world state
Any layer built on Neotoma must respect this boundary: it can read truth, but cannot mutate it except through the Domain Event → Reducer → State update flow.
