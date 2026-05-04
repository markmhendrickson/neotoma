---
description: "When creating or revising plans, include goals, problems, solutions, and automated tests sections when relevant."
alwaysApply: true
---

<!-- Source: foundation/.cursor/rules/plan_sections_rules.mdc -->


# Plan Sections

When creating or updating a plan, structure it around the decision the user needs to make and the work that will follow.

## Requirements

- Include a `Goals` section when the plan would benefit from a clear statement of desired outcomes.
- Include a `Problems` section when the plan is addressing pain points, failure modes, blockers, or current-state gaps.
- Include a `Solutions` section when the plan proposes concrete approaches, design responses, or implementation choices.
- Include an `Automated tests` section when testing is relevant to the work, especially for code changes, integrations, workflows, or regressions.
- Omit any of these sections only when they would be empty, redundant, or not useful for the specific plan.

## Guidance

- Keep the sections concise and proportional to the scope of the plan.
- Use explicit section headings so the structure is easy to scan.
- For small plans, each section can be brief; the requirement is about coverage, not verbosity.
- Do not force the `Automated tests` section for plans where no meaningful automated verification exists, but address testing whenever it materially reduces risk.

## Examples

### Good

- A feature or architecture plan with `Goals`, `Problems`, `Solutions`, and `Automated tests`.
- A lightweight operational plan with `Goals` and `Solutions`, while omitting `Automated tests` if no testable system change is involved.

### Bad

- A plan that jumps straight into tasks without clarifying the problem being solved.
- A code-change plan that omits testing considerations even though regressions are plausible.
