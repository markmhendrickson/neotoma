---
name: CLI UX improvements
overview: "Improve the Neotoma CLI by applying patterns from Codex, Cursor Agent, npm, Claude, and Claude Code: clearer onboarding, contextual status, quantitative feedback, structured diagnostics, auth fallbacks, interactive prompts, config surface, proactive suggestions, and autocomplete."
todos: []
isProject: false
---

# Neotoma CLI improvements (inspired by Codex, Cursor Agent, npm, Claude, Claude Code)

## Current state

- **Entry:** Pack-rat intro box (version, entity/relationship/source counts, server lines) with wink animation; `--no-session` shows a panel with nest art, API status, storage summary, and "Tips for getting started" then command menu.
- **Command menu:** Hint "Type / for commands, ? for shortcuts", prompt `> ` (no placeholder). Live `/` filtering for command list.
- **Output:** [format.ts](src/cli/format.ts) provides bold, dim, success, warn, accent, panel, blackBox; no dedicated error color. Messages go through `writeMessage` / `writeOutput` with `--json` / `--pretty`.
- **Auth:** `auth login` opens browser, prints "Opening browser..." and "Waiting for you..."; no manual URL fallback, no device code, no Esc to cancel.
- **Doctor:** `npm run doctor` runs [scripts/doctor.ts](scripts/doctor.ts) (env, Supabase, security, DB placeholder); there is no `neotoma doctor` subcommand.
- **Repo not found:** In pretty mode, asks "Path to Neotoma repo (optional...)"; no explicit "run neotoma init" first step or bordered trust-style prompt.

---

## 1. Onboarding and context (Codex / Cursor Agent)

**Inspiration:** Welcome + purpose, signed-in state, current directory, optional trust prompt; version + repo path + branch in header.

**Changes:**

- **Explicit welcome line (first-run or --no-session):** Add a single line after the intro panel or pack-rat box, e.g. "Welcome to Neotoma. Truth layer for AI memory." (or reuse existing tagline) so purpose is stated in prose, not only in art.
- **Context block:** In the same flows, show in one line: auth mode (e.g. "Signed in as dev" or "Auth: key-derived"), and "Cwd: &lt;path&gt;" (already present in --no-session; ensure it appears in session intro when useful).
- **Optional directory trust (low priority):** If we ever run agent-like or file-modifying commands from the CLI, consider a one-time "Do you trust the contents of this directory?" with numbered options (1. Yes, continue / 2. No, quit) and "Press Enter to continue". Defer until such commands exist; document as future option.

**Files:** [src/cli/index.ts](src/cli/index.ts) (intro block, no-session panel), [src/cli/format.ts](src/cli/format.ts) (no change unless we add a small helper).

---

## 2. Interactive prompts and discoverability (Cursor Agent / Codex)

**Inspiration:** Placeholder in input ("Plan, search, build anything"), shortcuts (/ commands, @ files, ! shell), "? for shortcuts", config line with "to change" hint.

**Changes:**

- **Placeholder for command menu:** When using `askWithLiveSlash` for the `> ` prompt, show a dim placeholder when the line is empty, e.g. "e.g. storage info, entities list" or "Run a command or ? for help". Clear placeholder as soon as the user types. Implementation: in the raw-mode input handler, when buffer is empty, draw placeholder in dim after the prompt; on first keypress, clear it and show the typed character.
- **Shortcut hint:** Keep "Type / for commands, ? for shortcuts"; optionally add one line under the prompt: "Tip: Use " + pathStyle("neotoma &lt;command&gt;") + " or " + pathStyle("?") + " for help." (or similar) so the next action is obvious.
- **Config hint in intro (optional):** If we show "Env: dev" or "API: up" in the intro, append a dim hint like " " + dim("(use " + pathStyle("neotoma env prod") + " to switch)") so users know how to change it.

**Files:** [src/cli/index.ts](src/cli/index.ts) (`askWithLiveSlash`, `runCommandMenuLoop`).

---

## 3. Quantitative and completion feedback (npm / Cursor installer)

