# Deployment Guide
*(Fly.io Deployment and Production Setup)*
## Scope
This document covers:
- Fly.io account setup and CLI installation
- Application creation and configuration
- Environment variable configuration
- Deployment procedures
- Post-deployment verification
- Marketing site deployment to neotoma.io (GitHub Pages)
This document does NOT cover:
- Local development setup (see `docs/developer/getting_started.md`)
- Infrastructure scaling (post-MVP)
- Advanced monitoring (post-MVP)
## Marketing site (neotoma.io)
The static marketing site is built with `npm run build:pages:site` (output: `site_pages/`) and deployed to **GitHub Pages** (`.github/workflows/deploy-pages-site.yml`).

- **Prod:** Push to **main** (or run the workflow manually). Served at **https://neotoma.io** (root).
- **Dev preview:** Push to **dev** and deploy to a **separate repository** via `.github/workflows/deploy-pages-dev-site.yml`. Served at **https://dev.neotoma.io**.

### One-time: Enable GitHub Pages from Actions
1. In the repo on GitHub: **Settings → Pages** (under "Code and automation").
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch"). Save.
3. The prod workflow runs on push to **main** or when run manually (Actions → "Deploy site (GitHub Pages)" → Run workflow).
### Deploy
No extra secrets: the prod workflow uses the repo’s GitHub Pages environment. Push to **main** (or run the workflow manually from the Actions tab) to build and deploy production at **https://neotoma.io**.

### Dev preview site (dev.neotoma.io, isolated from prod)
Use a dedicated Pages repository so preview deploys never modify the prod Pages artifact.

1. Create repository `markmhendrickson/neotoma-dev-site` (or adjust the workflow `external_repository` value).
2. In `neotoma-dev-site`: **Settings → Pages**:
   - Set source to **Deploy from a branch**.
   - Branch: `gh-pages` / root.
3. In this repo (`neotoma`) add secret `DEV_PAGES_DEPLOY_TOKEN` with a PAT that can push to `neotoma-dev-site`.
4. Push to **dev** (or run Actions → "Deploy dev site (dev.neotoma.io)").
5. In `neotoma-dev-site` Pages settings, set custom domain to **dev.neotoma.io**.
6. Add DNS record for `dev.neotoma.io`:
   - **CNAME** `dev` -> `markmhendrickson.github.io`
7. Enable **Enforce HTTPS** once available.
### Custom domain (neotoma.io)
1. In the repo: **Settings → Pages** (under "Code and automation").
2. Under **Custom domain**, enter **neotoma.io** and click **Save**. GitHub will add a CNAME file or show DNS instructions.
3. At your DNS provider for neotoma.io, add **A records** for the apex (all four):
   - `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - **Via script (Cloudflare):** `./scripts/cloudflare_set_github_pages_apex.sh` (sets apex to these IPs, DNS only).
   - Or an **ALIAS/ANAME** for the apex pointing to `<owner>.github.io` if your provider supports it.
4. Wait for DNS to propagate (up to 24 hours). GitHub will provision HTTPS for neotoma.io.
5. When **Enforce HTTPS** becomes available in Settings → Pages, enable it.

#### If HTTPS stays unavailable (certificate for \*.github.io or "Not Secure")
- **CAA records:** If the zone has CAA records, at least one must allow Let's Encrypt (GitHub uses it for custom domains). Add a CAA record: `0 issue "letsencrypt.org"`. Via script: `./scripts/cloudflare_ensure_caa_letsencrypt.sh`.
- **Retrigger issuance:** In Settings → Pages, remove the custom domain, wait a few minutes, then re-add `neotoma.io` and Save. GitHub will run DNS check and request a new certificate.
- **Wait:** Issuance can take up to 24 hours after DNS is correct.

### Cloudflare cutover checklist (redirect removal)
1. Remove any forwarding or redirect rule that sends `https://neotoma.io` to GitHub (repo or github.io):
   - **Via script (recommended):** `CLOUDFLARE_API_TOKEN` in env, then run `./scripts/remove_cloudflare_redirect.sh`. Uses Rulesets API; removes redirect rules that point to `*github*`.
   - **Via dashboard:** Cloudflare Dashboard → Rules → Redirect Rules (or Page Rules); delete the rule that forwards neotoma.io to the repo or github.io.
