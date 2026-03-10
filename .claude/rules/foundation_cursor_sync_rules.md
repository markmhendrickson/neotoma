---
description: "When the foundation submodule is updated, refresh .cursor/ from foundation so skills and rules are installed automatically."
alwaysApply: false
---

<!-- Source: docs/developer/foundation_cursor_sync_rules.mdc -->


# Foundation Cursor Sync Rule

## Purpose

Ensures `.cursor/skills/` (and, when present, `.claude/rules/` and `.claude/skills/` from foundation) are refreshed whenever the foundation submodule is updated. Copies are installed automatically by git hooks when you merge or checkout; this rule covers cases where an agent or user updates the submodule without a merge/checkout (e.g. `git submodule update`).

## When This Runs Automatically

- **post-merge**: After `git pull`, the hook runs `scripts/setup_cursor_from_foundation.sh`.
- **post-checkout**: After `git checkout`, the hook runs the same script so a new foundation commit is reflected in `.cursor/`.

## When to Run Manually

Run the script yourself (or tell the agent to run it) when:

- You run `git submodule update --init foundation` or `git submodule update --remote foundation` (no merge/checkout, so no hook runs).
- You have just cloned the repo and initialized foundation and want `.cursor/skills/` populated.
- You want to refresh `.cursor/` from foundation without changing branches or pulling.

## Agent Action

When you update the foundation submodule (e.g. run `git submodule update` for foundation), run:

```bash
npm run setup:cursor
```

or:

```bash
./scripts/setup_cursor_from_foundation.sh
```

Then confirm that `.cursor/skills/` (and rules/commands if present) are updated.

## Script Location

- **Script**: `scripts/setup_cursor_from_foundation.sh`
- **npm**: `npm run setup:cursor`

The script copies `foundation/.cursor/skills/*` into `.cursor/skills/` and, if they exist, foundation `agent_instructions/cursor_rules` and `cursor_commands` into `.claude/rules/` and `.claude/skills/`.
