Four onboarding/install fixes reported by an external evaluator running a fresh global npm install of Neotoma against Claude Code, plus a store-response parity fix, a new swarm-facing entity schema, an agent-facing URL cleanup, and a pixel-level render regression gate for the Inspector graph.

## Highlights

- **`neotoma hooks install` / `neotoma setup --tool claude-code` now work from a global npm install (#1904).** The hook installers copy templates from `packages/{claude-code-plugin,codex-hooks,cursor-hooks}`, but those directories were absent from the npm `files` allowlist, so a global install failed with *"Could not locate the Neotoma package root … hook packages were not published with this install."* Per-turn auto-capture is now achievable from a normal `npm install -g neotoma`.
- **`get_authenticated_user` surfaces the active environment (#1905).** On a fresh install the CLI local transport defaults to production while the server/API default to development, so an unflagged CLI query can silently hit an empty prod DB and return nothing/401. The `storage` block now includes `environment`, so an agent can confirm which graph (dev vs prod) it is on before writing instead of discovering the split via silent-empty results.
- **`neotoma setup` no longer rewrites `settings.local.json` on a pure reformat (#1906).** Running setup to diagnose an error could rewrite a user's tracked config even when nothing meaningful changed (a whitespace-only diff), because the change check compared the pretty-printed serialization against the raw on-disk bytes. A semantic no-op guard now leaves the file untouched when only formatting differs.
- **Documented the Bash-tool gap in path-based deny rules (#1907).** Declarative `Read`/`Glob`/`Grep` deny rules do not stop a raw `cat`/`grep`/`find`/`ls` via the agent's Bash tool from reaching the same paths. The Claude Code hooks doc now documents this explicitly and ships a fail-closed `PreToolUse` reference hook (with its known limits) for users hardening a scoped install against sensitive sibling directories.
- **Store dedup-replay response now matches on both transports (#1860).** A deduplicated `/store` call over the offline/HTTP transport previously came back without `entity_snapshot_after` and `deduplicated: true`, even though the MCP transport already returned them. The offline path now mirrors the MCP behavior, closing a gap re-confirmed by an evaluator using Neotoma as an offline audit ledger.
- **New `issue_spec` entity schema for the swarm issue-spec pipeline (#1901).** Gives the Ateles swarm's issue-spec pipeline a formal schema with a deterministic identity key (composite `[repo, issue_number]`, with a `spec_key` fallback), so concurrent agent stores for the same issue resolve to one entity instead of relying on schema-inference + O(n) dedup.
- **Agent-facing links no longer emit the retired `/inspector` prefix (#1555).** Following the SPA's move to serving at `/` with `/inspector/*` 308-redirecting, every agent-facing URL emitter (MCP instructions, server display-rule string, CLI/agent turn-report builders) now emits unprefixed `/conversations/<id>` and `/entities/<id>` links directly, instead of a redirect-through legacy form.
- **Pixel-level render smoke gate for the Inspector graph (#1874).** Adds a PR-gating Playwright test against the built Inspector bundle that asserts the graph actually paints pixels (not just that DOM nodes/edges exist), catching the class of "healthy DOM, blank canvas" regressions that shipped twice in v0.18.5 and v0.18.6.

## What changed for npm package users

**Packaging**

- `packages/claude-code-plugin`, `packages/codex-hooks`, `packages/cursor-hooks` are now in the published tarball, so the hook installers find their templates.

**Tools / API**

- `get_authenticated_user` response `storage` block gains an `environment` field (`"development"` | `"production"`) for the local backend. Additive; existing fields unchanged.
- `/store` (offline/HTTP transport): a deduplicated store call now returns `entity_snapshot_after` and `deduplicated: true`, matching the MCP transport's existing behavior on the same idempotency-replay path. No new observation is written; observation count is unchanged.
- New `issue_spec` entity type registered in the schema registry (additive; no existing type affected).

**CLI**

- `neotoma setup` is now a true no-op on `settings.local.json` when the effective content is unchanged (no whitespace-only reformat).

**Agent-facing surfaces**

- MCP instructions, the server's compact display-rule string, and the CLI/agent `turn_report` URL builders now emit `/conversations/<id>` and `/entities/<id>` instead of `/inspector/conversations/<id>` and `/inspector/entities/<id>`.

**Docs**

- `docs/integrations/hooks/claude_code.md` gains a "Path-based isolation and the Bash-tool gap" section + a reference `PreToolUse` hook.

**Inspector / CI**

- A new required `graph_render_smoke` CI job runs a pixel-level Playwright check against the built Inspector bundle on every PR (`npm run test:e2e:graph-render`).
- `graph-integrity.spec.ts` renamed to `graph-data-integrity.spec.ts` to distinguish data-integrity checks (orphans/cycles/deletion) from render-effect checks.

## API surface & contracts

Additive only:

- `get_authenticated_user` gains `storage.environment`.
- `/store` offline transport response gains `entity_snapshot_after` / `deduplicated: true` on idempotency replay (already present on the MCP transport — this is a parity fix, not a new field).
- New `issue_spec` entity type in the schema registry.

No routes, breaking schema changes, or removed/renamed fields.

## Behavior changes

- `neotoma setup` no longer reformats `settings.local.json` when content is unchanged. (The larger "default to read-only preview / `--apply`" UX redesign for `setup`, and flipping the CLI default env to match the server, are intentionally deferred as separate, riskier behavior changes.)
- A deduplicated `/store` call over the offline/HTTP transport now returns the same response shape as the MCP transport (previously under-populated).
- Agent-facing entity/conversation links no longer route through the `/inspector` redirect.

## Fixes

- **#1904** — hook packages not shipped with the npm install (`neotoma hooks install` / `setup --tool claude-code` fail on a global install).
- **#1905** — dev/prod DB default mismatch is now observable via `get_authenticated_user.storage.environment` (observability half; the CLI-default coherence fix is tracked separately).
- **#1906** — `neotoma setup` rewrote `settings.local.json` on a formatting-only difference.
- **#1907** — documented the Read/Glob/Grep-vs-Bash isolation gap + shipped a reference hook.
- **#1860** — offline/HTTP `/store` dedup-replay response missing `entity_snapshot_after` / `deduplicated: true` (already present on MCP transport).
- **#1555** — agent-facing URL emitters still producing legacy `/inspector/...` links after the SPA prefix retirement.

#1904, #1905, #1906, #1907 reported by an external evaluator (Nick Talwar, Bottega8) during onboarding, with independent repro. #1860 reported by an evaluator using Neotoma as an offline audit ledger. All fixes ship with an effect test (npm-pack contents, HTTP response shape, bytes+mtime unchanged, or transport-parity assertion).

## Tests and validation

- `tests/contract/package_contents.test.ts` — asserts (via `npm pack --dry-run`) the hook installer templates ship in the tarball (#1904).
- `tests/integration/get_authenticated_user_environment.test.ts` — asserts the `storage.environment` field is present over HTTP (#1905).
- `tests/cli/cli_doctor_setup.test.ts` — asserts a differently-formatted-but-equivalent `settings.local.json` is not rewritten (bytes + mtime unchanged) (#1906).
- `tests/integration/store_dedup_snapshot_after.test.ts` + `tests/integration/transport_parity_store_snapshot_auth.test.ts` — offline/MCP transport-parity gate; assert `entity_snapshot_after` and `deduplicated: true` on BOTH transports for a deduplicated store, verified to fail if the offline fix is reverted (#1860, #1840).
- `tests/unit/issue_spec_schema.test.ts` — registration, field types, composite+fallback identity, dedup behavior for the new `issue_spec` schema (#1901).
- `tests/unit/client_turn_report.test.ts` — updated to assert unprefixed `/conversations/<id>` and `/entities/<id>` URLs (#1555).
- `playwright/tests/inspector/inspector-graph-render.spec.ts` — pixel-level render gate; verified RED against the reintroduced v0.18.6 embed height-collapse bug, GREEN on the current fix (#1874).
- `security:classify-diff` (base v0.18.7): see [security_review.md](security_review.md).

## Security hardening

Not security-sensitive in the exploit sense. The classifier flags `src/actions.ts` due to path heuristics (touched by #1905 and #1860), but neither change touches authentication, authorization, or token handling — see [security_review.md](security_review.md) for the per-area breakdown. The #1907 docs change is security-*relevant* in the positive direction (documents an isolation-expectation gap and provides a fail-closed mitigation).

## Breaking changes

None. Additive packaging/tool/schema/doc fixes, one transport-parity correction, one no-op-write correction, and a CI-only render regression gate. Patch bump is correct per SemVer.
