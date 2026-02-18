# Developer Getting Started Guide

_(Local Environment Setup and First Contribution)_

## Scope

This document covers:

- Prerequisites and system requirements
- Installation options (npm package or repository clone)
- Local environment setup (storage backends, configuration)
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
- **Git**: 2.30+ for version control (only needed for development)

### Optional Accounts

- **Supabase Account**: Only required for the remote storage backend

### Optional but Recommended

- **VS Code** or **Cursor**: IDE with TypeScript support
- **Fly CLI**: For deployment testing (`brew install flyctl`)
- **Docker**: For local Supabase (optional, cloud is easier for MVP)

---

## Installation Options

### Option A: Install from npm (recommended for users)

If you want to use Neotoma as an MCP server without modifying the source code:

```bash
# Global install
npm install -g neotoma

# Initialize Neotoma (creates directories, database, config)
neotoma init

# Or with encryption enabled (privacy-first mode)
neotoma init --generate-keys
```

**What `neotoma init` does:**

- Creates data directories (`~/neotoma/data/`, `sources/`, `events/`, `logs/`)
- Initializes SQLite database with WAL mode
- Optionally generates encryption keys for privacy-first mode
- Creates `.env.example` with documented configuration

**Init command options:**

| Option | Description |
|--------|-------------|
| `--data-dir <path>` | Custom data directory (default: `~/neotoma/data` or `./data` if in repo) |
| `--generate-keys` | Generate encryption keys for privacy-first mode |
| `--force` | Overwrite existing configuration |
| `--skip-db` | Skip database initialization |

**After initialization:**

```bash
# Start the API server
neotoma api start

# Configure MCP for your AI tool
neotoma mcp config

# Check status
neotoma api status
```

**Installation locations:**

- **Global install** (`npm install -g`): Binary at `$(npm config get prefix)/bin/neotoma`
- **Data directory**: `~/neotoma/data/` (or custom via `--data-dir`)
- **Config file**: `~/.config/neotoma/config.json`

---

### Option B: Clone Repository (for development)

If you want to modify the source code or contribute:

```bash
# Clone the repository
git clone https://github.com/markmhendrickson/neotoma.git
cd neotoma

# Install dependencies
npm install

# Verify installation
npm run type-check
```

If `type-check` passes, dependencies are installed correctly.

**Note:** When developing from a cloned repo, data defaults to `./data/` in the project directory.

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

Create `.env` in the project root (see `env.example`).

For local storage, no environment variables are required. The app uses these defaults if unset:

| Variable | Default (when unset) |
|----------|----------------------|
| `NEOTOMA_STORAGE_BACKEND` | `local` |
| `NEOTOMA_DATA_DIR` | `./data` |
| `NEOTOMA_SQLITE_PATH` | `./data/neotoma.db` (dev) or `./data/neotoma.prod.db` (prod) |
| `NEOTOMA_RAW_STORAGE_DIR` | `./data/sources` (dev) or `./data/sources_prod` (prod) |

Override only when you need custom paths. `NEOTOMA_EVENT_LOG_DIR` and `NEOTOMA_LOGS_DIR` also default from `NEOTOMA_DATA_DIR` (e.g. `./data/events`, `./data/logs`). Example `.env` with optional overrides:

```bash
# Storage backend (optional; default: local)
# NEOTOMA_STORAGE_BACKEND=local
# Optional local storage paths (defaults: ./data, ./data/neotoma.db, ./data/sources; prod uses _prod suffixes)
# NEOTOMA_DATA_DIR=./data
# NEOTOMA_SQLITE_PATH=./data/neotoma.db
# NEOTOMA_RAW_STORAGE_DIR=./data/sources
# NEOTOMA_EVENT_LOG_DIR=./data/events
# NEOTOMA_LOGS_DIR=./data/logs
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
# Optional: OpenAI (for embeddings and AI interpretation)
# Required for: AI interpretation of unstructured files, entity semantic search (both Supabase and local)
OPENAI_API_KEY=sk-your-api-key-here
```

**Note:** Local semantic search (sqlite-vec) requires `OPENAI_API_KEY`. When unset, semantic search returns empty; keyword fallback remains available.

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

