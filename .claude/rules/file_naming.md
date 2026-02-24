---
description: "Load when creating or renaming files or folders: use underscores (snake_case) for all names; use when referencing paths in documentation; symlinks may use foundation_ prefix."
alwaysApply: false
---

<!-- Source: foundation/agent_instructions/cursor_rules/file_naming.mdc -->

# File and Folder Naming Convention

All filenames and folder names must use underscores (snake_case), not kebab-case (dashes).

## Format

**Files:**
- Correct: `create_feature_unit.md`, `setup_symlinks.md`, `run_feature_workflow.md`
- Incorrect: `create-feature-unit.md`, `setup-symlinks.md`, `run-feature-workflow.md`

**Folders:**
- Correct: `cursor_rules/`, `feature_units/`, `agent_instructions/`, `repo_adapters/`
- Incorrect: `cursor-rules/`, `feature-units/`, `agent-instructions/`, `repo-adapters/` (use underscores: `cursor_rules/`, `feature_units/`, `agent_instructions/`, `repo_adapters/`)

## When Creating or Renaming

1. Use underscores (snake_case) for all filenames and folder names
2. Use underscores when referencing files or folders in documentation
3. Symlinks automatically use `foundation_` prefix (e.g., `foundation_create_feature_unit.md`)

## Migration

If existing files or folders use kebab-case:

1. Rename from `command-name.md` to `command_name.md` or `folder-name/` to `folder_name/`
2. Update references in `foundation_config.yaml`, documentation files, and scripts
3. Run `setup_cursor_rules.sh` to update symlinks
