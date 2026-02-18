---
name: ""
overview: ""
todos: []
isProject: false
---

# Prefer CLI locally, MCP remotely; close CLI–MCP capability gap

## 1. Rationale

- **Problem:** The MCP server locally often becomes unavailable (Cursor settings, restart, code changes, sync issues), blocking agents that rely on it.
- **Approach:** Prefer the CLI when the agent is in the same environment as the Neotoma repo (local). Use MCP when the agent is remote (tunnel, ChatGPT, deployed neotoma.fly.dev).
- **Parity:** Today the CLI can reach almost all MCP actions via dedicated commands or `neotoma request --operation <id>`. Two capabilities are MCP-only and must be added to the API and CLI.
- **REPL vs direct:** All functionality currently available in the interactive REPL (`neotoma>` prompt) must be executable as direct CLI invocations (e.g. `neotoma entities list`) without entering interactive mode, so agents and scripts never need a TTY or session.

---

## 2. Agent instructions: when to use CLI vs MCP

**Documents to add or update:**

- `**[docs/developer/mcp/instructions.md](docs/developer/mcp/instructions.md)**` (or a dedicated agent-instruction doc): Add a short "Transport and environment" block:
  - **Local (same machine as repo):** Prefer the **Neotoma CLI** (`neotoma …`). Start or use an existing API session; run `neotoma` with no args for an interactive session, or `neotoma --servers=start` in non-interactive mode. Use MCP only if the user explicitly configures it or when CLI is unsuitable.
  - **Remote (tunnel, ChatGPT, cloud):** Use **MCP** over HTTP with the configured Neotoma URL (e.g. tunnel or neotoma.fly.dev).
- `**[docs/developer/mcp_overview.md](docs/developer/mcp_overview.md)**` and `**[docs/developer/agent_cli_configuration.md](docs/developer/agent_cli_configuration.md)`: State that for local development and agents running in the repo, the CLI is the recommended interface; MCP is recommended for remote clients.
- **Context index / agent instructions:** Ensure the "when to load" and "constraints" sections reference "prefer CLI when local" so agents load this guidance.

No code changes to the MCP server are required for this part; only documentation and instructions.

---

## 3. CLI config process: add agent instructions to the repo/project (like MCP config, for CLI usage)

**Goal:** When the CLI is run from a repo or project (Neotoma repo or any project that has `neotoma` available), offer a bootstrap/setup step that adds or updates **agent instructions** so that agents know to use Neotoma via the CLI (direct invocation, prefer CLI over MCP when local). This mirrors the existing MCP config flow (`neotoma mcp config`, `neotoma mcp check`) but targets agent-instruction files instead of MCP server entries. Support **both project-level and user-level** placement and **ask the user** which they prefer when adding.

**Why:** MCP config ensures the MCP server is listed in `.cursor/mcp.json` etc. There is no equivalent today that ensures agents are told “to use Neotoma CLI.” “prefer CLI when local”. Project-level applies only to the current repo; user-level applies in all projects (e.g. `~/.cursor/rules/`). User preference varies; the tool should offer both and let the user choose.

**Planned work:**

1. **New CLI commands** (or subcommands under an existing group), e.g.:

- `**neotoma cli-instructions config**` (or `neotoma setup cli-instructions`): Print guidance on what agent instructions to add and where (e.g. “Add a rule that says: when local, use Neotoma via CLI; direct invocation only”).
- `**neotoma cli-instructions check**`: Scan the current directory/repo for known agent-instruction locations and detect whether “use Neotoma via CLI when local” (or equivalent) is already present. If missing, offer to add it (or print the exact snippet and path to add).

1. **Scan locations:** Support both **project-level** and **user-level**; when adding, **ask the user** which they want:

- **Project-level** (this repo only): `.cursor/rules/`, `docs/` paths that feed into `.cursor/rules/` (e.g. `docs/developer/*_rules.mdc`), `.claude/`, `AGENTS.md`, `.codex/` (tool-specific).
- **User-level** (all projects): `~/.cursor/rules/` or equivalent, `~/.claude/`, user-level AGENTS or instructions path per tool. User-level means "use Neotoma via CLI when local" applies in every project where the user runs the CLI.

