# Agentic Wallet Overview

## Purpose

The **Agentic Wallet** is the execution and tactical reasoning layer of Neotoma's system.  

It interprets the strategy defined by the Agentic Portfolio and decides **how** to implement it operationally across chains, venues, and liquidity sources.

Unlike the portfolio, the Agentic Wallet:

- Holds keys (local or MPC)  

- Signs transactions  

- Submits transactions  

- Handles complex multi-chain routing  

- Provides receipts and confirmations back to Neotoma  

The Wallet is an **agentic executor**, not the origin of strategy.

---

## Role in Neotoma Architecture

- Neotoma = data truth + validation  

- Agentic Portfolio = strategic intent ("what should happen")  

- Agentic Wallet = tactical realization ("how it should happen")  

### Core Responsibilities

- Interpret portfolio-level intent  

- Convert high-level goals into specific transactional operations  

- Evaluate venue options (DEX, CEX, L2, RWA issuers)  

- Perform risk-aware routing and bridging  

- Compute optimal execution paths under constraints  

- Hold keys securely (local/MPC)  

- Sign and submit transactions  

- Provide verifiable receipts for post-execution reconciliation  

---

## Execution Model

Given a strategy directive (e.g. "rebalance BTC from 75% to 60%"):

1. Analyze liquidity and slippage across venues  

2. Determine optimal sell-side routes  

3. Evaluate bridging options to reach target chain(s)  

4. Sign transactions sequentially or atomically  

5. Submit transactions  

6. Report precise results to Neotoma Truth Layer  

7. Allow portfolio recomputation and verification  

The Wallet must **never** alter strategy rules; it must honor the Agentic Portfolio's constraints.

---

## Non-Custodial vs Custodial Modes

The Agentic Wallet does hold keys, but the mode varies:

- **Local custody**: Wallet runs locally on user device; keys stored in secure enclave  

- **MPC custody**: Distributed key shares  

- **Hardware-backed**: Ledger, Trezor, or similar devices integrated as signing endpoints  

Regardless of mode, the Wallet executes only within the strategy boundaries defined by the Portfolio.

---

## Relationship with Agentic Portfolio

The Wallet answers:

- How do we operationalize the strategy?  

- Which venue is optimal?  

- What sequence of transactions satisfies constraints?  

- How do we minimize slippage, fees, and risk?  

The Portfolio defines *intent*.  

The Wallet computes *actions*.

---

## Agent Instructions

- The Wallet must introspect the Agentic Portfolio for constraints and rules.  

- It must produce deterministic action bundles and plans.  

- It must sign only actions compliant with strategy.  

- It must export receipts and outcomes for truth-layer reconciliation.  

- It must never self-modify strategy or rules.  

---

## Example Use Cases

- Executing a cross-chain rebalance pipeline  

- Yield migration (e.g., staking → RWA minting)  

- Liquidity-aware swap routing  

- Risk-driven deleveraging operation  

- High-frequency micro-rebalancing driven by strategic envelopes  

---
