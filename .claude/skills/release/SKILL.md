---
name: release
description: Release
---

<!-- Source: .cursor/skills/release/SKILL.md -->


# Release

Prepare and ship a GitHub + npm release with a mandatory preview step.

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

After user confirms:

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

9. **Publish to npm**:
   ```bash
   npm publish
   ```

10. **Merge main back to dev** (keep branches in sync):
    ```bash
    git checkout dev
    git merge main
    git push origin dev
    ```

### Step 5: Post-Release

1. Move supplement: `mv docs/releases/in_progress/vX.Y.Z docs/releases/completed/vX.Y.Z` (if directory was created).
2. Report summary: version, GitHub Release URL, npm package URL.

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
