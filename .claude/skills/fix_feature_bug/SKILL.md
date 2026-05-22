---
name: fix-feature-bug
description: Fix bugs using structured workflow with error classification and regression tests.
triggers:
  - bug
  - error
  - fix
  - broken
  - not working
  - failing
  - fix-feature-bug
  - /fix-feature-bug
---

# Fix Feature Bug

Fix a bug in a feature or module.

Configuration is read from `foundation-config.yaml`.

This workflow can also be triggered automatically via `.cursor/rules/bug_fix_detection.md` (or `foundation/agent_instructions/cursor_rules/bug_fix_detection.md`) when you mention bug/error-related patterns in natural language (e.g., "bug", "error", "fix", "broken"). Both paths execute the same workflow.

## Workflow

1. **Load configuration:**
   - Read `foundation-config.yaml` for bug fix settings
   - Check if error classification is configured
   - Determine feature/module directory structure

2. **Identify feature/module** from error, path, or context.

3. **Load relevant documents:**
   - Repository navigation guide (if configured)
   - Feature/module spec and manifest (if available)
   - Error classification documentation (if configured)
   - Relevant subsystem/module documentation (if configured)

4. **Classify bug** (if error classification configured):
   - Use configured error classification system
   - Determine correction approach based on class

5. **Apply correction rules:**
   - **If Class 1 (Implementation bug):** Patch code only
   - **If Class 2 (Spec bug):** Update spec/manifest first, then align code/tests
   - **If Class 3 (Architectural bug):** Update subsystem/architecture docs first, then rebuild
   - **If no classification:** Fix bug and update relevant documentation

6. **Always add a regression test.**

7. **Run tests:**
   - Run configured test commands
   - Verify fix doesn't break existing functionality

8. **Output:**
   - Error class (if classification configured)
   - Reason for classification
   - Corrected files
   - Tests added/updated

## Error Classification (Configurable)

If `development.bug_fix.error_classification.enabled: true` in foundation-config:

- **Class 1:** Implementation bug - spec is correct, code doesn't match spec
  - **Action:** Patch code only
- **Class 2:** Spec bug - spec is incomplete or wrong, code matches spec but spec is wrong
  - **Action:** Update spec/manifest first, then align code/tests
- **Class 3:** Architectural bug - subsystem/architecture docs are wrong or incomplete
  - **Action:** Update architecture docs first, then rebuild

## Configuration

Bug fix workflow uses settings from `foundation-config.yaml`:

```yaml
development:
  bug_fix:
    enabled: true
    error_classification:
      enabled: false  # Enable if you have error classification system
      classes:
        - name: "Class 1"
          description: "Implementation bug"
          correction: "Patch code only"
        - name: "Class 2"
          description: "Spec bug"
          correction: "Update spec first, then code"
        - name: "Class 3"
          description: "Architectural bug"
          correction: "Update architecture docs first"
    require_regression_test: true
    test_commands:  # Optional, repo-specific test commands
      - "npm test"
      - "npm run test:integration"
```

## Inputs

- `feature_id` or `module_name` (optional): The feature/module identifier to fix

