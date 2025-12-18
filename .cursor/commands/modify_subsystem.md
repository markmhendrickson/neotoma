# Modify Subsystem

You are modifying a Neotoma subsystem.

subsystem = {{input:subsystem}}

## Always load

- docs/context/index.md
- docs/subsystems/{{input:subsystem}}.md
- docs/architecture/architecture.md
- docs/feature_units/standards/error_protocol.md
- docs/feature_units/standards/execution_instructions.md
- docs/governance/risk_classification.md

## Rules

1. Subsystem work is ALWAYS high- or critical-risk.
   - You MUST produce a detailed plan BEFORE editing.
   - Wait for explicit user approval unless explicitly told to proceed.

2. NEVER modify a subsystem without:
   - updating the subsystem spec
   - updating dependent Feature Unit specs/manifests
   - evaluating blast radius and cross-feature impacts

3. For structural changes (schema, ingestion, search, vector_ops):
   - update docs/migration/migrations_lifecycle.md
   - create or modify migration files
   - update all affected manifests

4. For i18n/accessibility/security/privacy:
   - update corresponding subsystem spec
   - update design system or API surface if needed
   - re-evaluate A11y/i18n implications in relevant Feature Units

5. ALWAYS update or add tests:
   - integration tests for subsystem behavior
   - regression tests if fixing a bug

6. Run:
   - TEST_CHANGED
   - subsystem-specific tests
   - TEST_ALL if the change touches schema, ingestion, or search

## Inputs

- `subsystem` (string): One of: schema, ingestion, search, vector_ops, auth, i18n, accessibility, privacy, events, errors
