**Inspiration:** "added 2 packages in 2s"; step checkmarks; clear completion message and next step.

**Changes:**

- **Quantitative success messages:** For commands that perform a countable action, add a one-line summary where applicable, e.g.:
  - `neotoma store --json '...'`: "Stored N record(s)." or "Stored N record(s) in 0.3s" if we measure.
  - `neotoma upload &lt;file&gt;`: "Uploaded 1 file. Created N observation(s)." (or whatever the API returns).
  - `neotoma init`: already has "created" / "done"; optionally add "Initialized in &lt;n&gt;s".
- **Multi-step flows:** For init or other multi-step flows, consider showing step checkmarks (e.g. "✓ Directories created", "✓ Database ready") in pretty mode, then a final "Initialization complete." and "Next: " + pathStyle("neotoma storage info") (or similar). Keep existing behavior when `--json` is set.

**Files:** [src/cli/index.ts](src/cli/index.ts) (store action, upload action, init action). Ensure all such messages go through `writeMessage`/existing pretty path so `--json` still gets machine-readable output only.

---

## 4. Auth flow robustness (Codex)

**Inspiration:** Fallback "if the link doesn't open, open this URL"; device code for headless; "Press Esc to cancel".

**Changes:**

- **Manual URL fallback:** In `runLoginFlow` ([src/cli/index.ts](src/cli/index.ts) ~849), when not in JSON mode, after "Opening browser for authorization...", print: "If the link didn't open, open this URL: " + pathStyle(authUrl) (or a shortened form if URL is very long). This avoids leaving the user stuck on headless or misconfigured browsers.
- **Esc to cancel:** In the same flow, the CLI currently waits on `waitForCode`. If we use a readline or key listener in TTY mode, we could listen for Esc and exit with a "Login cancelled." message. This may require refactoring the callback server wait (e.g. race with a keypress listener). Mark as optional if it would require large refactors.
- **Device code:** Document as a future enhancement (separate backend support for device-code flow); not in scope for this plan unless the API already supports it.

**Files:** [src/cli/index.ts](src/cli/index.ts) (`runLoginFlow`, OAuth callback handling).

---

## 5. Doctor command and diagnostics (Claude /doctor)

**Inspiration:** Intuitive name, structured sections with headings, L-prefix or bullet hierarchy, actionable errors with doc links, version info, "Press Enter to continue" for long output.

**Changes:**

- **Add `neotoma doctor` subcommand:** Implement a CLI command that runs the same checks as [scripts/doctor.ts](scripts/doctor.ts) (or calls into a shared module). Prefer reusing the existing script logic so we don't duplicate (e.g. require/import the doctor script or move its logic to a small `src/cli/doctor.ts` or `src/doctor.ts` used by both).
- **Structured output in pretty mode:** In pretty mode, output:
  - Bold section headings (e.g. "Diagnostics", "Environment", "Storage", "MCP").
  - Under each section, consistent prefix (e.g. "  " or "  L ") and status (success/warn/fail) with message. Use existing [format.ts](src/cli/format.ts) (success, warn, and a new error style for fail).
- **Actionable errors:** For each failed or warning check, append a doc link or command where applicable (e.g. "Run " + pathStyle("neotoma mcp check") + " to fix" or link to [docs/developer/getting_started.md](docs/developer/getting_started.md)).
- **Version and context:** At the top, print "Neotoma " + dim("v" + version) and "Cwd: " + pathStyle(cwd). Optionally "Stable: vX.Y.Z" if we have a way to fetch latest; otherwise skip.
- **Pagination:** If output is long, optionally "Press Enter to continue..." at the end when stdout is TTY (like Claude). Lower priority.
- **JSON mode:** With `--json`, output a single JSON object with sections and list of { name, status, message, fix_hint? }.

**Files:** New or shared: [src/cli/doctor.ts](src/cli/doctor.ts) or shared [src/doctor.ts](src/doctor.ts), [scripts/doctor.ts](scripts/doctor.ts) (refactor to call shared logic). [src/cli/index.ts](src/cli/index.ts) (register `program.command("doctor")`). [src/cli/format.ts](src/cli/format.ts) (add `error()` for red/fail if missing).

