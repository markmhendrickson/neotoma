# Developer Getting Started Guide

_(Local Environment Setup and First Contribution)_

## Scope

This document covers:

- Prerequisites and system requirements
- Local environment setup (Supabase, dependencies, configuration)
- Running the development server
- Running tests
- Making your first code change
- Common setup issues and solutions
  This document does NOT cover:
- Deployment procedures (see `docs/infrastructure/deployment.md`)
- Advanced development workflows (see `docs/developer/development_workflow.md`)
- Feature Unit implementation (see `docs/feature_units/standards/feature_unit_spec.md`)

## Prerequisites

### Required Software

- **Node.js**: v18.x or v20.x (LTS recommended)
- **npm**: v9.x or later (comes with Node.js)
- **Git**: 2.30+ for version control

### Optional Accounts

- **Supabase Account**: Only required for the remote storage backend

### Optional but Recommended

- **VS Code** or **Cursor**: IDE with TypeScript support
- **Fly CLI**: For deployment testing (`brew install flyctl`)
- **Docker**: For local Supabase (optional, cloud is easier for MVP)

## Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/neotoma.git
cd neotoma
# Install dependencies
npm install
# Verify installation
npm run type-check
```

If `type-check` passes, dependencies are installed correctly.

## Step 2: Choose storage backend

Neotoma defaults to local storage with SQLite. Remote Supabase storage is optional.

**Default local storage:**

- SQLite database at `./data/neotoma.db` (development) or `./data/neotoma.prod.db` (production)
- Raw file storage at `./data/sources/`
- Optional JSONL event log mirror at `./data/events/` when enabled

**Remote Supabase storage (optional):**

- Uses Supabase PostgreSQL and Supabase Storage
- Requires Supabase credentials in `.env`

Set the backend in `.env`:

```bash
NEOTOMA_STORAGE_BACKEND=local
```

## Step 3: Create Supabase Project (optional)

1. Go to https://supabase.com and sign in (or create account)
2. Click **"New Project"**
3. Name it (e.g., `neotoma-dev`)
4. Set a database password (save securely)
5. Choose a region close to you
6. Click **"Create new project"**
7. Wait ~2 minutes for provisioning

## Step 4: Enable Anonymous Sign-Ins (Required for Guest Users, Supabase only)

The app automatically signs in users as guests when they load without authentication. This requires anonymous sign-ins to be enabled:

**For Remote Supabase:**

1. In Supabase dashboard, go to **Authentication** → **Settings**
2. Find **"Enable anonymous sign-ins"** toggle
3. **Enable** it

**For Local Supabase:**

1. Open Supabase Studio: `http://localhost:54323`
2. Go to **Authentication** → **Providers**
3. Find **Anonymous** provider
4. Click **Enable**

## Step 5: Run Database Schema (Supabase only)

1. In Supabase dashboard, open **"SQL Editor"**
2. Click **"New Query"**
3. Open `supabase/schema.sql` from the project
4. Copy entire contents and paste into SQL editor
5. Click **"Run"** (or press Cmd+Enter)
6. Wait for success confirmation
   This creates:

- `records` table with indexes
- `entities` table
- `events` table
- Graph edge tables
- RLS policies
- Extensions (pgvector, etc.)

## Step 6: Create Storage Buckets (Supabase only)

Create two storage buckets in Supabase:

**Bucket 1: `files`**

1. In Supabase dashboard, click **"Storage"** in left sidebar
2. Click **"New bucket"**
3. Name: `files`
4. Make it **public**: NO (private)
5. Click **"Create bucket"**

**Bucket 2: `sources`**

1. Click **"New bucket"** again
2. Name: `sources`
3. Make it **public**: NO (private)
4. Click **"Create bucket"**

**Note:** Both buckets should be **private** for security. The system uses `service_role` for uploads/downloads and creates signed URLs for client access. The `sources` bucket is required for `ingest()` and other source-based ingestion operations. The `files` bucket is used for general file uploads.

## Step 7: Configure Environment Variables

Create `.env` in the project root:

