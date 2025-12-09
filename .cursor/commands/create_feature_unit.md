# Create New Feature Unit

Create a new Feature Unit with feature_id = {{input:feature_id}}.

**Follow the complete workflow in:** `docs/feature_units/standards/creating_feature_units.md`

**Automatic Detection:** This workflow can also be triggered automatically via `.cursor/rules/feature_unit_detection.md` when you mention feature-related patterns in natural language (e.g., "create feature", "new feature", "FU-XXX"). Both paths execute the same workflow.

## Workflow Overview

This command implements **Checkpoint 0** of the Feature Unit creation workflow (includes UX input collection if UI changes present):

1. Check if spec exists (completed or in_progress)
2. If spec exists: validate completeness, proceed if complete
3. If spec does NOT exist: **STOP and prompt user** interactively for all required spec details
4. Generate complete spec and manifest from user input
5. **Validate dependencies** — REJECT if dependencies not implemented
6. Create file structure (spec, manifest, test directories)
7. Do NOT implement code yet — only scaffolds

## Tasks

1. **Check for existing spec:**

   - `docs/feature_units/completed/{{input:feature_id}}/{{input:feature_id}}_spec.md`
   - `docs/feature_units/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md`
   - `docs/specs/MVP_FEATURE_UNITS.md` (check if MVP FU exists)

2. **If spec does NOT exist:**

   - **STOP** and ask user these questions interactively:
     - Feature name and brief description
     - Priority (P0/P1/P2/P3)
     - Risk level (Low/Medium/High)
     - User value
     - Functional requirements (list)
     - Non-functional requirements
     - Affected subsystems
     - Dependencies (list of feature_ids)
     - Schema changes (if any)
     - API/MCP changes (if any)
   - UI changes (if any)
   - **If UI changes present, also ask UX questions:**
     - User flow description
     - Visual design requirements
     - Interaction patterns
     - Responsive design requirements
     - Accessibility priorities
     - Empty/error/loading/success states
     - Mockups/wireframes/design references
   - Testing strategy
   - Observability plan (**REQUIRED**: At least one metric or log pattern that would catch this FU misbehaving)
   - Kill switch / defer criteria (conditions under which this FU should be dropped from current release or postponed)
   - Cross-cutting concern tags (e.g., ["schema", "security", "ui", "ingestion", "search"])

3. **After collecting input:**
   - Generate spec following `docs/feature_units/standards/feature_unit_spec.md`
   - Generate manifest following `docs/feature_units/standards/manifest_template.yaml`
   - Save to `docs/feature_units/in_progress/{{input:feature_id}}/`
4. **Alignment Check (Spec vs Mental Model):**

   - After drafting the spec, produce a concise summary covering:
     - Problem it solves and why it exists
     - What is explicitly in scope and out of scope
     - Which subsystems and schema types it will touch
     - Critical invariants or constraints
   - Present summary to user and ask:
     - "Does this accurately capture what you want this Feature Unit to do? (yes/no)"
     - "What feels off, missing, or over-scoped compared to your intent?"
   - Incorporate corrections immediately and re-summarize if changes are substantial
   - **MUST NOT** proceed until user confirms spec summary matches their mental model

5. **Validate dependencies (CRITICAL):**

   - Extract `dependencies.requires` from manifest
   - For each dependency:
     - Check `docs/specs/MVP_FEATURE_UNITS.md` for status
     - Check `docs/feature_units/completed/` for completed status
     - **REJECT if dependency status is "⏳ Not Started" or missing**
     - **WARN if dependency status is "🔨 Partial"** (require user confirmation)
     - Only proceed if all dependencies are ✅ Complete or user confirms partial

6. **Create file structure:**

   ```
   docs/feature_units/in_progress/{{input:feature_id}}/
     ├── {{input:feature_id}}_spec.md
     └── manifest.yaml

   tests/unit/features/{{input:feature_id}}/
   tests/integration/features/{{input:feature_id}}/
   tests/e2e/features/{{input:feature_id}}/
   tests/regression/features/{{input:feature_id}}/
   ```

7. **Output:**
   - File tree created
   - Spec document includes UX Requirements section (if UI changes present)
   - Manifest includes complete `ui` section (if UI changes present)
   - Next steps: "If UI changes, proceed to Create Prototype → Prototype Review. Otherwise proceed to implementation."

## Required Documents

Load before starting:

- `docs/feature_units/standards/creating_feature_units.md` (this workflow)
- `docs/feature_units/standards/feature_unit_spec.md` (spec template)
- `docs/feature_units/standards/manifest_template.yaml` (manifest template)
- `docs/specs/MVP_FEATURE_UNITS.md` (for dependency checking)

## Dependency Validation Rules

- ✅ **Allow:** Dependency status `completed` or `✅ Complete`
- ⚠️ **Warn but allow:** Dependency status `🔨 Partial` (requires user confirmation)
- ❌ **REJECT:** Dependency status `⏳ Not Started` or missing

**Error message if rejected:**

```
ERROR: Cannot create {{input:feature_id}}. Required dependency FU-YYY is not yet implemented.
Please implement FU-YYY first, or remove the dependency if not actually required.
```

## Inputs

- `feature_id` (string): The feature identifier (e.g., "FU-2025-01-001")
