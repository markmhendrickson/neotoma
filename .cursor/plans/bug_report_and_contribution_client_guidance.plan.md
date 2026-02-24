---
name: ""
overview: ""
todos: []
isProject: false
---

# Bug report and contribution instructions in client guidance

## Recommendation

**Yes.** Add structured steps for (A) reporting bugs and (B) contributing fixes. Prefer (B) when the agent has access to a full Neotoma repo or fork (current workspace or another path with permission); otherwise do (A).

## Scope and placement

- **Files to update (parity required):**
  - [docs/developer/mcp/instructions.md](docs/developer/mcp/instructions.md) — plain-text instruction block sent to MCP clients
  - [docs/developer/cli_agent_instructions.md](docs/developer/cli_agent_instructions.md) — CLI rule content and any new section
- **Sync rule:** [docs/developer/agent_instructions_sync_rules.mdc](docs/developer/agent_instructions_sync_rules.mdc) — add a new row to the "Behavioral Sections That Must Stay in Parity" table for "Bug report / contribute fix".
- **Reference only (no change):** [CONTRIBUTING.md](CONTRIBUTING.md), [docs/templates/issue_template.md](docs/templates/issue_template.md), [docs/developer/development_workflow.md](docs/developer/development_workflow.md).

## Trigger conditions (when to apply automatically)

Encode so the agent **proactively** applies the bug-report or contribute-fix flow based on recent context. Do not wait for the user to say "report this bug" or "fix this."

**Apply when either:**

1. **Errors or failures in recent context**

- A Neotoma-related error was thrown or appears in output (stack trace, error message, failed MCP tool result, non-zero exit from a `neotoma` CLI command).
- A command or tool call that uses Neotoma (store, entities, schemas, API, etc.) failed or returned an error envelope.
- Tests failed in a Neotoma repo (e.g. `npm test` or integration tests) and the failure points to Neotoma code.

1. **User is discussing or reporting a bug**

- User describes something not working, an error they saw, or unexpected behavior with Neotoma.
- User asks why something failed or mentions a possible bug in Neotoma.
- User says they want to report a bug or contribute a fix.

**Instruction wording:** Start the bug-report/contribute section with a line like: "When recent context shows a Neotoma error (thrown error, failed MCP/CLI call, stack trace, test failure) or the user describes or discusses a Neotoma bug, apply the flow below immediately—report (Option A) or contribute fix (Option B) as applicable; do not wait for the user to ask."

## When Option B works vs Option A only

- **Option B (contribute fix)** works when the agent has access to **a directory that is a full clone or fork of the Neotoma repo** — whether that is the current workspace or another path the user allows (e.g. "use `~/repos/neotoma`"). The agent can work outside the current workspace if given permission (read/write by path, run commands in that directory). Require that the directory has `.git`, tests, and dev scripts (full repo), not just installed package code.
- **Option A only** when:
  - The only Neotoma code visible is the **global npm install** path (e.g. `npm root -g` / packaged `neotoma`). That path is not a full repo (no `.git`, often no tests/scripts), so the agent cannot run tests or create a branch/PR from there. Do not attempt to patch there; report the bug (Option A) and tell the user: "To contribute a fix, clone or fork the repo, open that folder (or give me access to it), and we can do the fix and PR from there."
  - The user only wants to report, or the agent cannot push (no fork, no auth).

## Option A: Report bug to GitHub

**Steps to encode:**

1. **Collect:** Repro steps, environment (OS, Neotoma version, CLI vs MCP, global vs local install), exact error message or unexpected behavior.
2. **Create issue:**

- **Preferred:** If `gh` is available and authenticated, run `gh issue create --repo markmhendrickson/neotoma --title "Brief description" --body "…"` (body can follow [docs/templates/issue_template.md](docs/templates/issue_template.md)).
- **Fallback:** Provide the user a link to `https://github.com/markmhendrickson/neotoma/issues/new` and a pre-filled body so they can paste and submit.

