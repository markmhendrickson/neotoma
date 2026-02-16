# Troubleshooting Guide
*(Common Issues and Solutions)*
## Scope
This document covers:
- Common setup and configuration issues
- Runtime errors and their solutions
- Database connection problems
- API and integration issues
- Performance problems
This document does NOT cover:
- Deployment issues (see `docs/infrastructure/deployment.md`)
- Integration-specific setup (see `docs/integrations/`)
- Feature Unit bugs (see `docs/feature_units/standards/error_protocol.md`)
## Setup Issues
### Issue: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"
**Symptoms:**
- Server exits immediately on startup
- Error: `Missing SUPABASE_URL or SUPABASE_SERVICE_KEY`
**Diagnosis:**
```bash
# Check environment variables
echo $DEV_SUPABASE_PROJECT_ID
echo $DEV_SUPABASE_URL
echo $DEV_SUPABASE_SERVICE_KEY
# Or check .env file exists
ls -la .env
```
**Solution:**
1. Verify `.env` exists in project root
2. Check variable names: `DEV_SUPABASE_PROJECT_ID` (preferred) or `DEV_SUPABASE_URL`, and `DEV_SUPABASE_SERVICE_KEY`
3. Ensure no extra spaces or quotes around values
4. Restart terminal/IDE to reload environment variables
5. For GUI apps (macOS), load env explicitly:
   ```bash
   set -a; source .env; set +a
   ```
### Issue: "relation does not exist" (Database Errors)
**Symptoms:**
- Tests fail with: `relation "records" does not exist`
- API calls return 500 errors
- Database queries fail
**Diagnosis:**
```sql
-- In Supabase SQL Editor, check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```
**Solution:**
1. Run `supabase/schema.sql` in Supabase SQL Editor
2. Verify all tables created:
   ```sql
   SELECT * FROM records LIMIT 1;
   SELECT * FROM entities LIMIT 1;
   SELECT * FROM events LIMIT 1;
   ```
3. Check RLS policies are enabled:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'records';
   ```
### Issue: "Port already in use"
**Symptoms:**
- Server fails to start: `EADDRINUSE: address already in use :8080`
- Port conflict errors
**Diagnosis:**
```bash
# Find process using port (macOS/Linux)
lsof -i :8080
# Or
netstat -an | grep 8080
```
**Solution:**
1. **Kill existing process:**
   ```bash
   kill -9 <PID>
   ```
2. **Or use different port:**
   ```bash
   HTTP_PORT=8180 npm run dev:server
   ```
3. **Or use branch-aware ports** (automatic port selection):
   ```bash
   npm run dev:full  # Automatically finds available ports
   ```
4. **Session / dev server on 8021:** If the API is started by the CLI session (e.g. `npm run dev` with tunnel), it uses `HTTP_PORT` (default 8080; often set to 8021 in scripts). If you see `EADDRINUSE :::8021`, another process is already bound. Kill it with `lsof -i :8021` then `kill -9 <PID>`, or set `NEOTOMA_SESSION_PORT_FILE` so the server writes the actual port and the tunnel script waits for it.
### Issue: "Invalid local session token"
**Symptoms:**
- API logs: `error: 'Invalid local session token'`
- MCP or API requests return 401 or auth errors
**Cause:**
- Local storage backend: the token is not in `mcp_oauth_connections` or the connection was revoked.
- Token expired or client (e.g. Cursor) is using an old token.
**Solution:**
1. **Re-authenticate:** Run `neotoma auth login` (or use the Neotoma UI) to get a fresh token.
2. **Update Cursor MCP config:** After logging in, copy the new token/URL from the UI or CLI and update `.cursor/mcp.json` if you use token-based auth.
3. **Local dev:** If using SQLite/local auth, ensure the dev server and CLI use the same `NEOTOMA_DATA_DIR` so the same `mcp_oauth_connections` is used.
### Issue: "Tunnel: (not ready)" even though ngrok/cloudflared is installed
**Symptoms:**
- Intro shows `Tunnel: (not ready) — check <repo>/data/logs/tunnel-*-url.log`
- `cloudflared` or `ngrok` is installed and works when run manually
**Cause:**
- The tunnel URL file is empty or missing because the tunnel script exited before writing it (e.g. Cloudflare named tunnel missing `CLOUDFLARE_TUNNEL_URL`, or quick tunnel hit rate limit).
**Solution:**
1. **Cloudflare named tunnel:** Set `CLOUDFLARE_TUNNEL_NAME` and `CLOUDFLARE_TUNNEL_URL` (or `HOST_URL`) in `.env`. Ensure `~/.cloudflared/config.yml` ingress points to `http://localhost:<HTTP_PORT>`.
2. **Cloudflare quick tunnel:** If the script fails with "Failed to get Cloudflare tunnel URL", see the "Failed to get Cloudflare tunnel URL" section below; prefer a named tunnel to avoid 429s.
3. **Check tunnel log:** When the CLI runs with `--tunnel`, the script writes logs under the repo at `data/logs/tunnel-dev-url.log` or `data/logs/tunnel-prod-url.log`. Run `tail -f data/logs/tunnel-prod-url.log` (or dev) to see why the tunnel exited.
### Issue: "Failed to get Cloudflare tunnel URL"
**Symptoms:**
- Message: `Failed to get Cloudflare tunnel URL. Check: tail -f .../data/logs/tunnel-prod-url.log` (or similar)
- Tunnel script exits before printing a URL
**Diagnosis:**
```bash
# Tunnel logs are under repo data/logs (same dir as session and CLI logs)
tail -f data/logs/tunnel-dev-url.log
# Or for prod
tail -f data/logs/tunnel-prod-url.log
```
**Solution:**
1. **Quick tunnel rate limits:** Cloudflare quick tunnels can hit 429. Use a named tunnel: set `CLOUDFLARE_TUNNEL_NAME=neotoma` and `CLOUDFLARE_TUNNEL_URL` (or `HOST_URL`) in `.env`.
2. **Wait longer:** The script polls for the URL for several seconds; if the tunnel is slow to start, increase retries or run `cloudflared tunnel --url http://localhost:8021` manually and copy the URL.
3. **URL file path:** The CLI and `scripts/setup-https-tunnel.sh` use repo `data/logs/tunnel-dev-url.txt` and `tunnel-prod-url.txt` (and `.log` for script output). Ensure `data/logs` exists; the CLI creates it when starting with `--tunnel`.
### Issue: TypeScript Compilation Errors
**Symptoms:**
- `npm run build:server` fails
- Type errors in IDE
- Import resolution errors
**Diagnosis:**
```bash
# Check TypeScript version
npx tsc --version
# Run type check
npm run type-check
```
**Solution:**
1. **Clean and reinstall:**
   ```bash
   rm -rf dist node_modules
   npm install
   npm run build:server
   ```
