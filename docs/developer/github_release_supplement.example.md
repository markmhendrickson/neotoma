# Example: `github_release_supplement.md` (copy into `docs/releases/in_progress/<TAG>/`)

Use this shape so releases stay scannable (same idea as v0.3.10, slightly clearer buckets).

---

One-line summary of the release (plain text, no heading). Readers see this right after the Install table when you keep it as the first paragraph.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- Bullet points: behavior that affects global install or `npx`.

**Runtime / data layer**

- Bullets: SQLite adapter, transports, MCP stdio, etc.

**Shipped artifacts**

- `openapi.yaml` / `dist/` / anything in the npm `files` list — note if unchanged.

## API surface & contracts

- OpenAPI / action schemas: changed or explicitly unchanged.
- MCP tool surface: notable additions or parity fixes.

## Docs site & CI / tooling

- GitHub Pages, Playwright, workflows, localized site, etc.

## Breaking changes

- None — or list with migration notes.
