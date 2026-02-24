# Environment distinction audit (dev vs prod)

## Purpose

This document records how the codebase distinguishes development from production (local SQLite, CLI, API) and what was audited or changed so dev and prod can run in parallel without overwriting each other.

## Scope

- Local backend: SQLite path, raw storage, event log, logs, API background log/PID.
- Out of scope: MCP token storage (single config file).

## Implemented (env-specific)

| Area | Dev default | Prod default | Override env var |
|------|-------------|--------------|------------------|
| SQLite DB | `data/neotoma.db` | `data/neotoma.prod.db` | `NEOTOMA_SQLITE_PATH` |
| Raw sources | `data/sources` | `data/sources_prod` | `NEOTOMA_RAW_STORAGE_DIR` |
| Event log | `data/events` | `data/events_prod` | `NEOTOMA_EVENT_LOG_DIR` |
| Logs (CLI/backup) | `data/logs` | `data/logs_prod` | `NEOTOMA_LOGS_DIR` |
| API background log dir | `~/.config/neotoma/logs` | `~/.config/neotoma/logs_prod` | (derived from `NEOTOMA_ENV`) |
| API background PID file | `~/.config/neotoma/api.pid` | `~/.config/neotoma/api_prod.pid` | (derived from env) |
| HTTP port | 8080 | 8021 | `NEOTOMA_HTTP_PORT` or `HTTP_PORT` |

Environment is determined by `NEOTOMA_ENV`; `production` means prod defaults.

## CLI base URL and port choice

When resolving the API base URL, the CLI uses: `--base-url` if set; otherwise session ports (`NEOTOMA_SESSION_DEV_PORT` / `NEOTOMA_SESSION_PROD_PORT`) when in a session; otherwise probe of 8180 and 8080. When **no server is detected**, the CLI falls back to port **8180** (prod). When one or two servers are found, port choice follows `--env`, `NEOTOMA_SESSION_ENV`, or `NEOTOMA_ENV` (e.g. prod → 8180, dev → 8080). See `src/cli/config.ts` `resolveBaseUrl()`.

## Optional / not implemented

- **Local storage for non-`sources` buckets** (`src/repositories/sqlite/` (storage adapter)): Path is `data/storage/<bucket>`. Could be made env-specific (e.g. `data/storage_prod/<bucket>`) for consistency if multiple buckets are used.
- **Backup output directory**: Default `./backups`; could default to `./backups_prod` when running in prod.
- **Restore target**: Restore could be env-aware so restores go to the correct env-specific dirs (more involved).

## References

- Config: `src/config.ts` (data dirs, ports).
- CLI paths: `src/cli/index.ts` (storage info, backup, logs tail) and `src/cli/config.ts` (API log/PID paths).
- Wipe script: `scripts/wipe-local-database.js` (uses env-specific subdirs when targeting prod).
- Docs: `docs/developer/getting_started.md`, `docs/operations/runbook.md`, `docs/developer/cli_reference.md`.