```bash
# Storage backend
NEOTOMA_STORAGE_BACKEND=local
# Optional local storage paths (defaults are env-specific: dev uses data/sources, data/events, data/logs; prod uses data/sources_prod, data/events_prod, data/logs_prod)
NEOTOMA_DATA_DIR=./data
NEOTOMA_SQLITE_PATH=./data/neotoma.db
NEOTOMA_RAW_STORAGE_DIR=./data/sources
NEOTOMA_EVENT_LOG_DIR=./data/events
NEOTOMA_LOGS_DIR=./data/logs
# Optional JSONL event log mirror
NEOTOMA_EVENT_LOG_MIRROR=false

# Supabase Configuration (required only when NEOTOMA_STORAGE_BACKEND=supabase)
DEV_SUPABASE_PROJECT_ID=your-project-id
DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
# Alternative: Full URL (also supported)
# DEV_SUPABASE_URL=https://your-project-id.supabase.co
# DEV_SUPABASE_SERVICE_KEY=your-service-role-key-here
# Optional: MCP/HTTP Server
PORT=3000
HTTP_PORT=8080
ACTIONS_BEARER_TOKEN=dev-token-or-random-string
# Optional: Plaid (for testing Plaid features)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
# Optional: OpenAI (for embeddings)
OPENAI_API_KEY=sk-your-api-key-here
```

**Where to find Supabase credentials:**

- **Project ID**: Settings → General → Project ID (preferred)
- **Project URL**: Settings → API → Project URL (alternative - extract ID from URL)
- **Service Role Key**: Settings → API → service_role key (NOT anon key)
  **Security Note:** Never commit `.env` to git. It's already in `.gitignore`.

## Step 8: Verify Setup

### Test Database Connection

```bash
npm test
```

This runs integration tests against your configured backend. If tests pass, your database connection is working.

### Start development server

**Watch** = run with file watching (hot reload). **Start** = run built code once. **:prod** = production environment (port 8082). Everything else = development (port 8080).

**MCP (stdio):**

```bash
npm run watch
```

**API only (no UI):**

```bash
npm run watch:server
```

**API + tunnel (for remote MCP):**

```bash
npm run watch:api
```

**API + tunnel + tsc watch:**

```bash
npm run watch:server+api
```

**Development env with reload (port 8080, tunnel + API + tsc watch):**

```bash
npm run watch:dev
```

**Production env with reload (port 8082):**

```bash
npm run watch:prod
```

**Full stack (API + UI):**

```bash
npm run watch:full
```

**Run built code (no watch):** `npm run start` (MCP), `npm run start:api` (API), `npm run start:prod` (API on 8082, production env).

| Environment | Port | Watch | Start |
|-------------|------|-------|-------|
| Development | 8080 | `watch:dev`, `watch`, `watch:server`, `watch:server+api` | `start`, `start:api` |
| Production  | 8082 | `watch:prod` | `start:prod` |

The `dev:*` scripts (e.g. `dev:server`, `dev:prod`) are aliases for the corresponding `watch:*` scripts and remain for backward compatibility.

### Branch-Based Port Assignment

When running `npm run watch:full` (or `dev:full`) or other watch commands, the system automatically assigns ports based on your git branch name. This allows multiple branches to run development servers simultaneously without port conflicts.
**How it works:**

- Ports are deterministically assigned using a hash of the branch name
- Each branch gets unique ports for HTTP (8080-8179), Vite (5173-5272), and WebSocket (8081-8180)
- Port assignments are stored in `.branch-ports/{branch-name}.json`
- The same branch always gets the same ports
  **State files:**
- `.branch-ports/` directory contains JSON files tracking active dev servers
- Each file includes: branch name, process ID, timestamp, and assigned ports
- Files are automatically created/updated when dev servers start
- Stale entries are cleaned up when processes terminate
  **Note:** The `.branch-ports/` directory is git-ignored and should not be committed.

## Step 7: Make Your First Change

### Example: Add a Test

1. Open `src/index.test.ts`
2. Add a simple test:

```typescript
test("my first test", async () => {
  const result = await storeRecord({
    type: "note",
    properties: { text: "Hello, Neotoma!" },
  });
  expect(result.id).toBeDefined();
});
```

3. Run the test:

```bash
npm test -- src/index.test.ts
```

### Example: Add a Log Statement

1. Open `src/server.ts`
2. Add a console.log in a handler
3. Restart dev server
4. Trigger the action and verify log appears

## Common Setup Issues

### Issue: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

**Solution:**

- Ensure `.env` exists in project root
- Confirm `NEOTOMA_STORAGE_BACKEND=supabase`
- Verify variable names: `DEV_SUPABASE_PROJECT_ID` (preferred) or `DEV_SUPABASE_URL`, and `DEV_SUPABASE_SERVICE_KEY`
- Restart terminal/IDE to reload environment variables

