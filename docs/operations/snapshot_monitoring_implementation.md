# Snapshot Monitoring Implementation Summary

**Date:** 2026-01-28
**Issue:** Stale entity snapshots (observation_count=0 but observations exist)
**Status:** ✅ Implemented

## Problem Identified

Bob's contact entity had a timing race condition:
1. Entity created: `08:36:00.027+00:00`
2. Snapshot computed (empty): `08:36:00.027+00:00`
3. Observation created: `08:36:00.169+00:00` (142ms later)
4. Snapshot never updated

**Result:** Snapshot showed `observation_count: 0` and empty data, but observation with email existed.

## Solution Implemented

### 1. Detection Script ✅

**File:** `scripts/check_stale_snapshots.ts`

**Purpose:** Read-only check for stale snapshots

**Usage:**
```bash
npm run check:snapshots
```

**What it does:**
- Queries snapshots with `observation_count = 0`
- Checks if observations exist
- Reports count (no fixes)

### 2. Monitor & Fix Script ✅

**File:** `scripts/monitor_and_fix_snapshots.ts`

**Purpose:** Detect and automatically fix stale snapshots

**Usage:**
```bash
npm run monitor:snapshots
```

**Features:**
- Detects stale snapshots
- Recomputes using observation reducer
- Saves updated snapshots
- Provides detailed summary
- Exit code 0 on success, 1 on errors

**Example Output:**
```
🔍 Monitoring snapshots for staleness...

⚠️  Stale snapshot detected: ent_8aca4ec27d6bf99b404c27c4 (contact)
   Snapshot observation_count: 0
   Actual observations: 1
   🔧 Recomputing snapshot...
   ✅ Fixed! New observation_count: 1

📊 Summary:
Total snapshots checked: 5
Stale snapshots found: 1
Successfully fixed: 1
Errors encountered: 0
```

### 3. GitHub Action ✅

**File:** `.github/workflows/monitor-snapshots.yml`

**Schedule:** Every 6 hours (`0 */6 * * *`)

**Features:**
- Runs monitoring automatically
- Creates GitHub issue on failure
- Labels: `bug`, `monitoring`, `snapshots`
- Manual trigger available

**Environment:**
- `DEV_SUPABASE_URL` (secret)
- `DEV_SUPABASE_SERVICE_KEY` (secret)

### 4. MCP Health Check Action ✅

**Added to:** `src/server.ts`

**Tool:** `health_check_snapshots`

**Usage via MCP:**
```typescript
// Check only
await mcp_neotoma.health_check_snapshots({});

// Check and auto-fix
await mcp_neotoma.health_check_snapshots({ auto_fix: true });
```

**Response:**
```json
{
  "healthy": true/false,
  "message": "Status message",
  "checked": 5,
  "stale": 0,
  "stale_snapshots": []
}
```

**Features:**
- Real-time health check via MCP
- Optional auto-fix
- Detailed stale snapshot info
- Integration-ready (CI/CD, monitoring)

### 5. NPM Scripts ✅

**Added to `package.json`:**
```json
{
  "monitor:snapshots": "tsx scripts/monitor_and_fix_snapshots.ts",
  "check:snapshots": "tsx scripts/check_stale_snapshots.ts"
}
```

### 6. Documentation ✅

**File:** `docs/operations/snapshot_monitoring.md`

**Contains:**
- Overview of monitoring infrastructure
- Usage scenarios (proactive, manual, MCP, cron)
- Alerting setup (GitHub issues, logs)
- Metrics and troubleshooting
- Prevention strategies

## Testing Results

### Initial Check
```bash
npm run check:snapshots
# Result: ✅ No stale snapshots found
```

### Monitor Run
```bash
npm run monitor:snapshots
# Result: ✅ No snapshots with observation_count = 0 found
```

### Bob's Entity Fixed
Before fix:
- observation_count: 0
- snapshot: {}
- Email: not accessible

After fix:
- observation_count: 1
- snapshot: {name: "bob willis", email: "bob@willis.dev"}
- Email: ✅ bob@willis.dev

## Verification

Current state:
- ✅ No stale snapshots in database
- ✅ Bob's snapshot fixed and email accessible
- ✅ Monitoring scripts functional
- ✅ GitHub Action configured
- ✅ MCP health check added
- ✅ Documentation complete

## Integration Points

### Existing Code
The `storeStructuredInternal` method (lines 3227-3695 in `src/server.ts`) already computes snapshots after creating observations, preventing the issue for MCP store operations.

### New Safeguards
1. **GitHub Action:** Runs every 6 hours, creates issues if problems detected
2. **MCP Health Check:** Real-time monitoring via MCP protocol
3. **Manual Scripts:** On-demand checking and fixing

## Deployment Checklist

- [x] Scripts created and tested
- [x] NPM scripts added
- [x] GitHub Action configured
- [x] MCP health check implemented
- [x] Documentation written
- [ ] GitHub secrets configured (DEV_SUPABASE_URL, DEV_SUPABASE_SERVICE_KEY)
- [ ] MCP server restarted to expose health_check_snapshots tool
- [ ] GitHub Action tested (manual trigger)
- [ ] Cron job configured (optional, for production)

## Next Steps

1. **Test GitHub Action:**
   ```bash
   # Via GitHub UI: Actions -> Monitor Entity Snapshots -> Run workflow
   ```

2. **Test MCP Health Check:**
   ```bash
   # Restart MCP server, then:
   # await mcp_neotoma.health_check_snapshots({})
   ```

3. **Configure Cron (Optional):**
   ```bash
   # Every 5 minutes
   */5 * * * * cd /path/to/neotoma && npm run monitor:snapshots >> /var/log/snapshot-monitor.log 2>&1
   ```

4. **Monitor GitHub Issues:**
   - Watch for automated issues labeled `monitoring`, `snapshots`
   - Investigate root cause if issues created

## Maintenance

### Weekly
- Review GitHub issues created by monitoring
- Check monitoring logs for patterns

### Monthly
- Review stale snapshot frequency
- Evaluate if prevention measures are working
- Consider database trigger implementation if issues persist

## Related Files

**Implementation:**
- `scripts/check_stale_snapshots.ts`
- `scripts/monitor_and_fix_snapshots.ts`
- `scripts/recompute_bob.ts` (example fix script)
- `src/server.ts` (health_check_snapshots action)
- `.github/workflows/monitor-snapshots.yml`

**Documentation:**
- `docs/operations/snapshot_monitoring.md`
- `docs/operations/snapshot_monitoring_implementation.md` (this file)

**Related Code:**
- `src/server.ts` lines 3227-3695 (storeStructuredInternal - prevention)
- `src/reducers/observation_reducer.ts` (snapshot computation logic)
