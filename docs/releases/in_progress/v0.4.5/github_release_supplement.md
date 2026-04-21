This release turns Neotoma's onboarding into an install-first flow and adds the first reusable integration surface for hook-driven agents, alongside a deterministic markdown mirror and bounded `MEMORY.md` export.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, ...)**

- Added `neotoma doctor` as a consolidated onboarding/runtime diagnostic so agents can inspect install state, API state, MCP wiring, CLI instructions, permissions, and hook eligibility without falling back to ad-hoc shell introspection.
- Added `neotoma setup --tool <tool>` to collapse init, MCP config, CLI instruction sync, and permission-file updates into one idempotent command for supported harnesses.
- Added `neotoma hooks <status|install|uninstall>` so hook-based integrations can be offered as an explicit post-activation step instead of being mixed into baseline setup.
- Added `neotoma mirror <enable|disable|rebuild|status|gitignore>` plus supporting edit / export flows for teams that want a filesystem view of Neotoma state. `neotoma mirror enable --gitignore` and the standalone `neotoma mirror gitignore` subcommand idempotently append the resolved mirror path to the enclosing git repo's `.gitignore` so the generated files do not noise up `git status`.
- Extended `neotoma doctor` with a `mirror` block (`enabled`, `path`, `inside_git_repo`, `git_repo_root`, `gitignored`, `eligible_for_offer`) so the activation agent can offer the markdown mirror as an opt-in step (see `install.md` Activation step 6.6) and fall back to a session-banner hint (`Markdown mirror: disabled (enable: neotoma mirror enable --yes)`) when users skip the offer.

**Runtime / data layer**

- Added a stable core operations surface in `src/core/operations.ts` so embedded clients and hook packages can call Neotoma actions directly with typed wrappers instead of reimplementing MCP dispatch.
- Added deterministic canonical markdown renderers plus a filesystem mirror subsystem that can regenerate entity, relationship, source, timeline, and schema views from SQLite and optionally keep bounded `MEMORY.md` exports in sync.
- Added an HTTP markdown rendering path for entity snapshots and aligned MCP text responses around deterministic markdown / JSON output selection.
- Expanded supporting state-layer plumbing across entity resolution, schema registry, raw storage, snapshot computation, timeline events, and local transport so the new mirror / export / hook flows share the same deterministic backend.

**Shipped artifacts**

- The main package continues to ship the CLI / server bundle, `openapi.yaml`, README, and skills, but now also exposes a clearer reusable code surface for embedded integrations through the package exports and core operations module.
- The repository now includes first-party packages for TypeScript and Python clients plus hook / adapter integrations for Cursor, Claude Code, Codex, OpenCode, and the Claude Agent SDK; these are part of the release scope in the repo and docs, even where publishing of the individual packages is staged separately.

## API surface & contracts

- `retrieve_entity_snapshot` now documents a `format` selector (`markdown` default for MCP, `json` for raw payload callers), making the KV-cache-stable text contract explicit in OpenAPI and action schemas.
- The server now exposes deterministic entity markdown rendering over HTTP for inspector and export flows, reusing the same canonical renderer family as MCP and the mirror.
- CLI / MCP parity work expanded the public contract around onboarding and storage behavior so hook packages and direct clients can share the same store / retrieve semantics.

## Behavior changes

- Agent-led install is now opinionated: inspect with `neotoma doctor --json`, configure with `neotoma setup --tool <tool> --yes`, then move into activation rather than improvising repo-specific shell commands.
- Hook integrations are explicitly positioned as an opt-in reliability floor after first value, while MCP remains the quality ceiling for deliberate, schema-typed writes.
- Users who enable the markdown mirror can inspect Neotoma state as deterministic files and optionally keep a bounded `MEMORY.md` export synchronized for file-oriented agent harnesses.

## Docs site & CI / tooling

- The install guide, MCP instructions, CLI instructions, CLI reference, README, and hook documentation were rewritten around the install-first / activation-first workflow.
- The docs site and integration pages were updated for Cursor, Codex, Claude Code, Claude Agent SDK, install preflight snippets, and the new alternate site / illustration surfaces.
- Repo metadata and site copy now reflect the new onboarding language, hook architecture, and mirror/export capabilities.

## Internal changes

- Added reusable packages under `packages/` for `@neotoma/client`, `neotoma-client`, hook installers, plugin manifests, and the Claude Agent SDK adapter.
- Added new services for canonical markdown rendering, canonical mirror rebuilds, git-backed mirror history, batch correction, entity-type equivalence / guard logic, flat-packed detection, memory export, and schema reference linking.
- Added new CLI support modules for doctor, setup, permissions, hooks detection, and mirror commands, plus corresponding transport and action-layer updates.

## Fixes

- Tightened CLI / MCP / local transport parity so install/setup and embedded client flows can reuse the same behavior instead of drifting between interfaces.
- Improved entity resolution, raw storage, timeline event handling, and snapshot computation in support of the new deterministic mirror / export paths.
- Clarified instruction and onboarding rules so agents stop relying on brittle shell inspection during installation and activation.

## Tests and validation

- Added and expanded CLI tests for doctor/setup, mirror, memory export, edit commands, onboarding commands, and command coverage.
- Added service-level tests for canonical markdown, canonical mirror, git-backed mirror behavior, batch correction, entity-type equivalence / guards, schema reference linking, flat-packed detection, raw fragment isolation, and memory export.
- Expanded integration and regression coverage for CLI-to-MCP parity, local transport behavior, entity resolution, raw storage, timeline events, and observation provenance.

## Breaking changes

- None expected for the public API or CLI command semantics.
- Ship constraints for execution: local backup artifacts (`*.backup.*`), temporary SQLite recovery files under `.tmp_wav_fix_data/`, and unrelated submodule drift are not intended for the release commit set and must remain excluded before tagging.
