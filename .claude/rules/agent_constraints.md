---
description: "Load when validating work or before completing: enforce architectural boundaries, determinism, immutability, project principles; no credentials in instructions; run validation checklist."
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/agent_constraints.mdc -->

# Agent Constraints Rule

**Reference:** `foundation/conventions/documentation-standards.md` - Documentation standards

## Purpose

Ensures agents enforce all absolute constraints, forbidden patterns, and validation requirements when working on the repository.

## Scope

This document defines:
- Absolute constraints that agents MUST enforce
- Project positioning constraints (if configured)
- Constraints agents must enforce
- Communication constraints
- Forbidden patterns
- Validation checklist

This document does NOT cover:
- Repository-specific constraints (configured in `foundation-config.yaml`)
- Risk management and hold points (see `risk_management.md`)
- Document loading order (see `document_loading_order.md`)

## Configuration

Configure project-specific constraints in `foundation-config.yaml`:

```yaml
agent_instructions:
  enabled: true
  constraints: []  # Repository-specific constraints
    # Example:
    # - "Never violate architectural boundaries"
    # - "Always follow schema-first principles"
    # - "Enforce immutability for core data"
  validation_checklist:
    enabled: true
    custom_checks: []  # Repository-specific validation checks
```

**Constraints are configurable per repository.** Default constraints shown below can be customized or extended in `foundation-config.yaml`.

## Absolute Constraints

Agents MUST enforce these constraints at all times (customize in `foundation-config.yaml`):

1. **Never violate architectural boundaries** (respect layer boundaries, no cross-layer violations)
2. **Never introduce nondeterminism** (no random IDs, no unstable logic, deterministic outputs)
3. **Never generate features outside project scope** (stay within defined boundaries)
4. **Always follow project principles** (schema-first, type-driven, or project-specific patterns)
5. **Enforce data integrity** (immutability where required, proper validation)
6. **Enforce safety and explicit control** (user approval where required, no implicit actions)
7. **Always output validated artifacts** (code, specs, docs must pass validation)
8. **Follow project positioning** (when creating marketing/content, follow project differentiators if configured)

## Project Positioning Constraints (Optional)

**If configured:** All release planning, marketing content, and feature positioning MUST validate project differentiators.

Configure project differentiators in `foundation-config.yaml`:

```yaml
project:
  differentiators: []  # Project-specific differentiators
    # Example:
    # - "privacy-first"
    # - "deterministic"
    # - "cross-platform"
  positioning_framework: "docs/private/competitive/positioning_framework.md"  # Optional
```

### When Creating Release Plans (If Differentiators Configured)

1. **Explicitly validate project differentiators**: Release must validate configured differentiators
2. **Avoid feature-only releases**: Don't ship features without validating differentiators
3. **Include acceptance criteria**: Release acceptance criteria must validate differentiators
4. **Reference framework**: Link to positioning framework (if configured) in release plans

### When Creating Marketing Content (If Differentiators Configured)

1. **Lead with project differentiators**, not features alone
2. **Contextualize features** as enabled by differentiators
3. **Avoid feature-only positioning** (competitors may develop similar features)
4. **Emphasize structural barriers** that prevent competitors from pursuing same path
5. **Validate messaging**: All marketing messaging must emphasize differentiators first

### When Creating Content, Documentation, or Positioning (If Differentiators Configured)

1. **Lead with project differentiators**, not features alone
2. **Contextualize features** as enabled by differentiators
3. **Avoid feature-only positioning**
4. **Emphasize structural barriers**
5. **Reference framework** when appropriate (if configured)

## Constraints Agents Must Enforce

**Base constraints (always apply):**

1. **Architectural boundaries:** MUST NOT violate layer boundaries or architectural constraints (configured per repository)
2. **Determinism:** MUST NOT introduce randomness or nondeterministic logic (no random IDs, no unstable sorting, no `Date.now()` in business logic unless required)
3. **Data integrity:** MUST NOT modify immutable data after storage (respect immutability requirements)
4. **Project principles:** MUST follow project-specific principles (schema-first, type-driven, or as configured)
5. **Explicit control:** MUST NOT implement automatic/implicit actions without user approval (respect explicit control requirements)
6. **Provenance:** MUST trace all outputs to source (source file, rule, timestamp, or as configured)
7. **Data integrity:** MUST maintain data consistency (no orphans, no cycles, transactional writes where required)
8. **Privacy:** MUST NOT log sensitive data (PII, credentials, or as configured - only IDs/logs as allowed)
9. **Security:** MUST NOT include credentials (API keys, tokens, service keys) in agent instructions, conversation text, or commit messages. Credentials MUST be injected via secure mechanisms (e.g., Cursor Cloud Agents Secrets) and agents MUST verify their availability via environment variable checks, not export commands with credential values

