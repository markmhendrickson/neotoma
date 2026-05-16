---
title: Agentic Wallet Overview
summary: "The execution style is pure effect: - Commands in → Events out - All truth updates flow through reducers ### Core Responsibilities - Read Commands from Neotoma - Convert high-level goals into specific transactional operations - Evaluate ..."
---

# Agentic Wallet Overview
## Purpose
The **Agentic Wallet** is an example **operational system** built on Neotoma's state layer — a financial effect system that reads Commands stored in Neotoma, performs side effects via external adapters, and emits Domain Events back into Neotoma's reducer pipeline.
It interprets the strategy authored by a reasoning-style operational system (e.g., Agentic Portfolio) and decides **how** to implement it operationally across chains, venues, and liquidity sources.
Unlike a reasoning-style operational system, the Agentic Wallet:
- Reads Commands from Neotoma
- Performs side effects using external adapters
- Emits Domain Events describing what happened
- Holds keys (local or MPC)
- Signs transactions
- Submits transactions
- Handles complex multi-chain routing
The Wallet is an **agentic executor**, not the origin of strategy.
## Role in Neotoma Architecture
- Neotoma = State Layer (event-sourced, reducer-driven)
- Operational Layer = any agent/pipeline/system above Neotoma. Agentic Wallet is one example operational system focused on financial side effects; Agentic Portfolio is another example focused on financial reasoning.
### Operational responsibilities (Agentic Wallet as Example)
Agentic Wallet:
- **Reads Commands from Neotoma**
- **Performs side effects using external adapters** (TradingAdapter, PaymentsAdapter, etc.)
- **Emits Domain Events** describing what actually happened (TRADE_EXECUTED, PAYMENT_INITIATED, etc.)
- **NEVER mutates Neotoma truth directly** (only via Domain Events → Reducers)

The execution style is pure effect:
- Commands in → Events out
- All truth updates flow through reducers
### Core Responsibilities
- Read Commands from Neotoma
- Convert high-level goals into specific transactional operations
- Evaluate venue options (DEX, CEX, L2, RWA issuers)
- Perform risk-aware routing and bridging
- Compute optimal execution paths under constraints
- Hold keys securely (local/MPC)
- Sign and submit transactions via adapters
- Emit Domain Events for post-execution reconciliation (events flow through reducers to update state)
## Execution Model
Given a Command from a reasoning-style operational system (e.g. "rebalance BTC from 75% to 60%"):
1. Read Command from Neotoma
2. Analyze liquidity and slippage across venues
3. Determine optimal sell-side routes
4. Evaluate bridging options to reach target chain(s)
5. Sign transactions sequentially or atomically via TradingAdapter
6. Submit transactions via TradingAdapter
7. Emit Domain Events (e.g., TRADE_EXECUTED) describing what happened
8. Domain Events flow through Reducers → Updated world state in Neotoma
9. The reasoning-style operational system reads updated state on its next tick
The Wallet must **never** alter strategy rules; it must honor the constraints encoded by the reasoning-style operational system.
The Wallet must **never** mutate Neotoma truth directly; all updates flow through Domain Events → Reducers.
## Non-Custodial vs Custodial Modes
The Agentic Wallet does hold keys, but the mode varies:
- **Local custody**: Wallet runs locally on user device; keys stored in secure enclave
- **MPC custody**: Distributed key shares
- **Hardware-backed**: Ledger, Trezor, or similar devices integrated as signing endpoints
Regardless of mode, the Wallet executes only within the strategy boundaries defined by the Portfolio.
## Relationship with Reasoning-Style Operational Systems (Agentic Portfolio)
The Wallet answers:
- How do we operationalize the strategy?
- Which venue is optimal?
- What sequence of transactions satisfies constraints?
- How do we minimize slippage, fees, and risk?
A reasoning-style operational system (e.g., Agentic Portfolio) defines *intent* and outputs Commands stored as state. The effect-style operational system (Agentic Wallet) reads those commands and emits Domain Events describing the actions actually taken.
### Event Flow
```
Reasoning-style operational system (Agentic Portfolio)
  ↓ Outputs Commands (stored in Neotoma)
  ↓
Effect-style operational system (Agentic Wallet + Domain Agents)
  ↓ Reads Commands from Neotoma
  ↓ Performs side effects via adapters
  ↓ Emits Domain Events (TRADE_EXECUTED, PAYMENT_INITIATED, etc.)
  ↓
Neotoma (State Layer)
  ↓ Reducers process Domain Events
  ↓ Updated world state
  ↓
Next reasoning tick reads updated state
```
## Agent Instructions
- The Wallet must read Commands from Neotoma.
- It must produce deterministic action bundles and plans.
- It must sign only actions compliant with strategy constraints.
- It must emit Domain Events describing what actually happened (not just intentions).
- It must never mutate Neotoma truth directly (all updates via Domain Events → Reducers).
- It must never self-modify strategy or rules (that's the reasoning-style operational system's responsibility).
- **Critical:** Effect-style operational functions are pure effect: Commands in → Events out. All side effects go through adapters. All truth updates flow through Domain Events → Reducers.
## Example Use Cases
- Executing a cross-chain rebalance pipeline
- Yield migration (e.g., staking → RWA minting)
- Liquidity-aware swap routing
- Risk-driven deleveraging operation
- High-frequency micro-rebalancing driven by strategic envelopes
