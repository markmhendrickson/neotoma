---
description: "Primary entrypoint for all AI assistants and developers, providing complete map of documentation system and reading-order rules"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: docs/context/index_rules.mdc -->


# Neotoma Documentation System — Index and Navigation Guide

_(Primary Entrypoint for All AI Agents and Developers)_

---

## Purpose

This document serves as the **primary entrypoint** for all AI assistants (Cursor, ChatGPT, Claude, IDE agents) and developers working on the Neotoma codebase. It provides:

1. A complete map of the documentation system
2. Reading-order rules for different types of changes
3. Dependency relationships between documents
4. Quick-reference guide to finding relevant context
5. Rules for deterministic documentation consumption

**Every agent session MUST begin by loading this file.**

---

## Scope

This index covers:

- All documentation files in the `docs/` directory
- Reading strategies for different change types
- Documentation dependency graph
- Feature Unit workflow integration

This index does NOT cover:

- Implementation details (see subsystem docs)
- Specific API contracts (see architecture docs)
- Test execution (see testing docs)

---

## 1. Documentation Hierarchy and Reading Order

### 1.1 Foundational Documents (Load FIRST, ALWAYS)

These documents are the **root of truth** for all Neotoma work:

1. **Foundation Documents** (`docs/foundation/`)
   - **Core Identity:** [`docs/foundation/core_identity.md`](../foundation/core_identity.md) — What Neotoma is and is not
   - **Philosophy:** [`docs/foundation/philosophy.md`](../foundation/philosophy.md) — Core principles and architectural invariants
   - **Layered Architecture:** [`docs/foundation/layered_architecture.md`](../foundation/layered_architecture.md) — Truth Layer, Strategy Layer, Execution Layer
   - **Problem Statement:** [`docs/foundation/problem_statement.md`](../foundation/problem_statement.md) — Why Neotoma exists
   - **Product Positioning:** [`docs/foundation/product_positioning.md`](../foundation/product_positioning.md) — Market positioning
   - **User Workflows:** [`docs/foundation/user_workflows.md`](../foundation/user_workflows.md) — Key workflows
   - **Product Principles:** [`docs/foundation/product_principles.md`](../foundation/product_principles.md) — Product design principles
   - **Data Models:** [`docs/foundation/data_models.md`](../foundation/data_models.md) — Global data commitments
   - **Entity Resolution:** [`docs/foundation/entity_resolution.md`](../foundation/entity_resolution.md) — Entity doctrine
   - **Timeline Events:** [`docs/foundation/timeline_events.md`](../foundation/timeline_events.md) — Event doctrine
   - **AI Safety:** [`docs/foundation/ai_safety.md`](../foundation/ai_safety.md) — AI tool interaction rules
   - **Quality Requirements:** [`docs/foundation/quality_requirements.md`](../foundation/quality_requirements.md) — Testing, observability, privacy, security
   - **Agent Instructions:** [`docs/foundation/agent_instructions.md`](../foundation/agent_instructions.md) — Complete agent instructions and validation checklist
   - **Load foundation documents FIRST in every agent session**

2. **[`docs/private/governance/00_GENERATION.md`](../private/governance/00_GENERATION.md)**
   - Master checklist for documentation generation
   - Required sections for each doc type
   - Global doctrine (determinism, Truth Layer boundaries)
   - **Load when creating or regenerating documentation**

### 1.2 Documentation Conventions

4. **[`docs/conventions/documentation_standards.md`](../conventions/documentation_standards.md)**
   - Shared formatting, structure, and style rules
   - Mermaid diagram standards
   - Example formatting requirements
   - MUST/MUST NOT language conventions
   - **Load when creating or modifying any documentation**

5. **[`docs/conventions/code_conventions.md`](../conventions/code_conventions.md)**
   - Code style, naming, and organization patterns
   - TypeScript/TSX, SQL, YAML, and Shell script conventions
   - Determinism requirements, error handling patterns
   - Testing patterns and code organization
   - **Load when writing or reviewing code**