When offering to add instructions, **prompt**: e.g. "Add to this project only (project-level), or to your user config so it applies in all projects (user-level)?" Default can be project-level to avoid global edits without explicit choice; document the default.

1. **Content to add:** A short, canonical block (e.g. a rule or a section in AGENTS.md) that states:

- When working in this repo (or when Neotoma CLI is available locally), use Neotoma via the **CLI** for all Neotoma operations.
- Invoke commands directly (e.g. `neotoma entities list`); do not rely on the interactive session.
- Use MCP only when using Neotoma remotely (tunnel, ChatGPT, deployed).

1. **Integration with boot/init:** Optionally:

- Run the “check” as part of `neotoma init` (e.g. “No Neotoma CLI agent instructions found. Run `neotoma cli-instructions check` to add them.”), or
- Run it when starting an interactive session (similar to how MCP status is shown and `neotoma mcp check` is suggested when servers are missing), or
- Keep it as a standalone command that users (or docs) run explicitly.

1. **Implementation:** New module or commands in `[src/cli/index.ts](src/cli/index.ts)` (and possibly a small helper in `src/cli/` for scanning and generating the snippet), reusing the same “scan project, offer to add” pattern as `[src/cli/mcp_config_scan.ts](src/cli/mcp_config_scan.ts)`.

**Deliverables:**

- `neotoma cli-instructions config`: prints where and what to add.
- `neotoma cli-instructions check`: scans project and optionally user-level paths, reports present/missing, **asks user** project vs user-level, then offers to add (or prints snippet).
- Optional: hook into `neotoma init` or session startup to suggest running the check.
- Doc: [CLI reference](docs/developer/cli_reference.md) and [agent CLI configuration](docs/developer/agent_cli_configuration.md) updated to describe the new commands, project vs user-level choice, and when to run them.

**Scope:** Both project-level and user-level are in scope. The tool should ask the user which they prefer when adding; default to project-level unless the user opts for user-level (avoids editing global config without explicit choice).

---

## 4. All REPL functionality must be directly invokable (no interactive mode required)

**Requirement:** Every action available in the interactive session (typing at the `neotoma>` prompt) must be executable as a direct CLI call from the shell or from a script/agent, without entering the REPL. Agents must never depend on interactive mode (TTY or session).

**Current behavior (from code):**

- The session REPL in `[src/cli/index.ts](src/cli/index.ts)` forwards user input to the same Commander `program`: `parseSessionLine(trimmed)` → `program.parseAsync([process.argv[0], process.argv[1], ...args])`. So anything typed at the prompt (e.g. `entities list`, `store --file x.json`) is equivalent to running `neotoma entities list` or `neotoma store --file x.json` from the shell.
- When no command is given (no args or only flags), the CLI enters the session only if `process.stdout.isTTY` is true; otherwise it falls through. So non-interactive callers must pass an explicit command.

**Planned work:**

1. **Document:** In [CLI overview](docs/developer/cli_overview.md) and [CLI reference](docs/developer/cli_reference.md), state explicitly that all session commands are available as direct invocations: `neotoma <top-level> [subcommand] [options] [args]`. List or reference the full command tree so agents know the exact form (e.g. `neotoma entities list`, `neotoma relationships list <entityId>`).
2. **Agent instructions:** In MCP/agent instructions, require: "When using the Neotoma CLI locally, always invoke commands directly (e.g. `neotoma entities list --type company`). Do not rely on entering the interactive session; use direct invocation so the CLI works in non-TTY and scripted environments."
3. **Audit:** Add a test or script that:

- Enumerates all top-level commands (and optionally key subcommands) from the Commander program (same list as the session command palette from `getSessionCommands` / `getSessionCommandsWithSubcommands`).
- For each, runs `neotoma <command> [subcommand] --help` (or a safe no-op) and asserts exit code 0 (or documented non-zero for invalid args), so that every REPL-listed command is confirmed to work when invoked directly.

1. **No-args, non-TTY:** When the CLI is run with no command and stdout is not a TTY (e.g. agent runs `neotoma` with no args), ensure behavior is clear: either print a short message (e.g. "No command given. Run neotoma ; e.g. neotoma entities list. Use neotoma --help for options.") and exit 0, or exit with a non-zero code and the same message, so agents get a clear signal to pass a command. Avoid silent or confusing exit.
2. **Session-only shortcuts:** The only REPL-only behavior is the "row number" shortcut (typing 1, 2, 3 after `watch` to open an entity/source by index). That shortcut merely runs existing commands (`entities get`, `sources get`, etc.). Document that these shortcuts are conveniences only; the underlying actions are available as direct commands.

