---
description: "Automatically detects feature unit creation intent from user patterns and triggers the feature unit creation workflow"
globs: ["**/*"]
alwaysApply: true
---

<!-- Source: foundation/agent_instructions/cursor_rules/feature_unit_detection.mdc -->

# Feature Unit Creation Detection Rule

**Reference:** `foundation/development/feature_unit_workflow.md` — Complete workflow

This is a foundation rule. Configuration is read from `foundation-config.yaml`.

## Trigger Patterns

When a user mentions any of the following patterns, automatically detect feature unit creation intent:

- "create feature"
- "new feature"
- "add feature"
- "implement feature"
- "feature unit" or configured abbreviation
- Feature Unit ID matching configured pattern (check `feature_units.id_pattern` in foundation-config)
- Feature descriptions that imply new work (e.g., "we need to add X", "implement Y functionality")
- Planning discussions about new functionality

## Agent Actions

### Step 1: Detection and Confirmation

If context suggests feature unit creation (mentions "feature", feature IDs, feature descriptions, etc.):

1. **Load configuration:**
   - Read `foundation-config.yaml` to get feature unit settings
   - Extract `feature_units.directory`, `feature_units.id_pattern`
   - Check if feature units are enabled

2. **Extract feature information** from context:
   - Feature Unit ID (if mentioned, validate against configured pattern)
   - Feature name or description
   - Priority hints (P0/P1/P2/P3)
   - Scope hints (what functionality is mentioned)

3. **Check if feature unit already exists:**
   - Look for `{configured_directory}/completed/{feature_id}/`
   - Look for `{configured_directory}/in_progress/{feature_id}/`
   - Look for repository-specific FU inventory (if configured)

4. **If feature unit exists:**
   - Inform user: "Feature Unit {feature_id} already exists. Status: {status}"
   - Ask: "Do you want to modify it or create a new one? (modify/new)"

5. **If feature unit does NOT exist:**
   - **Ask for confirmation:**
     ```
     I see you're requesting a new Feature Unit. Should I create a Feature Unit spec 
     in `{configured_directory}/in_progress/{feature_id}/` following the Feature Unit 
     creation workflow? (yes/no)
     ```
   
   If feature ID was detected, include it in the path.

6. **If feature ID not detected:**
   - Show configured ID pattern: "What Feature Unit ID should I use? (format: {configured_pattern}, e.g., FU-2025-01-001)"
   - Wait for user input before proceeding

7. **Exception handling:**
   - If user says "no" → do not proceed with feature unit creation
   - If user says "just a spec document" → create spec document instead

### Step 2: Execute Feature Unit Creation Workflow

**If user confirms (yes) and feature_id is provided:**

1. **Load required documents:**
   - `foundation/development/feature_unit_workflow.md` (primary workflow)
   - `foundation/agent_instructions/cursor_commands/create_feature_unit.md` (command implementation, or `.claude/skills/foundation_create_feature_unit.md` if symlinked)
   - `foundation/development/templates/feature_unit_spec_template.md` (spec template)
   - `foundation/development/templates/manifest_template_simple.yaml` or `manifest_template_extended.yaml` (manifest template, based on config)
   - Repository-specific FU inventory (if configured)

2. **Follow the Feature Unit creation workflow:**
   - Start at Step 0 (Checkpoint 0) — Spec Creation
   - Check if spec exists (completed or in_progress)
   - If spec exists: validate completeness, proceed if complete
   - If spec does NOT exist: **STOP and prompt user** interactively for all required spec details (questions based on configuration)
   - Generate complete spec and manifest from user input
   - **Validate dependencies** — REJECT if dependencies not implemented (if validation enabled)
   - Create file structure (spec, manifest, test directories)
   - Do NOT implement code yet — only scaffolds

3. **Alignment Check (Spec vs Mental Model):**
   - After drafting the spec, produce a concise summary covering:
     - Problem it solves and why it exists
     - What is explicitly in scope and out of scope
     - Which modules/subsystems it will touch (if architecture tracking enabled)
     - Critical invariants or constraints
   - Present summary to user and ask:
     - "Does this accurately capture what you want this Feature Unit to do? (yes/no)"
     - "What feels off, missing, or over-scoped compared to your intent?"
   - Incorporate corrections immediately and re-summarize if changes are substantial
   - Do NOT proceed until user confirms spec summary matches their mental model

4. **Create file structure:**
   ```
   {configured_directory}/in_progress/{feature_id}/
     ├── {feature_id}_spec.md
     └── manifest.yaml
   
   tests/unit/features/{feature_id}/
   tests/integration/features/{feature_id}/
   tests/e2e/features/{feature_id}/  (if e2e tests required by config)
   tests/regression/features/{feature_id}/
   ```

## Constraints

- Do NOT proceed without user confirmation - always ask before creating feature unit specs
- Do NOT proceed without feature_id - always require explicit feature ID
- Do NOT skip dependency validation - always check dependencies if validation enabled in config
- Do NOT create incomplete specs - always collect all required information
- Always get user approval at configured checkpoints
- Always validate dependencies if enabled in configuration

## Integration with Commands

This rule complements the explicit `/create_feature_unit` command:
- **Rule-based detection:** Triggers automatically when patterns are detected
- **Explicit command:** User can call `/create_feature_unit` directly with feature_id

Both paths lead to the same workflow execution.