6. **[`docs/conventions/plan_format_rules.md`](../conventions/plan_format_rules.md)**
   - Plan content requirements for agent generated plans
   - **Load when creating or updating plans**

7. **[`docs/conventions/native_browser_debugging_rules.mdc`](../conventions/native_browser_debugging_rules.mdc)**
   - Native browser requirement for UI debugging and verification
   - **Load when debugging or verifying UI flows**

---

## 2. Documentation Categories and Structure

See docs/context/index_rules.mdc Section 2 (document categories and tables) and Section 3 (dependency graph) for the full index.

---

## 4. Reading Strategies by Change Type

### 4.1 Adding a New Feature

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Verify feature fits Truth Layer scope and product vision
2. `docs/foundation/layered_architecture.md` — Understand layer boundaries
3. `docs/foundation/product_principles.md` — Ensure principles are reflected
4. `docs/feature_units/standards/feature_unit_spec.md` — Understand Feature Unit structure
5. `docs/feature_units/standards/manifest_template.yaml` — Create manifest
6. Relevant subsystem docs (e.g., `ingestion.md`, `search.md`)
7. `docs/testing/testing_standard.md` — Plan testing strategy
8. `docs/private/governance/risk_classification.md` — Assess risk level

### 4.2 Modifying Database Schema

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Verify immutability constraints
2. `docs/foundation/layered_architecture.md` — Understand event-sourced architecture
3. `docs/subsystems/schema.md` — Understand current schema and evolution rules
4. `docs/subsystems/schema_registry.md` — Schema versioning and registry patterns
5. `docs/architecture/determinism.md` — Ensure deterministic migration
6. `docs/migration/migrations_lifecycle.md` — Plan migration strategy
7. `docs/private/governance/risk_classification.md` — Schema changes are typically high-risk

### 4.3 Building a UI Component

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — UI as inspection window, not agent
2. `docs/foundation/product_principles.md` — Truth Before Experience, Minimal Over Magical
3. `docs/ui/dsl_spec.md` — UI DSL structure
4. Relevant `docs/ui/patterns/*.md` — Appropriate pattern (list/detail/dashboard/etc.)
5. `docs/subsystems/accessibility.md` — A11y requirements
6. `docs/subsystems/i18n.md` — Localization requirements
7. `docs/testing/testing_standard.md` — UI testing requirements

### 4.4 Implementing Ingestion Logic

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Determinism, explicit control, provenance
2. `docs/foundation/layered_architecture.md` — Truth Layer boundaries
3. `docs/foundation/product_principles.md` — Explicit Over Implicit, Determinism Over Heuristics
4. `docs/architecture/architecture.md` — Ingestion layer boundaries
5. `docs/subsystems/ingestion/ingestion.md` — Full pipeline details (includes observation creation)
6. `docs/subsystems/ingestion/state_machines.md` — State transitions
7. `docs/subsystems/schema.md` — Schema assignment rules
8. `docs/subsystems/schema_registry.md` — Schema registry lookup
9. `docs/subsystems/observation_architecture.md` — Observation creation during ingestion
10. `docs/architecture/determinism.md` — Deterministic extraction
11. `docs/subsystems/events.md` — Event emission during ingestion

### 4.5 Implementing Search or Retrieval

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — No semantic search in MVP
2. `docs/architecture/architecture.md` — Search layer placement
3. `docs/subsystems/search/search.md` — Search models and ranking
4. `docs/architecture/consistency.md` — Search index consistency model
5. `docs/subsystems/i18n.md` — Cross-language search rules
6. `docs/subsystems/vector_ops.md` — If using embeddings

### 4.6 Adding Authentication or Authorization

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Privacy and explicit control
2. `docs/subsystems/auth.md` — Auth flows and permissions
3. `docs/subsystems/privacy.md` — PII handling
4. `docs/subsystems/errors.md` — Auth error handling
5. `docs/observability/logging.md` — Never log PII or tokens

### 4.7 Implementing Reducer Logic

**Required Reading Order:**

