# Run Feature Workflow

You are working in the Neotoma repository.

feature_id = {{input:feature_id}}

1. Read these authoritative documents first:
   - docs/context/index.md
   - docs/feature_units/standards/creating_feature_units.md (workflow context)
   - docs/feature_units/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md (or docs/feature_units/completed/{{input:feature_id}}/{{input:feature_id}}_spec.md if completed)
   - docs/feature_units/in_progress/{{input:feature_id}}/manifest.yaml (or docs/feature_units/completed/{{input:feature_id}}/manifest.yaml if completed)
   - docs/feature_units/standards/feature_unit_spec.md
   - docs/feature_units/standards/execution_instructions.md
   - docs/feature_units/standards/error_protocol.md

2. Check relevant subsystem docs based on the spec:
   - docs/subsystems/schema.md
   - docs/subsystems/ingestion/ingestion.md
   - docs/subsystems/search/search.md
   - docs/subsystems/i18n.md
   - docs/subsystems/accessibility.md

3. Determine risk level:
   - low → skip plan
   - medium → produce brief structured plan
   - high/critical → produce detailed plan and wait for user approval

4. Apply the Feature Unit Execution Instructions:
   - update spec/manifest if ambiguous
   - update code/tests/docs/metrics together
   - follow subsystem invariants
   - preserve i18n and accessibility rules

5. Run tests:
   - TEST_CHANGED first
   - then relevant subsystem tests or TEST_ALL
   
   **If any tests fail:**
   - Immediately invoke `Fix Feature Bug` with feature_id={{input:feature_id}}
   - Do NOT attempt to fix bugs inline
   - Let the error protocol classify and correct
   - After bugfix completes, re-run the test suite
   - Only proceed to step 6 once all tests pass

6. Apply error protocol (Class 1/2/3) only if bugs were encountered and fixed via step 5.

7. **Spec-to-Implementation Diff Checkpoint (CRITICAL):**

   Before producing the final summary, the agent MUST:
   
   - Compare the implemented code against the spec
   - List any ways implementation **intentionally diverged** from spec (even if small)
   - For each divergence:
     - Either update the spec to reflect the change (if divergence is intentional and correct)
     - Or mark the divergence as a bug to be fixed (if divergence is unintentional)
   - Present this diff to the user:
     - "Implementation vs Spec Diff: [list of divergences]"
     - "For each divergence, should I update the spec or fix the implementation? (spec/implementation/list)"
   - **MUST NOT** proceed to final summary until spec and implementation are aligned (either by updating spec or fixing implementation)

8. Produce a final change summary:
   - feature_id
   - files changed
   - risk
   - error_class (if bugfix)
   - tests run

## Inputs

- `feature_id` (string): The feature_id to work on.

