---
name: setup-commands
description: Setup Commands (Legacy)
---

<!-- Source: foundation/.cursor/skills/setup-commands/SKILL.md -->

---
name: setup-commands
description: Legacy setup for .claude/skills; foundation uses skills instead. Prefer setup-cursor-copies.
triggers:
  - setup commands
  - /setup_commands
  - setup-commands
---

# Setup Commands (Legacy)

Foundation workflows have been **replaced by skills**. There is no longer a `foundation/agent_instructions/cursor_commands/` directory; workflows live in `foundation/agent_instructions/cursor_skills/{slug}/SKILL.md`.

## What to do instead

1. **Use setup-cursor-copies** — Run `./foundation/scriptsscripts/setup_claude_instructions.sh.sh` (or the **setup-cursor-copies** skill). It copies foundation rules into `.claude/rules/` and foundation skills into `.cursor/skills/`.
2. **Load skills by trigger** — When a trigger matches (e.g. commit, pull, push, fix-feature-bug), load the corresponding skill from `.cursor/skills/{slug}/SKILL.md` per the router rule.

## When this skill is invoked

- Tell the user that foundation no longer installs into `.claude/skills/`.
- Run or direct them to run **setup-cursor-copies** to refresh `.claude/rules/` and `.cursor/skills/`.
- Repository-specific command files in `docs/*_command.md` (if any) may still be installed by setup into `.claude/skills/` when configured in the manifest; foundation workflows are only in `.cursor/skills/`.

## Related

- **setup-cursor-copies** skill — Copies foundation rules and skills into `.cursor/`.
- **Foundation skills source:** `foundation/agent_instructions/cursor_skills/`