1. `docs/architecture/architectural_decisions.md` — Core architectural decisions, four-layer model
2. `docs/subsystems/reducer.md` — Reducer patterns, merge strategies
3. `docs/architecture/determinism.md` — Reducer determinism requirements
4. `docs/subsystems/schema_registry.md` — Schema registry, merge policy configuration
5. `docs/subsystems/observation_architecture.md` — Observation architecture overview

### 4.8 Working with Observations and Entity Snapshots

**Required Reading Order:**

1. `docs/architecture/architectural_decisions.md` — Four-layer truth model
2. `docs/subsystems/observation_architecture.md` — Observation lifecycle, entity snapshot computation
3. `docs/subsystems/reducer.md` — Reducer execution, merge strategies
4. `docs/subsystems/schema.md` — Observations and entity snapshots tables
5. `docs/architecture/consistency.md` — Observation and entity snapshot consistency

### 4.9 Implementing Schema Registry

**Required Reading Order:**

1. `docs/architecture/architectural_decisions.md` — Schema registry rationale
2. `docs/subsystems/schema_registry.md` — Schema registry patterns
3. `docs/subsystems/schema.md` — Schema registry table
4. `docs/architecture/schema_expansion.md` — Automated schema promotion (if applicable)

### 4.10 Working with Relationships

**Required Reading Order:**

1. `docs/architecture/architectural_decisions.md` — Open ontology via relationships
2. `docs/subsystems/relationships.md` — Relationship types, graph patterns
3. `docs/subsystems/schema.md` — Relationship observations and snapshots tables
4. `docs/foundation/entity_resolution.md` — Entity resolution patterns

### 4.11 Working with Four-Layer Truth Model

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Truth Layer boundaries and scope
2. `docs/foundation/layered_architecture.md` — Event-sourced architecture
3. `docs/architecture/architectural_decisions.md` — Four-layer truth model rationale
4. `docs/subsystems/observation_architecture.md` — Complete observation architecture
5. `docs/subsystems/reducer.md` — Reducer patterns and merge strategies
6. `docs/subsystems/schema_registry.md` — Schema registry for merge policies
7. `docs/subsystems/ingestion/ingestion.md` — How ingestion creates observations
8. `docs/architecture/determinism.md` — Deterministic computation requirements

### 4.12 Writing Tests

**Required Reading Order:**

1. `docs/architecture/determinism.md` — Deterministic test requirements
2. `docs/testing/testing_standard.md` — Test types and coverage
3. `docs/testing/automated_test_catalog.md` — File level test inventory and suite commands
4. `docs/testing/fixtures_standard.md` — Fixture creation and usage
5. Relevant subsystem docs for domain logic

### 4.13 Creating Documentation

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Foundational + product context
2. `docs/foundation/product_principles.md` — Product design principles
3. `docs/private/governance/00_GENERATION.md` — Required sections for doc type
4. `docs/conventions/documentation_standards.md` — Formatting and style rules

### 4.14 Writing Code

**Required Reading Order:**

1. `docs/conventions/code_conventions.md` — Code style, naming, organization patterns
2. `docs/architecture/determinism.md` — Determinism requirements (no randomness, hash-based IDs)
3. `docs/subsystems/errors.md` — Error handling patterns (ErrorEnvelope structure)
4. `docs/testing/testing_standard.md` — Testing patterns and coverage requirements
5. Relevant subsystem docs for domain logic
6. `.eslintrc.json` and `tsconfig.json` — Linting and type checking rules

### 4.15 Debugging or Error Handling

**Required Reading Order:**

1. `docs/subsystems/errors.md` — Error envelope and codes
2. Relevant subsystem doc for the failing component
3. `docs/observability/logging.md` — Logging for debugging
4. `docs/observability/tracing.md` — Distributed tracing if multi-service
5. `docs/feature_units/standards/error_protocol.md` — Error classification

