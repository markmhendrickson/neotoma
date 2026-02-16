---
description: "Autonomous execution rule: proceed without asking except for high-stakes architectural/design ambiguities"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/autonomous_execution.mdc -->


# Autonomous Execution Rule

## Purpose

Ensures agents proceed autonomously for routine work, stopping only for high-stakes architectural/design ambiguities that could lead to substantively wrong implementation if answered incorrectly.

## Scope

This rule defines:
- When to proceed without asking
- When to stop and ask the user
- How to phrase questions when necessary
- Alignment with risk management hold points

## Proceed Without Asking

**Execute immediately without confirmation for:**

1. **Routine implementation**: Implementing features, refactors, bug fixes where the approach is clear from docs/codebase
2. **Tests**: Writing unit tests, integration tests, E2E tests per testing standards
3. **Documentation**: Updating docs to reflect code changes, fixing doc errors, adding missing documentation
4. **Lint fixes**: Fixing linter errors, type errors, formatting issues
5. **Code style**: Applying code conventions, normalizing naming, organizing imports
6. **Allowed tool use**: Running any Bash commands, edits, or reads allowed by permissions in settings
7. **Clear requirements**: Any task where the docs, codebase, or user request provide a clear answer

**Do NOT ask for confirmation** before:
- Making edits (permissions already grant Edit)
- Running npm scripts, git commands, or other allowed Bash commands
- Running tests or type checks
- Fixing obvious issues (typos, broken imports, syntax errors)

## Stop and Ask Only When

**Stop and ask the user ONLY when ALL of these are true:**

1. **Unclear architectural or design choice**: There is ambiguity about:
   - Where to put a new module (which subsystem, which layer)
   - Which abstraction to use (repository pattern, service pattern, reducer pattern)
   - How to cross subsystem boundaries (direct import, event, API)
   - Which consistency model to use (strong, eventual, bounded)
   - Data model changes (new tables, new entity types, new relationships)

2. **High stakes**: Choosing wrong would likely cause:
   - Wrong layer (strategy/execution logic in Truth Layer)
   - Wrong consistency model (eventual when strong required)
   - Violating architectural boundaries (cross-layer dependencies)
   - Breaking determinism (introducing nondeterministic logic)
   - Breaking immutability (modifying observations/source after creation)
   - Security issues (exposing PII, bypassing auth)

**When asking:**
- **Be concise**: Short, concrete question (1-2 sentences)
- **Provide options**: "Proceed with X unless you prefer Y" or "Option A vs Option B?"
- **State consequences**: "X would mean..., Y would mean..."
- **Default to safe choice**: "I'll proceed with X (safe choice) unless you want Y"

**Example good questions:**
- "New `schema_registry` module: add to `src/services/` or create `src/schema/`? I'll use `src/services/` unless you prefer a separate directory."
- "Cross-subsystem call: import directly or emit event? Direct is simpler but tighter coupling; event adds complexity. Proceed with direct import?"
- "New `preferences` table: strong consistency (like entities) or eventual (like search)? I'll use strong unless you prefer eventual."

## Do NOT Ask For

**Never ask for confirmation when:**
- Task is clearly specified in the prompt or docs ("should I do X?" when X is the task)
- Fixing obvious errors ("is this correct?" for syntax errors, broken imports)
- Running allowed tools (permissions already grant access)
- Implementation details when approach is clear (function naming, file organization within established patterns)
- Completing sub-tasks of an approved task (user asked for feature X, don't ask to implement each function)

## Alignment with Risk Management

This rule aligns with hold points from `risk_management.md`:

**High-risk triggers that warrant asking:**
- Schema changes (table structure, breaking JSONB changes)
- Foundation document changes (files in configured foundation docs path)
- Security changes (auth, RLS, encryption)
- Architectural changes (layer boundaries, consistency models)
- Violating documented constraints (even if user requests)

**Medium/low-risk work that should proceed:**
- New features within scope (no schema changes, no new subsystems)
- API endpoint additions (following existing patterns)
- Logic changes in non-critical paths
- UI changes, documentation, tests

## Configuration

This rule is always loaded. No additional configuration needed.

Permissions in settings already configured for autonomous execution (defaultMode, allow rules).

## Constraints

- **MUST proceed** without asking for routine work
- **MUST stop** and ask only for high-stakes architectural/design ambiguity
- **MUST phrase questions** concisely with options and defaults
- **MUST NOT ask** for confirmation on allowed tool use
- **MUST NOT ask** "should I do X?" when X is the specified task

## Validation Checklist

Before asking a question, verify:
- [ ] Is there genuine architectural/design ambiguity?
- [ ] Would choosing wrong cause substantively wrong implementation?
- [ ] Can I find the answer in docs/codebase? (If yes, don't ask)
- [ ] Have I phrased the question concisely with options?
- [ ] Am I providing a safe default?

If any of the first two are "no", proceed without asking.
