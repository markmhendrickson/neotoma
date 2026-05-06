---
name: release
description: Release
---

<!-- Source: .cursor/skills/release/SKILL.md -->


# Release

Prepare and ship a GitHub + npm + sandbox release with a mandatory preview step. A confirmed **execute** run is **not complete** until **`npm publish`** succeeds from the published package root and `sandbox.neotoma.io` is deployed and verified, unless the user explicitly scoped the request to GitHub-only / no registry / no sandbox.

## When to Use

When you want to ship what is on `dev` (or the current integration branch) to `main`, tag it, publish to npm, create a GitHub Release with curated notes, and update the public sandbox deployment.

Trigger with `/release`, or naturally ("prepare a release", "let's ship v0.5.0").

## Reference Documents

| Document | Role |
|----------|------|
| `docs/developer/github_release_process.md` | GitHub Release template layout, `release-notes:render` usage, `gh release create` |
| `docs/developer/github_release_supplement.example.md` | Section pattern for the human-readable supplement |
| `docs/infrastructure/deployment.md` | Sandbox Fly deployment command and verification |
| `docs/subsystems/sandbox_deployment.md` | Sandbox runtime behavior and operator runbook |
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
8. **Sandbox deploy readiness**: Confirm `fly.sandbox.toml` exists, `flyctl` is available, and the active Fly account can deploy `neotoma-sandbox`. If Fly auth is missing, report that execute will block at sandbox deployment unless the user explicitly scopes the release to no sandbox.

### Step 2: Resolve Version

1. If the user provided a version (e.g. "v0.5.0"), use it.
2. Otherwise, propose next patch from the latest tag: if latest is `v0.4.2`, propose `v0.4.3`. If the user wants a minor or major bump, ask once.
3. Confirm: "Release as **vX.Y.Z**?"

### Step 3: Preview

Draft the supplement following the section pattern from `docs/developer/github_release_supplement.example.md`:

- **Summary**: One plain-English sentence of what this release ships.
- **What changed for npm package users**: CLI, runtime/data layer, shipped artifacts.
- **API surface & contracts**: OpenAPI / MCP tool changes.
- **Behavior changes**: What users notice after upgrading.
- **Docs site & CI / tooling**: If applicable.
- **Internal changes**: Refactors, architecture, dependency, test-only work.
- **Fixes**: Bug fixes with user/operator impact.
- **Tests and validation**: What validates confidence.
- **Breaking changes**: None, or list with migration notes.

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

After user confirms, run **every** step below in order through **npm publish and sandbox deployment**. Stopping after `gh release create` or `npm publish` is a failed full `/release` unless the user confirmed a GitHub-only / no-registry / no-sandbox scope.

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
   From the directory that owns the published `package.json` (repo or workspace root per your monorepo layout):

   - **Registry auth:** If `npm publish` fails for auth or the session is stale, run `npm login` in an interactive terminal when needed.
   - **Web login URL (agent-assisted):** When `npm login` prints `Login at: https://www.npmjs.com/login?...`, an agent with shell access may parse that URL from the CLI or terminal transcript and run `open '<url>'` on macOS or `xdg-open '<url>'` on Linux so the default browser loads the same page pressing Enter would open. **Only** use URLs that clearly come from official `npm` output for `registry.npmjs.org` / `npmjs.com`; prefer explicit user confirmation before opening browser or running `open`/`xdg-open`. After sign-in completes in the browser, return to the terminal and continue the release (including OTP if 2FA prompts for `npm publish --otp=...`).

   ```bash
   npm publish
   ```
   Do not treat the release as finished until this succeeds (capture or report the registry URL / version). **Skip only** if the user explicitly confirmed a scope that excludes npm (for example tag-only or internal).

   After `npm publish` returns, confirm the registry actually reflects the new version before moving on:
   ```bash
   npm view neotoma version
   ```
   The output must equal `X.Y.Z`. If it still reports the previous version, the registry has not propagated yet — wait 30s and retry rather than advancing.

10. **Deploy sandbox.neotoma.io (mandatory for a full release)**:
    Deploy the Fly app from the final release commit:
    ```bash
    flyctl deploy -c fly.sandbox.toml --remote-only
    ```
    Then verify the live sandbox before advancing:
    ```bash
    curl -fsS -H "Accept: application/json" https://sandbox.neotoma.io/ | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); if (j.version !== "X.Y.Z" || j.mode !== "sandbox") { console.error(j); process.exit(1); } console.log(j.version); })'
    curl -fsSI https://sandbox.neotoma.io/health | grep -i '^x-neotoma-sandbox: 1'
    ```
    Do not treat the release as complete until the root JSON reports `version: X.Y.Z`, `mode: sandbox`, and `/health` returns `X-Neotoma-Sandbox: 1`. If sandbox deployment fails after npm publish, report the partial-release state and keep working the sandbox failure unless the user explicitly pauses.

11. **Merge main back to dev** (keep branches in sync):
    ```bash
    git checkout dev
    git merge main
    git push origin dev
    ```

### Step 5: Post-Release

1. Move supplement: `mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z` (if directory was created).
2. Report summary: version, GitHub Release URL, npm package URL (must reflect a successful **`npm publish`** when the release included npm), and sandbox URL/version verification.

## Submodule Mode

If the user says `/release foundation` (or another submodule name):

1. `cd <submodule>` and run the same workflow scoped to that submodule.
2. After tagging and pushing inside the submodule, return to the main repo.
3. Do NOT proceed with main repository release.

## Constraints

- Always run preflight before version bumps or note drafting.
- Always preview the full changelog and get explicit user confirmation before executing.
- Always show the rendered GitHub Release Markdown body during preview, not just a prose summary of the supplement.
- Always describe uncommitted changes concretely — never use a generic placeholder.
- Do not ship a GitHub Release body that is only an auto-generated commit list.
- Do not merge or tag without user approval of the preview.
- For a standard `/release`, **always** run **`npm publish`** after `gh release create` unless the user explicitly confirmed GitHub-only / no registry.
- For a standard `/release`, **always** deploy `sandbox.neotoma.io` with `flyctl deploy -c fly.sandbox.toml --remote-only` and verify the live sandbox version unless the user explicitly confirmed no sandbox.
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
- Ending execute after **`npm publish`** without deploying and verifying `sandbox.neotoma.io` when the user confirmed a normal sandbox-included release
