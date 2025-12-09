# Neotoma Agent Instructions

_(Repository-Wide Instructions for AI Assistants)_

---

## Purpose

This document provides repository-wide instructions for AI assistants (Cursor, ChatGPT, Claude) working on Neotoma.

---

## 23. Repository-Wide Agent Instructions

Every AI assistant (Cursor, ChatGPT, Claude) working on Neotoma MUST follow:

### 23.1 Mandatory Loading Order

1. **Load `docs/context/index.md` FIRST** (navigation guide and entry point)
2. Load foundation documents from `docs/foundation/` as indicated by context index
3. Load task-specific docs as indicated by context index
4. Load `docs/conventions/documentation_standards.md` if creating/editing docs

### 23.2 Absolute Constraints

1. **Never violate Truth Layer boundaries** (no strategy/execution logic)
2. **Never introduce nondeterminism** (no random IDs, no LLM extraction in MVP)
3. **Never generate features outside MVP scope** (no semantic search, no agents)
4. **Always follow schema-first principles** (type-driven, not inference-driven)
5. **Enforce immutability** (raw_text, schema_type, extracted_fields)
6. **Enforce safety and explicit control** (user approves all ingestion)
7. **Always output deterministic, validated artifacts** (code, specs, docs)

### 23.3 Document Generation Rules

When generating docs, specs, or Feature Units:

1. **Treat foundation documents in `docs/foundation/` as root context** (resolve ambiguities here)
2. **Reject scope creep** (stay within Truth Layer)
3. **Validate against invariants** (MUST/MUST NOT lists)
4. **Apply constraints to all artifacts** (specs, code, tests)
5. **Treat forbidden patterns as errors** (halt and report)

### 23.4 Code Generation Rules

When writing code:

1. **Extraction MUST be rule-based** (regex, parsing; no LLM)
2. **IDs MUST be hash-based** (entities, events, records)
3. **All collections MUST be sorted** (deterministic iteration)
4. **Graph writes MUST be transactional** (all-or-nothing)
5. **Errors MUST use ErrorEnvelope** (structured, trace_id)
6. **No PII in logs** (record IDs only)

---

## 24. Risk Classification and Hold Points

### 24.1 When Agents MUST Stop

AI assistants MUST stop and request human approval for:

1. **Schema changes** (table structure, breaking JSONB changes)
2. **High-risk changes** (see `docs/private/governance/risk_classification.md`)
3. **Foundation document changes** (files in `docs/foundation/`)
4. **Security changes** (auth, RLS, encryption)
5. **Violating documented constraints** (even if user requests)

### 24.2 Risk Levels

**Low Risk:**

- Documentation updates
- UI text changes
- Unit test additions

**Medium Risk:**

- New Feature Units
- API endpoint additions
- Extraction logic changes

**High Risk:**

- Schema migrations
- Auth changes
- Breaking API changes

---

## 25. Final Invariants and Success Criteria

Neotoma MUST:

