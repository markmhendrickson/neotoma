# Example: `github_release_supplement.md` (copy into `docs/releases/in_progress/<TAG>/`)

Use this shape so releases stay scannable and reader-first.

Write the public release notes for someone deciding whether to upgrade:
- Start with a short plain-English summary.
- Explain why notable changes matter.
- Keep internal implementation detail concise.
- Save deeper rationale, exhaustive inventories, and storytelling for a separate blog post or internal release-prep doc.

---

One-line summary of the release (plain text, no heading). Readers see this right after the Install table when you keep it as the first paragraph. Make this understandable without reading commit history.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- Bullet points: behavior that affects global install or `npx`.
- Prefer "`what changed` + `why it matters`" phrasing over file lists.

**Runtime / data layer**

- Bullets: SQLite adapter, transports, MCP stdio, etc.
- Focus on observable behavior, compatibility, and operator impact.

**Shipped artifacts**

- `openapi.yaml` / `dist/` / anything in the npm `files` list — note if unchanged.

## API surface & contracts

- OpenAPI / action schemas: changed or explicitly unchanged.
- MCP tool surface: notable additions or parity fixes.

## Behavior changes

- What users or operators will actually notice after upgrading.

## Docs site & CI / tooling

- GitHub Pages, Playwright, workflows, localized site, etc.

## Internal changes

- Refactors, architecture, tooling, dependency changes, or test-only work.

## Fixes

- Bug fixes with user or operator impact.

## Tests and validation

- What you ran or what validates confidence in the release.

## Breaking changes

- None — or list with migration notes.