### Issue: Tests Fail with "relation does not exist"

**Solution:**

- Run `supabase/schema.sql` in Supabase SQL Editor
- Verify all tables exist: `SELECT * FROM records LIMIT 1;`

### Issue: "Port already in use"

**Solution:**

- The branch-based port system should prevent conflicts automatically
- If conflicts occur, check `.branch-ports/` for stale entries and remove them
- Find process: `lsof -i :8080` (macOS/Linux)
- Kill process: `kill -9 <PID>`
- Or use different port: `HTTP_PORT=8081 npm run dev:server`

### Issue: TypeScript Errors

**Solution:**

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Issue: Supabase Connection Timeout

**Solution:**

- Verify project is active (not paused)
- Check region matches your location
- Verify firewall/network allows outbound HTTPS

## CLI setup

Use the Neotoma CLI for HTTP access to the API surface.

### Running the CLI

**Without global install (from project root):**

```bash
# Run built CLI
npm run cli

# Run in dev mode (TypeScript via tsx; source changes picked up immediately)
npm run cli:dev
```

**Global install or link:**

```bash
npm run build
npm install -g .   # Install globally

# Or link for development (points to local package; run npm run build after changes)
npm link
```

Note: A global install uses a copy of `dist/cli/index.js`. Changes to `src/cli/index.ts` require `npm run build` and reinstall (`npm install -g .`). With `npm link`, run `npm run build` after changes; no reinstall needed. Use `npm run cli:dev` for immediate source changes during development.

**If `neotoma` is not found after install or link:** The npm global bin directory may not be on your PATH. Add to `~/.zshrc` (or `~/.bashrc`):

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

Then run `source ~/.zshrc` or open a new terminal. To diagnose: `echo "$(npm config get prefix)/bin"` shows the bin path; `ls -la "$(npm config get prefix)/bin/neotoma"` confirms the binary exists.

### Authenticate

When encryption is off (default), no authentication is needed. The CLI works immediately.

For MCP Connect (Cursor) setup only, run:
```bash
neotoma auth login --base-url http://localhost:8080
```

Check auth status: `neotoma auth status`. When encryption is on, set `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC`.

### Example commands

```bash
neotoma entities list
neotoma sources list
neotoma timeline list --limit 10
```

## Next Steps

After setup is complete:

1. **Read foundational docs:**
   - `docs/NEOTOMA_MANIFEST.md` — Core principles
   - Foundation rules in `.cursor/rules/` — Agent instructions and documentation loading order
2. **Understand development workflow:**
   - `docs/developer/development_workflow.md` — Git, branches, PRs
3. **Pick a Feature Unit:**
   - `docs/specs/MVP_FEATURE_UNITS.md` — MVP build plan
   - Start with a P0 item marked "⏳ NEW"
4. **Read relevant subsystem docs:**
   - `docs/subsystems/ingestion/ingestion.md` — For ingestion work
   - `docs/subsystems/search/search.md` — For search work
   - `docs/architecture/architecture.md` — For structural changes

## Verification Checklist

Before starting development, verify:

- [ ] Node.js v18+ installed (`node --version`)
- [ ] Dependencies installed (`npm install` completed)
- [ ] Supabase project created and active
- [ ] Database schema applied (`supabase/schema.sql` run)
- [ ] Storage bucket `files` created (private)
- [ ] Storage bucket `sources` created (private)
- [ ] `.env` configured with valid credentials
- [ ] Tests pass (`npm test`)
- [ ] Dev server starts (`npm run dev` or `npm run dev:server`)
- [ ] Can access Supabase dashboard

## Agent Instructions

### When to Load This Document

Load when:

- Setting up a new development environment
- Onboarding new developers
- Troubleshooting local setup issues
- Verifying environment configuration

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` — Foundational principles
- `README.md` — Project overview and additional setup details
- `docs/developer/development_workflow.md` — After initial setup

### Constraints Agents Must Enforce

1. **Never commit `.env` files** — Already in `.gitignore`, but verify
2. **Always use `DEV_*` prefixed variables** — For development environment
3. **Verify Supabase connection before proceeding** — Run `npm test` first
4. **Follow documentation standards** — See `docs/conventions/documentation_standards.md`

### Forbidden Patterns

- Committing secrets or API keys
- Using production Supabase for development
- Skipping schema setup (tests will fail)
- Modifying `.gitignore` to allow `.env` files
