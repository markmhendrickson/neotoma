# GitHub Releases (neotoma)

Every **version tag** published to GitHub MUST have a matching **[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)** with human-readable notes. Tags alone are not enough for subscribers and npm users scanning changes.

**Before notes or `release-notes:render`:** Run preflight — `git fetch`, `git log origin/main..origin/dev`, `git status`, submodules, and choose compare range (prefer tag on `main` after merge; provisional draft from `dev` OK if re-rendered after tag). If the working tree is dirty, the `/release` preview **must** merge local changes into the same supplement sections as committed work (as if already committed); see `.cursor/skills/release/SKILL.md` Step 3. Commit only what should ship before tagging, respecting protected paths.

**Agent workflow:** When the user asks to **prepare a release** (or equivalent), follow the `/release` skill (`.cursor/skills/release/SKILL.md`). Do not use commit lists alone as the narrative. The preview step must show the same rendered Markdown body later passed to `gh release create --notes-file`.

## Template layout

1. **Wrap (fixed structure):** [`.github/release_notes_wrap.md`](../../.github/release_notes_wrap.md) — install commands, npm/compare table, commit list, compare link. Do not duplicate this by hand each time.
2. **Supplement (per release):** `docs/releases/in_progress/<TAG>/github_release_supplement.md` (then under `completed/<TAG>/` after the release moves). Follow the section pattern in [`github_release_supplement.example.md`](github_release_supplement.example.md) (audiences: npm users, API/OpenAPI, site/CI, breaking changes).

## Render release notes

Use **silent** npm output when redirecting to a file (otherwise npm prints script headers into the file):

```bash
npm run -s release-notes:render -- --tag v0.3.11
```

Or call the script directly (no npm banner):

```bash
npx tsx scripts/render_github_release_notes.ts --tag v0.3.11
```

For a **pre-tag preview** of the final GitHub Release body, render against the intended release ref while keeping the future tag in the wrap:

```bash
npx tsx scripts/render_github_release_notes.ts --tag v0.4.3 --head-ref HEAD
```

Use `--supplement` when the draft body lives outside the canonical in-progress path.

Optional custom supplement path:

```bash
npm run -s release-notes:render -- --tag v0.3.11 --supplement path/to/extra.md
```

**Skipped npm version:** If a git tag exists but that version was **never published to npm** (registry still on an older semver), set **`--compare-base`** to the **last published npm tag** so the GitHub compare link and commit list match what registry users actually upgrade from:

```bash
npm run -s release-notes:render -- --tag v0.4.0 --compare-base v0.3.10
```

## Create or update the GitHub Release

After the tag exists on `origin`:

```bash
TAG=v0.3.11
npm run -s release-notes:render -- --tag "$TAG" > /tmp/gh-release-"$TAG".md
gh release create "$TAG" --title "$TAG" --notes-file /tmp/gh-release-"$TAG".md
# or if the release already exists:
gh release edit "$TAG" --notes-file /tmp/gh-release-"$TAG".md
```

Before the tag exists, `/release` should still render the preview body to a temp file with `--head-ref` and show that Markdown verbatim for approval. After the tag/commit set is finalized, re-render without `--head-ref` before `gh release create`.

If the **last npm publish** is older than the previous git tag (example: **`v0.4.0`** after **`v0.3.11`** was never on npm):

```bash
TAG=v0.4.0
npm run -s release-notes:render -- --tag "$TAG" --compare-base v0.3.10 > /tmp/gh-release-"$TAG".md
gh release create "$TAG" --title "$TAG" --notes-file /tmp/gh-release-"$TAG".md
```

The `/release` skill ([`.cursor/skills/release/SKILL.md`](../../.cursor/skills/release/SKILL.md)) requires this flow for all future releases.
