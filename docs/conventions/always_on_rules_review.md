# Review: Repo Rules Currently Always Applied but Should Be On-Demand

## Summary

The selective rule injection plan defines **three always-on repo rules**: `docs/context/index_rules.mdc`, `docs/conventions/rule_router_rules.mdc`, and `docs/foundation/agent_instructions_rules.mdc`. The foundation setup script **honors `cursor_rules_manifest.json`** when present: it installs only the allowlisted foundation rules and the three repo rules above (kernel-only), and removes any other rules from `.cursor/rules/`. Run `npm run setup:cursor` with `jq` installed to get kernel-only install. Below is the list of repo rules that are **on-demand only** (loaded via the router when the trigger matches).

## Intended Always-On (per manifest)

We use **three** always-on repo rules so each has a single job: index (where to go), router (when to load what), agent instructions (constraints and checklist). You can instead use **one** always-on rule; see "Single always-on option" below.

| Source | Installed as | Status |
|--------|--------------|--------|
| `docs/context/index_rules.mdc` | `context_index_rules.mdc` | Installed (correct) |
| `docs/foundation/agent_instructions_rules.mdc` | `foundation_agent_instructions_rules.mdc` | Installed (correct) |
| `docs/conventions/rule_router_rules.mdc` | `conventions_rule_router_rules.mdc` | Installed (correct) |

### Single always-on option

To have **one** always-on repo rule: add a loader rule that tells the agent to load the three docs above from `docs/` at session start. Then install only that loader in `.cursor/rules/` and keep the three as normal docs (not copied). Steps:

1. Add `docs/context/kernel_loader_rules.mdc` (or similar) whose content is: at session start, load in order `docs/context/index_rules.mdc`, `docs/conventions/rule_router_rules.mdc`, `docs/foundation/agent_instructions_rules.mdc`.
2. In `cursor_rules_manifest.json`, set `always_on.repo_rules` to that one path, e.g. `["docs/context/kernel_loader_rules.mdc"]`.
3. Run `npm run setup:cursor`. Only the loader is copied; the three source docs stay in `docs/` and are loaded by following the loader.

## Repo Rules That Should NOT Be Always Applied (on-demand only)

These **20** repo rules are currently in `.cursor/rules/` and always applied. Per the manifest they should be loaded only when the router trigger matches.

| Installed name | Source path | Router trigger (if any) |
|----------------|-------------|-------------------------|
| `conventions_code_conventions_rules.mdc` | `docs/conventions/code_conventions_rules.mdc` | Code style, naming, TypeScript/SQL/YAML/shell |
| `conventions_documentation_standards_rules.mdc` | `docs/conventions/documentation_standards_rules.mdc` | Creating or editing documentation |
| `conventions_plan_format_rules.md` | `docs/conventions/plan_format_rules.md` | Creating or editing documentation |
| `conventions_prefer_cli_tools_rules.mdc` | `docs/conventions/prefer_cli_tools_rules.mdc` | Prefer CLI over dashboard |
| `conventions_social_media_conventions_rules.mdc` | `docs/conventions/social_media_conventions_rules.mdc` | Social media, tweets, posts |
| `conventions_ui_imports_rules.mdc` | `docs/conventions/ui_imports_rules.mdc` | Modifying UI, components |
| `conventions_ui_style_guide_enforcement_rules.mdc` | `docs/conventions/ui_style_guide_enforcement_rules.mdc` | Modifying UI |
| `conventions_ui_test_requirements_rules.mdc` | `docs/conventions/ui_test_requirements_rules.mdc` | UI test coverage |
| `developer_agent_instructions_sync_rules.mdc` | `docs/developer/agent_instructions_sync_rules.mdc` | MCP/CLI instruction parity |
| `developer_bug_learning_rules.mdc` | `docs/developer/bug_learning_rules.mdc` | Bug fix, regression test, learning |
| `developer_cli_debugging_rules.mdc` | `docs/developer/cli_debugging_rules.mdc` | Debugging CLI |
| `developer_env_check_rules.mdc` | `docs/developer/env_check_rules.mdc` | Env vars, .env, config |
| `developer_mcp_bug_investigation_rules.mdc` | `docs/developer/mcp_bug_investigation_rules.mdc` | Debugging MCP |
| `developer_pre_release_validation_rules.mdc` | `docs/developer/pre_release_validation_rules.mdc` | Pre-release, validation |
| `testing_full_route_coverage_rules.md` | `docs/testing/full_route_coverage_rules.md` | UI test coverage, route coverage |
| `testing_integration_test_quality_rules.mdc` | `docs/testing/integration_test_quality_rules.mdc` | Writing/reviewing integration tests |
| `testing_test_quality_enforcement_rules.mdc` | `docs/testing/test_quality_enforcement_rules.mdc` | Writing/reviewing tests |
| `ui_design_system_automation_rules.mdc` | `docs/ui/design_system_automation_rules.mdc` | Modifying UI, design system |
| `ui_design_system_sync_rules.mdc` | `docs/ui/design_system_sync_rules.mdc` | Modifying UI, design system |
| `docs_anchor_and_docs_ui.mdc` | **No source in docs/** (file exists only in `.cursor/rules/`) | **Missing from router** (see below) |

## Gap: docs_anchor_and_docs_ui (optional)

`docs_anchor_and_docs_ui.mdc` governs documentation location and web docs navigation. With manifest-based install it is **not** in the kernel (no source under `docs/` in the manifest). The setup script removes it when using the manifest. To have it on-demand: add a source file under `docs/` (e.g. `docs/conventions/docs_anchor_and_docs_ui_rules.mdc`), add it to the router table with a trigger such as **Creating or moving documentation, updating docs navigation or doc dependencies**, and optionally add it to `cursor_rules_manifest.json` `always_on.repo_rules` if you want it always-on.

## Manifest enforcement

When `cursor_rules_manifest.json` exists in the repo root and `jq` is installed, `npm run setup:cursor` installs only the kernel (allowlisted foundation rules + the three repo rules). Any other file in `.cursor/rules/` (e.g. `neotoma_cli.mdc`, `docs_anchor_and_docs_ui.mdc`) is removed. The CLI may re-add `neotoma_cli.mdc` when you run `neotoma cli-instructions check` or start a session.

## Why some rules still have alwaysApply: true (Cursor/Claude)

**Source of truth:** Foundation rule files (e.g. `foundation/agent_instructions/cursor_rules/*.mdc`) and docs rule files use frontmatter with `alwaysApply: true` by default. Cursor’s setup copies from these sources; the Claude setup script (`scripts/setup_claude_instructions.sh`) also copies frontmatter **verbatim** and does not use the cursor manifest or change `alwaysApply`. So every rule that is copied into `.claude/rules/` keeps whatever the source has.

**Result:** In `.claude/rules/`, every rule ends up with `alwaysApply: true` because the sources were written when the model was “all rules always on.” That burns context even when a rule is only needed in specific situations (e.g. “document an always/never instruction,” “create a rule,” “fix a bug”).

**Fix:** In the **source** (foundation or docs), set `alwaysApply: false` and keep a clear `description` for rules that are only needed in specific contexts. Then both Cursor and Claude will get “Apply Intelligently” when scripts run. Example: `instruction_documentation.mdc` is only needed when the user says “always X” or “never Y” or when creating/editing rules, so it should have `alwaysApply: false`.
