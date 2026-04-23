---
name: release
description: Prepare a GitHub + npm release with preview. Covers preflight, changelog preview, version bump, tag, merge, GitHub Release creation, and npm publish.
triggers:
  - new release
  - release
  - /release
  - create release
  - prepare a release
  - prepare release
  - prep release
  - /publish
  - publish
---

# Release

Prepare and ship a GitHub + npm release with a mandatory preview step. A confirmed **execute** run is **not complete** until **`npm publish`** succeeds from the published package root, unless the user explicitly scoped the request to GitHub-only / no registry.

## When to Use

When you want to ship what is on `dev` (or the current integration branch) to `main`, tag it, publish to npm, and create a GitHub Release with curated notes.

Trigger with `/release`, or naturally ("prepare a release", "let's ship v0.5.0").

## Reference Documents

| Document | Role |
|----------|------|
| `docs/developer/github_release_process.md` | GitHub Release template layout, `release-notes:render` usage, `gh release create` |
| `docs/developer/github_release_supplement.example.md` | Section pattern for the human-readable supplement |
| `.github/release_notes_wrap.md` | Fixed wrap template (install commands, npm/compare table, commit list) |

## Workflow

### Step 1: Preflight

Run before anything else:

1. **Fetch**: `git fetch origin` (and other configured remotes).
2. **Determine branches**: Default integration = `dev`, target = `main`. Override if the user specifies.
3. **Commits not on main**: `git log origin/main..origin/dev --oneline` (or `origin/main..HEAD` on integration branch). This is the default scope of "what ships."
4. **Uncommitted changes**: `git status --short`. If dirty, describe the actual pending work grouped by area/impact using `git diff --stat` and targeted file inspection. Do not use a generic placeholder.
5. **Submodules**: `git submodule status` — surface any that are ahead/behind recorded SHAs.
6. **Previous tag**: `git tag --sort=-v:refname | head -1` — this is the compare base unless the user specifies `--compare-base`.
7. **Current package.json version**: Read and display.
8. **OpenAPI breaking-change diff**: Run `npm run -s openapi:bc-diff -- --base <previous-tag>` (the script defaults to the latest tag if `--base` is omitted). Capture stdout — it lists every breaking entry classified against `openapi.yaml`. The script exits non-zero when breaking entries exist; that exit code is informational, not fatal, at this stage. Save the prose output for the supplement reconciliation in Step 3.
9. **Breaking-changes section present**: When the draft supplement at `docs/releases/in_progress/<TAG>/github_release_supplement.md` exists, confirm it contains a `## Breaking changes` (or `### Breaking changes`) heading. If missing, abort preflight with a clear message pointing at `docs/developer/github_release_process.md` § Validation tightening is breaking. When the release has no breaking changes, the section still exists and contains the single line `No breaking changes.` — an omitted heading is treated as a preflight failure, not an empty section.
10. **Preflight reconciliation (gate)**: For every entry in the Step 8 breaking list, confirm the draft supplement's Breaking changes section names that entry with a migration note. Abort preflight when any breaking entry is uncovered. Typical output:

    ```
    OpenAPI diff reports 2 breaking entries; supplement covers 1.
    Missing: tightened-additional-properties components.schemas.StoreRequest
    Add an entry under "## Breaking changes" in docs/releases/in_progress/<TAG>/github_release_supplement.md
    or restore compatibility before proceeding.
    ```

    The release-skill executor does not tag or push a release whose supplement omits a breaking entry reported by the diff.

### Step 2: Resolve Version

1. If the user provided a version (e.g. "v0.5.0"), use it.
2. Otherwise, propose next patch from the latest tag: if latest is `v0.4.2`, propose `v0.4.3`. If the user wants a minor or major bump, ask once.
3. Confirm: "Release as **vX.Y.Z**?"

### Step 3: Preview

Draft the supplement following the section pattern from `docs/developer/github_release_supplement.example.md`:

