# Health Check

_(Running and interpreting `npm run doctor`)_

## Scope

This document covers:

- How to run the Neotoma health check
- What each check category does
- How to interpret results and fix common issues

It does not cover:

- General troubleshooting (see [Troubleshooting](troubleshooting.md))
- Deployment or runbook procedures (see [Runbook](runbook.md) in this directory)

---

## Running Health Checks

From the repository root:

```bash
npm run doctor
```

The command runs diagnostics for environment, database (when using Supabase), storage, migrations, security, and MCP startup. Output is printed to stdout with pass (✅), fail (❌), or warning (⚠️) per check.

---

## Check Categories

| Category        | What is checked                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Environment** | Required variables present (e.g. storage backend, Supabase credentials when using remote backend). |
| **Database**    | Connection and ping when backend is Supabase.                                                      |
| **Tables**      | Required tables exist (sources, interpretations, observations, entities, entity_snapshots, etc.).  |
| **RLS**         | Row-level security enabled on all user-facing tables.                                              |
| **Storage**     | Local paths or Supabase buckets exist and are configured (e.g. private buckets).                   |
| **OAuth**       | OAuth configuration present (optional; warning if missing for production).                         |
| **Migrations**  | Latest migration applied (version comparison).                                                     |
| **MCP**         | MCP server can start (e.g. stdio mode).                                                            |
| **Security**    | `.env` is gitignored; no service key in logs; `.env` present when required.                        |

Implementation may vary by storage backend (local vs Supabase). See script output and code in `scripts/doctor.ts` for the exact checks in your version.

---

## Interpreting Results

- **Overall: HEALTHY** – All critical checks passed. Warnings (e.g. OAuth not configured) are acceptable for local dev.
- **Overall: UNHEALTHY** – One or more critical checks failed. Fix failing items before relying on the system for data or production use.
- **Warning (⚠️)** – Recommended but not required (e.g. OAuth for production, optional env vars).

---

## Fixing Common Issues

| Failure     | Typical fix                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment | Create or fix `.env`; set `NEOTOMA_STORAGE_BACKEND` and, for Supabase, `DEV_SUPABASE_PROJECT_ID` and `DEV_SUPABASE_SERVICE_KEY`. See [Getting started](../developer/getting_started.md). |
| Database    | Verify Supabase project is active, credentials correct, network allows HTTPS. See [Troubleshooting – Database](troubleshooting.md#issue-database-connection-timeout).                    |
| Tables      | Run migrations: `npm run migrate`. For Supabase, ensure schema and migrations have been applied.                                                                                         |
| RLS         | Ensure RLS is enabled and policies exist (schema/migrations). Run `npm run check:advisors` for Supabase.                                                                                 |
| Storage     | For Supabase, create required buckets (e.g. `files`, `sources`) and set them private. For local, ensure `NEOTOMA_DATA_DIR` / `NEOTOMA_RAW_STORAGE_DIR` exist and are writable.           |
| Security    | Ensure `.env` is not committed; remove any committed secrets. Do not log service keys.                                                                                                   |

---

## Automated Monitoring

A dedicated health-check HTTP endpoint for production (e.g. for load balancers or uptime checks) may be added in a future release. Until then, use `npm run doctor` from a cron job or deployment script, or call existing API endpoints that reflect backend connectivity.
