Four onboarding/install fixes reported by an external evaluator running a fresh global npm install of Neotoma against Claude Code. All target the "does the published artifact work, coherently, on a clean machine" class — the kind of gap only visible against the packed tarball on a fresh machine, not a repo checkout.

## Highlights

- **`neotoma hooks install` / `neotoma setup --tool claude-code` now work from a global npm install (#1904).** The hook installers copy templates from `packages/{claude-code-plugin,codex-hooks,cursor-hooks}`, but those directories were absent from the npm `files` allowlist, so a global install failed with *"Could not locate the Neotoma package root … hook packages were not published with this install."* Real per-turn auto-capture is now achievable from a normal `npm install -g neotoma`.
- **`get_authenticated_user` surfaces the active environment (#1905).** On a fresh install the CLI local transport defaults to production while the server/API default to development, so an unflagged CLI query can silently hit an empty prod DB and return nothing/401. The `storage` block now includes `environment`, so an agent can confirm which graph (dev vs prod) it is on before writing instead of discovering the split via silent-empty results.
- **`neotoma setup` no longer rewrites `settings.local.json` on a pure reformat (#1906).** Running setup to diagnose an error could rewrite a user's tracked config even when nothing meaningful changed (a whitespace-only diff), because the change check compared the pretty-printed serialization against the raw on-disk bytes. A semantic no-op guard now leaves the file untouched when only formatting differs.
- **Documented the Bash-tool gap in path-based deny rules (#1907).** Declarative `Read`/`Glob`/`Grep` deny rules do not stop a raw `cat`/`grep`/`find`/`ls` via the agent's Bash tool from reaching the same paths. The Claude Code hooks doc now documents this explicitly and ships a fail-closed `PreToolUse` reference hook (with its known limits) for users hardening a scoped install against sensitive sibling directories.

## What changed for npm package users

**Packaging**

- `packages/claude-code-plugin`, `packages/codex-hooks`, `packages/cursor-hooks` are now in the published tarball, so the hook installers find their templates.

**Tools / API**

- `get_authenticated_user` response `storage` block gains an `environment` field (`"development"` | `"production"`) for the local backend. Additive; existing fields unchanged.

**CLI**

- `neotoma setup` is now a true no-op on `settings.local.json` when the effective content is unchanged (no whitespace-only reformat).

**Docs**

- `docs/integrations/hooks/claude_code.md` gains a "Path-based isolation and the Bash-tool gap" section + a reference `PreToolUse` hook.

## API surface & contracts

Additive only: `get_authenticated_user` gains `storage.environment`. No routes, schema, or breaking contract changes.

## Behavior changes

- `neotoma setup` no longer reformats `settings.local.json` when content is unchanged. No other behavior changes. (The larger "default to read-only preview / `--apply`" UX redesign for `setup`, and flipping the CLI default env to match the server, are intentionally deferred as separate, riskier behavior changes.)

## Fixes

- **#1904** — hook packages not shipped with the npm install (`neotoma hooks install` / `setup --tool claude-code` fail on a global install).
- **#1905** — dev/prod DB default mismatch is now observable via `get_authenticated_user.storage.environment` (observability half; the CLI-default coherence fix is tracked separately).
- **#1906** — `neotoma setup` rewrote `settings.local.json` on a formatting-only difference.
- **#1907** — documented the Read/Glob/Grep-vs-Bash isolation gap + shipped a reference hook.

All four reported by an external evaluator (Nick Talwar, Bottega8) during onboarding, with independent repro. Fixes each ship with an effect test (npm-pack contents, HTTP response shape, bytes+mtime unchanged).

## Tests and validation

- `tests/contract/package_contents.test.ts` — asserts (via `npm pack --dry-run`) the hook installer templates ship in the tarball (#1904).
- `tests/integration/get_authenticated_user_environment.test.ts` — asserts the `storage.environment` field is present over HTTP (#1905).
- `tests/cli/cli_doctor_setup.test.ts` — asserts a differently-formatted-but-equivalent `settings.local.json` is not rewritten (bytes + mtime unchanged) (#1906).
- `security:classify-diff` (base v0.18.7): see [security_review.md](security_review.md).

## Security hardening

Not security-sensitive in the exploit sense. The #1907 docs change is security-*relevant* (it documents an isolation-expectation gap and provides a fail-closed mitigation). See [security_review.md](security_review.md).

## Breaking changes

None. Additive packaging/tool/doc fixes plus one no-op-write correction. Patch bump is correct per SemVer.