---

## 6. Error styling and actionable errors (Claude /doctor)

**Inspiration:** Red for errors; pinpoint schema/config errors; link to docs.

**Changes:**

- **Dedicated error style:** In [src/cli/format.ts](src/cli/format.ts), add `error(text: string)` (red ANSI when color enabled) and use it for CLI error messages and for "fail" in doctor output.
- **Actionable CLI errors:** Where we currently write a generic message (e.g. "Server not reachable"), append a short fix hint when known, e.g. "Check " + pathStyle("neotoma servers") + " or start with " + pathStyle("neotoma") + " (no args)." Reuse existing `humanReadableApiError` and extend with optional `suggestion` or second line.
- **MCP/config errors:** If we validate MCP config (e.g. in `mcp check`), and schema validation fails, report which key/value failed (e.g. "mcpServers.neotoma-prod: expected 'port' to be a number") and link to [docs/developer/mcp_overview.md](docs/developer/mcp_overview.md) or mcp_oauth_troubleshooting.

**Files:** [src/cli/format.ts](src/cli/format.ts), [src/cli/index.ts](src/cli/index.ts) (error paths, MCP validation if any).

---

## 7. Init and repo-not-found flow (Codex / Cursor trust prompt)

**Inspiration:** Clear numbered options, default "Press Enter to continue", bordered prompt for important decisions.

**Changes:**

- **Repo not found:** When no repo is found and we're in pretty mode, show a short bordered panel (using existing `panel()` or `blackBox()`):
  - Title: "Neotoma repo not found"
  - Body: "Run " + pathStyle("neotoma init") + " in the project root, or provide the path to an existing Neotoma repo."
  - Options: "1. Run " + pathStyle("neotoma init") + " now (recommended)" / "2. Enter path to repo" / "3. Skip (use from repo directory later)"
  - "Press Enter for 1, or type 2/3."
- Implement by either (a) simple prompt "Choice (1/2/3): " and branch, or (b) optional arrow-key selector (larger change). Prefer (a) for minimal scope.
- **Init completion:** After successful init, print "Initialization complete." and "Next: " + pathStyle("neotoma storage info") + " or " + pathStyle("neotoma --no-session") + " to try the command menu."

**Files:** [src/cli/index.ts](src/cli/index.ts) (repo detection and init prompt, init success message).

---

## 8. Documentation and style rules

**Inspiration:** UI style guide (no em dashes, sentence case, direct tone); doc links in CLI.

- **CLI copy:** All new user-facing strings must follow [docs/conventions/ui_style_guide_enforcement_rules.mdc](.cursor/rules/conventions_ui_style_guide_enforcement_rules.mdc): sentence case, no motivational fluff, no em dashes, direct and actionable.
- **Docs:** Update [docs/developer/cli_overview.md](docs/developer/cli_overview.md) and [docs/developer/cli_reference.md](docs/developer/cli_reference.md) for new behaviors (doctor, auth fallback, init next-step, placeholder/hints). Add a short "CLI UX" or "Output and prompts" subsection if helpful.

---

## 9. Claude Code–inspired additions (config, suggestions, status, autocomplete)

**Inspiration:** Config panel with search and keyboard hints; `/` command list with optional-arg examples in descriptions; proactive suggestion line (e.g. "►► accept edits on (shift+tab to cycle)"); status indicator (e.g. "Context left: 3%"); autocomplete with hierarchical names and argument hints.

**Changes:**

