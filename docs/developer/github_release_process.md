# GitHub Releases (neotoma)

Every **version tag** published to GitHub MUST have a matching **[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)** with human-readable notes. Tags alone are not enough for subscribers and npm users scanning changes.

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

Optional custom supplement path:

```bash
npm run -s release-notes:render -- --tag v0.3.11 --supplement path/to/extra.md
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

Agent skills [`.cursor/skills/publish/SKILL.md`](../../.cursor/skills/publish/SKILL.md) and [`.cursor/skills/create-release/SKILL.md`](../../.cursor/skills/create-release/SKILL.md) require this flow for all future releases.
