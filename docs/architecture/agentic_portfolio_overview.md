# Agentic Portfolio Overview

## Purpose

The **Agentic Portfolio** is the strategic decision-making layer of Neotoma's financial system.  

It encodes what *should* happen to a user's financial position over time, in deterministic, inspectable, agent-operable form.  

It is the canonical representation of **intent**, **strategy**, **constraints**, and **allowable transformations** of a portfolio.

The Agentic Portfolio is not an executor.  

It defines strategy-as-data and exposes it so that agents—including the Agentic Wallet—can compute compliant actions.

---

## Role in Neotoma Architecture

Neotoma = Truth  

Agentic Portfolio = Intent + Strategy  

Agentic Wallet = Execution

### Core Responsibilities

- Define **target allocations**  

- Encode **risk constraints** and **boundaries**  

- Define **permissible transformations** (rebalance, accumulate, reduce, roll, unwind)  

- Define **rebalance triggers** and deviation thresholds  

- Define **long-horizon strategy trajectories**  

- Define **scenario-driven rules** (e.g., max exposure to chain X when volatility > Y)  

- Provide deterministic, immutable portfolios that multiple agents can reason over identically  

### Explicit "What Should Happen" Decision-Making

The Agentic Portfolio answers:

- What should my exposures be?  

- When should they shift?  

- Under what conditions does rebalancing occur?  

- How should allocations evolve as markets change?  

- What assets are allowable or forbidden?  

It does **not** decide *how* to achieve these transitions on-chain.

---

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

---

## Relationship with Agentic Wallet

- The Agentic Portfolio defines the *goal state* and *rules*.  

- The Agentic Wallet generates the *action plan* and executes it.  

- The Wallet reads the Portfolio; the Portfolio never reads or depends on the Wallet.  

- The Wallet must provide receipts and confirmations back to Neotoma, which updates portfolio truth.

**Portfolio = strategy**  

**Wallet = execution**  

---

## Agent Instructions

- Agents may query the strategy graph and compute next eligible transformations.  

- Agents must not mutate the portfolio directly—only propose transformations compliant with rules.  

- The portfolio state may be recomputed deterministically and compared against proposed changes.  

- All strategic outputs must remain inspectable and fully explainable.

---

## Example Use Cases

- Long-term BTC accumulation with dynamic rebalance rules  

- Structured risk reduction strategies  

- Multi-asset yield optimization under stable constraints  

- RWA allocation boundaries and rebalance trajectories  

- Personalized risk envelopes encoded as deterministic rules  

---