2. **Check tsconfig.json:**
   - Verify `include` paths are correct
   - Check `exclude` doesn't block needed files
3. **Restart TypeScript server** in IDE:
   - VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
## Runtime Issues
### Issue: Database Connection Timeout
**Symptoms:**
- Requests hang or timeout
- Error: `ETIMEDOUT` or `ECONNREFUSED`
- Database queries fail
**Diagnosis:**
```bash
# Test Supabase connection
curl https://your-project.supabase.co/rest/v1/ \
  -H "apikey: your-anon-key"
```
**Solution:**
1. **Verify Supabase project is active:**
   - Check Supabase dashboard
   - Projects pause after inactivity (free tier)
   - Resume project if paused
2. **Check network/firewall:**
   - Verify outbound HTTPS allowed
   - Check proxy settings if behind corporate firewall
3. **Verify credentials:**
   - Check `DEV_SUPABASE_URL` is correct
   - Verify `DEV_SUPABASE_SERVICE_KEY` is service_role key (not anon key)
4. **Check region:**
   - Ensure Supabase region matches your location
   - Consider moving project to closer region
### Issue: "Row Level Security policy violation"
**Symptoms:**
- API returns 403 Forbidden
- Error: `new row violates row-level security policy`
- Records not visible after creation
**Diagnosis:**
```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'records';
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```
**Solution:**
1. **Verify RLS policies exist:**
   - Run `supabase/schema.sql` to create policies
   - Check policies allow authenticated users
2. **Check authentication:**
   - Verify user is authenticated
   - Check JWT token is valid
   - Ensure `user_id` is set in token
3. **Verify user_id filtering:**
   - Check application layer filters by `user_id`
   - Verify RLS policies use `auth.uid()`
### Issue: File Upload Fails
**Symptoms:**
- Upload returns 500 error
- File not stored in Supabase Storage
- Error: `Storage bucket not found`
**Diagnosis:**
```bash
# Check Supabase Storage bucket exists
# In Supabase dashboard → Storage → Check required buckets exist
```
**Solution:**
1. **Create required storage buckets:**
   - Go to Supabase → Storage
   - Create bucket named `files` (for general file uploads)
   - Create bucket named `sources` (for `ingest_structured()` and source-based ingestion)
   - Set both as **private** buckets (for security; service_role handles access)
