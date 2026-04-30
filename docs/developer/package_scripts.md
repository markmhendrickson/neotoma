# npm script-prefix convention

The `scripts` block in [`package.json`](../../package.json) uses three prefixes with orthogonal meanings. Keep every script name inside its category; introduce a new prefix only with explicit buy-in.

| Prefix    | Runs against                 | Watchers / reload | Supervised (systemd, PM2, etc.) | Typical callers                         |
| --------- | ---------------------------- | ----------------- | ------------------------------- | --------------------------------------- |
| `watch:*` | Source (`src/`) via `tsx`    | yes               | not intended                    | developer inner-loop                    |
| `serve:*` / `start:*` | Compiled `dist/` via `node` | no       | yes                             | production operators, CI smoke, supervised runners |
| `dev:*`   | Dev-only tooling (no server) | varies            | no                              | one-shot dev scripts, REPLs, generators |

The `start:*` naming coexists with `serve:*` for historical reasons (`start:mcp`, `start:api`, `start:api:prod`, `start:ws`). A future consolidation under `serve:*` is tracked in [`.cursor/plans/api_start_v060_flip_followup.plan.md`](../../.cursor/plans/api_start_v060_flip_followup.plan.md); until then, treat `start:*` and `serve:*` as equivalent compiled-dist runners and do not introduce new `start:*` entries unless mirroring the `serve:*` convention is disproportionate churn.

## Why the convention matters

Every script name encodes two contracts the operator and the CLI rely on:

1. **What does this spawn?** A watcher that pins `tsx` + `tsc --watch` under `concurrently`, or a single `node dist/…` child?
2. **Is it safe under a supervisor?** Watchers restart themselves on file changes and run `npx concurrently` as the parent — `systemd`'s `Restart=` semantics do not apply cleanly to the watcher children. Compiled runners are a single long-lived `node` process that a supervisor can manage.

Prefix mismatch breaks that contract. An alias like `dev:prod = npm run watch:prod` (dropped in v0.6.0) crossed the `dev:*` / `watch:*` boundary and was the root cause of the "`neotoma api start --env prod` silently runs a watcher" ambiguity — the name said "dev" but the behavior was a production-env watcher.

## Rules for adding a new script

- **Adding a watcher?** Prefix with `watch:` and list the ports, watched paths, and any `concurrently` wrappers inline.
- **Adding a compiled-dist runner (API, MCP server, WebSocket bridge, static site)?** Prefix with `serve:` or `start:` (matching the neighboring scripts in that family) and make sure it runs `node dist/…` with no watch flags.
- **Adding a dev tool that is not a long-lived server (migration, generator, one-shot REPL)?** Prefix with `dev:` and document what it produces.
- **Adding a stable dev shim?** Use `start:*` for the compiled shim and `watch:*` for the source-mode shim only when the shim itself remains the stable parent process. Do not point installed MCP clients at watch-mode stdio workers.
- **Need a convenience alias?** Keep the alias in the same category. `watch:foo → dev:foo` aliases that cross the category boundary are forbidden; they reintroduce the exact ambiguity `dev:prod` caused.
- **Renaming an existing script?** Keep the old name as an alias for one minor release, then drop it. Announce both the rename and the alias drop in the release supplement. See `docs/architecture/change_guardrails_rules.mdc` § file/script rename rules.

## Cross-references

- [`docs/architecture/change_guardrails_rules.mdc`](../architecture/change_guardrails_rules.mdc) — repository-wide guardrails; the script-rename row in the Touchpoint Matrix points here.
- [`docs/developer/cli_reference.md`](cli_reference.md) — npm-scripts summary table and `neotoma api start` routing behavior that depends on this convention.
- [`.cursor/plans/api_start_prod_routing_8e3d1a0f.plan.md`](../../.cursor/plans/api_start_prod_routing_8e3d1a0f.plan.md) — the phased plan that motivated formalizing the convention.
