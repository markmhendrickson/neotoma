---
name: run-feature-workflow
description: Run feature workflow per foundation command.
triggers:
  - run feature workflow
  - /run_feature_workflow
  - run-feature-workflow
---

# Run Feature Workflow

feature_id = {{input:feature_id}}

Configuration is read from `foundation-config.yaml`.

1. **Load configuration:**
   - Read `foundation-config.yaml` to get feature unit settings
   - Determine directory structure, manifest complexity, testing requirements

2. **Read authoritative documents:**
   - `foundation/development/feature_unit_workflow.md` (workflow context)
   - `{configured_directory}/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md` (or `completed/` if completed)
   - `{configured_directory}/in_progress/{{input:feature_id}}/manifest.yaml` (or `completed/` if completed)
   - `foundation/development/templates/feature_unit_spec_template.md`
   - Repository-specific execution instructions (if they exist)
   - Repository-specific architecture/module documentation (based on spec)

3. **Determine risk level:**
   - low → skip plan
   - medium → produce brief structured plan
   - high/critical → produce detailed plan and wait for user approval

4. **Apply Feature Unit execution principles:**
   - Update spec/manifest if ambiguous
   - Update code/tests/docs together
   - Follow architectural invariants (from repo-specific docs)
   - Preserve accessibility and i18n rules (if applicable)

5. **Run tests (based on configuration):**
   - Unit tests (if `testing.require_unit_tests: true`)
   - Integration tests (if `testing.require_integration_tests: true`)
   - E2E tests (if `testing.require_e2e_tests: true`)
   - Verify coverage meets configured targets
   
   **If any tests fail:**
   - Immediately invoke `Fix Feature Bug` with feature_id={{input:feature_id}}
   - Do NOT attempt to fix bugs inline
   - Let the error protocol classify and correct
   - After bugfix completes, re-run the test suite
   - Only proceed to step 6 once all tests pass

6. **Apply error protocol** (if repository has one) only if bugs were encountered and fixed via step 5.

7. **Spec-to-Implementation Diff Checkpoint (CRITICAL):**

   Before producing the final summary:
   
   - Compare the implemented code against the spec
   - List any ways implementation **intentionally diverged** from spec (even if small)
   - For each divergence:
     - Either update the spec to reflect the change (if divergence is intentional and correct)
     - Or mark the divergence as a bug to be fixed (if divergence is unintentional)
   - Present this diff to the user:
     - "Implementation vs Spec Diff: [list of divergences]"
     - "For each divergence, should I update the spec or fix the implementation? (spec/implementation/list)"
   - Do NOT proceed to final summary until spec and implementation are aligned (either by updating spec or fixing implementation)

8. **Produce a final change summary:**
   - feature_id
   - files changed
   - risk
   - error_class (if bugfix)
   - tests run
   - coverage achieved

## Inputs

- `feature_id` (string): The feature_id to work on.

