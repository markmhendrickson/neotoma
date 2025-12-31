# Agentic Portfolio Overview
## Purpose
The **Agentic Portfolio** is an example instance of the **Strategy Layer** in Neotoma's layered architecture.
It demonstrates how the Strategy Layer (General Strategy Engine) operates as pure cognition: reading world state, evaluating priorities and constraints, and outputting Decisions + Commands.
The Agentic Portfolio encodes what _should_ happen to a user's financial position over time, in deterministic, inspectable, agent-operable form.
It is the canonical representation of **intent**, **strategy**, **constraints**, and **allowable transformations** of a portfolio.
The Agentic Portfolio is not an executor.
It defines strategy-as-data and exposes it so that agents—including the Agentic Wallet—can compute compliant actions.
## Role in Neotoma Architecture
Neotoma = Truth Layer (event-sourced, reducer-driven)
Strategy Layer = Pure Cognition (Agentic Portfolio is an example instance)
Execution Layer = Pure Effect (Agentic Wallet is part of this layer)
### Strategy Layer Responsibilities (Agentic Portfolio as Example)
As part of the Strategy Layer, Agentic Portfolio:
- **Reads current world state** from Neotoma (read-only)
- **Evaluates priorities, constraints, risk, commitments, time, and financial posture**
- **Plans what should happen next**
- **Outputs Decisions + Commands** (intents)
- **NEVER mutates truth or performs side effects**
Strategy is pure cognition:
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
It does **not** decide _how_ to achieve these transitions on-chain (that's the Execution Layer's responsibility).
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
All fields are deterministic, versioned, and validated by the Neotoma Truth Layer.
## Relationship with Execution Layer (Agentic Wallet + Domain Agents)
- The Agentic Portfolio (Strategy Layer) defines the _goal state_ and _rules_.
- The Execution Layer (including Agentic Wallet) takes Commands and executes them via adapters.
- The Execution Layer reads Commands from Strategy Layer; Strategy Layer never reads or depends on Execution Layer.
- The Execution Layer emits Domain Events (e.g., TRADE_EXECUTED, PAYMENT_INITIATED) describing what happened.
- Domain Events flow through Reducers → Updated world state in Neotoma.
**Portfolio = Strategy Layer (pure cognition)**
**Wallet = Execution Layer (pure effect)**
### Event Flow
```
Agentic Portfolio (Strategy Layer)
  ↓ Reads world state
  ↓ Evaluates priorities/constraints
  ↓ Outputs Decisions + Commands
  ↓
Execution Layer (Agentic Wallet + Domain Agents)
  ↓ Takes Commands
  ↓ Performs side effects via adapters
  ↓ Emits Domain Events
  ↓
Neotoma (Truth Layer)
  ↓ Reducers process Domain Events
  ↓ Updated world state
  ↓
Next Strategy Tick
```
## Agent Instructions
- Agents may query the strategy graph and compute next eligible transformations.
- Agents must not mutate the portfolio directly—only propose transformations compliant with rules.
- The portfolio state may be recomputed deterministically and compared against proposed changes.
- All strategic outputs must remain inspectable and fully explainable.
- **Critical:** Agentic Portfolio (Strategy Layer) MUST NOT perform side effects or mutate truth. All truth updates flow through Domain Events → Reducers.
- Strategy Layer functions are pure: State in → Decisions out. No file I/O, no external API calls, no state mutations.
## Example Use Cases
- Long-term BTC accumulation with dynamic rebalance rules
- Structured risk reduction strategies
- Multi-asset yield optimization under stable constraints
- RWA allocation boundaries and rebalance trajectories
- Personalized risk envelopes encoded as deterministic rules
