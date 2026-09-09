# Neotoma Project Instructions for Claude Code

<!-- Generated from docs/context/index_rules.mdc and docs/foundation/agent_instructions_rules.mdc -->
<!-- Source: scripts/setup_claude_instructions.sh -->

## Document Loading Order (MANDATORY)

**Every session MUST begin by loading these documents in this order:**

1. **`docs/context/index_rules.mdc`** — Primary entrypoint; complete documentation map, reading strategies, dependency graph
2. **Foundation documents** from `docs/foundation/` in this order:
   - `core_identity.md` — What Neotoma is and is not (State Layer scope)
   - `philosophy.md` — Core principles and architectural invariants
   - `layered_architecture.md` — State Layer (Neotoma) and Operational Layer(s) above it
   - `product_principles.md` — Product design principles
   - `agent_instructions_rules.mdc` — Repository-wide agent instructions and validation checklist
3. **Task-specific docs** as indicated by the index (e.g. subsystems, architecture, testing)
   - **For install / MCP / configuration tasks:** MUST load `install.md` (repo root) before any work involving installing Neotoma, configuring MCP entries, setting up LaunchAgents, changing data directories, or onboarding a new environment. `install.md` is the canonical CLI-driven setup sequence; never substitute shell introspection or hand-editing of config files for the CLI commands documented there.

**Why this order:** Foundation establishes constraints (determinism, immutability, State Layer boundaries) that all work must respect.

## Core Constraints (Summary)

Full constraints in `docs/foundation/agent_instructions_rules.mdc` and `.claude/rules/`. Summary:

**MUST enforce:**
- **State Layer boundaries**: No strategy/execution logic in Neotoma
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

## Verification discipline

Derived from repeated cross-repo failures, all of one shape: a mechanism reported success while doing nothing.

- **A write that reports success has not necessarily happened — read it back.** `/store` accepts undeclared fields and routes them to `raw_fragments`, so a store returns 2xx while the field you cared about is silently not on the entity. A correction can return `success: true` and write nothing. After any write that matters, retrieve the entity and assert the specific field holds the value you wrote. Never treat a 2xx or `success: true` as evidence that data landed.
- **Validate the instrument before believing the measurement.** A zero or an empty result is a claim about the query before it is a claim about the data. Field-name drift across records (`github_number` / `issue_number` / `number`), a value stored qualified (`owner/repo`) but queried bare, and an MCP tool name used as a REST route (which 404s into an empty result) have each produced a confident, wrong zero. Prove the query non-zero on a case known to be positive before reporting an absence.
- **A test that cannot fail on the thing it watches is decoration.** Before trusting a test as coverage, revert the fix and confirm it goes red. A test written against current behaviour ratifies the bug rather than catching it.
- **Fail closed on the field that carries the safety meaning.** When a value is absent, unrecognized, or malformed, default to the restrictive branch — and give absence a single spelling, normalizing sentinels (`""`, `"none"`, `"unassigned"`) to it rather than letting a truthy placeholder pass as a real value.
- **Extend the mechanism that already generalizes; do not build a parallel one.** Search the code for the existing path before adding another, and reuse the existing entity or relationship type rather than minting a near-duplicate — a second type covering the same meaning splits every future query across both.
- **A mechanism that does not bind is not a control.** A linter no workflow invokes, a step carrying `continue-on-error`, or a verdict posted as a comment enforces nothing. When adding a control, name what fails when it is violated.

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
2. **Getting it wrong would likely cause substantively wrong assumptions** (e.g. wrong layer, wrong consistency model, violating State Layer)

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
- **First-run install and migration**: \`install.md\` (repo root) — agent install workflow, bootstrap from context, and migration from platform memory / conversation history / project config. See \`docs/foundation/what_to_store.md\` for what to store.

## Additional Instructions

All rules in `.claude/rules/` apply; they are modular instructions loaded automatically by context.

Skills live under `.claude/skills/<command_name>/SKILL.md` (Claude Code requirement). Invoke with `/command_name` for each foundation `cursor_commands` entry, plus repo-only skills from `.cursor/skills/*/SKILL.md` (hyphenated Cursor folders map to `_` in the directory name). Foundation wins on name collisions.

For complete documentation map, reading strategies, and dependency graph, see `docs/context/index_rules.mdc`.