## Option B: Patch, verify, fork, PR (preferred when applicable)

**Steps to encode:**

1. **Context:** Only when the agent has access to a **full clone or fork** of Neotoma (current workspace or another path with permission). If Neotoma is only installed globally, use Option A and guide the user to clone/fork first.
2. **Fix:** Implement the fix following existing code conventions; add a regression test per bug_learning (test that would have caught the bug).
3. **Verify:** From the repo directory, run `npm run type-check`, `npm run lint`, `npm test` (and `npm run test:integration` if relevant); fix any failures.
4. **Branch:** Create branch `bugfix/short-description` (or `bugfix/FU-XXX-description` if a Feature Unit applies).
5. **Commit:** Commit with a clear message; reference issue if one was created.
6. **Remote:** If the user has a fork, push to the fork. If the agent cannot push (no fork, no auth), instruct the user to create a fork and push the branch, or fall back to Option A and include the suggested fix in the issue body.
7. **PR:** Run `gh pr create --base dev --title "Brief description" --body "…"` (body per [docs/developer/development_workflow.md](docs/developer/development_workflow.md)); if base is `main` for hotfixes, say so in instructions.

**Caveats:**

- The agent cannot create a GitHub fork for the user. If the user has no fork, guide them using the steps below (fork and install from fork), then retry Option B.
- Prefer not to push to `markmhendrickson/neotoma` from an agent; contributions from external contributors go via fork → PR.

## Fork and install from fork (when user doesn't have one yet)

Include these steps in client guidance so the agent can guide the user (or run when permitted) when Option B is desired but no fork exists:

1. **Create fork**