- **Summary**: One plain-English sentence of what this release ships.
- **Highlights**: A short section immediately after the summary with the 3-5 most compelling user-facing changes (never omit; draft via the Highlights rule below).
- **What changed for npm package users**: CLI, runtime/data layer, shipped artifacts.
- **API surface & contracts**: OpenAPI / MCP tool changes.
- **Behavior changes**: What users notice after upgrading.
- **Agent-facing instruction changes**: Include whenever `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, or `AGENTS.md` changed materially — the MCP server ships those instructions to every connected client, so each net-new rule or block is user-facing behavior.
- **Plugin / hooks / SDK changes**: Include when any of `packages/cursor-hooks`, `codex-hooks`, `claude-code-plugin`, `opencode-plugin`, `claude-agent-sdk-adapter`, or the TS/Python clients changed.
- **Security hardening**: Include when CSP, rate limits, auth, loopback/local classification, or capability registries changed.
- **Docs site & CI / tooling**: If applicable.
- **Internal changes**: Refactors, architecture, dependency, test-only work.
- **Fixes**: Bug fixes with user/operator impact.
- **Tests and validation**: What validates confidence.
- **Breaking changes**: **REQUIRED AND EXPLICIT.** Never omit this section. When nothing is breaking, write a single line `No breaking changes.` under the heading. When the release contains validation tightenings (see `docs/developer/github_release_process.md` § Validation tightening is breaking), each entry names the before/after request shape, the error code returned, the structured `hint` text, and the migration step callers must take. The preflight in Step 1 refuses to proceed when this section is absent.

**Highlights drafting rule (mandatory):**

Before writing Highlights bullets, walk the **actual release scope** (code, docs, tests, OpenAPI diff, plans folder) and identify the user-visible benefit of each major subsystem that changed. Do not draft from commit messages or diff-stats alone — shipped commits plus folded-in working-tree scope both count.

For each candidate bullet, rank it by upgrade motivation:

1. **New capability** — something the reader can now do that was impossible or painful before (e.g. repair an over-merged entity, verify a signed writer, diff against an external store).
2. **Visibility / trust / safety** — information or guarantees the reader newly gets (e.g. attribution tier exposed, structured migration guidance on validation errors).
3. **Ops / quality-of-life** — defaults changed to the sane thing (e.g. `api start --env prod` flip).
4. **Breaking-change cleanup** — only headline-worthy if the cleanup unlocks a new capability. Otherwise keep it in **Breaking changes**, not in Highlights.

Keep **3-5 Highlights bullets** (absolute max 7; prefer fewer). Apply this shape to each bullet:

- `- **<Bolded benefit claim in plain English>.** <One concrete mechanic sentence naming the tool, endpoint, field, flag, or file that delivers the benefit.>`

Benefit-claim phrasing rules: lead with what the reader can do or know; avoid implementation verbs like "refactored", "introduced middleware", "added service". Name endpoints/tools/flags once inside the mechanic sentence so readers can map the bullet to the detailed sections.

When in doubt, cut. Supporting-cast items (single bug fixes, tightenings, internal refactors, doc moves) belong in later sections, not in Highlights.

**Comprehensive body coverage rule (mandatory):**

Highlights are tight; the body is **comprehensive**. Take the time needed to explain every significant user-impacting change in the detailed sections below Highlights — omission and under-explanation are equally bad. A change is user-impacting if it affects anyone in the audience set: npm/CLI users, HTTP/OpenAPI callers, MCP tool callers, agent authors (including via the MCP instructions the server ships to clients), server operators, plugin/hook/SDK integrators, the Inspector/frontend, or the feedback/triage pipeline.

Before writing body sections, enumerate the full release scope across these source lanes and confirm each is covered somewhere in the supplement:

- Committed commits since the base tag (`git log <base>..HEAD`).
- Dirty working-tree edits and untracked files (folded into the same sections as committed work).
- `openapi.yaml` diff — new routes, expanded existing routes, new component schemas, validation tightenings.
- MCP tool diff (`src/tool_definitions.ts`) — new/renamed tools, schema changes.
- Agent-facing instruction diffs (`docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, `AGENTS.md`) — these ship to every connected client and count as user-facing behavior.
- CLI diff (`src/cli/index.ts`, `package.json` scripts) — new commands, flags, defaults, removals.
- Runtime middleware / reducers / adapters / schema registry.
- Plugin and hook packages (`packages/cursor-hooks`, `codex-hooks`, `claude-code-plugin`, `opencode-plugin`, `claude-agent-sdk-adapter`, `client`, `client-python`).
- Frontend (`frontend/`) and Inspector (`inspector/`).
- New services (`services/…`), new scripts (`scripts/…`), new cron/launchd templates.
- New subsystem docs (`docs/subsystems/…`), operator docs (`docs/developer/…`, `docs/infrastructure/…`), architecture docs.
- New or changed tests (counts meaningfully — it tells readers what's validated).
- New env vars (grep `.env.example` and `NEOTOMA_*` references).
- Security-relevant changes (CSP, rate limits, auth, loopback detection, capability registries).

Every significant user-impacting item from the above lanes MUST appear in at least one body section with enough detail that the reader can act on it (endpoint path, tool name, CLI flag, env var, schema field, file path). Supporting cast items (single internal refactors, test-only tweaks, doc typo fixes, generated-code churn) can be summarized in aggregate; substantive behavior changes cannot. If a body section grows long, add subheadings rather than cutting — verbosity in body sections is fine when the content is substantive.

For releases that change agent-facing behavior via the shipped MCP instructions, include a dedicated **Agent-facing instruction changes** section calling out each net-new rule or block; that surface ships to every connected agent on server upgrade and is user-facing.

**Integrated supplement (mandatory for `/release`):** The narrative is always a **single release story** across committed history and the working tree. Walk the default compare range (commits not yet on `main`, plus any user override) **and** fold **all** material uncommitted and untracked work into **the same sections above**, written **as if that work were already committed** — same grouping and reader-facing tone as shipped commits. Do not isolate dirty work in a separate appendix (for example, do not use a standalone **Uncommitted changes pending inclusion** block as the primary description). If paths cannot ship under repo security or submodule policy, state that in **Breaking changes** or a one-line **Ship constraints** item inside the same structure.

**Exact GitHub Release preview (mandatory):** After drafting the supplement, render the **exact Markdown body** that `gh release create --notes-file` will use. Preview the rendered wrap + supplement, not just the supplement summary.

- If the tag already exists, render it normally:
  ```bash
  npm run -s release-notes:render -- --tag vX.Y.Z > /tmp/gh-release-vX.Y.Z.md
  ```
- If the tag does **not** exist yet, render a **pre-tag exact preview** against the intended release ref:
  ```bash
  npm run -s release-notes:render -- --tag vX.Y.Z --head-ref <release-ref> --supplement docs/releases/in_progress/vX.Y.Z/github_release_supplement.md > /tmp/gh-release-vX.Y.Z.md
  ```
  Use `<release-ref>` as the ref that will receive the tag (for example `HEAD`, `origin/dev`, or the chosen integration branch after any confirmed pre-release commit).

**Preflight honesty:** If the tree is dirty, append a short **Execute note:** the tag matches this preview only after the described local work is committed on the branch you will release (never stage paths forbidden by security / pre-commit rules). In that case the rendered Markdown is exact for the manual body and wrap, while the commit list becomes exact only after the pending commit set exists and you re-render in Step 4.

Write for a human reader deciding whether to upgrade. Do not dump raw commit lists into the supplement. Walk the commit range and group by theme together with local changes.

**Present the rendered `/tmp/gh-release-vX.Y.Z.md` body to the user verbatim. STOP and ask:**

> "Confirm release **vX.Y.Z** with these notes? (yes / modify / cancel)"

If the working tree was dirty when drafting, state that **execute** matches the preview only after that local work is committed (excluding forbidden paths); confirm whether the user intends that full scope or needs to narrow it before Step 4.

### Step 4: Execute

After user confirms, run **every** step below in order through **`npm publish`**. Stopping after `gh release create` is a failed full `/release` unless the user confirmed a GitHub-only (no npm) scope.

1. **Commit uncommitted changes** (when the preview assumed them and the user confirms execute):
   - Stage only paths that should ship; **never** stage paths forbidden by repository security / pre-commit rules (for example configured `protected_paths`, `.env*`, `data/` when disallowed).
   - Prefer explicit `git add <paths>`; avoid blind `git add -A` when forbidden or local-only paths are present.
   ```bash
   git commit -m "Pre-release: include pending changes for vX.Y.Z"
   ```
   Skip this step if the working tree was clean at confirm time.

2. **Bump version** in `package.json` (and workspaces if monorepo):
   ```bash
   npm version X.Y.Z --no-git-tag-version
   git add package.json package-lock.json
   git commit -m "Bump version to vX.Y.Z"
   ```

3. **Merge dev into main**:
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff dev -m "Merge dev into main for vX.Y.Z"
   ```
   If merge conflicts: STOP and report. User resolves manually.

4. **Tag**:
   ```bash
   git tag -a "vX.Y.Z" -m "Release vX.Y.Z"
   ```

5. **Push**:
   ```bash
   git push origin main
   git push origin "vX.Y.Z"
   ```

6. **Write supplement file**: Save the confirmed changelog to `docs/releases/in_progress/vX.Y.Z/github_release_supplement.md`.

7. **Render release notes**:
   ```bash
   npm run -s release-notes:render -- --tag vX.Y.Z > /tmp/gh-release-vX.Y.Z.md
   ```
   If the last npm publish does not match the previous git tag, use `--compare-base <last_published_tag>`. This must reproduce the same body style shown in Step 3, now with the final tag/commit set.

8. **Create GitHub Release**:
   ```bash
   gh release create "vX.Y.Z" --title "vX.Y.Z" --notes-file /tmp/gh-release-vX.Y.Z.md
   ```

9. **Publish to npm (mandatory for a full release)**:
   From the directory that owns the published `package.json` (repo or workspace root per your monorepo layout), run:
   ```bash
   npm publish
   ```
   Do not treat the release as finished until this succeeds (capture or report the registry URL / version). **Skip only** if the user explicitly confirmed a scope that excludes npm (for example tag-only or internal).

   After `npm publish` returns, confirm the registry actually reflects the new version before moving on:
   ```bash
   npm view neotoma version
   ```
   The output must equal `X.Y.Z`. If it still reports the previous version, the registry has not propagated yet — wait 30s and retry rather than advancing. This protects against the contract-discrepancy class of issue Simon's agent reported against v0.5.0, where the GitHub Release existed but `npm install neotoma@latest` still resolved to the prior version for several minutes.

10. **Merge main back to dev** (keep branches in sync):
    ```bash
    git checkout dev
    git merge main
    git push origin dev
    ```

### Step 5: Post-Release

1. Move supplement: `mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z` (if directory was created).
2. Report summary: version, GitHub Release URL, npm package URL (must reflect a successful **`npm publish`** when the release included npm).

## Submodule Mode

If the user says `/release foundation` (or another submodule name):

1. `cd <submodule>` and run the same workflow scoped to that submodule.
2. If that submodule is the npm package root, run **`npm publish`** there after tag push, same as the main repo execute path.
3. After tagging and pushing (and npm publish when applicable) inside the submodule, return to the main repo.
4. Do NOT proceed with main repository release.

## Constraints

- Always run preflight before version bumps or note drafting.
- Always preview the full changelog and get explicit user confirmation before executing.
- Always show the rendered GitHub Release Markdown body during preview, not just a prose summary of the supplement.
- Always describe uncommitted changes concretely — never use a generic placeholder.
- Do not ship a GitHub Release body that is only an auto-generated commit list.
- Do not merge or tag without user approval of the preview.
- For a standard `/release`, **always** run **`npm publish`** after `gh release create` unless the user explicitly confirmed GitHub-only / no registry.
- If `docs/developer/github_release_process.md` exists, follow its template and render pipeline.

## Agent Instructions

### Load Order

1. This skill
2. `docs/developer/github_release_process.md` (template layout, render commands)
3. `docs/developer/github_release_supplement.example.md` (section pattern)

### Forbidden Patterns

- Skipping the preview step
- Showing only a release summary when the final GitHub Release body can be rendered
- Tagging or pushing without user confirmation
- Omitting material working-tree changes from the integrated preview (they must appear in-section, not dropped)
- Treating confirmed uncommitted changes as shipped without committing them first
- Using only `git log --oneline` as the GitHub Release body
- Ending execute after the GitHub Release without **`npm publish`** when the user confirmed a normal (npm-included) release
- Omitting the **Breaking changes** section from the supplement, even when the release contains no breaking changes (write `No breaking changes.` explicitly)
- Omitting the **Highlights** section, or drafting Highlights from commit messages / diff-stats alone instead of reviewing the actual scope for user benefit
- Highlights bullets that lead with implementation detail ("refactored X", "added middleware", "new service") instead of a bolded user-benefit claim plus a concrete mechanic
- Stuffing more than 5 Highlights bullets or mixing supporting-cast items (single fixes, tightenings, internal refactors) into the Highlights section
