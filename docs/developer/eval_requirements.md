# Eval Requirements for Agentic Behavior PRs

PRs that change agentic behavior must include eval coverage before they can be merged. This document defines what counts as an agentic behavior change, what eval evidence satisfies the requirement, how to write evals that meet the bar, and why the requirement exists.

## What counts as an agentic behavior change

A PR is _agentic-behavior-adjacent_ if its diff touches any of the following paths:

| Path pattern | What it controls |
|---|---|
| `docs/developer/mcp/instructions.md` | MCP interaction instructions sent to agents |
| `src/tool_definitions.ts` | MCP tool schemas exposed to agents |
| `src/server.ts` | MCP server handlers (tool routing, request/response logic) |
| `.cursor/skills/*/SKILL.md` | Cursor skill definitions |
| `.claude/skills/*/SKILL.md` | Claude Code skill definitions |
| Any path containing `agent_instructions` | Agent instruction docs in any location |
| `src/services/*agent*` or `src/services/*instruction*` | Agent-related service modules |

If a PR touches none of these, the eval requirement does not apply.

## What counts as eval evidence

At least one of the following must be true before the PR can merge:

1. **New or modified eval fixture.** The diff adds or modifies a file under `tests/fixtures/agentic_eval/`. The fixture must exercise the changed behavior; a fixture that does not reach the changed code path does not satisfy the requirement.

2. **PR body references passing evals.** The PR description mentions `eval`, `agentic eval`, `agentic_eval`, `scenario`, `tier 1`, or `tier 2`, and CI is green (the agentic eval suite passes).

3. **Linked issue references evals.** An issue referenced by the PR (via `Closes #N` or equivalent) includes eval evidence in its body.

4. **Reviewer confirms eval coverage.** A human reviewer posts a comment containing the exact phrase `eval coverage confirmed`, `evals pass`, or `evals verified` (case-insensitive) after reviewing the changed behavior.

## How to write an eval fixture

Eval fixtures live at `tests/fixtures/agentic_eval/<scenario_id>.json`. See `docs/developer/agentic_eval_fixture_format.md` for the full schema.

A minimal fixture for a skill or instruction change:

```json
{
  "meta": {
    "id": "my_behavior_change",
    "description": "Describe what the changed behavior does and what the fixture verifies.",
    "harnesses": ["cursor-hooks", "claude-code-plugin"],
    "models": ["composer-2", "claude-sonnet-4"],
    "tags": ["agentic-behavior"]
  },
  "events": [
    { "hook": "beforeSubmitPrompt", "payload": { "prompt": "..." } },
    { "hook": "stop", "payload": { "text": "..." } }
  ],
  "assertions": {
    "default": [
      { "type": "entity_stored", "entity_type": "conversation_message", "where": { "role": "user" } }
    ]
  }
}
```

The `scenario_id` in `meta.id` must match the filename without `.json`.

Run the eval suite locally before opening the PR:

```bash
npm run test:agentic-eval
```

## Why this requirement exists

Agent instructions, tool definitions, and skill files define how agents behave. Changes to these files can silently alter agent behavior in ways that are invisible to unit and integration tests, which test the server's HTTP surface rather than how agents use it. Evals test the full behavior loop — what the agent does with the tool, not just whether the tool exists.

This requirement was introduced in [issue #229](https://github.com/neotoma-app/neotoma/issues/229).

## Enforcement

The `/process_prs` skill (`.cursor/skills/process-prs/SKILL.md`) checks for eval evidence in Step 1d and blocks merge until it is present. If your PR is eval-blocked, the skill will post a comment with the specific actions needed to unblock it.