**Watch** = run with file watching (hot reload). **Start** = run built code once. **:prod** = production environment (port 8180). Everything else = development (port 8080).

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
npm run watch:dev:tunnel
```

**API + tunnel + tsc watch:**

```bash
npm run watch:server+api
```

**Development env with reload (port 8080, tunnel + API + tsc watch):**

```bash
npm run watch:dev
```

**Production env with reload (port 8180):**

```bash
npm run watch:prod
```

**Production env with tunnel (local mode, remote access):**

```bash
npm run watch:prod:tunnel
```

Uses port 8180, `NEOTOMA_ENV=production`, and starts an HTTPS tunnel so the server is reachable at the printed URL. See [Tunnels](tunnels.md) and [MCP HTTPS tunnel status](mcp_https_tunnel_status.md).

**Environment variables for `watch:prod:tunnel`:**

- **Required for the command:** None in `.env` for default local storage. The script sets port and prod mode; the tunnel URL is passed to the server automatically. You need a tunnel provider: **Cloudflare** (install `cloudflared`) or **ngrok** (install and authenticate). The script prefers Cloudflare when `cloudflared` is installed; see [tunnels.md](tunnels.md).
- **Required if using Supabase:** `SUPABASE_PROJECT_ID` or `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY`.
- **Optional (remote access / auth):** `HOST_URL` — base URL for API and MCP (OAuth, "Add to Cursor"). If not set, server auto-discovers from tunnel URL file. For fixed domain, set in `.env`. `MCP_PROXY_URL` overrides MCP URL only when it must differ (rare). `NEOTOMA_BEARER_TOKEN` = optional bearer token for MCP/tunnel auth.
- **Optional (features / paths):** `OPENAI_API_KEY` (LLM extraction), `NEOTOMA_DATA_DIR`, `NEOTOMA_SQLITE_PATH`, `FRONTEND_URL`, encryption vars. For a fixed tunnel domain, set `HOST_URL` in `.env` (ngrok reserved/custom domain required). **Tunnel provider override:** `NEOTOMA_TUNNEL_PROVIDER=cloudflare` or `=ngrok`. Full tunnel docs: [tunnels.md](tunnels.md).
- **Deprecated:** `API_BASE_URL` (legacy alias for `HOST_URL`; use `HOST_URL` instead).

**Full stack (API + UI):**

```bash
npm run watch:full
```

**Run built code (no watch):** `npm run start:mcp` (MCP), `npm run start:api` (API), `npm run start:api:prod` (build backend + API on 8180, production env; no UI build).

| Environment | Port | Watch | Start |
|-------------|------|-------|-------|
| Development | 8080 | `watch:dev`, `watch:dev:tunnel`, `watch:server`, `watch:server+api` | `start:mcp`, `start:api` |
| Production  | 8180 | `watch:prod`, `watch:prod:tunnel` (with tunnel) | `start:api:prod` |

The `dev:*` scripts (e.g. `dev:server`, `dev:prod`) are aliases for the corresponding `watch:*` scripts. For a full table of all npm scripts, see [CLI reference – npm scripts summary](cli_reference.md#npm-scripts-summary).

### Branch-Based Port Assignment

When running `npm run watch:full` (or `dev:full`) or other watch commands, the system automatically assigns ports based on your git branch name. This allows multiple branches to run development servers simultaneously without port conflicts.
**How it works:**

- Ports are deterministically assigned using a hash of the branch name
- Each branch gets unique ports for HTTP (8080-8179), Vite (5173-5272), and WebSocket (8280-8379)
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
- Or use different port: `HTTP_PORT=8180 npm run dev:server`

### Issue: TypeScript Errors

**Solution:**

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build:server
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
npm run build:server
npm install -g .   # Install globally

# Or link for development (points to local package; run npm run build:server after changes)
npm link
```

Note: A global install uses a copy of `dist/cli/index.js`. Changes to `src/cli/index.ts` require `npm run build:server` and reinstall (`npm install -g .`). With `npm link`, run `npm run build:server` after code changes; no reinstall needed. Use `npm run cli:dev` for immediate source changes during development.

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
