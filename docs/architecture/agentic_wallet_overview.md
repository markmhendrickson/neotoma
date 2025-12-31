# Agentic Wallet Overview
## Purpose
The **Agentic Wallet** is part of the **Execution Layer** in Neotoma's layered architecture.  
It demonstrates how the Execution Layer operates as pure effect: taking Commands from the Strategy Layer, performing side effects via external adapters, and emitting Domain Events that flow through reducers to update world state.
It interprets the strategy defined by the Strategy Layer (e.g., Agentic Portfolio) and decides **how** to implement it operationally across chains, venues, and liquidity sources.
Unlike the Strategy Layer, the Agentic Wallet (Execution Layer):
- Takes Commands from Strategy Layer  
- Performs side effects using external adapters  
- Emits Domain Events describing what happened  
- Holds keys (local or MPC)  
- Signs transactions  
- Submits transactions  
- Handles complex multi-chain routing  
The Wallet is an **agentic executor**, not the origin of strategy.
## Role in Neotoma Architecture
- Neotoma = Truth Layer (event-sourced, reducer-driven)  
- Strategy Layer = Pure Cognition ("what should happen", e.g., Agentic Portfolio)  
- Execution Layer = Pure Effect ("how it should happen", Agentic Wallet is part of this layer)  
### Execution Layer Responsibilities (Agentic Wallet as Part)
As part of the Execution Layer, Agentic Wallet:
- **Takes Commands from Strategy Layer**
- **Performs side effects using external adapters** (TradingAdapter, PaymentsAdapter, etc.)
- **Emits Domain Events** describing what actually happened (TRADE_EXECUTED, PAYMENT_INITIATED, etc.)
- **NEVER mutates Neotoma truth directly** (only via Domain Events → Reducers)
Execution is pure effect:
- Commands in → Events out
- All truth updates flow through reducers
### Core Responsibilities
- Take Commands from Strategy Layer  
- Convert high-level goals into specific transactional operations  
- Evaluate venue options (DEX, CEX, L2, RWA issuers)  
- Perform risk-aware routing and bridging  
- Compute optimal execution paths under constraints  
- Hold keys securely (local/MPC)  
- Sign and submit transactions via adapters  
- Emit Domain Events for post-execution reconciliation (events flow through reducers to update state)  
## Execution Model
Given a Command from Strategy Layer (e.g. "rebalance BTC from 75% to 60%"):
1. Take Command from Strategy Layer  
2. Analyze liquidity and slippage across venues  
3. Determine optimal sell-side routes  
4. Evaluate bridging options to reach target chain(s)  
5. Sign transactions sequentially or atomically via TradingAdapter  
6. Submit transactions via TradingAdapter  
7. Emit Domain Events (e.g., TRADE_EXECUTED) describing what happened  
8. Domain Events flow through Reducers → Updated world state in Neotoma  
9. Strategy Layer reads updated state on next tick  
The Wallet must **never** alter strategy rules; it must honor the Strategy Layer's constraints.
The Wallet must **never** mutate Neotoma truth directly; all updates flow through Domain Events → Reducers.
## Non-Custodial vs Custodial Modes
The Agentic Wallet does hold keys, but the mode varies:
- **Local custody**: Wallet runs locally on user device; keys stored in secure enclave  
- **MPC custody**: Distributed key shares  
- **Hardware-backed**: Ledger, Trezor, or similar devices integrated as signing endpoints  
Regardless of mode, the Wallet executes only within the strategy boundaries defined by the Portfolio.
## Relationship with Strategy Layer (Agentic Portfolio)
The Wallet (Execution Layer) answers:
- How do we operationalize the strategy?  
- Which venue is optimal?  
- What sequence of transactions satisfies constraints?  
- How do we minimize slippage, fees, and risk?  
The Strategy Layer (e.g., Agentic Portfolio) defines *intent* and outputs Commands.  
The Execution Layer (including Agentic Wallet) computes *actions* and emits Domain Events.
### Event Flow
```
Strategy Layer (Agentic Portfolio)
  ↓ Outputs Commands
  ↓
Execution Layer (Agentic Wallet + Domain Agents)
  ↓ Takes Commands
  ↓ Performs side effects via adapters
  ↓ Emits Domain Events (TRADE_EXECUTED, PAYMENT_INITIATED, etc.)
  ↓
Neotoma (Truth Layer)
  ↓ Reducers process Domain Events
  ↓ Updated world state
  ↓
Next Strategy Tick reads updated state
```
## Agent Instructions
- The Wallet (Execution Layer) must take Commands from Strategy Layer.  
- It must produce deterministic action bundles and plans.  
- It must sign only actions compliant with strategy constraints.  
- It must emit Domain Events describing what actually happened (not just intentions).  
- It must never mutate Neotoma truth directly (all updates via Domain Events → Reducers).  
- It must never self-modify strategy or rules (that's Strategy Layer's responsibility).
- **Critical:** Execution Layer functions are pure effect: Commands in → Events out. All side effects go through adapters. All truth updates flow through Domain Events → Reducers.  
## Example Use Cases
- Executing a cross-chain rebalance pipeline  
- Yield migration (e.g., staking → RWA minting)  
- Liquidity-aware swap routing  
- Risk-driven deleveraging operation  
- High-frequency micro-rebalancing driven by strategic envelopes  