2. Ensure apex A records point to GitHub Pages (all four): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. Run `./scripts/cloudflare_set_github_pages_apex.sh` to set them via API.
3. Verify with browser and curl:
   - `https://neotoma.io` returns `200` and stays on `neotoma.io` (no hop to `github.io` or `github.com`).
   - `https://neotoma.io/sitemap.xml` and `https://neotoma.io/robots.txt` resolve successfully.
## Prerequisites
- Fly.io account (free tier available)
- Fly CLI installed (`brew install flyctl` or see https://fly.io/docs/hands-on/install-flyctl/)
- Database (PostgreSQL or SQLite for local)
- Domain name (optional, for custom domain)
## Step 1: Install Fly CLI
### macOS
```bash
brew install flyctl
```
### Linux
```bash
curl -L https://fly.io/install.sh | sh
```
### Windows
```bash
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```
### Verify Installation
```bash
flyctl version
```
## Step 2: Authenticate with Fly.io
```bash
flyctl auth login
```
This opens a browser for authentication. After login, you're ready to create apps.
## Step 3: Create Fly.io Application
### One-Time Setup
```bash
# Navigate to project directory
cd neotoma
# Create app (don't deploy yet)
flyctl launch --no-deploy --name neotoma --region <closest-region>
```
**Region Selection:**
- Choose region closest to your database
- Common regions: `iad` (Washington DC), `sjc` (San Jose), `lhr` (London))
- List all regions: `flyctl regions list`
**What This Creates:**
- `fly.toml` configuration file
- Fly.io app named "neotoma"
- App configuration (not deployed yet)
## Step 4: Configure Environment Variables
### Set Secrets (Never Commit)
```bash
# Set database credentials (if using remote backend)
flyctl secrets set \
  NEOTOMA_DATA_DIR=""
# Set bearer token for API auth
flyctl secrets set \
  ACTIONS_BEARER_TOKEN="your-strong-random-token"
# Optional: Plaid (if using production)
flyctl secrets set \
  PLAID_CLIENT_ID="your_plaid_client_id" \
  PLAID_SECRET="your_plaid_secret" \
  PLAID_ENV="production"
# Optional: OpenAI (for embeddings)
flyctl secrets set \
  OPENAI_API_KEY="sk-your-api-key"
```
**Security Notes:**
- Secrets are encrypted and never exposed in logs
- Use strong random tokens for `ACTIONS_BEARER_TOKEN`
- Never commit secrets to git
### Verify Secrets
```bash
flyctl secrets list
```
## Step 5: Review fly.toml
The `fly.toml` file should look like:
```toml
app = "neotoma"
primary_region = "iad"
[build]
[env]
  PORT = "3180"
  NODE_ENV = "production"
[http_service]
  internal_port = 3180
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]
[[services]]
  http_checks = []
  internal_port = 3180
  processes = ["app"]
  protocol = "tcp"
  script_checks = []
    [services.concurrency]
      hard_limit = 25
      soft_limit = 20
      type = "connections"
    [[services.ports]]
      force_https = true
      handlers = ["http"]
      port = 80
    [[services.ports]]
      handlers = ["tls", "http"]
      port = 443
    [[services.tcp_checks]]
      grace_period = "1s"
      interval = "15s"
      restart_limit = 0
      timeout = "2s"
```
**Key Settings:**
- `internal_port = 3180`: Matches `HTTP_PORT` environment variable
- `auto_stop_machines = true`: Saves costs (machines stop when idle)
- `auto_start_machines = true`: Machines start on first request
- `min_machines_running = 0`: No always-on machines (cost-effective)
## Step 6: Deploy Application
### First Deployment
```bash
# Build and deploy
flyctl deploy --remote-only
```
**What This Does:**
- Builds Docker image using `Dockerfile`
- Pushes image to Fly.io registry
- Deploys to Fly.io infrastructure
- Starts application
**Deployment Output:**
```
==> Building image
==> Creating release
==> Monitoring deployment
v0 deployed successfully
```
### Verify Deployment
```bash
# Check app status
flyctl status
# View logs
flyctl logs
# Check app URL
flyctl info
```
**Expected Output:**
```
App: neotoma
Hostname: neotoma.fly.dev
Region: iad
Status: running
```
## Step 7: Test Deployment
### Health Check
```bash
# Test health endpoint
curl https://neotoma.fly.dev/health
# Expected: {"status":"ok"}
```
### Test API
```bash
# Test with bearer token
TOKEN=your-bearer-token
curl https://neotoma.fly.dev/openapi.yaml \
  -H "Authorization: Bearer $TOKEN"
# Should return OpenAPI spec
```
### Test MCP Endpoint
```bash
curl -X POST https://neotoma.fly.dev/retrieve_records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "note", "limit": 10}'
```
## Step 8: Update OpenAPI Spec
If your app URL changed, update `openapi.yaml`:
```yaml
servers:
  - url: https://neotoma.fly.dev
    description: Production server
```
Then redeploy:
```bash
flyctl deploy --remote-only
```
## Continuous Deployment
### Deploy After Code Changes
```bash
# After committing changes
git push origin dev
# Deploy latest code
flyctl deploy --remote-only
```
### Automated Deployment (Post-MVP)
Consider setting up:
- GitHub Actions for CI/CD
- Automatic deployments on merge to `main`
- Staging environment for testing
## Monitoring and Logs
### View Logs
```bash
# Real-time logs
flyctl logs
# Last 100 lines
flyctl logs --limit 100
# Follow logs
flyctl logs --follow
```
### Check Metrics
```bash
# App metrics
flyctl metrics
# Machine status
flyctl status
```
### SSH into Machine
```bash
# SSH into running machine
flyctl ssh console
```
## Troubleshooting
### Issue: "Deployment failed"
**Solution:**
1. **Check logs:**
   ```bash
   flyctl logs
   ```