2. **Verify bucket permissions:**
   - Check bucket policies allow uploads
   - Verify service_role key has storage access
3. **Check file size:**
   - Verify file is under 50MB limit
   - Check `maxFileSize` configuration
### Issue: OCR Fails
**Symptoms:**
- Image upload succeeds but no text extracted
- Error: `OCR processing failed`
- `raw_text` is empty for images
**Diagnosis:**
```bash
# Check Tesseract.js is installed
npm list tesseract.js
```
**Solution:**
1. **Verify Tesseract.js installed:**
   ```bash
   npm install tesseract.js
   ```
2. **Check image format:**
   - Supported: JPG, PNG
   - Verify image is not corrupted
   - Check image has readable text
3. **Test OCR manually:**
   ```typescript
   import { recognize } from 'tesseract.js';
   const { data } = await recognize('path/to/image.png');
   console.log(data.text);
   ```
### Issue: Many "Entity snapshot computed" lines for one store
**Symptoms:**
- CLI watch (or activity log) shows dozens of "Entity snapshot computed" entries for the same entity ID after a single store (e.g. one task).
**Cause:**
- The backend can write the same entity snapshot row multiple times in quick succession (each upsert sets a new `computed_at`). The watch displays one line per such update, so repeated writes produce repeated lines.
**Solution:**
- The CLI watch deduplicates entity_snapshot events: it shows at most one "Entity snapshot computed" per entity per 2-second window. Ensure you are on a build that includes this behavior. If you still see many lines, the backend may be invoking snapshot computation in a loop; check for multiple store or interpretation calls for the same idempotency key or entity.
### Issue: Duplicate confirmation text in MCP response
**Symptoms:**
- After storing a task or entity, the agent response shows the same phrase twice (e.g. "Task created and stored:" in the thought and again as the section heading).
**Cause:**
- The assistant is repeating the same confirmation as both the thought summary and the structured output heading.
**Solution:**
- When summarizing store or entity results, do not use the same phrase for both the thought and the section heading. Use the thought for a brief status (e.g. "Task is created and stored. Summary below.") and use the heading only for the structured block, or omit the redundant heading.
## Integration Issues
### Issue: Plaid Link Token Expired
**Symptoms:**
- Plaid Link fails to initialize
- Error: `link_token expired`
**Solution:**
- Link tokens expire after 4 hours
- Create new link token before each Plaid Link session
- Don't cache or reuse link tokens
### Issue: Gmail OAuth Redirect URI Mismatch
**Symptoms:**
- OAuth flow fails
- Error: `redirect_uri_mismatch`
**Solution:**
1. **Verify redirect URI in Google Cloud Console:**
   - Must match exactly (no trailing slashes)
   - Check http vs https
   - Verify port matches (8080 for local dev)
2. **Update OAuth client settings:**
   - Add exact redirect URI: `http://localhost:8080/import/gmail/callback`
   - Save changes and wait 5-10 minutes for propagation
### Issue: External Provider Rate Limits
**Symptoms:**
- Sync fails with rate limit error
- Error: `rate_limit_exceeded` or `429 Too Many Requests`
**Solution:**
1. **Implement exponential backoff:**
   ```typescript
   async function syncWithRetry(provider, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await syncProvider(provider);
       } catch (error) {
         if (error.status === 429) {
           const delay = Math.pow(2, i) * 1000; // Exponential backoff
           await sleep(delay);
           continue;
         }
         throw error;
       }
     }
   }
   ```
2. **Reduce sync frequency:**
   - Increase time between syncs
   - Reduce `max_items` parameter
   - Use incremental syncs (not full)
3. **Check provider status:**
   - Verify provider API is operational
   - Check provider status page
## Performance Issues
### Issue: Slow Search Queries
**Symptoms:**
- Search takes >1 second
- Database queries are slow
- High CPU usage
**Diagnosis:**
```sql
-- Check if indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'records';
-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM records WHERE type = 'note';
```
**Solution:**
1. **Verify indexes exist:**
   - Run `supabase/schema.sql` to create indexes
   - Check GIN indexes on `type` and `properties`
2. **Optimize queries:**
   - Add `LIMIT` to queries
   - Use indexed columns in WHERE clauses
   - Avoid full table scans
3. **Check database size:**
   - Large tables may need partitioning (post-MVP)
   - Consider archiving old records
### Issue: High Memory Usage
**Symptoms:**
- Node process uses excessive memory
- Server crashes with OOM errors
**Diagnosis:**
```bash
# Check memory usage
node --max-old-space-size=4096 dist/index.js  # Increase limit
```
**Solution:**
1. **Limit concurrent operations:**
   - Implement request queuing
   - Limit concurrent file uploads
   - Batch database operations
