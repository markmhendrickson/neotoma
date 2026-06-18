---
description: Prompt to publish plan to GitHub Discussions after any plan file is created or updated.
globs:
  - "docs/releases/in_progress/**/release_plan.md"
  - "docs/feature_units/in_progress/**/*_spec.md"
  - ".cursor/plans/**/*.md"
  - ".cursor/plans/**/*.plan.md"
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/publish_plan_prompt.mdc -->


# Publish Plan Prompt Rule

## Purpose

Ensures users are offered the option to share a newly written plan as a
GitHub Discussion post for pre-execution public input, without blocking
the workflow if they decline.

## Trigger Patterns

Offer the publish-plan prompt after any of the following:

- A release plan file is created or substantially updated
  (`docs/releases/in_progress/**/release_plan.md`)
- A feature unit spec is created or substantially updated
  (`docs/feature_units/in_progress/**/*_spec.md`)
- A plan file is created under `.cursor/plans/`
- The user completes the `create-release` or `create-feature-unit` skill
- The user writes or edits a file whose name includes `plan`, `spec`, or
  `release_plan` and the file contains a goal, scope, or decisions section

Do NOT trigger when:
- The plan file already has a corresponding GitHub Discussion linked
- The user explicitly declined in the same session
- The file is a template, example, or stub (fewer than 30 lines)

## Agent Actions

### Step 1: Detect plan creation

After writing a plan file that meets the trigger conditions, check
whether a publish-plan prompt is appropriate:

1. Confirm the file has substantive content (goal, approach, or scope
   section present).
2. Confirm the file is not a template or stub.
3. Confirm the user has not already declined in this session.

### Step 2: Offer the prompt

Present a single, non-blocking offer immediately after reporting that
the plan file was created:

```
Plan saved to {path}.

Would you like to share this as a GitHub Discussion for pre-execution
input? Run /publish-plan {path} to generate a public-facing post.
```

- One line, no pressure, no follow-up questions.
- Do not re-offer if the user does not respond or says no.
- Do not block any subsequent workflow steps on the user's answer.

### Step 3: If user says yes

Invoke the `publish-plan` skill:

```
/publish-plan {path}
```

Pass the plan file path as the argument. Let the skill handle all
subsequent steps (stripping PII, drafting the post, posting to
Discussions).

## Constraints

- MUST offer the prompt at most once per plan file per session.
- MUST NOT block workflow continuation on the user's response.
- MUST NOT re-offer after a decline.
- MUST pass the exact file path to `/publish-plan` without modification.
- MUST NOT offer for templates, stubs, or files under 30 lines.
