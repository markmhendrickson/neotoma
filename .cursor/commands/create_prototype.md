# Create Prototype

Create fully functional client-side prototype for Feature Unit {{input:feature_id}}.

**Follow:** `docs/feature_units/standards/creating_feature_units.md` Step 1 (Prototype Creation)

**This happens after Checkpoint 0 (spec + UX collection) and before Checkpoint 1 (prototype review).**

## Purpose

This command implements prototype creation after Checkpoint 0 (spec + UX) is complete. It creates a fully interactive, client-side prototype with mocked APIs.

## Trigger

- Spec created with UX requirements (Checkpoint 0 complete, UI changes present) OR
- No UI changes required (skip prototype)

## Tasks

1. **Load spec and manifest:**
   - `docs/feature_units/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md` (or `docs/feature_units/completed/{{input:feature_id}}/{{input:feature_id}}_spec.md` if completed)
   - `docs/feature_units/in_progress/{{input:feature_id}}/manifest.yaml` (or `docs/feature_units/completed/{{input:feature_id}}/manifest.yaml` if completed)
   
2. **Check if UI changes present:**
   - Review spec and manifest for UI components
   - Verify UX Requirements section exists in spec (from Checkpoint 0)
   - If no UI changes → skip to implementation
   - If UI changes present → proceed

3. **Create prototype:**
   - Use `frontend/src/prototype/` directory structure
   - Create prototype component(s): `frontend/src/prototype/components/{{input:feature_id}}_*.tsx`
   - Create mock API fixtures: `frontend/src/prototype/fixtures/{{input:feature_id}}_*.ts`
   - Integrate into `frontend/src/prototype/main.tsx`

4. **Prototype requirements:**
   - Fully interactive (click, type, navigate)
   - All API calls mocked (no real backend)
   - All UI states testable (empty, error, loading, success)
   - Accessible (keyboard nav, ARIA)
   - Uses existing design system components
   - Documented mock API responses

5. **Make prototype runnable:**
   - Ensure `npm run dev:prototype` works
   - Document how to run prototype

6. **Output:**
   - Prototype location and run command
   - Summary of what prototype demonstrates
   - List of mocked APIs
   - **STOP and proceed to Checkpoint 1 (Prototype Review)**

## User Review Prompt

Present:
- Prototype location
- How to run: `npm run dev:prototype` (or similar)
- Summary of prototype features

Ask:
- "Please review the prototype at [location]. Run with [command]."
- "Does the prototype meet your requirements? (yes/no)"
- "Any changes needed? (list changes or 'none')"

## If User Requests Changes

- Update prototype based on feedback
- Re-run prototype creation
- Repeat until approved

## If Approved

- Document approval in spec: `**Prototype Approved:** YYYY-MM-DD`
- Proceed to implementation (use `Run Feature Workflow`)

## Inputs

- `feature_id` (string): The feature identifier