- **Preferred (if `gh` authenticated):** `gh repo fork markmhendrickson/neotoma` (creates fork under the user's GitHub account and adds it as a remote if run from an existing clone).
- **Otherwise:** Direct user to [https://github.com/markmhendrickson/neotoma/fork](https://github.com/markmhendrickson/neotoma/fork) and have them click "Create fork".

1. **Get a full clone of the fork**

- If user had no clone: `git clone https://github.com/<USER>/neotoma.git` (replace `<USER>` with their GitHub username) or `gh repo clone <USER>/neotoma`.
- If user already had a clone of upstream: add fork as remote and fetch — `git remote add fork https://github.com/<USER>/neotoma.git` (or `origin` if they renamed it), then `git fetch fork`.

1. **Install from fork (so they can run Option B from that directory)**

- **For contributing (fix + tests + PR):** From the clone, run `npm install` (install deps). No need to install the package globally; the agent works in the repo directory and runs `npm test` etc. from there. User (or agent) opens that folder as the workspace or grants access to that path.
- **Optional — use forked CLI globally:** From the clone, `npm install -g .` or `npm link` (local symlink for development). Only if the user wants to run the fixed version as their global `neotoma` before the PR is merged.

Encode in instructions: "If user has no fork but wants Option B, guide them: (1) create fork (gh repo fork or GitHub UI), (2) clone the fork (or add fork remote to existing clone), (3) open the clone (or give agent access to that path) and run npm install there; then proceed with fix, test, push to fork, and open PR."

## Content shape per file

### MCP ([docs/developer/mcp/instructions.md](docs/developer/mcp/instructions.md))

Add a short block (3–4 lines) in the existing instruction style. **Lead with trigger:**

- **Trigger:** When recent context shows a Neotoma error (thrown error, failed MCP/CLI call, stack trace, test failure) or the user describes or discusses a Neotoma bug, apply the flow below immediately; do not wait for the user to ask to report or fix.
- **Bug report:** Collect repro, env, and error. Prefer Option B only when the agent has access to a **full clone or fork** of the repo (current workspace or another path with permission). If Neotoma is installed globally only, or no repo path is available, use Option A: `gh issue create --repo markmhendrickson/neotoma` or give user link + pre-filled body; tell user to clone/fork if they want to contribute a fix.
- **Option B (when repo available):** Implement fix, add regression test, run type-check/lint/tests from repo dir, commit on bugfix/ branch, push to user fork, then `gh pr create --base dev`. If no fork or cannot push: guide user through fork and install from fork (create fork via gh repo fork or GitHub UI, clone fork or add fork remote, open clone and npm install), then retry Option B; or fall back to Option A with suggested fix in issue.

### CLI ([docs/developer/cli_agent_instructions.md](docs/developer/cli_agent_instructions.md))

Add a new section **"Neotoma bug report and contributing a fix"** with:

- **Trigger (apply automatically):** When recent context shows a Neotoma error (thrown error, failed MCP/CLI call, stack trace, test failure) or the user describes or discusses a Neotoma bug, apply the flow below immediately; do not wait for the user to ask to report or fix.
- **Option B when:** Agent has access to a directory that is a full clone or fork of Neotoma (current workspace or another path with permission). If Neotoma is only installed globally, use Option A and guide the user to clone/fork to contribute.
- **Option B steps:** Fix → regression test → from repo dir run type-check, lint, test → branch `bugfix/…` → commit → push to fork → `gh pr create --base dev`. If no fork: guide user through fork and install from fork (see below), then retry Option B or fall back to Option A with suggested fix.
- **Fork and install from fork (when user doesn't have one yet):** (1) Create fork: `gh repo fork markmhendrickson/neotoma` or [https://github.com/markmhendrickson/neotoma/fork](https://github.com/markmhendrickson/neotoma/fork). (2) Clone fork: `git clone https://github.com/<USER>/neotoma.git` or `gh repo clone <USER>/neotoma`; or add remote if they have upstream clone. (3) From clone: `npm install`; open that folder (or give agent access) and proceed with fix/test/push/PR. Optional: `npm install -g .` or `npm link` from clone to use forked CLI globally.
- **Option A:** Collect repro/env/error → `gh issue create --repo markmhendrickson/neotoma` or give user link + body from issue template. Repo URL: `https://github.com/markmhendrickson/neotoma`.

Optional: add one bullet to the "Rule (instruction content)" list that references this section.

## Sync rule update

In [docs/developer/agent_instructions_sync_rules.mdc](docs/developer/agent_instructions_sync_rules.mdc), add to the behavioral parity table:

| Behavior                    | MCP anchor                                 | CLI anchor                                              |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Bug report / contribute fix | New "Neotoma bug:" / "Bug report:" line(s) | New "Neotoma bug report and contributing a fix" section |

## Implementation order

1. Add the new section and MCP block (content as above).
2. Update the sync rule parity table.
3. Run `neotoma cli-instructions check` (or equivalent) so applied CLI rule picks up the new section.
4. Optionally add a short note in [docs/developer/agent_cli_configuration.md](docs/developer/agent_cli_configuration.md) or [docs/developer/mcp_overview.md](docs/developer/mcp_overview.md) that agents are instructed to report bugs and contribute fixes when applicable.

## Summary

| Item             | Action                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger          | Encode so agent applies flow **automatically** when recent context has Neotoma errors (thrown/failed call/stack trace/test failure) or user discusses/reports a bug; do not wait for user to ask. |
| MCP instructions | Lead with trigger line; then 2–3 lines for bug report + Option B (only when full repo available), global-install → Option A; if no fork, guide through fork + clone + npm install                 |
| CLI instructions | Section opens with **Trigger (apply automatically)**; then A/B steps, repo URL, "full clone/fork (any path with permission)", global-install caveat, and **fork and install from fork** steps     |
| Sync rule        | Add parity row for bug report / contribute fix                                                                                                                                                    |
| Global install   | Explicit: Option B does not run from global install path; use Option A and guide user to clone/fork for contributing                                                                              |
| Fork / install   | Include steps: create fork (gh repo fork or GitHub UI), clone fork or add remote, npm install in clone; optional install -g / npm link from clone                                                 |
