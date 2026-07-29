This release adds an opt-in way for the CLI to materialize instance-stored skills and hash-verified script attachments onto the local harness, fixes Inspector sessions dying after an hour instead of silently refreshing, repairs the client-instance auto-deploy workflow that failed at v0.20.0 due to a cross-org Fly token, and closes a deploy-time gap where a fresh instance's schema registry was never seeded — while fixing a related bug where re-seeding could silently revert an operator's custom schema back to the built-in.

## Highlights

- **`neotoma skills sync` can now pull skills from the connected instance, not just the local package.** New opt-in flags `--include-instance-skills` and `--include-instance-scripts` fetch enabled skill entities (and any script attachments they embed) from the instance and materialize them onto the local harness (`~/.neotoma/instance-skills/<host>/`), symlinked in alongside package skills using the same mechanism `skills_mirror.ts` already used. Package skills always win on name collision.
- **Script attachments are hash-pinned before they're ever written.** A script's SHA-256 is verified against the value recorded on the graph; an unapproved or changed hash is blocked until the operator reviews it (new `neotoma sources content <id>` command) and re-runs with `--approve-scripts`. A content-hash mismatch is refused unconditionally, with no override.
- **Inspector sessions no longer hard-expire after an hour.** Google sign-in returns an access token, a refresh token, and an expiry — the client previously discarded the refresh token and let the 1-hour access token die outright, forcing a "your session is no longer valid" re-login. The client now persists the full bundle, refreshes transparently on a 401 (single-flight, so a burst of concurrent requests can't each burn the one-time-use refresh token), and proactively refreshes within 60 seconds of expiry.
- **The hosted client instance's auto-deploy is fixed.** v0.20.0's client-instance deploy failed with `unauthorized`: the client app lives in a different Fly org than the sandbox, and the workflow was using the sandbox-scoped token. It now uses a client-org-scoped token, falling back to the sandbox token only if unset.
- **A fresh instance's schema registry is now seeded on every deploy path, and re-seeding can no longer clobber a custom schema.** `schemaRegistry.loadActiveSchema` has no code fallback: an instance whose `schema_registry` table was never seeded silently loses store-time reference-field auto-linking (e.g. `organization` → `works_at` never fires). Seeding existed (`npm run schema:init`) but was wired into no deploy path at all — no `fly.toml` `release_command`, no step in the RC redeploy script, and the Docker `CMD` is a bare `node dist/actions.js`. This release adds an idempotent boot-time seeder plus deploy-command seeding on both Fly apps and the RC redeploy script, so every path is covered, including ones not yet written. Separately, and more importantly: the existing seeding logic decided by matching the built-in's `schema_version` *string* and called `activate()` whenever that version was registered-but-inactive — and `activate()` deactivates every other version for the type. On an instance where an operator had registered and activated a custom schema, a routine deploy could silently revert the type back to the built-in. All three seeding paths (the new bootstrap, `seed_schemas_entry.ts`, `initialize-schemas.ts`) now key on "does this entity type have an ACTIVE global schema?" and skip outright if so — never re-registering, re-activating, or merging. `--force` remains as an explicit, documented-hazardous opt-in.

## Security hardening

- **A deploy-time schema-clobbering bug is fixed (issue #1968).** Re-running the schema seeder on an instance with an operator-registered custom schema previously deactivated that custom schema and reactivated the built-in — silently reverting a deliberate customization on every deploy. Verified end-to-end against a real SQLite DB with the pre-fix code (an active `contact` v99.0-operator-custom was deactivated and the built-in v1.1 reactivated); the fix and its regression tests were verified to fail against the old logic. See `docs/releases/in_progress/v0.21.0/security_review.md` for the full adversarial pass, including why this release's diff classifier flips to `sensitive=true` (a path-match on `src/actions.ts`, not an auth-path change) and why that flip does not indicate an auth-surface change.
- **Path traversal in script attachment writes, closed before ship.** `attachment.original_filename` is a graph field an adversarial skill row could set to `../../../../.zshrc`-style values. A new `sanitizeScriptFilename()` rejects (never rewrites) any filename that is empty, absolute, `.`/`..`, contains a path separator anywhere (including after `basename()`), or a null byte — plus an independent containment assertion before every write as a backstop. The approvals manifest derives its key from the sanitized filename, so a rejected filename can never be pinned as approved.
- `security:classify-diff` reports `sensitive=true` for this release's net diff, driven solely by a path-match on `src/actions.ts` (the schema-seeding boot hook was added inside `startHTTPServer()`, in the same file that also contains auth middleware). No auth-path lines changed; no new routes; no `LOCAL_DEV_USER_ID` surface change. The OAuth token-refresh fix is client-side only (`inspector/src/api/client.ts`, `inspector/src/lib/oauth_signin.ts`) and does not touch the server-side auth/proxy-trust code covered by `docs/security/threat_model.md`. See `docs/releases/in_progress/v0.21.0/security_review.md` for the full review.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma skills sync` gained `--include-instance-skills`, `--include-instance-scripts` (implies the former), and `--approve-scripts` (hidden alias: `--approve`, kept working for anything already scripted against it).
- New `neotoma sources content <id>` (or `--source-id <id>`) prints a source's raw bytes to stdout, for reviewing a script attachment's actual content before approving its hash. `--json` emits `{ id, size, is_utf8, content_base64 }`.

**Inspector**

- Google sign-in sessions persist and transparently refresh instead of hard-expiring at the 1-hour access-token boundary.

## API surface & contracts

- No `openapi.yaml` changes. `npm run openapi:bc-diff --base v0.20.0 --head HEAD` reports no schema changes to reconcile.
- No new MCP tools. The instance-skills/instance-scripts materialization is CLI-only by design — it writes to the invoking machine's local filesystem, which has no server-side equivalent (same carve-out precedent as `NEOTOMA_USER_ID`). `docs/developer/mcp/instructions.md` gained one pointer line noting this.
- No new Express routes.

## Behavior changes

- None to existing default behavior for CLI/Inspector users. Both new sync flags are opt-in and off by default; a plain `neotoma skills sync` is unchanged.
- **Operator-visible on self-hosted instances:** an instance whose `schema_registry` was never seeded will now see its built-in schemas (contact, organization, transaction, etc.) auto-populate at next boot or deploy, restoring reference-field auto-linking (e.g. `organization` → `works_at`) that was previously silently missing. An instance that already has an active schema for a type — built-in or custom — sees no change at all.

## Docs site & CI / tooling

- `docs/developer/cli_reference.md`: full flag semantics for the new skills-sync flags and the new `sources content`/`sources get` commands, including a worked three-step consent flow (fetch → review via `sources content` → approve).
- `docs/skills/skill_strategy.md`: documents the instance-skill materialization model, the hash-pin consent model, and the "would every adopter want this?" boundary test for upstreaming into the package vs. keeping it instance-local.
- `.github/workflows/deploy-client-instance.yml`: deploy and verify steps now use `CLIENT_INSTANCE_FLY_TOKEN` (org-scoped to the client instance), falling back to `FLY_API_TOKEN`.
- `docs/developer/schema_initialization.md`: documents the boot-time seeder, the three seeding paths' shared skip-if-active-schema-exists contract, and the `--force` hazard.
- `fly.toml`, `fly.sandbox.toml`: both gain a `[deploy] release_command` that runs `node dist/seed_schemas_entry.js` before the new release takes traffic.
- `scripts/redeploy_rc_from_main.sh`: seeds the registry after build; failure is logged as a warning and does not block the redeploy (the boot-time seeder retries idempotently).

## Internal changes

- `skills_mirror.ts`: exported `mirrorPerSkill` and `listSkillNames` so the instance-skills reconciler reuses the exact symlink mechanism and package-name collision check instead of duplicating it.
- `raw_storage.ts`: extracted `resolveMimeTypeFromExtension` as a standalone, unit-testable function; added MIME mappings for script extensions (`.py`, `.sh`, `.js`, `.ts`, `.rb`, `.sql`) that previously fell through to `application/octet-stream`.
- `--json` mode for `skills sync --include-instance-scripts` now correctly sets a nonzero exit code on a content-hash mismatch or a rejected filename; previously it returned before those checks ran, so a CI pipeline scripting off `$?` would have read a data-integrity failure as a clean sync.
- `src/services/schema_registry_bootstrap.ts` (new): idempotent `seedSchemaRegistryIfEmpty()`, called from `startHTTPServer()` alongside the existing per-service seeders (issue schema, plan schema, skill schema, subscription schema). Wrapped in try/catch so a briefly-unavailable DB warns rather than failing boot; concurrent boots racing to register the same type are absorbed by a duplicate-key fallback.
- `scripts/initialize-schemas.ts` and `src/seed_schemas_entry.ts`: both rewritten to key on `loadGlobalSchema` (does an active global schema exist?) rather than a `schema_version` string match, matching the new bootstrap module's safety contract.

## Fixes

- **Inspector "your session is no longer valid" after ~1 hour.** Root cause: the OAuth token exchange returns `access_token` + `refresh_token` + `expires_in`, but only `access_token` was persisted. Fixed by persisting the full bundle and refreshing transparently (see Highlights). This is a different mechanism than the OAuth key-session cookie fixed in #2007 — that fix did not touch this token, which is why the symptom persisted after that deploy.
- **Client-instance auto-deploy `unauthorized` at v0.20.0.** The client app (`bottega8-neotoma`) lives in a different Fly org than the sandbox; the deploy workflow now uses an org-scoped token. Operator action: `CLIENT_INSTANCE_FLY_TOKEN` is set as a repo secret. The sandbox deploy itself was unaffected and stayed healthy on its prior build throughout.
- **Fresh-instance schema registry never seeded (closes #1968).** No deploy path ran the seeder; a never-seeded instance silently lost reference-field auto-linking with no error surfaced anywhere. Now seeded idempotently at boot and again (belt-and-braces) via `release_command` on both Fly apps and the RC redeploy script.
- **Schema re-seeding could clobber an operator's custom schema (part of #1968, found during the fix above).** The pre-fix logic activated the built-in schema whenever it was registered-but-inactive under the same version string, and `activate()` deactivates every other version — silently reverting a deliberately-activated custom schema on the next deploy. Fixed by keying all three seeding paths on "is there an active global schema already?" instead.

## Tests and validation

- Instance-skills/instance-scripts: 68 new unit tests across `instance_skills.test.ts`, `instance_scripts.test.ts` (including 7 path-traversal fixtures — `../` escape, absolute path, null byte, `.`/`..`, empty filename, backslash traversal, embedded separator — asserting both refusal and that nothing is written outside the sandbox), `instance_skills_client.test.ts`, `skills_sync_instance_cli.test.ts`, `sources_content_cli.test.ts`, and `raw_storage_mime_map.test.ts`.
- OAuth refresh: 5 new tests in `inspector/src/api/token_refresh.test.ts` covering bundle persistence, refresh-and-retry on 401, no-double-retry, dead-refresh-clears-session, and concurrent-401 coalescing. The four retry-path cases were verified to fail with the retry guard disabled and pass with it.
- Schema seeding (#1968): 10 new tests across `tests/services/schema_registry_bootstrap.test.ts` (fresh-instance gap, idempotency on second run, custom-schema preservation at both the same and a different version string), `tests/integration/seed_then_works_at_e2e.test.ts` (negative control: unseeded → no `works_at` edge fires; positive: seed then store a real contact → `works_at` fires to a real company entity), and `tests/services/deploy_seed_wiring.test.ts` (regression guard asserting `fly.toml`, `fly.sandbox.toml`, and `redeploy_rc_from_main.sh` each invoke the seed entrypoint uncommented). The bootstrap test suite was verified to fail against the pre-fix logic before the fix was applied.
- `tsc`, `eslint` (0 errors, 333 warnings — pre-existing baseline, none newly introduced), and `format:check` clean; `validate:test-catalog` green (catalog regenerated via `npm run generate:test-catalog`, not hand-edited).

## Breaking changes

None. `npm run openapi:bc-diff --base v0.20.0 --head HEAD` reports zero API changes. Both new CLI flags are opt-in and off by default; existing `neotoma skills sync` invocations are unaffected. The OAuth and client-deploy fixes are internal/operational and do not change any public contract. Schema seeding is additive-only by design (see Security hardening): an instance with an existing active schema for a type, custom or built-in, sees zero behavior change.
