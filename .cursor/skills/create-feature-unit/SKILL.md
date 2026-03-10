---
name: create-feature-unit
description: Create a new feature unit with spec, manifest, and test structure.
triggers:
  - create feature
  - new feature
  - create feature unit
  - create-feature-unit
  - /create-feature-unit
---

# Create New Feature Unit

Create a new Feature Unit with feature_id = {{input:feature_id}}.

Follow the complete workflow in `foundation/development/feature_unit_workflow.md`. Configuration is read from `foundation-config.yaml`.

This workflow can also be triggered automatically via `.cursor/rules/feature_unit_detection.md` when you mention feature-related patterns in natural language (e.g., "create feature", "new feature", feature IDs). Both paths execute the same workflow.

## Workflow Overview

Implements Checkpoint 0 of the Feature Unit creation workflow:

1. Load configuration from `foundation-config.yaml`
2. Check if spec exists (completed or in_progress)
3. If spec exists: validate completeness, proceed if complete
4. If spec does NOT exist: **STOP and prompt user** interactively for all required spec details
5. Generate complete spec and manifest from user input
6. **Validate dependencies** — REJECT if dependencies not implemented (if validation enabled)
7. Create file structure (spec, manifest, test directories)
8. Do NOT implement code yet - only scaffolds

## Tasks

1. **Load configuration:**

   - Read `foundation-config.yaml` (or `foundation-config.yaml` in repo root)
   - Extract feature unit settings:
     - `feature_units.directory` — Base directory for feature units
     - `feature_units.id_pattern` — ID format pattern
     - `feature_units.manifest_complexity` — simple or extended
     - `feature_units.product_strategy` — Product strategy tracking settings
     - `feature_units.architecture` — Architecture tracking settings
     - `feature_units.dependencies` — Dependency validation settings
     - `feature_units.testing` — Testing requirements

2. **Check for existing spec:**

   - `{configured_directory}/completed/{{input:feature_id}}/{{input:feature_id}}_spec.md`
   - `{configured_directory}/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md`
   - Repository-specific FU inventory (if configured)

3. **If spec does NOT exist:**

   - STOP and ask user these questions interactively:
   
   **Core Questions (always asked):**
     - Feature name and brief description
     - Priority (P0/P1/P2/P3)
     - Risk level (Low/Medium/High)
     - User value (why this matters to users)
     - Functional requirements (list)
     - Non-functional requirements (performance, reliability, etc.)
     - Dependencies (list of feature_ids this requires)
     - Testing strategy (unit, integration, E2E)
     - Observability plan (metrics, logs) - REQUIRED: At least one metric or log pattern
     - Kill switch / defer criteria (if enabled in config)
     - Cross-cutting concern tags (if configured)
   
   **Product Strategy Questions (if enabled in config):**
     - If `product_strategy.track_defensible_differentiation: true`:
       - "How does this feature validate or enable your defensible differentiators?"
       - Show configured `differentiation_types` as options
     - If `product_strategy.track_competitive_positioning: true`:
       - "How does this feature position against competitors?"
   
   **Architecture Questions (if extended manifest mode):**
     - If `architecture.track_subsystems: true`:
       - "Which architecture modules are affected?"
       - Show configured `subsystems` as options
     - If `architecture.track_schema_changes: true`:
       - "Any database schema changes?"
     - If `architecture.track_api_changes: true`:
       - "Any API/endpoint changes?"
     - If `architecture.track_ui_changes: true`:
       - "Any UI changes?"
   
   **UI/UX Questions (if UI changes indicated):**
     - User flow description (step-by-step user journey)
     - Visual design requirements
     - Interaction patterns
     - Responsive design requirements
     - Accessibility priorities
     - Empty/error/loading/success states
     - Mockups or design references

4. **After collecting input:**
   - Generate spec following `foundation/development/templates/feature_unit_spec_template.md`
   - Include sections based on configuration (product strategy, architecture, UX)
   - Generate manifest following complexity mode:
     - Simple: `foundation/development/templates/manifest_template_simple.yaml`
     - Extended: `foundation/development/templates/manifest_template_extended.yaml`
   - Save to `{configured_directory}/in_progress/{{input:feature_id}}/`

5. **Alignment Check (Spec vs Mental Model):**

   After drafting the spec, produce a concise summary covering:
   - Problem it solves and why it exists
   - What is explicitly in scope and out of scope
   - Which modules/subsystems it will touch (if architecture tracking enabled)
   - Critical constraints or invariants
   
   Present summary to user and ask:
   - "Does this accurately capture what you want this Feature Unit to do? (yes/no)"
   - "What feels off, missing, or over-scoped compared to your intent?"
   
   Incorporate corrections immediately and re-summarize if changes are substantial.
   
   Do NOT proceed until user confirms spec matches their mental model.

6. **Validate dependencies (if enabled in config):**

   If `dependencies.validate_on_create: true`:
   - Extract `dependencies.requires` from manifest
   - For each dependency:
     - Check if spec exists in `{configured_directory}/completed/` or `in_progress/`
     - Check repository-specific FU inventory (if configured)
     - If `dependencies.reject_missing_dependencies: true`: REJECT if dependency status is "Not Started" or missing
     - If `dependencies.allow_partial_dependencies: true`: WARN if dependency status is "Partial" (require user confirmation)
     - Only proceed if all dependencies are Complete or user confirms partial

7. **Create file structure:**

   ```
   {configured_directory}/in_progress/{{input:feature_id}}/
     ├── {{input:feature_id}}_spec.md
     └── manifest.yaml
   ```

8. **Create test directory structure:**
   ```
   tests/unit/features/{{input:feature_id}}/
   tests/integration/features/{{input:feature_id}}/
   tests/e2e/features/{{input:feature_id}}/  (if e2e tests required)
   tests/regression/features/{{input:feature_id}}/
   ```

9. **Output:**
   - File tree created
   - Spec document includes configured sections
   - Manifest follows configured complexity mode
   - Next steps: "If UI changes, proceed to Create Prototype → Prototype Review. Otherwise proceed to implementation."

## Required Documents

Load before starting:

- `foundation/development/feature_unit_workflow.md` (workflow)
- `foundation/development/templates/feature_unit_spec_template.md` (spec template)
- `foundation/development/templates/manifest_template_simple.yaml` or `manifest_template_extended.yaml` (manifest template)
- `foundation-config.yaml` (configuration)
- Repository-specific FU inventory (if configured)

## Dependency Validation Rules

- ✅ **Allow:** Dependency status `completed` or `Complete`
- ⚠️ **Warn but allow:** Dependency status `Partial` or `in_progress` (if `allow_partial_dependencies: true`)
- ❌ **REJECT:** Dependency status `Not Started` or missing (if `reject_missing_dependencies: true`)

**Error message if rejected:**

```
ERROR: Cannot create {{input:feature_id}}. Required dependency {dependency_id} is not yet implemented.
Please implement {dependency_id} first, or remove the dependency if not actually required.
```

## Inputs

- `feature_id` (string): The feature identifier (format from foundation-config, e.g., "FU-2025-01-001")

