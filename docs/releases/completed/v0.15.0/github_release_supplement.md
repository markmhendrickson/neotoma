# v0.15.0

## Summary

This release seeds a first-class `pull_request` entity type, extends agent grants to cover GitHub-harness operations, hardens the issue-submission path for keyless and guest agents, and fixes a graph-query bug that silently dropped source records. It also restores the `main` CI baseline (broken inspector submodule pin) and ships the LaunchAgent deployment tooling for running Neotoma daemons under launchd.

## What changed for npm package users

- **New `pull_request` entity type.** The schema registry now seeds a `pull_request` type with declared fields (resolves #158), so agents can store and retrieve pull requests as first-class entities instead of untyped records.
- **`retrieve_graph_neighborhood` now returns source records correctly.** The `node_type: "source"` branch and the entity-branch `include_sources` sub-path queried a singular `source` table that does not exist, so they silently returned no rows for every user. Both now query the canonical `sources` table (resolves #389, #394).
- **Faster full re-mirror.** The canonical mirror no longer performs a dynamic `import()` once per entity inside the per-profile render loop; the renderer is imported once at module load (resolves #371).
- **New `/end` session-close audit skill** that surfaces remaining work and verifies session data intended for Neotoma is actually stored before context is lost (#373).
- **MCP transport preset `e`** added for the MCP server, with Node-version pinning in the LaunchAgent run scripts.

## API surface & contracts

- Additive only. `npm run openapi:bc-diff` against v0.14.0 reports **no breaking changes**.
- `pull_request` is a new declared schema; no existing request or response shapes were narrowed.

## Behavior changes

- Agents that query `retrieve_graph_neighborhood` for a source node, or request `include_sources` on an entity node, now receive the source rows they previously did not.
- `submit_issue` no longer hard-fails for agents without an AAuth keypair: it skips AAuth when no keypair is present and retries as an unsigned guest when AAuth returns `AUTH_REQUIRED` (resolves #944, #937). Issue submission also orders Neotoma-first.
- Agent grants can now authorize `github_harness` operations and repo scopes via an extended `AgentCapabilityOp` (closes #934), enabling attributed GitHub actions through the harness.

## Docs site & CI / tooling

- **CI baseline restored.** `main`'s baseline lane had failed since 2026-05-25 because the `inspector` submodule was pinned to a commit never pushed to the inspector remote. The pin is repointed to the last-good published commit (#1471).
- **Husky v10 readiness.** Removed the deprecated v9 shebang lines from `.husky/pre-commit` that printed a deprecation warning on every commit and would fail under Husky v10 (resolves #400).
- Instruction docs updated for mandatory extraction, GitHub entity types, and an awaiting-reply rule (#174, #175, #176).

## Internal changes

- **LaunchAgent deployment tooling.** Templatized LaunchAgent plists for the prod server, dev server, issues-sync, and watch-build daemons, with an `install.sh`, a README covering install/load/unload/logs/template vars, and `.gitignore` rules so only `.tmpl` sources are tracked.
- `NEOTOMA_LOCAL_PORT_DISK_PROFILE` now overrides the write-side disk profile for the local HTTP port file.
- The prod-server LaunchAgent bypasses `pick-port.js` (resolves ateles#10), and `NEOTOMA_TRUST_PROD_LOOPBACK=1` is set in both LaunchAgent run scripts.
- Machine-specific configs are gitignored; `.cursor/` uses relative symlinks; MCP configs synced.
- `content_field` heading-skip fix in `renderEntityMarkdown` (resolves #262).

## Fixes

- #389 / #394 — `retrieve_graph_neighborhood` queried a nonexistent singular `source` table; now uses `sources`.
- #371 — dynamic import inside the per-entity mirror render loop, hoisted to module load.
- #400 — deprecated Husky v9 shebang removed from `.husky/pre-commit`.
- #262 — `content_field` heading-skip in `renderEntityMarkdown`.
- #944 / #937 — `submit_issue` keyless/guest handling.
- ateles#10 — prod-server LaunchAgent port-pick bypass.

## Tests and validation

- New HTTP-level integration regression (`tests/integration/graph_neighborhood_source_branch.test.ts`) boots the Express app and asserts the source branch returns rows; verified to fail against the singular table and pass after the fix.
- Mirror and markdown suites pass (54 tests) after the import hoist.
- New `pull_request` schema covered by `tests/unit/pull_request_schema.test.ts`.
- Automated test catalog regenerated (400 files).
- `npm run type-check`, lint (0 errors), Prettier, and site-copy lint all clean.

## Security hardening

The diff classifier flagged this release as sensitive because `src/actions.ts` is in the diff (the v0.11.1 auth-bypass surface heuristic). The actual change is two `db.from("source")` → `db.from("sources")` substitutions; adversarial review of all six prompt axes (alternate-path auth, proxy trust, local-dev widening, unauth public route, guest-access policy, AAuth downgrade) found no security regression. See [`docs/releases/in_progress/v0.15.0/security_review.md`](docs/releases/in_progress/v0.15.0/security_review.md) for the full walkthrough and sign-off verdict (`with-caveats`). No advisories opened or referenced by this release.

## Breaking changes

No breaking changes.