**Deliverables:**

- Doc update: CLI overview + reference state "all session commands = direct invocation".
- Agent instructions: "always use direct CLI invocation when local; do not depend on interactive session."
- Test or script: audit that every session-listed command parses and runs when invoked directly.
- Optional: improve no-command / non-TTY message so agents know to pass a command.

---

## 5. Capability gap: two MCP-only features

From `**[src/shared/contract_mappings.ts](src/shared/contract_mappings.ts)**` (lines 432–435, 442–444), the only MCP-only tools are:

- `**store_unstructured**` — Store raw files (file_path or file_content + mime_type); server stores and optionally runs interpretation.
- `**get_relationship_snapshot**` — Return a relationship snapshot and its observations by (relationship_type, source_entity_id, target_entity_id).

All other MCP tools already have a CLI path (dedicated command or `request --operation <id>`).

---

## 6. Closing the gap: store_unstructured

**Current state:**

- MCP: `store` / `store_unstructured` accept `file_path` (local) or `file_content` (base64) + `mime_type`; `[src/server.ts](src/server.ts)` handles both.
- HTTP: `[src/actions.ts](src/actions.ts)` exposes only `POST /api/store` with `StoreStructuredRequestSchema` (entities only). No REST endpoint for unstructured file store.
- CLI: `neotoma store` only supports `--json` / `--file` with a **JSON** entity array. The "Upload a file" example in `[docs/developer/cli_overview.md](docs/developer/cli_overview.md)` (`neotoma upload ./file`) is not implemented (no `upload` command in `[src/cli/index.ts](src/cli/index.ts)`).

**Planned work:**

1. **REST:** Add an endpoint for unstructured store, e.g. `POST /api/store/unstructured` (or `POST /upload`), that:

- Accepts either:
  - JSON body: `{ file_path: string, mime_type?: string, original_filename?: string, idempotency_key?: string, interpret?: boolean }` (server reads file from path; only safe when API runs with filesystem access), or
  - Multipart: one file part plus optional fields (idempotency_key, interpret, original_filename).
- Reuses the same storage/interpretation logic as MCP (e.g. call into the same service used by the MCP `store` handler).
- Returns a response consistent with MCP store (e.g. source_id, entity_ids if interpret ran).

1. **OpenAPI:** Add the new operation to `[openapi.yaml](openapi.yaml)` and regenerate types if needed.
2. **CLI:** Add a command, e.g. `neotoma store --file <path>` for unstructured or a dedicated `neotoma upload <path>`:

- Read file from path, send to the new endpoint (multipart or base64 in JSON, depending on chosen API shape).
- Options: `--no-interpret`, `--idempotency-key`, `--mime-type` (optional; infer from extension if omitted).

1. **Contract mappings:** In `[src/shared/contract_mappings.ts](src/shared/contract_mappings.ts)`, add a mapping for the new operation and set `store_unstructured` to that CLI command; remove `store_unstructured` from `MCP_ONLY_TOOLS`.
2. **Docs:** Update [CLI reference](docs/developer/cli_reference.md) and [CLI overview](docs/developer/cli_overview.md) so "Upload a file" points to the implemented command.

---

## 7. Closing the gap: get_relationship_snapshot

**Current state:**

- MCP: `[src/server.ts](src/server.ts)` `getRelationshipSnapshot()` (lines 2455–2494) takes `relationship_type`, `source_entity_id`, `target_entity_id`; reads from `relationship_snapshots` and `relationship_observations` (Supabase).
- HTTP: No endpoint. OpenAPI has `getRelationshipById` (by relationship id), not by (type, source, target).
- CLI: No command; `[MCP_TOOL_TO_CLI_COMMAND](src/shared/contract_mappings.ts)` maps it to `mcp-only --tool get_relationship_snapshot`.

**Planned work:**

