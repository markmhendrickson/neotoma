---
name: create-prototype
description: Create prototype per foundation command.
triggers:
  - create prototype
  - /create_prototype
  - create-prototype
---

# Create Prototype

Create fully functional client-side prototype for Feature Unit {{input:feature_id}}.

Follow `foundation/development/feature_unit_workflow.md` Step 1 (Prototype Creation). Configuration is read from `foundation-config.yaml`.

This happens after Checkpoint 0 (spec creation) and before Checkpoint 1 (prototype review).

Implements prototype creation after Checkpoint 0 (spec) is complete. Creates a fully interactive, client-side prototype with mocked APIs.

## Trigger

- Spec created with UI requirements (Checkpoint 0 complete, UI changes present) OR
- No UI changes required (skip prototype)

## Tasks

1. **Load configuration:**
   - Read `foundation-config.yaml` to get feature unit settings
   - Determine directory structure and prototype paths

2. **Load spec and manifest:**
   - `{configured_directory}/in_progress/{{input:feature_id}}/{{input:feature_id}}_spec.md` (or `completed/` if completed)
   - `{configured_directory}/in_progress/{{input:feature_id}}/manifest.yaml` (or `completed/` if completed)
   
3. **Check if UI changes present:**
   - Review spec and manifest for UI components
   - Verify UX Requirements section exists in spec (from Checkpoint 0)
   - If no UI changes → skip to implementation
   - If UI changes present → proceed

4. **Create prototype:**
   - Use configured prototype directory structure (or default: `frontend/src/prototype/`)
   - Create prototype component(s): `{prototype_dir}/components/{{input:feature_id}}_*.tsx`
   - Create mock API fixtures: `{prototype_dir}/fixtures/{{input:feature_id}}_*.ts`
   - Integrate into prototype main file

5. **Prototype requirements:**
   - Fully interactive (click, type, navigate)
   - All API calls mocked (no real backend)
   - All UI states testable (empty, error, loading, success)
   - Accessible (keyboard nav, ARIA if applicable)
   - Uses existing design system components (if available)
   - Documented mock API responses

6. **Make prototype runnable:**
   - Ensure prototype can be run (e.g., `npm run dev:prototype`)
   - Document how to run prototype

7. **Output:**
   - Prototype location and run command
   - Summary of what prototype demonstrates
   - List of mocked APIs
   - STOP and proceed to Checkpoint 1 (Prototype Review)

## User Review Prompt

Present:
- Prototype location
- How to run: [command]
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

