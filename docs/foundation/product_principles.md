---
title: Neotoma Product Principles
summary: "This mirrors the architectural invariant in `philosophy.md` §5.9 (Signal Without Strategy) in product-principle language. Practical implications for product decisions: - Substrate emits events for all state changes; consumers filter, pri..."
---

# Neotoma Product Principles
## 10.1 Truth Before Experience
Correctness > convenience. Never sacrifice accuracy for UX.
## 10.2 Explicit Over Implicit
Users control ingestion. No automatic background processing.
## 10.3 Minimal Over Magical
UI is an inspection window, not an AI showpiece. Show truth, don't embellish.
## 10.4 Schema Over Semantics
LLMs cannot determine truth; schemas do. Type-driven, not inference-driven.
## 10.5 Structure Over Interpretation
Store structured facts, not meaning. Extract fields, don't interpret intent.
## 10.6 Determinism Over Heuristics
If a rule can be misinterpreted, formalize it. No ambiguity.
## 10.7 Privacy Over Automation
- No background ingestion
- No message body ingestion
- No auto-scanning of cloud drives
- User explicitly provides all data

## 10.8 Signal Without Strategy
The state layer may signal state changes to consumers. It must not decide what those changes mean or what to do about them. Signaling is infrastructure; interpretation is the consumer's job.

This mirrors the architectural invariant in `philosophy.md` §5.9 (Signal Without Strategy) in product-principle language. Practical implications for product decisions:
- Substrate emits events for all state changes; consumers filter, prioritize, and react.
- No user-facing "important change" decisions live in the substrate.
- Delivery is best-effort; no retry queues, no dead-letter queues, no ordering guarantees in the substrate.
- See `scope_decisions.md` SD-002 for the boundary against strategy-layer notifications.
