---
title: Release notes
summary: Helpers used by the release pipeline to render human-readable changelog text and to gate semver-compatibility checks between the local CLI / package and a remote Neotoma instance (peer or hosted).
---

# Release notes

Helpers used by the release pipeline to render human-readable changelog text and to gate semver-compatibility checks between the local CLI / package and a remote Neotoma instance (peer or hosted).

## Scope

This document covers:

- `src/release_notes_enrichment.ts` — enriches raw commit / PR data into Markdown release notes for `docs/releases/in_progress/<TAG>/github_release_supplement.md` and the `gh release create` body.
- `src/semver_compat.ts` — `compareCliApiCompat` and helpers that drive `neotoma compat`, `neotoma peers status`, and the package update prompt.
- `src/version_check.ts` — `checkForNeotomaUpdate` used by the CLI startup banner.
- The accompanying tests (`*.test.ts` siblings).

It does NOT cover:

- The release process itself (see [`docs/developer/github_release_process.md`](../developer/github_release_process.md), [`docs/developer/release_orchestrator.md`](../developer/release_orchestrator.md), [`.cursor/skills/release/SKILL.md`](../../.cursor/skills/release/SKILL.md)).
- The "Breaking changes" supplement contract (see [`docs/architecture/change_guardrails_rules.mdc`](../architecture/change_guardrails_rules.mdc)).
- The OpenAPI breaking-change diff gate (`scripts/openapi_bc_diff.js`).

## Purpose

Releases ship via a tightly-scripted process (preflight → version bump → supplement → tag → npm publish → sandbox deploy). Three pieces of logic recur often enough that they live in `src/` rather than `scripts/`:

1. **Enrich raw commit data into release notes** so the release SKILL and the `render_github_release_notes.ts` script share one renderer.
2. **Compare local and remote semver** so peer health, CLI startup banners, and the update gate all agree on what "compatible" means.
3. **Detect newer published versions** so the CLI can nudge users without launching a network request on every command.

Keeping these in `src/` gives them tests and lets the CLI consume them without a separate npm dependency on `scripts/`.

## Components

### `src/release_notes_enrichment.ts`

- `enrichReleaseNotes(rawNotes: string, opts?: { tag?: string; previousTag?: string }): EnrichedReleaseNotes`.
- Parses the conventional-commit-shaped raw input (typically the output of `git log --pretty=...` from `scripts/render_github_release_notes.ts`), groups by `feat`, `fix`, `docs`, `chore`, etc., and adds a "Breaking changes" header when the supplement-style breaking marker is present.
- Returns:
  - `markdown` — final release-notes Markdown ready for the GitHub release body.
  - `sections` — structured `{ kind, title, entries[] }` for downstream consumers.
  - `breakingChanges` — extracted "Breaking changes" entries (or `[]`).
- Tested by `src/release_notes_enrichment.test.ts` against fixtures covering the main commit-prefix taxonomy plus the explicit `BREAKING CHANGE:` footer.

### `src/semver_compat.ts`

- `compareCliApiCompat({ localVersion, remoteVersion }): { result, message, severity }`.
- Result is `match | minor_skew | major_skew | unknown_remote | unknown_local`.
- Severity drives UI: `match` → silent, `minor_skew` → info, `major_skew` → warning.
- Used by:
  - `neotoma compat` to score the local CLI vs the configured API.
  - `neotoma peers status <peer_id>` (via `src/services/sync/peer_health.ts`) to score the local package vs the peer's reported `/health` version.
  - The startup banner when `npm_check_update` flags a newer version.
- Tested by `src/semver_compat.test.ts`.

### `src/version_check.ts`

- `checkForNeotomaUpdate({ currentVersion, registryFetcher? }): Promise<UpdateInfo | null>`.
- Hits the npm registry (with a 1.5s timeout and a single retry) and returns the latest published version if it is greater than the current one.
- Wraps the result in a structured `UpdateInfo` with the upgrade command and supplement-anchor URL.
- Tested by `src/version_check.test.ts` against a stubbed registry fetcher.

## Determinism and side effects

- All three helpers are deterministic given their inputs (the version-check helper accepts an injected fetcher for tests).
- None mutate Neotoma state. They are read-only utilities consumed by the CLI and release scripts.
- Release notes Markdown is byte-stable across runs given identical commit input, which keeps the generated supplement diff-friendly.

## Operations

- Release SKILL: see [`.cursor/skills/release/SKILL.md`](../../.cursor/skills/release/SKILL.md).
- Render the upcoming release body locally: `npx tsx scripts/render_github_release_notes.ts --tag vX.Y.Z`.
- Score CLI vs API: `neotoma compat`.
- Score CLI vs a peer: `neotoma peers status <peer_id>` (uses the same comparator under the hood).

## Related

- [`docs/developer/github_release_process.md`](../developer/github_release_process.md) — the canonical release process.
- [`docs/developer/release_orchestrator.md`](../developer/release_orchestrator.md) — the script that drives the process end-to-end.
- [`docs/architecture/change_guardrails_rules.mdc`](../architecture/change_guardrails_rules.mdc) — the supplement / breaking-change contract.
- [`docs/subsystems/peer_sync.md`](peer_sync.md) — consumer of the semver comparator for peer health.
