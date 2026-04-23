# Example: `github_release_supplement.md` (copy into `docs/releases/in_progress/<TAG>/`)

Use this shape so releases stay scannable and reader-first.

Write the public release notes for someone deciding whether to upgrade:
- Start with a short plain-English summary.
- Highlights at the top are tight (3-5 bullets, benefit-led); see the Highlights drafting rule in [`github_release_process.md`](github_release_process.md).
- Body sections are **comprehensive** — explain every significant user-impacting change with enough detail to act on (endpoint, tool, flag, env var, schema field, file path). Verbosity is fine when substantive; add subheadings rather than cutting. See the comprehensive body coverage rule in [`github_release_process.md`](github_release_process.md).
- Save deeper rationale, internal storytelling, and exhaustive commit-level inventories for a separate blog post or internal release-prep doc.

---

One-line summary of the release (plain text, no heading). Readers see this right after the Install table when you keep it as the first paragraph. Make this understandable without reading commit history.

## Highlights

3-5 bullets with the most compelling user-facing changes. Draft these by walking the actual release scope, not commit messages — see the Highlights drafting rule in [`github_release_process.md`](github_release_process.md).

Each bullet uses this shape: `- **<Bolded benefit claim in plain English>.** <One concrete mechanic sentence naming the tool, endpoint, field, flag, or file that delivers the benefit.>`

Example shape (illustrative, not real):

- **Know which agent wrote what.** Signed AAuth requests now stamp a trust tier on every write, and `GET /session` / `get_session_identity` let agents confirm they are seen as a real writer before producing data.
- **Repair over-merged entities without destructive edits.** `POST /entities/split` and the `split_entity` MCP tool rebind a subset of observations to a new entity by time range, source, or field match.
- **Sane prod defaults.** `neotoma api start` now targets `--env prod` by default so the CLI matches how most operators actually run it.

Rank candidates by upgrade motivation (new capability > visibility/trust/safety > ops quality-of-life > breaking-change cleanup). Keep Highlights to 3-5 bullets; put single fixes, tightenings, refactors, and doc moves in the later sections.

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

## Agent-facing instruction changes (ship to every client)

Include this section whenever `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, or `AGENTS.md` changed materially — the MCP server ships those instructions to every connected client, so each net-new rule or block is user-facing behavior on server upgrade. List net-new sections, new rules, and changed defaults.

## Plugin / hooks / SDK changes

- Updates to `packages/cursor-hooks`, `codex-hooks`, `claude-code-plugin`, `opencode-plugin`, `claude-agent-sdk-adapter`, the TypeScript client, or the Python client.

## Security hardening

- CSP, rate limits, auth, loopback/local classification, capability registries, and similar defaults changes that change the attack surface or the operator knobs.

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
