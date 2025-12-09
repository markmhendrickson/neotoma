# Neotoma Repo Doctrine

## Required Reading

Always load these files FIRST for context:

- `docs/context/index.md` — Navigation guide and reading strategies
- `docs/architecture/architecture.md` — System architecture and layer boundaries
- `docs/feature_units/standards/feature_unit_spec.md` — Feature Unit specification method
- `docs/feature_units/standards/execution_instructions.md` — Feature Unit execution protocol
- `docs/feature_units/standards/error_protocol.md` — Error classification and handling

**Defer to these docs before code or chat history.**

---

## Workflow Detection Rules

**Release Detection:**
- **Reference:** `.cursor/rules/release_detection.md` — Detailed detection patterns and agent actions
- When users mention release-related patterns, agents MUST automatically detect release intent and ask for confirmation before proceeding with release creation workflow.

**Feature Unit Creation Detection:**
- **Reference:** `.cursor/rules/feature_unit_detection.md` — Feature Unit creation detection patterns
- When users mention feature-related patterns, agents MUST automatically detect feature unit creation intent and ask for confirmation before proceeding with feature unit creation workflow.

**Bug Fix Detection:**
- **Reference:** `.cursor/rules/bug_fix_detection.md` — Bug fix detection patterns
- When users mention bug/error-related patterns, agents MUST automatically detect bug fix intent and ask for confirmation before proceeding with bug fix workflow.