2. **Verify secrets:**
   ```bash
   flyctl secrets list
   ```
3. **Check Dockerfile:**
   - Ensure `Dockerfile` exists and is valid
   - Verify build process works locally
4. **Check fly.toml:**
   - Verify `internal_port` matches `HTTP_PORT`
   - Check region is valid
### Issue: "Application not responding"
**Solution:**
1. **Check machine status:**
   ```bash
   flyctl status
   ```
2. **Restart application:**
   ```bash
   flyctl apps restart neotoma
   ```
3. **Check health endpoint:**
   ```bash
   curl https://neotoma.fly.dev/health
   ```
4. **Verify environment variables:**
   ```bash
   flyctl secrets list
   ```
### Issue: "Port mismatch"
**Solution:**
- Ensure `fly.toml` has `internal_port = 3180`
- Verify `HTTP_PORT=3180` in environment (or use default)
- Check `Dockerfile` exposes port 3180
### Issue: "Out of memory"
**Solution:**
1. **Increase memory:**
   ```bash
   flyctl scale vm shared-cpu-2x  # 2GB RAM
   ```
2. **Or in fly.toml:**
   ```toml
   [vm]
     memory_mb = 2048
   ```
## Custom Domain (Optional)
### Add Domain
```bash
# Add custom domain
flyctl certs add neotoma.yourdomain.com
```
### Update DNS
1. **Get DNS records:**
   ```bash
   flyctl certs show neotoma.yourdomain.com
   ```
2. **Add CNAME record:**
   - Name: `neotoma` (or subdomain)
   - Value: `neotoma.fly.dev`
3. **Wait for DNS propagation** (5-30 minutes)
4. **Verify certificate:**
   ```bash
   flyctl certs check neotoma.yourdomain.com
   ```
## Cost Optimization
### Free Tier Limits
- **3 shared-cpu-1x VMs** (256MB RAM each)
- **160GB outbound data transfer/month**
- **3GB persistent volumes**
### Cost-Saving Tips
1. **Use auto-stop/start:**
   - Machines stop when idle
   - Start automatically on first request
   - Saves costs for low-traffic apps
2. **Right-size VMs:**
   - Start with `shared-cpu-1x` (256MB)
   - Scale up only if needed
   - Monitor memory usage
3. **Optimize Docker image:**
   - Use multi-stage builds (already in `Dockerfile`)
   - Minimize image size
   - Use `.dockerignore`
## MCP host (mcp.neotoma.io)

The **HTTP actions** app (same Fly app as API: `dist/actions.js`, `fly.toml` `internal_port = 3180`) serves Streamable HTTP MCP at **`/mcp`** and OAuth / server-card under **`/.well-known/`**. Use a dedicated hostname so OAuth metadata and Smithery match one origin.

### One-time: DNS

1. At your DNS provider for **neotoma.io**, add a **CNAME**:
   - **Name:** `mcp`
   - **Target:** `neotoma.fly.dev` (or the hostname shown by `flyctl info` for your app)
