# Neotoma Repo Doctrine

## Required Reading

Always load these files FIRST for context:

- `docs/context/index.md` — Navigation guide and reading strategies
- `docs/architecture/architecture.md` — System architecture and layer boundaries
- `docs/feature_units/standards/feature_unit_spec.md` — Feature Unit specification method
- `docs/feature_units/standards/execution_instructions.md` — Feature Unit execution protocol
- `docs/feature_units/standards/error_protocol.md` — Error classification and handling
- `docs/foundation/agent_instructions.md` — Repository-wide agent instructions and constraints

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

**Checkpoint Management:**

- **Reference:** `.cursor/rules/checkpoint_management.md` — Checkpoint update rules
- When batches complete, agents MUST automatically check and update checkpoint status in `status.md` per trigger configuration in `manifest.yaml`.
- Checkpoint 2 (Pre-Release Sign-Off) MUST be marked as `completed` when all batches are complete.

**Post-Build Testing:**

- **Reference:** `.cursor/rules/post_build_testing.md` — Post-build test case descriptions
- After completing a release build, agents MUST always describe manual test cases from `integration_tests.md`.
- Test cases MUST be formatted as user-facing instructions and included in release report Section 9 (Testing Guidance).
- Agents MUST present test cases to user after build completion.

**Instruction Documentation:**

- **Reference:** `.cursor/rules/instruction_documentation.md` — Instruction documentation and repo rule availability
- When users provide important instructions, constraints, or guidelines, agents MUST document them in appropriate locations and make them available as repo rules.
- Ensures all instructions are discoverable and automatically available to Cursor agents.

**README Maintenance:**

- **Reference:** `.cursor/rules/readme_maintenance.md` — README synchronization rules
- When documentation is created, modified, or deleted, agents MUST update `README.md` to reflect changes.
- Ensures README remains accurate and comprehensive representation of the repository.

**Downstream Documentation Updates:**

- **Reference:** `.cursor/rules/downstream_doc_updates.md` — Downstream documentation synchronization rules
- When upstream documentation is updated, agents MUST identify and update all downstream documentation that depends on it.
- Ensures documentation consistency across the entire documentation tree.