1. **REST:** Add `POST /get_relationship_snapshot` (or `/api/relationships/snapshot`) with body schema aligned to MCP: `{ relationship_type, source_entity_id, target_entity_id }`. Reuse the same logic as the MCP handler (or call a shared service). Return snapshot + observations (and optionally user_id handling if multi-tenant).
2. **OpenAPI:** Add operation (e.g. `getRelationshipSnapshot`) and request/response schemas in `[openapi.yaml](openapi.yaml)`.
3. **CLI:** Add a command, e.g. `neotoma relationships get-snapshot` (or `relationships snapshot`) with args/options for the three identifiers, calling the new endpoint. Alternatively, document `neotoma request --operation getRelationshipSnapshot --body '{"relationship_type":"PART_OF","source_entity_id":"...","target_entity_id":"..."}'` once the operation exists.
4. **Contract mappings:** Add mapping for `getRelationshipSnapshot` with adapter `both` and the chosen CLI command; remove `get_relationship_snapshot` from `MCP_ONLY_TOOLS` and from the "mcp-only" fallback in `MCP_TOOL_TO_CLI_COMMAND`.

---

## 8. Implementation order and files

| Step | Task                                                                                                                                   | Key files                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Document "prefer CLI when local, MCP when remote"                                                                                      | `docs/developer/mcp/instructions.md`, `docs/developer/mcp_overview.md`, `docs/developer/agent_cli_configuration.md`, context/agent docs                    |
| 2    | **CLI config process:** Add `neotoma cli-instructions config` / `check`; scan repo and offer to add “use Neotoma via CLI” instructions | `src/cli/index.ts`, new helper (e.g. `src/cli/agent_instructions_scan.ts`), `docs/developer/cli_reference.md`, `docs/developer/agent_cli_configuration.md` |
| 3    | **REPL = direct invocation:** Doc + agent instructions + audit test + non-TTY no-args message                                          | `docs/developer/cli_overview.md`, `docs/developer/cli_reference.md`, MCP/agent instructions, `src/cli/index.ts` (optional message), new test or script     |
| 4    | REST + OpenAPI for unstructured store                                                                                                  | `src/actions.ts`, `openapi.yaml`, shared store/interpretation service                                                                                      |
| 5    | CLI for unstructured store (upload)                                                                                                    | `src/cli/index.ts`, `docs/developer/cli_reference.md`, `docs/developer/cli_overview.md`                                                                    |
| 6    | Contract mapping for store_unstructured                                                                                                | `src/shared/contract_mappings.ts`                                                                                                                          |
| 7    | REST + OpenAPI for get_relationship_snapshot                                                                                           | `src/actions.ts`, `openapi.yaml` (reuse logic from `server.ts` or relationships service)                                                                   |
| 8    | CLI for get_relationship_snapshot                                                                                                      | `src/cli/index.ts`                                                                                                                                         |
| 9    | Contract mapping for get_relationship_snapshot                                                                                         | `src/shared/contract_mappings.ts`                                                                                                                          |

---

## 9. Optional: friendlier CLI commands

To reduce reliance on `request --operation`, consider adding dedicated commands for operations that are currently only via `request`:

- **File URL:** `neotoma file url --path <storage_path>` (wraps `request --operation getFileUrl`).
- **Merge entities:** `neotoma entities merge --from <id> --to <id>` (wraps `mergeEntities`).
- **Create relationship:** `neotoma relationships create --type <type> --source <id> --target <id>` (wraps `createRelationship`).

These are UX improvements; parity is achieved once store_unstructured and get_relationship_snapshot are implemented.

---

## 10. Validation

- **Parity:** After implementation, `MCP_ONLY_TOOLS` in `[src/shared/contract_mappings.ts](src/shared/contract_mappings.ts)` should be empty (or only contain tools that are intentionally MCP-only).
- **REPL = direct:** Audit test passes: every session-listed command runs when invoked as `neotoma <cmd> ...` (e.g. with `--help`).
- **CLI instructions config:** `neotoma cli-instructions config` and `neotoma cli-instructions check` run without error; check correctly detects presence/absence of “use Neotoma via CLI” in scanned paths.
- **Docs:** All references to "neotoma upload" and "get_relationship_snapshot" should point to real CLI commands or operations.
- **Tests:** Add or extend CLI and API tests for the new store-unstructured and get-relationship-snapshot flows.
