# Bug Fix Detection Rule

**Reference:** `.cursor/commands/fix_feature_bug.md` — Bug fix workflow
**Reference:** `docs/feature_units/standards/error_protocol.md` — Error classification

## Trigger Patterns

When a user mentions any of the following patterns, the agent MUST automatically detect bug fix intent:

- "bug"
- "error"
- "fix"
- "broken"
- "not working"
- "failing"
- "issue" (in context of problems)
- "problem" (in context of code/functionality)
- Error messages or stack traces
- Test failures
- "regression"
- "broken feature"
- "doesn't work"

## Agent Actions

### Step 1: Detection and Confirmation

**If context suggests a bug** (mentions "bug", "error", "fix", "broken", error messages, etc.):

1. **Extract bug information** from context:
   - Error messages or stack traces (if provided)
   - Feature Unit ID (if mentioned or can be inferred from path/context)
   - Description of the problem
   - Steps to reproduce (if mentioned)

2. **Identify feature_id:**
   - Check error messages for file paths (e.g., `src/features/FU-100/...`)
   - Check context for feature mentions
   - Check open files for feature_id references
   - If cannot identify → ask user: "Which Feature Unit is affected? (feature_id or 'unknown')"

3. **Ask for confirmation:**
   ```
   I see you're reporting a bug. Should I fix this using the bug fix workflow? 
   Feature Unit: {feature_id} (or 'unknown' if not identified)
   (yes/no)
   ```

4. **Exception handling:**
   - If user says "no" → do not proceed with bug fix workflow
   - If user says "just document it" → document the bug instead

### Step 2: Execute Bug Fix Workflow

**If user confirms (yes):**

1. **Load required documents:**
   - `.cursor/commands/fix_feature_bug.md` (command implementation)
   - `docs/context/index.md` (navigation guide)
   - `docs/feature_units/in_progress/{feature_id}/{feature_id}_spec.md` (or completed path)
   - `docs/feature_units/in_progress/{feature_id}/manifest.yaml` (or completed path)
   - `docs/feature_units/standards/error_protocol.md` (error classification)
   - `docs/subsystems/i18n.md` (if UI bug)
   - `docs/subsystems/accessibility.md` (if UI bug)

2. **Follow the bug fix workflow:**
   - Identify feature_id from error, path, or context
   - Load spec and manifest for the feature unit
   - Classify bug into Class 1, 2, or 3 (per error_protocol.md)
   - Apply correction rules:
     - **Class 1:** Patch code only (implementation bug, no spec change)
     - **Class 2:** Update spec/manifest first, then align code/tests (spec incomplete or wrong)
     - **Class 3:** Update subsystem/architecture docs first, then rebuild (architectural issue)
   - Always add a regression test
   - Run lint → TEST_CHANGED → subsystems → TEST_ALL

3. **Output:**
   - Error class (1, 2, or 3)
   - Reason for classification
   - Corrected files
   - Tests added/updated

## Error Classification (from error_protocol.md)

- **Class 1:** Implementation bug, spec is correct, code doesn't match spec
- **Class 2:** Spec bug, spec is incomplete or wrong, code matches spec but spec is wrong
- **Class 3:** Architectural bug, subsystem/architecture docs are wrong or incomplete

## Constraints

- **NEVER proceed without user confirmation** — always ask before fixing bugs
- **ALWAYS classify error** into Class 1, 2, or 3 before fixing
- **ALWAYS add regression test** — never fix without test
- **ALWAYS run tests** — lint → TEST_CHANGED → subsystems → TEST_ALL
- **ALWAYS update spec/manifest** for Class 2 bugs before fixing code
- **ALWAYS update architecture docs** for Class 3 bugs before fixing code

## Integration with Commands

This rule complements the explicit `/fix_feature_bug` command:
- **Rule-based detection:** Triggers automatically when bug patterns are detected
- **Explicit command:** User can call `/fix_feature_bug` directly

Both paths lead to the same workflow execution.