- **Preserve truth** (immutable, provenance-tracked)
- **Maintain determinism** (reproducible outputs)
- **Maintain stability** (no breaking changes)
- **Never infer meaning** (extract, don't interpret)
- **Never hallucinate** (no synthetic data)
- **Never mutate truth** (except metadata)
- **Never exceed its layer** (Truth only, no strategy/execution)

Neotoma MUST remain forever compatible with:

- **Agent-driven upper layers** (e.g., Strategy Layer with Agentic Portfolio as example, Execution Layer with Agentic Wallet as part)
- **AI-native operating environments** (MCP, agents)
- **Deterministic computational reasoning** (reproducible, testable)

Any layer built on Neotoma must respect the read-only boundary: it can consume truth but cannot mutate it except through the Domain Event → Reducer → State update flow.

---

## 26. How to Use This Document

### 26.1 For AI Assistants

**Every session:**

1. Load `docs/context/index.md` first
2. Load foundation documents from `docs/foundation/`
3. Reference foundation documents to resolve ambiguities
4. Validate all outputs against invariants
5. Stop at hold points for human approval

**When uncertain:**

- Default to conservative interpretation
- Prioritize determinism over convenience
- Prioritize correctness over feature richness
- Ask for clarification rather than guess

### 26.2 For Human Developers

**Before starting work:**

1. Read `docs/context/index.md`
2. Read foundation documents from `docs/foundation/`
3. Read relevant subsystem docs as indicated by context index
4. Understand which layer you're working in (Truth only)
5. Verify feature fits within Neotoma's scope

**During implementation:**

- Follow schema-first approach
- Write deterministic code
- Test for reproducibility
- Document all assumptions

**Before committing:**

- Verify alignment with manifest
- Check MUST/MUST NOT lists
- Run full test suite
- Update docs if patterns changed

---

## Constraints Agents Must Enforce

1. **Truth Layer boundaries:** MUST NOT implement strategy, execution, or agent logic in Neotoma code
2. **Determinism:** MUST NOT introduce randomness, LLM extraction (MVP), or nondeterministic logic (no `Date.now()` in business logic, no random IDs, no unstable sorting)
3. **Immutability:** MUST NOT modify `raw_text`, `schema_type`, or `extracted_fields` after storage (only metadata mutable)
4. **Schema-first:** MUST use application types from `docs/subsystems/record_types.md` (e.g., `invoice`, `receipt`), NOT schema families (e.g., `Financial`, `Productivity`)
5. **Explicit control:** MUST NOT implement automatic ingestion, background scanning, or implicit data collection
6. **Provenance:** MUST trace all outputs to source file + extraction rule + timestamp
7. **Graph integrity:** MUST maintain zero orphans, no cycles, typed edges only, transactional writes
8. **Privacy:** MUST NOT log PII from `properties` (record IDs only, not extracted fields)
9. **Multi-pattern matching:** MUST use 2+ patterns for schema detection (see `record_types.md`)
10. **Consistency models:** MUST apply correct consistency tier per subsystem (strong vs bounded eventual)

### Forbidden Patterns

- Violating Truth Layer boundaries (implementing strategy, execution, or autonomous agent behavior in Neotoma)
- Introducing nondeterminism (random IDs, LLM extraction in MVP, unstable sorting, `Date.now()` in logic)
- Generating features outside MVP scope (semantic search, real-time collaboration, predictive analytics)
- Breaking immutability (modifying raw_text, schema_type, extracted_fields after initial storage)
- Inferring beyond extraction (creating entities not present in fields, inferring relationships)
- Using schema families as database types (code must use application types: `invoice` not `Financial`)
- Schema mutations (changing assigned schema_type after creation)
- Synthetic data (guessing missing information, hallucinating fields)
- Upward dependencies (Domain layer calling Application or Presentation layers)
- Non-transactional graph writes (all record+entity+event inserts must be atomic)

### Validation Checklist

- [ ] Change respects Truth Layer boundaries (no strategy/execution logic)
- [ ] No nondeterministic logic introduced (no randomness, no LLM in MVP, no unstable sorts)
- [ ] Immutability preserved (raw_text, schema_type, extracted_fields immutable)
- [ ] Schema changes are additive only (no breaking changes, no column removal)
- [ ] Uses application types from `record_types.md` (not schema families)
- [ ] Multi-pattern matching for schema detection (2+ patterns required)
- [ ] Graph integrity maintained (no orphans, no cycles, transactional writes)
- [ ] Privacy preserved (no PII in logs, only record IDs)
- [ ] Provenance maintained (all outputs trace to source + rule)
- [ ] Consistency model correct (strong vs bounded eventual per subsystem)
- [ ] Tests cover all new paths (unit, integration, E2E as appropriate)
- [ ] Documentation updated to reflect changes
- [ ] Feature fits within Neotoma scope (Truth Layer only)
- [ ] No violations of MUST/MUST NOT lists

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide (primary entry point)
- [`docs/foundation/philosophy.md`](./philosophy.md) — Core philosophy and architectural invariants
- [`docs/foundation/layered_architecture.md`](./layered_architecture.md) — Layered architecture
- [`docs/conventions/documentation_standards.md`](../conventions/documentation_standards.md) — Documentation standards