2. Prefer **DNS only** (grey cloud on Cloudflare) so TLS terminates at Fly. If the record is proxied (orange cloud), use Cloudflare SSL mode **Full (strict)** and ensure Fly’s certificate is valid for `mcp.neotoma.io`.

### One-time: Fly certificate

```bash
flyctl certs create mcp.neotoma.io
flyctl certs show mcp.neotoma.io
```

Wait until issuance shows **Ready**, then verify:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://mcp.neotoma.io/health
```

### Secrets (required for correct OAuth / MCP URLs)

```bash
flyctl secrets set NEOTOMA_HOST_URL="https://mcp.neotoma.io"
```

Set other production secrets as needed (`NEOTOMA_BEARER_TOKEN`, encryption keys, `OPENAI_API_KEY`, etc.). **`NEOTOMA_HOST_URL`** must equal the URL clients use in the browser for MCP “Connect” (scheme + host, no trailing slash).

### Verify MCP and server card

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://mcp.neotoma.io/.well-known/mcp/server-card.json
# Expect 200

curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://mcp.neotoma.io/mcp \
  -H "Content-Type: application/json" \
  -d '{}'
# Expect 401 (unauthenticated) — correct for Smithery OAuth discovery, not 403
```

### Smithery

After the host is live, publish **`https://mcp.neotoma.io/mcp`**. See `docs/integrations/smithery_external_url.md`.

## Sandbox host (sandbox.neotoma.io)

Public demo host combining the Neotoma API, MCP, and Inspector SPA on a single
Fly app. Full architecture and operator runbook:
[docs/subsystems/sandbox_deployment.md](../subsystems/sandbox_deployment.md).

### Provision

```bash
./scripts/provision_sandbox_fly.sh       # creates app + volume + TLS cert
flyctl deploy --config fly.sandbox.toml  # bakes Inspector via [build.args] in fly.sandbox.toml
```

After the first deploy, add repository secret **`FLY_API_TOKEN`** and enable
the **Sandbox weekly reset** workflow (`.github/workflows/sandbox-weekly-reset.yml`),
or run `./scripts/schedule_sandbox_reset.sh` manually (uses `fly ssh` into the
app; Fly volumes cannot attach to a second scheduled Machine).

### Secrets

Set on the `neotoma-sandbox` app:

- `NEOTOMA_ENCRYPTION_KEY`
- `NEOTOMA_AAUTH_AUTHORITY=https://sandbox.neotoma.io`
- `NEOTOMA_SANDBOX_REPORT_FORWARD_URL=https://agent.neotoma.io/sandbox/report/submit`
- `NEOTOMA_SANDBOX_REPORT_FORWARD_BEARER` (must equal Netlify **`AGENT_SITE_SANDBOX_BEARER`**)
- Optional: `OPENAI_API_KEY`, etc., only if the sandbox exposes those tools.

Public-facing sandbox toggles live in `fly.sandbox.toml` (`NEOTOMA_SANDBOX_MODE`,
`NEOTOMA_DATA_DIR`, `NEOTOMA_INSPECTOR_STATIC_DIR`,
`NEOTOMA_INSPECTOR_BASE_PATH`) and do not need to be set as secrets.

### Root landing page (`GET /`)

Every Neotoma host — local dev, personal tunnel, public sandbox, future
managed prod — renders a content-negotiated root page at `/` (HTML for
browsers, JSON for agents/curl) that identifies the instance, surfaces
harness-specific connect snippets pre-filled with the resolved host URL,
and mirrors the marketing-site navigation. Source lives at
`src/services/root_landing/`.

Two environment variables control its behavior; both are optional:

- `NEOTOMA_ROOT_LANDING_MODE` — explicit mode override. Valid values:
  `sandbox`, `personal`, `prod`, `local`. Precedence is:

  1. `NEOTOMA_ROOT_LANDING_MODE` (explicit).
  2. `NEOTOMA_SANDBOX_MODE=1` → `sandbox`.
  3. Loopback request (`127.0.0.1`, `::1`) → `local`.
  4. Default → `personal`.

  Set this for hosted personal tunnels where the default `personal` copy is
  still correct, or to `prod` for the future managed-prod deployment.

- `NEOTOMA_PUBLIC_DOCS_URL` — base URL used by the landing page to link
  back to the marketing site (`/docs`, `/install`, `/connect`, etc.).
  Defaults to `https://neotoma.io`. Override only if you host a private
  documentation mirror for a managed deployment.