- **Config / settings surface:** Add a `neotoma config` (or `neotoma settings`) command that shows current CLI config (base_url, preferred_env, output style, etc.) in a clear key/value list. Optionally support `neotoma config get/set <key>` or an interactive TUI; if interactive, show hints at bottom: "Type to filter · Enter/↓ to select · Esc to clear" (or "Tab to cycle").
- **Command list with optional-arg hints:** In the existing `/` live-filter command list, keep the two-column layout (command | description) and add optional-arg hints in descriptions where useful (e.g. `store --json '<...>'`, `upload <path>`). Ensure `?` / `help` use the same concise, action-oriented descriptions.
- **Proactive suggestion line:** After certain commands, print a single suggestion line with a distinct prefix (e.g. "► " or "Next: "): e.g. after `neotoma init`: "► Run " + pathStyle("neotoma storage info") + " to verify." After a failed API call: "► Run " + pathStyle("neotoma servers") + " or start with " + pathStyle("neotoma") + " (no args)." Optional later: keyboard-driven "cycle through suggestions" if we add multiple follow-ups.
- **Status / resource indicator (optional):** For interactive session, optional one-line status (e.g. right of prompt or one line above): "API: up" / "API: down" or "Env: dev", or "Storage: N sources, M entities" when relevant. Minimal and non-intrusive; only in TTY when not `--json`.
- **Autocomplete with hierarchy and argument hints:** For the `> ` prompt, add Tab-completion for command names (and optionally subcommands) from the same list used for `/` filtering; show the short description for the selected completion. If we introduce namespaced commands, use a consistent style (e.g. `entity:list`, `source:upload`) and show "(subcommand of entity)" or "(arguments: type, limit)" in the description. Optional tags in descriptions, e.g. "(requires API)" or "(local only)."

**Files:** [src/cli/index.ts](src/cli/index.ts) (config command, suggestion lines, status line, tab-complete in `askWithLiveSlash` or command menu). Command descriptions: wherever `getSessionCommandsBlock` / session command list is built; ensure each command has a one-line description and optional usage hint.

---

## Implementation order (suggested)

1. **Format and errors:** Add `error()` in format.ts; use it and actionable hints in 1–2 key error paths.
2. **Quantitative feedback:** Add one-line success summaries for store and upload (and init if easy).
3. **Auth fallback:** Print manual URL when browser open is attempted.
4. **Welcome and context:** One welcome line and cwd/auth in intro/panel.
5. **Command menu placeholder and tip:** Placeholder when buffer empty; one tip line.
6. **Doctor:** Shared doctor module + `neotoma doctor` with structured pretty output and JSON.
7. **Repo-not-found panel and init next-step:** Bordered prompt and "Next: ..." after init.
8. **Claude Code additions:** Enrich `/` command list with optional-arg hints in descriptions; add "► Next: ..." suggestion line after init and after failed API; then add `neotoma config` (read-only list, optionally get/set) with keyboard hints if interactive; then Tab-complete for session prompt using same command list and descriptions.
9. **Optional:** Esc to cancel login; "Press Enter to continue" for doctor; config hint in intro; optional status line (API/env or storage summary); cycle-through suggestions.

---

## Out of scope (for later)

- Arrow-key interactive menus (e.g. trust directory, model choice) — requires a small in-CLI menu library or custom readline.
- Device code auth — depends on backend support.
- Upgrade announcements with opt-in (e.g. "New model available") — no current version-check flow.
- Scoped package naming (e.g. @neotoma/cli) — packaging decision.

---

## Summary

| Area | Change |
|------|--------|
| Onboarding | Welcome line; context (auth, cwd); optional trust later |
| Prompts | Placeholder in `> `; tip line; optional config hint |
| Feedback | Quantitative success (store, upload, init); step checkmarks; "Next: ..." |
| Auth | Manual URL fallback; optional Esc to cancel |
| Doctor | `neotoma doctor`; structured sections; actionable errors; JSON |
| Errors | `error()` style; actionable hints; MCP schema detail |
| Repo/init | Bordered repo-not-found panel with 1/2/3; init completion next-step |
| Docs | cli_overview + cli_reference updated; style guide respected |
| Config | `neotoma config` list (and optionally get/set); keyboard hints if interactive |
| Suggestions | "► Next: ..." after init and after failed API |
| Command list | Optional-arg hints in `/` and help descriptions |
| Autocomplete | Tab-complete command names in session prompt; optional hierarchy/tags |

All changes preserve `--json` behavior (no decorative text in JSON output) and respect existing patterns in [src/cli/index.ts](src/cli/index.ts) and [src/cli/format.ts](src/cli/format.ts).
