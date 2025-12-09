# Neotoma Product Principles

_(Principles That MUST Be Reflected in Every File, UI, and Feature)_

---

## Purpose

This document defines product principles that MUST be reflected in every file, UI, and feature.

---

## 10.1 Truth Before Experience

Correctness > convenience. Never sacrifice accuracy for UX.

---

## 10.2 Explicit Over Implicit

Users control ingestion. No automatic background processing.

---

## 10.3 Minimal Over Magical

UI is an inspection window, not an AI showpiece. Show truth, don't embellish.

---

## 10.4 Schema Over Semantics

LLMs cannot determine truth; schemas do. Type-driven, not inference-driven.

---

## 10.5 Structure Over Interpretation

Store structured facts, not meaning. Extract fields, don't interpret intent.

---

## 10.6 Determinism Over Heuristics

If a rule can be misinterpreted, formalize it. No ambiguity.

---

## 10.7 Privacy Over Automation

- No background ingestion
- No message body ingestion
- No auto-scanning of cloud drives
- User explicitly provides all data

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/foundation/philosophy.md`](./philosophy.md) — Core philosophy
- [`docs/ui/design_system.md`](../ui/design_system.md) — UI design system
