# Agentic Portfolio Overview
## Purpose
The **Agentic Portfolio** is an example **operational system** built on Neotoma's state layer — a financial reasoning system that reads truth from Neotoma, evaluates priorities and constraints, and outputs Decisions + Commands stored back as state.
The Agentic Portfolio encodes what _should_ happen to a user's financial position over time, in deterministic, inspectable, agent-operable form.
It is the canonical representation of **intent**, **strategy**, **constraints**, and **allowable transformations** of a portfolio.
The Agentic Portfolio is not an executor.
It defines strategy-as-data and exposes it so that other operational systems — including the Agentic Wallet — can compute compliant actions.
## Role in Neotoma Architecture
Neotoma = State Layer (event-sourced, reducer-driven). The Agentic Portfolio sits in the **operational layer** as one example operational system. It is not an architectural layer Neotoma extends into; it is an example of what an operational system focused on financial reasoning looks like.
### Operational responsibilities (Agentic Portfolio as Example)
Agentic Portfolio:
- **Reads current world state** from Neotoma (read-only)
- **Evaluates priorities, constraints, risk, commitments, time, and financial posture**
- **Plans what should happen next**
- **Outputs Decisions + Commands** (intents) — stored back in Neotoma as `decision` / `command` entities
- **NEVER mutates truth directly**

The reasoning style is pure cognition:
- State in → Decisions out
- Declarative, testable, deterministic
### Core Responsibilities
- Define **target allocations**
- Encode **risk constraints** and **boundaries**
- Define **permissible transformations** (rebalance, accumulate, reduce, roll, unwind)
- Define **rebalance triggers** and deviation thresholds
- Define **long-horizon strategy trajectories**
- Define **scenario-driven rules** (e.g., max exposure to chain X when volatility > Y)
- Provide deterministic, immutable portfolios that multiple agents can reason over identically
- Evaluate multi-domain reasoning (financial flows, portfolio management, tax & entity logic)
- Enforce constraint & value enforcement (budgets, time blocks, autonomy caps, risk tolerances)
### Explicit "What Should Happen" Decision-Making
The Agentic Portfolio answers:
- What should my exposures be?
- When should they shift?
- Under what conditions does rebalancing occur?
- How should allocations evolve as markets change?
- What assets are allowable or forbidden?
It does **not** decide _how_ to achieve these transitions on-chain (that's an effect-style operational system's responsibility — e.g., Agentic Wallet).
It does **not** perform side effects or mutate truth (all truth updates flow through Domain Events → Reducers).
## Data Model (High-Level)
Core objects:
- **Portfolio State**
  - asset list
  - quantities
  - valuations
  - metadata
- **Strategy Graph**
  - target allocations
  - constraints
  - optimization preferences
- **Transformation Rules**
  - rebalance rules
  - drift thresholds
  - allowable transformation classes
- **Trajectory Plans**
  - multi-step objectives
  - long-horizon allocation envelopes
All fields are deterministic, versioned, and validated by the Neotoma State Layer.
## Relationship with Effect-Style Operational Systems (Agentic Wallet + Domain Agents)
- Agentic Portfolio defines the _goal state_ and _rules_.
- Effect-style operational systems (including Agentic Wallet) read those Commands from Neotoma and execute them via adapters.
- Agentic Portfolio never reads or depends on the effect-style operational system; it only produces Commands.
- Effect-style operational systems emit Domain Events (e.g., TRADE_EXECUTED, PAYMENT_INITIATED) describing what happened.
- Domain Events flow through Reducers → Updated world state in Neotoma.
**Portfolio = reasoning-style operational system (pure cognition)**
**Wallet = effect-style operational system (pure effect)**
### Event Flow
```
Agentic Portfolio (reasoning-style operational system)
  ↓ Reads world state from Neotoma
  ↓ Evaluates priorities/constraints
  ↓ Outputs Decisions + Commands (stored as state in Neotoma)
  ↓
Agentic Wallet + Domain Agents (effect-style operational system)
  ↓ Reads Commands from Neotoma
  ↓ Performs side effects via adapters
  ↓ Emits Domain Events
  ↓
Neotoma (State Layer)
  ↓ Reducers process Domain Events
  ↓ Updated world state
  ↓
Next reasoning tick
```
## Agent Instructions
- Agents may query the strategy graph and compute next eligible transformations.
- Agents must not mutate the portfolio directly—only propose transformations compliant with rules.
- The portfolio state may be recomputed deterministically and compared against proposed changes.
- All strategic outputs must remain inspectable and fully explainable.
- **Critical:** Agentic Portfolio MUST NOT perform side effects or mutate Neotoma truth directly. All truth updates flow through Domain Events → Reducers.
- Reasoning-style functions are pure: State in → Decisions out. No file I/O, no external API calls, no state mutations.
## Example Use Cases
- Long-term BTC accumulation with dynamic rebalance rules
- Structured risk reduction strategies
- Multi-asset yield optimization under stable constraints
- RWA allocation boundaries and rebalance trajectories
- Personalized risk envelopes encoded as deterministic rules
