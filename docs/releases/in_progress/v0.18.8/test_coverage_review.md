# Test coverage review — v0.18.8

Each fix in this batch ships with an **effect test** — asserting the observable outcome the issue describes, not merely that a contract validates.

| Fix | Effect test | Asserts |
|---|---|---|
| #1904 (hook packages in npm) | `tests/contract/package_contents.test.ts` | `npm pack --dry-run` output contains `packages/claude-code-plugin/hooks/session_start.py`, `packages/codex-hooks/scripts/install.mjs`, `packages/cursor-hooks/scripts/install.mjs` — i.e. the installer templates actually ship in the tarball. Would have failed before the `files` change. |
| #1905 (active env) | `tests/integration/get_authenticated_user_environment.test.ts` | POST `/get_authenticated_user` returns `storage.environment` ∈ {development, production} for the local backend, over real HTTP. |
| #1906 (no-op reformat) | `tests/cli/cli_doctor_setup.test.ts` | A compact/reordered-but-semantically-equal `settings.local.json` yields `changed === false`, on-disk **bytes** unchanged, and **mtime** unchanged (not just the `changed` flag — the bug was a silent rewrite). |
| #1907 (Bash-deny docs) | — | Documentation + reference hook; no code path to unit-test. The reference hook is fail-closed by construction (denies on unparseable input). |

## Class-level guard

These are the fresh-install / runtime-file-completeness class (retrospective `ent_e5e2778500c522178d1ea9d0`). The #1904 test runs `npm pack` against the real tarball, so it guards not just this instance but the class: any file the CLI resolves at runtime but that is missing from `files` would fail it. A broader fresh-install test lane is tracked as a follow-up (#1908).

## Not covered (intentional, tracked)

- The #1905 **CLI-default coherence** fix (flip the CLI local-transport default to match the server, or fail loud) is deferred as a separate behavior change; this release ships only the observability half.
- The #1906 fuller `setup` UX redesign (default read-only preview, `--apply`) is deferred.

## Regression risk

Low. All changes are additive (a field, tarball entries), a narrowed write condition, or docs. Existing `patchClaudeCodeProject` idempotency and merge tests continue to pass unmodified, confirming the no-op guard does not regress the already-covered content-change path.
