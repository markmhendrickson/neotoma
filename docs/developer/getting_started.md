# Developer Getting Started Guide
*(Local Environment Setup and First Contribution)*
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
- **Supabase Account**: Free account at https://supabase.com
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
## Step 2: Create Supabase Project
1. Go to https://supabase.com and sign in (or create account)
2. Click **"New Project"**
3. Name it (e.g., `neotoma-dev`)
4. Set a database password (save securely)
5. Choose a region close to you
6. Click **"Create new project"**
7. Wait ~2 minutes for provisioning
## Step 3: Run Database Schema
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
## Step 4: Create Storage Bucket
1. In Supabase dashboard, click **"Storage"** in left sidebar
2. Click **"New bucket"**
3. Name: `files`
4. Make it **public**: YES
5. Click **"Create bucket"**
## Step 5: Configure Environment Variables
Create `.env` in the project root:
```bash
# Supabase Configuration (preferred: use Project ID)
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
## Step 6: Verify Setup
### Test Database Connection
```bash
npm test
```
This runs integration tests against your Supabase instance. If tests pass, your database connection is working.
### Start Development Server
**MCP Server (stdio mode):**
```bash
npm run dev
```
Should see: `MCP Server running on stdio`
**HTTP Actions Server:**
```bash
npm run dev:http
```
Should see: `HTTP Actions listening on :8080`
**Full Stack (HTTP + UI):**
```bash
npm run dev:full
```
Opens UI at `http://localhost:5173` (or next available port).
### Branch-Based Port Assignment
When running `npm run dev:full` or other dev commands, the system automatically assigns ports based on your git branch name. This allows multiple branches to run development servers simultaneously without port conflicts.
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
test('my first test', async () => {
  const result = await storeRecord({
    type: 'note',
    properties: { text: 'Hello, Neotoma!' }
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
- Or use different port: `HTTP_PORT=8081 npm run dev:http`
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
- [ ] Storage bucket `files` created (public)
- [ ] `.env` configured with valid credentials
- [ ] Tests pass (`npm test`)
- [ ] Dev server starts (`npm run dev` or `npm run dev:http`)
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
