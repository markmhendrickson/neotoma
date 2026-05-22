---
name: create-plan
description: Create a new plan as a Neotoma entity, optionally linked to objectives, releases, or other plans.
triggers:
  - create plan
  - new plan
  - create a plan
  - /create-plan
---

# Create New Plan

Create a new plan entity in Neotoma with title = {{input:title}}.

Follow the complete workflow in `foundation/development/plan_workflow.md`. Configuration is read from `foundation-config.yaml`.

This workflow can also be triggered automatically via `.cursor/rules/plan_detection.mdc` when you mention planning-related patterns in natural language (e.g., "create plan", "new plan"). Both paths execute the same workflow.

## Workflow Overview

Implements Checkpoint 0 of the plan creation workflow:

1. Collect required plan fields from the user
2. Run alignment check (summary → user confirms)
3. Store plan as a Neotoma `plan` entity
4. Create relationships to related entities
5. Optionally rebuild the `neotoma-plans` mirror

## Tasks

1. **Collect required fields:**

   Ask the user for any missing required fields:
   - `title` — Short, imperative name
   - `description` — Problem being solved and why it matters
   - `scope` — What is explicitly in scope
   - `out_of_scope` — What is explicitly out of scope
   - `success_criteria` — Measurable conditions for completion
   - `status` — Default to `draft`

   Optional fields to offer (collect if relevant):
   - `priority` (P0/P1/P2/P3)
   - `phase`
   - `target_release`
   - `deliverables`
   - `dependencies` (canonical names of plans this plan requires)
   - `testing_notes`
   - `observability_notes`

2. **Alignment check:**

   After collecting fields, produce a concise summary:
   - Problem it solves and why it exists
   - What is explicitly in scope and out of scope
   - Critical constraints or invariants

   Ask: "Does this accurately capture what you want this plan to do?"

   Incorporate corrections and re-summarize if changes are substantial. Do not proceed until the user confirms.

3. **Store the plan:**

   Use `store` or `submit_entity` with:
   - `entity_type: plan`
   - All collected fields as snapshot fields

4. **Create relationships** (if relevant entities are mentioned or known):
   - `REFERS_TO` for objectives, releases, or parent plans
   - `DEPENDS_ON` for plans this plan requires
   - `INFORMED_BY` for issues, feedback, or research

5. **Confirm and offer mirror rebuild:**

   ```
   Plan stored: {canonical_name}

   To refresh plans/ in the repo, run:
     neotoma mirror rebuild --profile neotoma-plans
   ```

   Do not wait for a response before completing this skill.

## Required Documents

Load before starting:

- `foundation/development/plan_workflow.md` (workflow)
- `foundation-config.yaml` (configuration)

## Inputs

- `title` (string): Short plan name, e.g. "Add selective mirror profiles"
