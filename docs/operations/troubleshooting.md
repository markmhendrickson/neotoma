# Troubleshooting Guide
*(Common Issues and Solutions)*

---

## Purpose

This document provides solutions for common development and runtime issues in Neotoma. It covers diagnostic procedures, error resolution, and preventive measures.

---

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

---

## Setup Issues

### Issue: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

**Symptoms:**
- Server exits immediately on startup
- Error: `Missing SUPABASE_URL or SUPABASE_SERVICE_KEY`

**Diagnosis:**
```bash
# Check environment variables
echo $DEV_SUPABASE_URL
echo $DEV_SUPABASE_SERVICE_KEY

# Or check .env file exists
ls -la .env.development
```

**Solution:**
1. Verify `.env.development` exists in project root
2. Check variable names: `DEV_SUPABASE_URL` and `DEV_SUPABASE_SERVICE_KEY`
3. Ensure no extra spaces or quotes around values
4. Restart terminal/IDE to reload environment variables
5. For GUI apps (macOS), load env explicitly:
   ```bash
   set -a; source .env.development; set +a
   ```

---

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

---

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
   HTTP_PORT=8081 npm run dev:http
   ```

3. **Or use branch-aware ports** (automatic port selection):
   ```bash
   npm run dev:full  # Automatically finds available ports
   ```

---

### Issue: TypeScript Compilation Errors

**Symptoms:**
- `npm run build` fails
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
   npm run build
   ```

2. **Check tsconfig.json:**
   - Verify `include` paths are correct
   - Check `exclude` doesn't block needed files

3. **Restart TypeScript server** in IDE:
   - VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

---

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

---

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

---

### Issue: File Upload Fails

**Symptoms:**
- Upload returns 500 error
- File not stored in Supabase Storage
- Error: `Storage bucket not found`

**Diagnosis:**
```bash
# Check Supabase Storage bucket exists
# In Supabase dashboard → Storage → Check "files" bucket exists
```

**Solution:**
1. **Create storage bucket:**
   - Go to Supabase → Storage
   - Create bucket named `files`
   - Set as **public** bucket

2. **Verify bucket permissions:**
   - Check bucket policies allow uploads
   - Verify service_role key has storage access

3. **Check file size:**
   - Verify file is under 50MB limit
   - Check `maxFileSize` configuration

---

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

---

## Integration Issues

### Issue: Plaid Link Token Expired

**Symptoms:**
- Plaid Link fails to initialize
- Error: `link_token expired`

**Solution:**
- Link tokens expire after 4 hours
- Create new link token before each Plaid Link session
- Don't cache or reuse link tokens

---

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

---

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

---

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

---

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

---

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

### Check Logs

```bash
# Development server logs
npm run dev:http  # Check console output

# Test output
npm test  # Check test results

# Type check output
npm run type-check  # Check for type errors
```

---

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

---

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
4. **Test incrementally** — Fix one issue at a time
5. **Document solutions** — Update this doc if new issues found

### Forbidden Patterns

- Guessing at solutions without diagnosis
- Skipping verification steps
- Modifying production without testing
- Ignoring error messages
- Bypassing security checks