### 4.16 Agent or Automated Development

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Absolute constraints and product context
2. `docs/foundation/layered_architecture.md` — Layer boundaries
3. `docs/foundation/product_principles.md` — Product principles validation
4. `docs/private/governance/agent_global.md` — Global agent rules
5. `docs/private/governance/risk_classification.md` — Risk assessment
6. `docs/private/governance/agent_background_execution.md` — If running autonomously
7. Relevant domain docs as needed

### 4.17 Evaluating or Documenting Neotoma as Memory Infrastructure for Agentic Systems

**Required Reading Order:**

1. `docs/foundation/core_identity.md` — Truth Layer scope and what Neotoma is not
2. `docs/foundation/product_positioning.md` — Substrate positioning, dual runway (human-in-the-loop and agentic systems), marketing positioning
3. `docs/foundation/problem_statement.md` — Why Neotoma exists, including agentic/multi-agent gap
4. `docs/specs/ICP_PROFILES.md` — Builders of agentic systems and related ICPs (Developer Integrators, AI Tool Integrators)
5. `docs/architecture/architecture.md` — System design and layer boundaries

---

## 5. Rules for Deterministic Documentation Reading

### 5.1 Always Load Foundational Docs First

Agents MUST load these docs before any other documentation:

1. `docs/context/index_rules.md` (this file)
2. Foundation documents from `docs/foundation/` (see Section 1.1)

### 5.2 Load Dependencies Before Dependents

Follow the dependency graph (Section 3). Load parent nodes before child nodes.

Example:

- Load `architecture.md` before `ingestion.md`
- Load `schema.md` before `search.md`
- Load `feature_unit_spec.md` before `manifest_template.yaml`

### 5.3 Load Cross-Cutting Concerns When Relevant

If a change touches:

- User data → load `privacy.md`
- Multiple languages → load `i18n.md`
- UI components → load `accessibility.md`
- State changes → load `events.md`
- Error paths → load `errors.md`

### 5.4 Never Make Assumptions

If unsure whether a doc is relevant:

- Load it (documentation loading is fast)
- Cross-reference the dependency graph
- Check the "Load When" column in Section 2 tables

### 5.5 Update This Index When Adding Docs

If creating new documentation:

1. Add entry to appropriate table in Section 2
2. Add node to dependency graph in Section 3
3. Add relevant reading strategy in Section 4 if applicable

---

## 6. Feature Unit Workflow Integration

### 6.1 Feature Unit Lifecycle and Documentation

Every Feature Unit MUST reference relevant documentation:

**Planning Phase:**

- Load foundational docs + `feature_unit_spec.md`
- Identify affected subsystems and load their docs
- Document dependencies in manifest

**Implementation Phase:**

- Follow subsystem docs for implementation details
- Reference architecture docs for layer boundaries
- Use testing docs for test planning

**Review Phase:**

- Use `review_checklist_mark.md` for human review
- Reference `risk_classification.md` for approval routing
- Verify alignment with foundational docs

**Post-Launch Phase:**

- Update documentation if patterns change
- Document new error codes in `errors.md`
- Update metrics in `metrics_standard.md`

### 6.2 Documentation as a Gate

No Feature Unit may be implemented without:

1. Loading relevant documentation
2. Verifying consistency with foundational docs
3. Updating docs if introducing new patterns
4. Passing documentation lint checks

---

## 7. Anti-Patterns and Forbidden Behaviors

### 7.1 Never Skip Foundational Docs

❌ **FORBIDDEN:** Starting implementation without loading foundation documents

✅ **REQUIRED:** Always load foundation documents first, even for "small" changes

### 7.2 Never Violate Truth Layer Boundaries

❌ **FORBIDDEN:** Introducing strategy, execution, or agent logic into Neotoma code

✅ **REQUIRED:** Verify all changes respect Truth Layer boundaries defined in foundation documents

### 7.3 Never Introduce Nondeterminism

❌ **FORBIDDEN:** Adding randomness, LLM-based extraction, or unstable ordering

✅ **REQUIRED:** Follow `architecture/determinism.md` for all logic

### 7.4 Never Guess Schema or API Contracts