2. **Optimize file processing:**
   - Stream large files (don't load into memory)
   - Process files in chunks
   - Clean up temporary files
3. **Check for memory leaks:**
   - Use Node.js memory profiler
   - Monitor memory usage over time
   - Fix unclosed connections or streams
## Diagnostic Commands
### Check Environment
```bash
# Verify Node.js version
node --version  # Should be v18+ or v20+
# Verify npm version
npm --version
# Check environment variables
env | grep SUPABASE
env | grep PLAID
```
### Check Database
```sql
-- In Supabase SQL Editor
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
-- Check record count
SELECT COUNT(*) FROM records;
-- Check recent records
SELECT id, type, created_at FROM records 
ORDER BY created_at DESC LIMIT 10;
```
### CLI-related issues
When debugging CLI-related issues, **always check the CLI log first.** In repo the default path is `<repo>/data/logs/cli.<pid>.log`; outside a repo, `~/.config/neotoma/cli.<pid>.log`. If the user ran with `--log-file <path>`, check that path. For session server output, check `<repo>/data/logs/session-dev.log` or `session-prod.log`. For tunnel issues, check `<repo>/data/logs/tunnel-*-url.log`. For the background API, run `neotoma api logs` or check `~/.config/neotoma/logs/api.log`. See `docs/developer/cli_reference.md` (Debugging and testing).

### Where to look for what (logs)
Neotoma does not write a single combined log. Use the right log for the component you are debugging:

| Component | Log path | Contains |
|-----------|----------|----------|
| Session server (interactive `neotoma`) | `<repo>/data/logs/session-dev.log`, `session-prod.log` | HTTP API and build process for that env; MCP/API activity. Use `tail -f` to stream. |
| Tunnel (when `neotoma --tunnel`) | `<repo>/data/logs/tunnel-dev-url.txt`, `tunnel-prod-url.txt` (URL), `tunnel-*-url.log` (script output) | Tunnel URL file and tunnel script stdout/stderr. |
| CLI | `<repo>/data/logs/cli.<pid>.log` (in repo) or `~/.config/neotoma/cli.<pid>.log`; or `--log-file <path>` | CLI process stdout/stderr (commands, errors). |
| Background API (`neotoma api start`) | `neotoma api logs` or `~/.config/neotoma/logs/api.log` | Background API process output. |

For a full picture across components, check all three (or the two that apply to your setup).

### Check Logs
```bash
# Development server logs
npm run dev:server  # Check console output
# Test output
npm test  # Check test results
# Type check output
npm run type-check  # Check for type errors
```
## Prevention
### Best Practices
1. **Always verify setup:**
   - Run `npm test` after environment changes
   - Verify database schema is applied
   - Check environment variables are set
2. **Use branch-aware ports:**
   - Use `npm run dev:full` for automatic port selection
   - Avoid hardcoded ports
3. **Monitor error logs:**
   - Check console output regularly
   - Set up error tracking (post-MVP)
4. **Test integrations:**
   - Use sandbox/test environments
   - Verify OAuth flows work
   - Test error handling
5. **Keep dependencies updated:**
   - Run `npm audit` regularly
   - Update dependencies when needed
   - Test after updates
## Agent Instructions
### When to Load This Document
Load when:
- Encountering setup or runtime errors
- Troubleshooting integration issues
- Diagnosing performance problems
- Debugging database connection issues
### Required Co-Loaded Documents
- `docs/developer/getting_started.md` — Initial setup procedures
- `docs/subsystems/errors.md` — Error codes and handling
- `docs/integrations/` — Integration-specific guides
### Constraints Agents Must Enforce
1. **Always verify environment first** — Check variables, credentials, network
2. **Use diagnostic commands** — Don't guess, verify
3. **Check logs** — Error messages provide clues
4. **When debugging CLI-related issues, always check the CLI log** — In repo: `<repo>/data/logs/cli.<pid>.log`; session: `<repo>/data/logs/session-dev.log` or `session-prod.log`; tunnel: `<repo>/data/logs/tunnel-*-url.log`; background API: `neotoma api logs` or `~/.config/neotoma/logs/api.log`
5. **Test incrementally** — Fix one issue at a time
6. **Document solutions** — Update this doc if new issues found
### Forbidden Patterns
- Guessing at solutions without diagnosis
- Skipping verification steps
- Modifying production without testing
- Ignoring error messages
- Bypassing security checks
