# Neotoma Project Instructions for Claude Code

<!-- Generated from docs/context/index_rules.mdc and docs/foundation/agent_instructions_rules.mdc -->
<!-- Source: scripts/setup_claude_instructions.sh -->

## Document Loading Order (MANDATORY)

**Every session MUST begin by loading these documents in this order:**

1. **`docs/context/index_rules.mdc`** — Primary entrypoint; complete documentation map, reading strategies, dependency graph
2. **Foundation documents** from `docs/foundation/` in this order:
   - `core_identity.md` — What Neotoma is and is not (Truth Layer scope)
   - `philosophy.md` — Core principles and architectural invariants
   - `layered_architecture.md` — Truth Layer, Strategy Layer, Execution Layer
   - `product_principles.md` — Product design principles
   - `agent_instructions_rules.mdc` — Repository-wide agent instructions and validation checklist
3. **Task-specific docs** as indicated by the index (e.g. subsystems, architecture, testing)

**Why this order:** Foundation establishes constraints (determinism, immutability, Truth Layer boundaries) that all work must respect.

## Core Constraints (Summary)

Full constraints in `docs/foundation/agent_instructions_rules.mdc` and `.claude/rules/`. Summary:

**MUST enforce:**
- **Truth Layer boundaries**: No strategy/execution logic in Neotoma
- **Determinism**: No random IDs, no unstable sorting, hash-based entity/event IDs
- **Immutability**: Observations and source are immutable (reinterpretation creates NEW observations)
- **Schema-first**: Use application types from `docs/subsystems/record_types.md`
- **Explicit control**: User approves all ingestion; no background scanning
- **Provenance**: All outputs trace to source + config + timestamp
- **Graph integrity**: No orphans, no cycles, transactional writes
- **Privacy**: No PII in logs (IDs only)

**MUST NOT:**
- Violate architectural boundaries (no cross-layer logic)
- Introduce nondeterminism (no `Math.random()`, `Date.now()` in business logic, unstable iteration)
- Generate features outside MVP scope (no semantic search, no autonomous agents)
- Break immutability (no modifying observations/source after creation)
- Store docs in repo root (all docs in `docs/` subdirectories)

**Validation checklist** in `docs/foundation/agent_instructions_rules.mdc`.

## Configuration

- **`foundation-config.yaml`** — Repository-specific settings (conventions, security, workflows)
- **Environment variables** — See `docs/developer/env_check_rules.mdc`; check `.env.example` for required vars

## Autonomous Execution

**Proceed without asking for:**
- Routine implementation, refactors, tests, docs, lint fixes
- Anything where docs/codebase give a clear answer
- Edits or commands allowed by permissions (no confirmation needed)

**Stop and ask the user only when:**
1. There is an **unclear architectural or design choice** (e.g. where to put a module, which abstraction, how to cross subsystem boundaries)
2. **Getting it wrong would likely cause substantively wrong assumptions** (e.g. wrong layer, wrong consistency model, violating Truth Layer)

In those cases: ask a short, concrete question with 1–2 options or "proceed with X unless you prefer Y."

**Do not ask** for: "should I do X?" when X is already specified; "is this correct?" for obvious fixes; permission to use allowed tools.

**Alignment**: Mirrors risk management hold points (schema changes, foundation doc changes, security, constraint violations); ask when ambiguity could lead to high-risk wrong choice.

## Quick Reference

- **Architecture**: `docs/architecture/architecture.md`, `determinism.md`, `consistency.md`
- **Subsystems**: `docs/subsystems/` (schema, ingestion, reducer, relationships, search, auth, etc.)
- **Testing**: `docs/testing/testing_standard.md`, `automated_test_catalog.md`
- **Feature Units**: `docs/feature_units/standards/` (spec, manifest, execution)
- **Code conventions**: `docs/conventions/code_conventions.md` (TypeScript, SQL, YAML, Shell)
- **Documentation standards**: `docs/conventions/documentation_standards.md`

## Additional Instructions

All rules in `.claude/rules/` apply; they are modular instructions loaded automatically by context.

Skills in `.claude/skills/` are workflows invokable with `/skill-name` (e.g. `/create_release`, `/fix_feature_bug`).

For complete documentation map, reading strategies, and dependency graph, see `docs/context/index_rules.mdc`.
