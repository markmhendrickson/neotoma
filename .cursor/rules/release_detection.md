# Release Detection Rule

**Reference:** `docs/feature_units/standards/release_workflow.md` — "Release Detection" section

## Trigger Patterns

When a user mentions any of the following patterns, the agent MUST automatically detect release intent:

- "new release"
- "internal release"
- "create release"
- "release vX.Y.Z"
- "split out [features] into a [type] release"
- "prior release"
- "pre-MVP release"
- "MCP-focused release"
- "v0.X.Y release"
- Version numbers in release context (e.g., "v1.1.0", "v2.0.0")
- Release-related planning discussions

## Agent Actions

### Step 1: Detection and Confirmation

**If context suggests a release** (mentions "release", version numbers, "split out", "prior", etc.):

1. **Extract release information** from context:
   - Release ID/version (if mentioned, e.g., "v1.0.0", "v1.1.0")
   - Release type hints (internal/external)
   - Scope hints (what features/FUs are mentioned)

2. **Ask for confirmation:**
   ```
   I see you're requesting a new release. Should I create a release plan in 
   `docs/releases/in_progress/{release_id}/` following the release workflow? (yes/no)
   ```
   
   If release ID was detected, include it: `docs/releases/in_progress/v1.1.0/`

3. **Exception handling:**
   - If user explicitly says "just a spec document" or "specification only" → create a spec document instead
   - If user says "no" → do not proceed with release creation

### Step 2: Execute Release Workflow

**If user confirms (yes):**

1. **Load required documents:**
   - `docs/feature_units/standards/release_workflow.md` (primary workflow)
   - `.cursor/commands/create_release.md` (command implementation)
   - `docs/feature_units/standards/creating_feature_units.md` (for FU creation)
   - `docs/feature_units/standards/execution_instructions.md` (for FU execution)
   - `docs/specs/MVP_FEATURE_UNITS.md` (if release_id is v1.0.0 / MVP)

2. **Follow the release workflow:**
   - Start at Step 0 (Checkpoint 0) — Release Planning
   - Create release structure in `docs/releases/in_progress/{release_id}/`:
     - `release_plan.md`
     - `manifest.yaml`
     - `execution_schedule.md`
     - `integration_tests.md`
     - `discovery_plan.yaml` (if discovery enabled)
     - `participant_recruitment_log.md` (if discovery enabled)
     - `status.md`

3. **Do NOT** create standalone specification documents in `docs/specs/` for releases. Releases MUST follow the release workflow and be created in `docs/releases/`.

## Constraints

- **NEVER proceed without user confirmation** — always ask before creating release plans
- **NEVER skip the release workflow** — always follow `release_workflow.md` process
- **ALWAYS validate dependencies** before generating execution schedule
- **ALWAYS get user approval** at checkpoints (0, 0.5, 1, 2)

## Integration with Commands

This rule complements the explicit `/create_release` command:
- **Rule-based detection:** Triggers automatically when patterns are detected
- **Explicit command:** User can call `/create_release` directly without pattern matching

Both paths lead to the same workflow execution.