**Repository-specific constraints:** Add custom constraints in `foundation-config.yaml` under `agent_instructions.constraints`.

## Forbidden Patterns

**Base forbidden patterns (always apply):**

- Violating architectural boundaries (implementing logic outside defined layer boundaries)
- Introducing nondeterminism (random IDs, unstable sorting, `Date.now()` in business logic unless required)
- Generating features outside project scope (features not aligned with project goals)
- Breaking immutability (modifying immutable data after initial storage)
- Inferring beyond extraction (creating data not present in source, inferring relationships without explicit rules)
- Schema mutations (changing assigned types after creation, unless allowed)
- Synthetic data (guessing missing information, hallucinating fields)
- Upward dependencies (lower layers calling higher layers, violating layer boundaries)
- Non-transactional writes (data writes must be atomic where required)
- Including credentials in agent instructions (no API keys, tokens, or service keys in prompt text, conversation messages, or code comments; use secure injection mechanisms like Cursor Secrets)
- Storing documentation files in repo root (all documentation MUST be in appropriate `docs/` subdirectories)

**Repository-specific forbidden patterns:** Add custom patterns in `foundation-config.yaml` under `agent_instructions.forbidden_patterns`.

## Communication Constraints

**Prohibitions:**
- No emojis
- No filler language
- No hype
- No soft asks
- No conversational transitions
- No call-to-action appendices
- No questions, offers, suggestions, or motivational content
- No tone matching, emotional softening, or user sentiment modulation

**Assumptions:**
- User possesses high cognitive acuity, though may have reduced verbal fluency

**Execution rules:**
- Use blunt, directive phrasing for cognitive restructuring
- Suppress all engagement-optimizing or corporate-aligned behaviors:
  - User satisfaction scores
  - Conversational flow tagging
  - Continuation bias
  - Sentiment uplift
- Avoid mirroring the user's tone, mood, or diction
- Communicate strictly to the deep cognitive tier—beyond surface-level language

**Response protocol:**
- Deliver the requested or relevant information only
- Terminate immediately after delivery—no transitions, no conclusions

**End goal:**
- User independence and cognitive restoration
- Model obsolescence via user self-sufficiency

## Validation Checklist

Before completing any work, verify:

**Base checks (always apply):**

- [ ] Change respects architectural boundaries (no layer violations)
- [ ] No nondeterministic logic introduced (no randomness, no unstable sorts)
- [ ] Immutability preserved (immutable data not modified)
- [ ] Schema changes are additive only (no breaking changes, no column removal)
- [ ] Project principles followed (schema-first, type-driven, or as configured)
- [ ] Data integrity maintained (no orphans, no cycles, transactional writes where required)
- [ ] Privacy preserved (no sensitive data in logs, only IDs/logs as allowed)
- [ ] Provenance maintained (all outputs trace to source)
- [ ] Consistency model correct (as required per subsystem/component)
- [ ] Security: No credentials included in agent instructions, conversation text, or code (use secure injection mechanisms)
- [ ] Documentation location: No documentation files stored in repo root (all docs in `docs/` subdirectories)
- [ ] Tests cover all new paths (unit, integration, E2E as appropriate)
- [ ] Documentation updated to reflect changes
- [ ] Downstream documentation updated if upstream docs changed
- [ ] README.md updated if documentation changes affect user-facing information
- [ ] Feature fits within project scope
- [ ] No violations of MUST/MUST NOT lists
- [ ] Project differentiators validated (if configured and if release planning or marketing content)

**Repository-specific checks:** Add custom checks in `foundation-config.yaml` under `agent_instructions.validation_checklist.custom_checks`.

## Related Documents

- `foundation/conventions/documentation-standards.md` - Documentation standards
- `foundation-config.yaml` - Repository-specific configuration
- Repository foundation docs (e.g., `docs/foundation/philosophy.md`) - Core philosophy and architectural invariants
- Repository architecture docs (e.g., `docs/architecture/architecture.md`) - System architecture
