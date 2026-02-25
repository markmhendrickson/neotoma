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
The static marketing site is built with `npm run build:pages:site` (output: `site_pages/`) and deployed to **GitHub Pages** (`.github/workflows/deploy-pages-site.yml`) on push to **dev**. The canonical URL is **https://neotoma.io**.
### Deploy
No extra secrets: the workflow uses the repo’s GitHub Pages environment. Push to **dev** (or run the workflow manually) to build and deploy. The site is available at your GitHub Pages URL (e.g. `https://<owner>.github.io/neotoma/`) until you add a custom domain.
### Custom domain (neotoma.io)
1. In the repo: **Settings → Pages** (under "Code and automation").
2. Under **Custom domain**, enter **neotoma.io** and click **Save**. GitHub will add a CNAME file or show DNS instructions.
3. At your DNS provider for neotoma.io, add either:
   - **A records** for the apex: `192.30.252.153` and `192.30.252.154`, or
   - An **ALIAS/ANAME** record for the apex pointing to `<owner>.github.io`.
4. Wait for DNS to propagate (up to 24 hours). GitHub will provision HTTPS for neotoma.io.
5. Optionally enable **Enforce HTTPS** in Settings → Pages.
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
  PORT = "8080"
  NODE_ENV = "production"
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]
[[services]]
  http_checks = []
  internal_port = 8080
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
- `internal_port = 8080`: Matches `HTTP_PORT` environment variable
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
- Ensure `fly.toml` has `internal_port = 8080`
- Verify `HTTP_PORT=8080` in environment (or use default)
- Check `Dockerfile` exposes port 8080
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