❌ **FORBIDDEN:** Assuming schema structure or API behavior

✅ **REQUIRED:** Load `subsystems/schema.md` and relevant subsystem docs

### 7.5 Never Bypass Documentation Updates

❌ **FORBIDDEN:** Changing patterns without updating documentation

✅ **REQUIRED:** Update docs when introducing new patterns, error codes, or architectural changes

---

## 8. Quick Reference: Common Questions

**Q: Where do I find the database schema?**
A: `docs/subsystems/schema.md`

**Q: How do I implement deterministic sorting?**
A: `docs/architecture/determinism.md`

**Q: What are the required tests for a Feature Unit?**
A: `docs/testing/testing_standard.md`

**Q: How do I handle user PII?**
A: `docs/subsystems/privacy.md`

**Q: What error codes should I use?**
A: `docs/subsystems/errors.md`

**Q: How do I make a UI component accessible?**
A: `docs/subsystems/accessibility.md`

**Q: What metrics should I emit?**
A: `docs/observability/metrics_standard.md`

**Q: How do I handle multiple languages?**
A: `docs/subsystems/i18n.md`

**Q: What's the ingestion pipeline flow?**
A: `docs/subsystems/ingestion/ingestion.md`

**Q: How do I classify a change as high-risk?**
A: `docs/private/governance/risk_classification.md`

**Q: What are Feature Units?**
A: `docs/feature_units/standards/feature_unit_spec.md`

**Q: How do I write a manifest?**
A: `docs/feature_units/standards/manifest_template.yaml`

---

## 9. Documentation TODO and Future Expansion

### 9.1 Planned Documentation (Not Yet Created)

The following documents are referenced but not yet implemented:

- `docs/traceability.md` — End-to-end traceability from requirements to tests
- `docs/private/governance/hold_points.md` — Explicit hold points requiring human approval
- Additional UI patterns (modal, toast, form validation)
- MCP-specific documentation (tool definitions, contracts)
- Integration testing patterns
- Performance testing standards

### 9.2 Documentation Maintenance

Documentation MUST be updated when:

- New subsystems are added
- Architectural patterns change
- New Feature Unit patterns emerge
- Error codes or schemas evolve
- Risk thresholds change

Agents MUST propose documentation updates alongside code changes.

---

## Agent Instructions

### When to Load This Document

Load `docs/context/index_rules.md` at the **start of every agent session**, regardless of task type.

### Required Co-Loaded Documents

After loading this file, immediately load foundation documents from `docs/foundation/` (see Section 1.1), then load task-specific docs as indicated in Section 4 (Reading Strategies).

### Constraints Agents Must Enforce

1. **Always load foundational docs first** — Never skip foundation documents from `docs/foundation/`
2. **Follow dependency graph** — Load parent docs before child docs
3. **Load cross-cutting concerns** — Privacy, i18n, A11y, events, errors when relevant
4. **Update this index** — When adding new documentation files
5. **Verify Truth Layer boundaries** — All changes must respect architectural constraints
6. **Never introduce nondeterminism** — Follow `determinism.md` rules
7. **Document references in manifests** — Feature Units MUST cite relevant docs

### Forbidden Patterns

- Starting implementation without loading foundational docs
- Guessing schema or API contracts
- Introducing logic that violates Truth Layer boundaries
- Skipping documentation updates when patterns change
- Creating new docs without adding them to this index
- Bypassing risk classification for high-risk changes

### Validation Checklist

- [ ] Loaded this index (`context/index_rules.md`) first
- [ ] Loaded foundation documents from `docs/foundation/` second
- [ ] Identified change type and followed appropriate reading strategy (Section 4)
- [ ] Loaded all dependency docs from graph (Section 3)
- [ ] Loaded relevant cross-cutting concern docs (privacy, i18n, A11y, etc.)
- [ ] Verified change respects Truth Layer boundaries
- [ ] Followed determinism rules from `determinism.md`
- [ ] Planned documentation updates if introducing new patterns
- [ ] Assessed risk level using `risk_classification.md`
