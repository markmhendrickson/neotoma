---
description: "Neotoma-specific documentation standards extending foundation standards with required structure, formatting, and agent instruction requirements"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: docs/conventions/documentation_standards_rules.mdc -->

# Neotoma Documentation Standards and Conventions

**Reference:** `foundation/conventions/documentation_standards.md` - Base documentation standards

This document extends the foundation documentation standards with Neotoma-specific requirements. For all generic documentation standards (structure, formatting, diagrams, examples, cross-referencing, versioning, testing, privacy, security, accessibility), see the foundation template.

## 1. Foundational Context
Every documentation file is governed by three root-of-truth documents:
1. **`docs/NEOTOMA_MANIFEST.md`** - Unified architectural and product context
2. **`docs/private/governance/00_GENERATION.md`** - Required documentation artifacts and sections
**Related Conventions:**
- **`docs/conventions/code_conventions.md`** - Code style, naming, and patterns for TypeScript, SQL, YAML, and Shell scripts
All documentation MUST:
- Remain consistent with these three sources
- Never contradict the Truth Layer boundaries
- Encode determinism, immutability, provenance, schema-first processing, explicit user control, privacy guarantees, and graph integrity

## 2. Documentation Doctrine
Every documentation file MUST embed or reference this doctrine:
### Neotoma Documentation Doctrine
```
Neotoma is a Truth Layer - not an app, agent, or strategy/execution system.
Core invariants:
- Deterministic: Same input -> same output, always
- Immutable: Truth never changes after storage
- Provenance: Every output traces to source
- Schema-first: All extraction derives from schemas
- Explicit control: User approves all ingestion
- Privacy-maximal: No background data collection
- Graph integrity: No orphans, no cycles, no inferred edges
- Truth-Layer bounded: No strategy, execution, or agent logic
- Event-sourced: All state updates via Domain Events -> Reducers
- Pure Strategy: Strategy Layer has no side effects (State in -> Decisions out)
- Pure Execution: Execution Layer emits Domain Events (Commands in -> Events out)
Layered architecture (example: financial system):
┌───────────────────────────────────────────────┐
│      Execution Layer                          │
│  (Agentic Wallet + Domain Agents)            │
│  Commands -> Side Effects -> Domain Events    │
└────────────▲─────────────────────────────────┘
             │ Reads Only, Receives Commands
┌────────────▼─────────────────────────────────┐
│      Strategy Layer                           │
│  (Agentic Portfolio is example instance)    │
│  State -> Evaluates -> Decisions + Commands   │
└────────────▲─────────────────────────────────┘
             │ Reads Only
┌────────────▼─────────────────────────────────┐
│    Neotoma (Truth Layer)                    │
│  Event-sourced, Reducer-driven             │
│  Domain Events -> Reducers -> State          │
└─────────────────────────────────────────────┘
Note: Agentic Portfolio is an example instance of Strategy Layer. Agentic Wallet is part of Execution Layer alongside domain agents. Many other agent-driven layers are possible.
This document enforces Truth Layer purity.
```

## 3. Required Document Structure
### 3.1 File Header
Every documentation file MUST begin with:
```markdown
# [Document Title]
## Scope
[Explicit statement of what this document covers and what it does NOT cover]
```

### 3.2 Core Sections
Documentation files MUST include these sections where applicable:
1. **Purpose** - Why this document exists
2. **Scope** - What is/isn't covered
3. **Invariants** - Non-negotiable MUST/MUST NOT rules
4. **Definitions** - Canonical terms and their meanings
5. **Data Models** or **Schemas** (for subsystem docs)
6. **Flows** or **Sequences** (for process docs)
7. **Diagrams** - Mermaid visualizations
8. **Examples** - Complete, deterministic examples
9. **Testing Requirements** - How to test this domain
10. **Agent Instructions** - How agents must read and apply this file

### 3.3 Closing Section
Every file MUST end with an **Agent Instructions** section following this template:
```markdown
## Agent Instructions
### When to Load This Document
[Specific triggers: e.g., "Load when modifying ingestion pipeline code"]
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (always)
- [Additional context-specific docs]
### Constraints Agents Must Enforce
1. [Specific constraint 1]
2. [Specific constraint 2]
...
### Forbidden Patterns
- [Anti-pattern 1]
- [Anti-pattern 2]
  ...
### Validation Checklist
- [ ] Change respects Truth Layer boundaries
- [ ] No nondeterministic logic introduced
- [ ] Schema changes are additive only
- [ ] Tests cover all new paths
- [ ] Documentation updated to reflect changes
```

**Note:** For generic documentation structure, formatting, diagram standards, example formatting, cross-referencing, versioning, testing documentation, privacy/security, and accessibility standards, see `foundation/conventions/documentation_standards.md` Sections 4-14.

## 4. Language and Phrasing Conventions
**Reference:** `foundation/conventions/documentation_standards.md` Section 5 - Language and Phrasing Conventions

All foundation language and phrasing conventions apply. Additionally:
- Examples in documentation MUST use Neotoma-specific terminology (entities, records, Truth Layer, etc.)
- References to architectural principles MUST reference `docs/NEOTOMA_MANIFEST.md`
- Writing style MUST avoid AI-generated patterns (see foundation Section 5.4)

