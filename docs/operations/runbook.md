# Operational Runbook

_(Startup, health checks, shutdown, and common operations)_

## Scope

This runbook covers:

- Startup procedures (local development and production)
- Health checks and verification
- Shutdown and cleanup
- Common operations (migrations, backups)
- Emergency procedures and troubleshooting pointers

It does not cover:

- Feature-level behavior (see subsystem docs)
- Deployment pipeline (see [Deployment](../infrastructure/deployment.md))
- Detailed troubleshooting (see [Troubleshooting](troubleshooting.md))

---

## Startup Procedures

### Local development

1. **Prerequisites:** Node.js v18/v20, npm 9+. Optional: Supabase project if using remote backend.
2. **Environment:** Copy or create `.env` (see [Getting started](../developer/getting_started.md)). For local storage: `NEOTOMA_STORAGE_BACKEND=local`. For Supabase: set `DEV_SUPABASE_PROJECT_ID` and `DEV_SUPABASE_SERVICE_KEY`.
3. **Install and migrate:**
   ```bash
   npm install
   npm run migrate   # when using Supabase
   ```
4. **Start services:**
   - MCP server (stdio): `npm run dev`
   - API only (MCP at /mcp): `npm run dev:server`
   - Full stack (API + UI): `npm run dev:full`
   - WebSocket MCP bridge: `npm run dev:ws`
5. **Verify:** Run `npm run doctor` (see [Health check](health_check.md)).

### Production

1. Build: `npm run build`.
2. Set production env (storage backend, Supabase credentials, HTTPS, OAuth config).
3. Run migrations: `npm run migrate` (Supabase) or ensure local DB path is correct.
4. Start: `node dist/actions.js` (API) or `node dist/index.js` (stdio MCP). Use a process manager (e.g. systemd, PM2) and HTTPS in front.
5. Verify health: `npm run doctor` and smoke-test critical endpoints.

---

## Health Checks

- **Primary:** Run `npm run doctor` for environment, database, RLS, storage, migrations, and security checks. See [Health check](health_check.md).
- **Manual:** Run tests (`npm test`, `npm run test:integration`), type-check (`npm run type-check`), and lint (`npm run lint`). For Supabase, run schema advisors: `npm run check:advisors`.
- **Runtime:** Hit API health/readiness endpoints if configured; confirm MCP server starts (e.g. stdio mode).

---

## Shutdown Procedures

- **Graceful:** Stop the Node process (SIGTERM). Allow in-flight requests to complete; process managers typically send SIGTERM then SIGKILL after a timeout.
- **Cleanup:** No mandatory cleanup for normal shutdown. For local dev, ensure no stray `tsx watch` or dev servers if switching branches (ports may be in use).

---

## Common Operations

- **Migrations:** Apply with `npm run migrate`. Dry-run: `npm run migrate:dry-run`. See [Troubleshooting](troubleshooting.md) for "relation does not exist" and RLS issues.
- **Backups:** For local SQLite, copy `NEOTOMA_SQLITE_PATH` (default `./data/neotoma.db` in dev, `./data/neotoma.prod.db` in prod), `NEOTOMA_RAW_STORAGE_DIR` (default `./data/sources` in dev, `./data/sources_prod` in prod), `NEOTOMA_EVENT_LOG_DIR` (default `./data/events` in dev, `./data/events_prod` in prod), and `NEOTOMA_LOGS_DIR` (default `./data/logs` in dev, `./data/logs_prod` in prod). For Supabase, use Supabase backup and storage export.
- **User and access:** Auth is via Supabase Auth; user management and RLS are in [Auth](docs/subsystems/auth.md).

---

## Emergency Procedures

- **Rollback:** Revert deployment to previous version; re-run migrations only if a migration rollback is defined (see migration docs). Restore DB/storage from backup if data corruption is suspected.
- **Incident response:** Triage using [Troubleshooting](troubleshooting.md). Check logs and `npm run doctor` output. For security issues, see [SECURITY.md](../../SECURITY.md) in the repo root.

---

## Troubleshooting Quick Reference

| Symptom                         | See                                                                    |
| ------------------------------- | ---------------------------------------------------------------------- |
| Missing env / connection errors | [Troubleshooting – Setup](troubleshooting.md#setup-issues)             |
| Database / RLS errors           | [Troubleshooting – Runtime](troubleshooting.md#runtime-issues)         |
| Port in use                     | [Troubleshooting – Port](troubleshooting.md#issue-port-already-in-use) |
| Health check failures           | [Health check](health_check.md)                                        |