The landing page also emits a mode-aware `GET /robots.txt`: `sandbox` and
`local` disallow crawling; `personal` and `prod` allow crawling, disallow
`/mcp` and `/sandbox/`, and advertise `{NEOTOMA_PUBLIC_DOCS_URL}/sitemap.xml`
as the external sitemap.

### DNS

Add a Cloudflare CNAME: `sandbox` → `neotoma-sandbox.fly.dev` (proxied off
so Fly-issued TLS serves directly).

### Verify

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://sandbox.neotoma.io/health
# Expect 200

curl -sI https://sandbox.neotoma.io/health | grep -i x-neotoma-sandbox
# Expect: X-Neotoma-Sandbox: 1

curl -sS https://sandbox.neotoma.io/sandbox/terms | head -20
# Terms JSON with weekly_reset_utc + abuse_report_email
```

Browse the Inspector at <https://sandbox.neotoma.io/app>. The sandbox banner
should appear immediately and link to `/app/sandbox` (terms + abuse form).

### Netlify Functions for abuse reports

The sandbox forwards abuse reports to `services/agent-site/` Netlify
functions `sandbox_report_submit` and `sandbox_report_status`. Set
`AGENT_SITE_SANDBOX_BEARER` on the Netlify site alongside the existing
feedback bearers.

## Agent feedback pipeline (agent.neotoma.io)

The hosted intake service for `submit_feedback` / `get_feedback_status` runs on Netlify as a set of functions under `services/agent-site/`. See [docs/subsystems/agent_feedback_pipeline.md](../subsystems/agent_feedback_pipeline.md) for the full architecture.

### Netlify site setup

1. From `services/agent-site/`, run `npm install` then `netlify init` to link a new site to the `agent.neotoma.io` subdomain.
2. Set the following site environment variables via `netlify env:set`:
   - `AGENT_SITE_BEARER` — public bearer shared with the Neotoma MCP server
   - `AGENT_SITE_ADMIN_BEARER` — admin bearer held only by the local cron / triage
3. Point the `agent.neotoma.io` DNS record at the Netlify site per standard Netlify docs.
4. Deploy with `netlify deploy --prod` (functions bundled via `esbuild`).

### Local dev

`netlify dev` inside `services/agent-site/` starts a local Functions server on port 8888. Point `AGENT_SITE_BASE_URL=http://localhost:8888` at it to exercise the HTTP transport end-to-end against the local Neotoma MCP.

### Cron (local machine)

Install the launchd template:

```bash
cp scripts/cron/com.neotoma.feedback-ingest.plist.template \
   ~/Library/LaunchAgents/com.neotoma.feedback-ingest.plist
sed -i '' "s|\${REPO_ROOT}|$(pwd)|g" ~/Library/LaunchAgents/com.neotoma.feedback-ingest.plist
launchctl load ~/Library/LaunchAgents/com.neotoma.feedback-ingest.plist
```

The cron runs `scripts/cron/ingest_agent_incidents.ts` every 15 minutes. Set `NEOTOMA_FEEDBACK_TRANSPORT=http` + admin bearer in the plist `EnvironmentVariables` dict to target the hosted Blobs store; leave at `local` to triage against the local JSON store.

## Rollback
### Rollback to Previous Version
```bash
# List releases
flyctl releases list
# Rollback to specific release
flyctl releases rollback <release-id>
```
### Emergency Rollback
```bash
# Rollback to previous release
flyctl releases rollback
```
## Agent Instructions
### When to Load This Document
Load when:
- Setting up production deployment
- Deploying code changes
- Troubleshooting deployment issues
- Configuring production environment
### Required Co-Loaded Documents
- `docs/developer/getting_started.md` — Local setup context
- `README.md` — Additional deployment details
- `docs/NEOTOMA_MANIFEST.md` — Production principles
### Constraints Agents Must Enforce
1. **Never commit secrets** — Use `flyctl secrets set`
2. **Always verify deployment** — Test health endpoint after deploy
3. **Use strong tokens** — Generate random `ACTIONS_BEARER_TOKEN`
4. **Monitor logs** — Check for errors after deployment
5. **Test before production** — Use staging environment if available
### Forbidden Patterns
- Committing secrets to git
- Deploying without testing locally
- Using weak bearer tokens
- Skipping health checks
- Deploying untested code
