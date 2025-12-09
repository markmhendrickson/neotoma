# Feature Unit Creation Detection Rule

**Reference:** `docs/feature_units/standards/creating_feature_units.md` — Complete workflow

## Trigger Patterns

When a user mentions any of the following patterns, the agent MUST automatically detect feature unit creation intent:

- "create feature"
- "new feature"
- "add feature"
- "implement feature"
- "feature unit" or "FU"
- Feature Unit ID format: `FU-YYYY-MM-NNN` (e.g., "FU-2025-01-001")
- Feature descriptions that imply new work (e.g., "we need to add X", "implement Y functionality")
- Planning discussions about new functionality

## Agent Actions

### Step 1: Detection and Confirmation

**If context suggests feature unit creation** (mentions "feature", "FU-", feature descriptions, etc.):

1. **Extract feature information** from context:
   - Feature Unit ID (if mentioned, e.g., "FU-2025-01-001")
   - Feature name or description
   - Priority hints (P0/P1/P2/P3)
   - Scope hints (what functionality is mentioned)

2. **Check if feature unit already exists:**
   - Look for `docs/feature_units/completed/{feature_id}/`
   - Look for `docs/feature_units/in_progress/{feature_id}/`
   - Look for `docs/specs/MVP_FEATURE_UNITS.md` (for MVP FUs)

3. **If feature unit exists:**
   - Inform user: "Feature Unit {feature_id} already exists. Status: {status}"
   - Ask: "Do you want to modify it or create a new one? (modify/new)"

4. **If feature unit does NOT exist:**
   - **Ask for confirmation:**
     ```
     I see you're requesting a new Feature Unit. Should I create a Feature Unit spec 
     in `docs/feature_units/in_progress/{feature_id}/` following the Feature Unit 
     creation workflow? (yes/no)
     ```
   
   If feature ID was detected, include it: `docs/feature_units/in_progress/FU-2025-01-001/`

5. **If feature ID not detected:**
   - Ask: "What Feature Unit ID should I use? (format: FU-YYYY-MM-NNN, e.g., FU-2025-01-001)"
   - Wait for user input before proceeding

6. **Exception handling:**
   - If user says "no" → do not proceed with feature unit creation
   - If user says "just a spec document" → create spec document instead

### Step 2: Execute Feature Unit Creation Workflow

**If user confirms (yes) and feature_id is provided:**

1. **Load required documents:**
   - `docs/feature_units/standards/creating_feature_units.md` (primary workflow)
   - `.cursor/commands/create_feature_unit.md` (command implementation)
   - `docs/feature_units/standards/feature_unit_spec.md` (spec template)
   - `docs/feature_units/standards/manifest_template.yaml` (manifest template)
   - `docs/specs/MVP_FEATURE_UNITS.md` (for dependency checking)

2. **Follow the Feature Unit creation workflow:**
   - Start at Step 0 (Checkpoint 0) — Spec Creation + UX Input
   - Check if spec exists (completed or in_progress)
   - If spec exists: validate completeness, proceed if complete
   - If spec does NOT exist: **STOP and prompt user** interactively for all required spec details
   - Generate complete spec and manifest from user input
   - **Validate dependencies** — REJECT if dependencies not implemented
   - Create file structure (spec, manifest, test directories)
   - Do NOT implement code yet — only scaffolds

3. **Alignment Check (Spec vs Mental Model):**
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

4. **Create file structure:**
   ```
   docs/feature_units/in_progress/{feature_id}/
     ├── {feature_id}_spec.md
     └── manifest.yaml
   
   tests/unit/features/{feature_id}/
   tests/integration/features/{feature_id}/
   tests/e2e/features/{feature_id}/
   tests/regression/features/{feature_id}/
   ```

## Constraints

- **NEVER proceed without user confirmation** — always ask before creating feature unit specs
- **NEVER proceed without feature_id** — always require explicit feature ID
- **NEVER skip dependency validation** — always check dependencies before proceeding
- **NEVER create incomplete specs** — always collect all required information
- **ALWAYS get user approval** at checkpoints (0, 1, 2)
- **ALWAYS validate dependencies** before creating spec

## Integration with Commands

This rule complements the explicit `/create_feature_unit` command:
- **Rule-based detection:** Triggers automatically when patterns are detected
- **Explicit command:** User can call `/create_feature_unit` directly with feature_id

Both paths lead to the same workflow execution.

