# Local Supabase Setup for E2E Tests

## Purpose

Using a local Supabase instance for E2E tests eliminates rate limiting issues, improves test speed, and provides better isolation.

## Does Playwright start its own dev server?

Yes. The Playwright fixture (`playwright/fixtures/servers.ts`) automatically starts:

- **Backend**: `npm run dev:http` (HTTP API + health)
- **Frontend**: `npm run dev:ui` (Vite dev server)

You do **not** need to run `npm run dev:full` or a separate dev server for E2E tests. The fixture starts backend and frontend per worker and tears them down after tests.

## Does Playwright start local Supabase?

By default, no. You can start it yourself (`supabase start`) or enable **auto-start** (see below). Playwright only configures the **spawned** backend and frontend to use local or remote Supabase via environment variables. When `USE_LOCAL_SUPABASE=1` is set (or the E2E script sets it), the fixture passes local Supabase URL and anon key into the frontend and backend env so the app talks to `http://127.0.0.1:54321` instead of a remote project.

**Why did tests use remote Supabase even when "the server" was running?** The server E2E uses is always the one **Playwright starts** (backend + frontend), not a manually started `dev:full`. The Supabase target for those spawned processes comes from the **Playwright process** environment when the fixture runs. If `USE_LOCAL_SUPABASE` was unset and `DEV_SUPABASE_URL` / `VITE_SUPABASE_URL` did not point at 127.0.0.1, `buildBackendEnv` / `buildFrontendEnv` in `playwright/utils/servers.ts` used remote (e.g. `DEV_SUPABASE_PROJECT_ID` → `https://<id>.supabase.co`), so the app hit remote and could get rate limits (e.g. 429). The E2E npm scripts now set `USE_LOCAL_SUPABASE=1` by default so the spawned app uses local Supabase when you have run `supabase start`.

**Auto-start (optional):** If you set `PLAYWRIGHT_START_SUPABASE=1` in addition to `USE_LOCAL_SUPABASE=1`, the Playwright global setup will check whether local Supabase is reachable at `http://127.0.0.1:54321`. If not, it runs `supabase start` from the repo root and waits until the API responds (up to 2 minutes for `supabase start`, then up to 30 seconds for health). Requires Docker and Supabase CLI. First run can be slow. To use:

```bash
PLAYWRIGHT_START_SUPABASE=1 npm run test:e2e
```

(or add `PLAYWRIGHT_START_SUPABASE=1` to your env). Auto-start is opt-in so CI or environments without Docker can skip it.

## Prerequisites

- Docker installed and running
- Supabase CLI installed (`brew install supabase/tap/supabase` or `npm install -g supabase`)

## Setup

### 1. Start Local Supabase (or use auto-start)

Either start it yourself:

```bash
cd /Users/markmhendrickson/repos/neotoma
supabase start
```

Or run E2E with auto-start: `PLAYWRIGHT_START_SUPABASE=1 npm run test:e2e` (see Auto-start above).

Running `supabase start` will:
- Download and start all Supabase services (PostgreSQL, Auth, API, Storage, etc.)
- Apply all migrations from `supabase/migrations/`
- Start services on default ports:
  - API: `http://127.0.0.1:54321`
  - DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  - Studio: `http://127.0.0.1:54323`
  - Auth: `http://127.0.0.1:54324`

### 2. Get Local Credentials

```bash
supabase status
```

This shows:
- API URL: `http://127.0.0.1:54321`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (local default)
- Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (local default)

**Note:** Local Supabase uses the same default keys for all instances. These are safe to use locally.

### 3. Run Tests

The E2E npm scripts default to local Supabase (`USE_LOCAL_SUPABASE=1`), so with `supabase start` running you can use:

```bash
# Headless
npm run test:e2e
```

```bash
# Headed (watch in browser)
npm run test:e2e:headed
```

Optional: run a single spec or project, e.g. `-- playwright/tests/oauth-flow.spec.ts --project=chromium`.

To use a **remote** Supabase project instead of local, override the default:

```bash
USE_LOCAL_SUPABASE=0 npm run test:e2e
```

(or set `DEV_SUPABASE_PROJECT_ID` and `DEV_SUPABASE_SERVICE_KEY` and leave `USE_LOCAL_SUPABASE=0`).

## Benefits

- **No rate limits** - Unlimited anonymous sign-ins (when enabled in local Supabase)
- **Faster** - No network latency
- **Isolated** - Separate from dev/prod data
- **Resettable** - Can wipe/reset between test runs
- **Free** - No API costs
- **Offline** - Works without internet

## Stopping Local Supabase

```bash
supabase stop
```

## Resetting Local Database

To reset the local database and reapply all migrations:

```bash
supabase db reset
```

## Troubleshooting

### Migration Errors

All migrations are now conditional and will automatically skip if required tables don't exist. The seed migration (`20240101000000_seed_base_tables.sql`) creates all base tables first, so subsequent migrations should apply successfully.

If you encounter migration errors:
1. Check that the seed migration ran successfully
2. Verify all base tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
3. Run `supabase db reset` to start fresh

### Port Conflicts

If ports are already in use:
```bash
supabase stop
# Wait a moment, then
supabase start
```

### Docker Issues

Ensure Docker is running:
```bash
docker ps
```

If Docker isn't running, start Docker Desktop.

### 422 "Anonymous sign-ins are disabled"

The E2E app is using local Supabase but anonymous sign-in is disabled. Enable it in Studio: **Authentication** → **Providers** → **Anonymous** → Enable.

### 504 Outdated Optimize Dep (Vite)

If the frontend shows **504 Outdated Optimize Dep** or similar Vite prebundle errors, the browser is requesting dependency URLs that no longer match the dev server's prebundle cache. To avoid this:

- Do **not** delete `frontend/.vite` between runs.
- If you see 504s after changing Node/vite deps, run `npm run dev:ui` once (then stop it) to warm the cache, or remove `frontend/.vite` and run E2E once so the fixture's dev server builds a fresh cache.

## Default Local Supabase Keys

Local Supabase uses these default keys (same for all local instances):

- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`

These are automatically used by the test fixtures when `USE_LOCAL_SUPABASE=1` is set.
