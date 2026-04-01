---
name: simplify onboarding flow
overview: Simplify full Neotoma onboarding by making core commands work without mandatory `init`, splitting optional setup into focused commands, and updating docs/tests to reflect the progressive setup model.
todos:
  - id: define-target-ux
    content: Define new progressive onboarding UX and command contract (`init` optional, targeted setup commands for env/MCP/CLI instructions).
    status: pending
  - id: refactor-cli-flow
    content: Refactor CLI startup and `init` implementation to reduce prompts and move environment/client-specific setup out of default init path.
    status: pending
  - id: add-compatibility-guards
    content: Preserve backward compatibility with clear deprecation warnings and migration guidance for existing `init` users.
    status: pending
  - id: expand-test-matrix
    content: Update and add CLI tests for no-init first use, optional setup commands, and reduced-interaction paths.
    status: pending
  - id: sync-docs
    content: Update getting started, CLI reference, and onboarding docs to the new simplified flow with examples, decision points, and context-based command guidance for agents.
    status: pending
  - id: add-agent-command-matrix
    content: Add a context-to-command matrix in agent onboarding docs so agents select `init`, `mcp check`, `cli-instructions check`, or auth commands based on concrete runtime signals.
    status: pending
isProject: false
---

# Simplify Neotoma Onboarding Plan

## Goal

Reduce upfront complexity by making first use work without a mandatory `neotoma init`, while keeping `init` available as an explicit advanced/bootstrap command.

## Current Friction Points To Address

- `init` currently bundles multiple concerns (auth mode, env targeting, scope selection, MCP install, CLI instruction setup), which creates a long interactive branch tree in `[src/cli/index.ts](/Users/markmhendrickson/repos/neotoma/src/cli/index.ts)`.
- MCP and instruction setup logic is extensive and better suited as explicit follow-up actions than first-run defaults (see `[src/cli/mcp_config_scan.ts](/Users/markmhendrickson/repos/neotoma/src/cli/mcp_config_scan.ts)`).
- Docs still present `init` as a first mandatory step in multiple places (for example `[docs/developer/getting_started.md](/Users/markmhendrickson/repos/neotoma/docs/developer/getting_started.md)` and `[docs/developer/cli_reference.md](/Users/markmhendrickson/repos/neotoma/docs/developer/cli_reference.md)`).
- Tests encode broad `init` responsibility and need to be rebalanced to validate progressive setup behavior (not only init behavior), especially in `[tests/cli/cli_init_commands.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_commands.test.ts)`, `[tests/cli/cli_init_interactive.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_interactive.test.ts)`, and `[tests/cli/cli_init_env_targeting.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_env_targeting.test.ts)`.

## Proposed End-State UX

- **Default first-run**: common read/write data commands auto-create required local directories/DB lazily if missing.
- `**neotoma init`**: optional convenience/bootstrap command for users who want guided setup; default path becomes minimal and non-invasive.
- **Optional explicit setup commands**:
  - `neotoma mcp check` for MCP configuration.
  - `neotoma cli-instructions check` for agent rule wiring.
  - Keep auth setup explicit rather than part of baseline init unless requested.
- **Prompting policy**: prompt only when a concrete action cannot be safely defaulted.

## Implementation Phases

### 1) Lock the command contract

- In `[src/cli/index.ts](/Users/markmhendrickson/repos/neotoma/src/cli/index.ts)`, define the new behavior contract:
  - data commands do not require prior `init`.
  - `init` no longer assumes ownership of MCP + CLI instruction setup by default.
  - keep an explicit “advanced/personalize” path for users who want full guided onboarding.
- Add clear deprecation/migration messaging for workflows that still assume mandatory `init`.

### 2) Split responsibilities from init

- Refactor the `init` action in `[src/cli/index.ts](/Users/markmhendrickson/repos/neotoma/src/cli/index.ts)` so baseline init only does:
  - local path resolution,
  - optional env bootstrap,
  - optional DB/bootstrap checks.
- Keep MCP setup orchestration in `[src/cli/mcp_config_scan.ts](/Users/markmhendrickson/repos/neotoma/src/cli/mcp_config_scan.ts)` but invoke it only when explicitly requested (or via advanced mode).
- Keep CLI instruction setup explicit, not automatic in baseline path.

### 3) Backward compatibility and guardrails

- Preserve existing flags (`--advanced`, `--yes`, `--skip-env`, `--skip-db`) with behavior-compatible semantics where possible.
- Add transitional messages in output/next steps to direct users to the new explicit setup commands when they previously relied on init side effects.
- Ensure non-interactive and CI flows remain deterministic.

### 4) Test strategy updates

- Update tests to validate progressive onboarding model:
  - Existing init tests in `[tests/cli/cli_init_commands.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_commands.test.ts)` and `[tests/cli/cli_init_interactive.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_interactive.test.ts)` should assert reduced default prompting and narrower init scope.
  - Add/adjust tests proving core data commands succeed on first run without prior `init`.
  - Keep env-targeting correctness in `[tests/cli/cli_init_env_targeting.test.ts](/Users/markmhendrickson/repos/neotoma/tests/cli/cli_init_env_targeting.test.ts)`.

### 5) Documentation realignment

- Update onboarding docs to make `init` optional and progressive setup primary:
  - `[docs/developer/getting_started.md](/Users/markmhendrickson/repos/neotoma/docs/developer/getting_started.md)`
  - `[docs/developer/cli_reference.md](/Users/markmhendrickson/repos/neotoma/docs/developer/cli_reference.md)`
  - `[docs/developer/agent_cli_configuration.md](/Users/markmhendrickson/repos/neotoma/docs/developer/agent_cli_configuration.md)`
  - `[docs/developer/agent_onboarding_confirmation.md](/Users/markmhendrickson/repos/neotoma/docs/developer/agent_onboarding_confirmation.md)`
- Add concise decision guidance: “When should I run init vs just start using commands?”
- Add an explicit **agent context-to-command matrix** in `agent_onboarding_confirmation.md`, including:
  - missing local state -> run the needed data command directly (lazy setup) and avoid forcing `init`,
  - explicit full bootstrap/customization intent -> run `neotoma init` (or `--advanced`),
  - MCP config absent/misaligned -> run `neotoma mcp check`,
  - agent instruction files missing/outdated -> run `neotoma cli-instructions check`,
  - auth-specific failures -> run targeted `neotoma auth ...` commands.

## Validation Checklist

- No-init path works for standard local data commands on clean machine.
- `init` still works as optional guided setup and advanced personalization.
- MCP and CLI instruction setup remain available via explicit commands.
- Non-interactive scripts and existing automation do not regress.
- Docs and tests reflect the same command contract end-to-end.
- Agent onboarding docs include deterministic command-selection guidance for context-specific setup cases.

## Rollout Notes

- Ship in one release with release notes explicitly calling out:
  - `init` is optional for most users,
  - what still benefits from `init`,
  - exact replacements for old init side effects (`mcp check`, `cli-instructions check`).