## 5. Timeline Estimates
### 5.1 Agent-Based Estimation Assumption
All timeline estimates in documentation MUST assume Cursor agents (or equivalent AI coding assistants) performing the work, NOT human developers.
**Rationale:** Neotoma development workflow uses Cursor agents as the primary execution mechanism. Timeline estimates based on human developer velocity would be inaccurate and misleading.

### 5.2 Timeline Estimate Format
When documenting timeline estimates:
- ✅ Use explicit duration units: "3 days", "2 weeks", "5 hours"
- ✅ State the assumption: "Estimated: 3 days (assumes Cursor agent execution)"
- ✅ Include parallelization notes: "With 3 agents in parallel: ~14-17 days"
- ❌ Do not assume human developer velocity
- ❌ Do not omit the agent execution assumption

### 5.3 Where Timeline Estimates Appear
Timeline estimates MUST follow this convention in:
- `execution_schedule.md` files
- Release plan documents (`release_plan.md`)
- Feature Unit specifications
- Any planning documents with duration estimates

### 5.4 Example
```markdown
### Estimated Timeline
**Assumptions:**
- All estimates assume Cursor agent execution
- FU-100: 5 days (high-risk, rule-based extraction)
- FU-101: 3 days
- FU-102: 3 days
**Sequential Timeline:** ~11 days
**With Parallelization (3 agents):** ~5-6 days
```

## 6. Agent Constraints for Documentation Changes
Agents modifying documentation MUST:
1. Load `docs/NEOTOMA_MANIFEST.md` first
2. Load this conventions file second
3. Load `foundation/conventions/documentation_standards.md` for generic standards
4. Verify changes don't violate Truth Layer boundaries
5. Ensure all required sections are present
6. Use deterministic examples only
7. Include proper Agent Instructions section
8. Cross-link to foundational documents where relevant
9. Update relevant documentation references if adding new files
10. **Identify and update downstream documentation** that depends on changes:
    - Check `docs/doc_dependencies.yaml` for explicit dependencies
    - Run `node scripts/validate-doc-dependencies.js [modified-doc-path]` to validate
    - Update downstream docs as needed (see `.claude/rules/downstream_doc_updates.md`)
    - Update dependency map if new relationships discovered
11. **Update README.md** if changes affect user-facing information (see `.claude/rules/readme_maintenance.md`)
12. **Follow writing style rules** (foundation Section 5.4): No em dashes, no AI-generated patterns, use commas/periods/colons instead
13. Run documentation validation before committing (automatic via pre-commit hook)

## Agent Instructions
### When to Load This Document
Load this document whenever:
- Creating new documentation files
- Modifying existing documentation
- Reviewing documentation for consistency
- Generating Feature Unit specs or manifests

### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (always)
- `foundation/conventions/documentation_standards.md` (always)
- `docs/private/governance/00_GENERATION.md` (when creating new docs)

### Constraints Agents Must Enforce
1. All documentation follows structure defined in Section 3 (and foundation Section 3)
2. All Mermaid diagrams follow standards in foundation Section 6
3. All examples are complete and deterministic (foundation Section 7)
4. MUST/MUST NOT language is used correctly (foundation Section 5.1)
5. Agent Instructions section is present in every doc
6. No PII or secrets in examples (foundation Section 12)
7. Timeline estimates assume Cursor agent execution (Section 5)
8. Downstream documentation updated when upstream docs change:
   - Use `docs/doc_dependencies.yaml` to identify dependencies
   - Run validation script: `node scripts/validate-doc-dependencies.js [doc-path]`
   - See `.claude/rules/downstream_doc_updates.md` for complete requirements
9. README.md updated when documentation changes affect user-facing information (see `.claude/rules/readme_maintenance.md`)
10. Dependency map (`docs/doc_dependencies.yaml`) updated when new doc relationships are created
11. Truth Layer boundaries respected (no strategy/execution logic in documentation)

### Forbidden Patterns
- Partial or pseudo-code examples
- Vague or marketing language
- Skipped heading levels
- Missing Agent Instructions sections
- Contradictions with foundational documents
- Nondeterministic examples or diagrams
- Em dashes (—) or en dashes (–)
- AI-generated writing patterns (em dashes, excessive parentheticals, conversational transitions)
- Soft questions or motivational language
- Timeline estimates based on human developer velocity

### Validation Checklist
- [ ] Document includes all required sections (Section 3 and foundation Section 3)
- [ ] Mermaid diagrams use consistent styling (foundation Section 6)
- [ ] Examples are complete and deterministic (foundation Section 7)
- [ ] MUST/MUST NOT language used correctly (foundation Section 5.1)
- [ ] Agent Instructions section present and complete
- [ ] Cross-references use correct relative paths (foundation Section 8)
- [ ] No PII or secrets in examples (foundation Section 12)
- [ ] Consistent with NEOTOMA_MANIFEST.md
- [ ] Downstream documentation updated if upstream doc changed (validated via script)
- [ ] Dependency map (`docs/doc_dependencies.yaml`) updated if new relationships created
- [ ] README.md updated if changes affect user-facing information
- [ ] No em dashes (—) or en dashes (–) used (use commas, periods, or colons instead)
- [ ] No AI-generated writing patterns (conversational transitions, soft questions, motivational language)
- [ ] Simple, declarative sentences with active voice
- [ ] Timeline estimates assume Cursor agent execution (Section 5)
- [ ] Truth Layer boundaries respected
