# Entity Snapshot Monitoring

## Overview

Entity snapshots are computed from observations using the observation reducer. Due to timing issues during entity creation, snapshots may become stale (showing `observation_count=0` but observations actually exist).

This monitoring infrastructure detects and fixes stale snapshots automatically.

## Problem

**Root cause:** Race condition during entity creation where:
1. Entity is created
2. Initial snapshot computed (empty, no observations yet)
3. Observation created shortly after (milliseconds later)
4. Snapshot never recomputed

**Symptom:** Entity snapshot shows `observation_count: 0` and empty snapshot data, but observations exist in the database.

## Monitoring Infrastructure

### 1. Check Script (`check_stale_snapshots.ts`)

**Purpose:** Quick check for stale snapshots (read-only)

```bash
npm run check:snapshots
```

**What it does:**
- Queries all snapshots with `observation_count = 0`
- Checks if observations actually exist for those entities
- Reports count of stale snapshots (no fixes)

### 2. Monitor & Fix Script (`monitor_and_fix_snapshots.ts`)

**Purpose:** Detect and automatically fix stale snapshots

```bash
npm run monitor:snapshots
```

**What it does:**
- Detects stale snapshots
- Recomputes snapshots using observation reducer
- Saves updated snapshots to database
- Provides detailed summary of actions taken

**Exit codes:**
- `0`: Success (no stale snapshots or all fixed)
- `1`: Errors encountered during fixing

### 3. GitHub Action (`.github/workflows/monitor-snapshots.yml`)

**Purpose:** Automated monitoring every 6 hours

**What it does:**
- Runs `npm run monitor:snapshots` on schedule
- Creates GitHub issue if stale snapshots detected
- Labels: `bug`, `monitoring`, `snapshots`

**Schedule:**
- Every 6 hours: `0 */6 * * *`
- Manual trigger: Via GitHub Actions UI

### 4. MCP Health Check Action (`health_check_snapshots`)

**Purpose:** Real-time health check via MCP protocol

```typescript
// Check only (no fixes)
await mcp_neotoma.health_check_snapshots({});

// Check and auto-fix
await mcp_neotoma.health_check_snapshots({ auto_fix: true });
```

**Response:**
```json
{
  "healthy": false,
  "message": "Found 1 stale snapshots",
  "checked": 5,
  "stale": 1,
  "stale_snapshots": [
    {
      "entity_id": "ent_...",
      "entity_type": "contact",
      "observation_count_snapshot": 0,
      "observation_count_actual": 1
    }
  ]
}
```

## Usage Scenarios

### Scenario 1: Proactive Monitoring

**Setup GitHub Action** (already configured):
- Runs every 6 hours automatically
- Creates issues when problems detected
- No manual intervention needed

### Scenario 2: Manual Check

```bash
# Check for stale snapshots (read-only)
npm run check:snapshots

# Fix stale snapshots
npm run monitor:snapshots
```

### Scenario 3: Integration with MCP Client

```typescript
// Example: Health check in CI/CD pipeline
const health = await mcp_neotoma.health_check_snapshots({});

if (!health.healthy) {
  console.error(`⚠️ ${health.stale} stale snapshots detected`);
  
  // Auto-fix
  await mcp_neotoma.health_check_snapshots({ auto_fix: true });
}
```

### Scenario 4: Cron Job (Production)

Add to system cron:

```bash
# Every 5 minutes
*/5 * * * * cd /path/to/neotoma && npm run monitor:snapshots >> /var/log/snapshot-monitor.log 2>&1
```

## Alerting

### GitHub Issues

When stale snapshots are detected by GitHub Action:
- Issue created automatically
- Title: "⚠️ Stale Entity Snapshots Detected"
- Labels: `bug`, `monitoring`, `snapshots`
- Contains workflow run link for debugging

### Logs

All monitoring scripts log to console:
- ✅ Success messages (green)
- ⚠️  Warning messages (yellow)
- ❌ Error messages (red)

**Log locations:**
- GitHub Actions: Workflow run logs
- Cron jobs: `/var/log/snapshot-monitor.log` (if configured)
- Manual runs: Console output

## Metrics

Each monitoring run reports:
- **Checked:** Total snapshots with `observation_count=0`
- **Stale:** Snapshots that have observations but show 0
- **Fixed:** Successfully recomputed snapshots
- **Errors:** Failed recomputation attempts

## Prevention

### Application-Level Prevention

The `storeStructuredInternal` method (MCP store action) always computes snapshots after creating observations:

```typescript
// In src/server.ts (lines 3612-3677)
for (const createdEntity of createdEntities) {
  // Get all observations
  const { data: allObservations } = await supabase
    .from("observations")
    .select("*")
    .eq("entity_id", createdEntity.entityId);
  
  // Compute snapshot
  const snapshot = await observationReducer.computeSnapshot(
    createdEntity.entityId,
    allObservations
  );
  
  // Save snapshot
  await supabase.from("entity_snapshots").upsert(snapshot);
}
```

This ensures snapshots are created with observation data when using MCP store action.

### Future Improvements

1. **Database Trigger:** Implement Postgres trigger to recompute snapshots when observations are inserted
2. **Real-time Monitoring:** WebSocket-based health monitoring dashboard
3. **Metrics Dashboard:** Grafana/Prometheus integration for snapshot health metrics

## Troubleshooting

### Issue: Monitoring script finds no stale snapshots but data looks wrong

**Solution:** Check if snapshots have `observation_count > 0` but data is outdated. This monitoring only detects `observation_count=0` cases.

### Issue: Auto-fix fails for some entities

**Check:**
1. Schema registry has active schema for entity type
2. Observations have valid field data
3. Reducer config is correct

**Debug:**
```bash
# Check specific entity
npx tsx scripts/recompute_bob.ts  # Replace bob with your entity
```

### Issue: GitHub Action not running

**Check:**
1. Workflow file exists: `.github/workflows/monitor-snapshots.yml`
2. Repository secrets configured: `DEV_SUPABASE_URL`, `DEV_SUPABASE_SERVICE_KEY`
3. GitHub Actions enabled for repository

## Related Documents

- `docs/subsystems/observation_architecture.md` - Observation architecture
- `docs/subsystems/reducer.md` - Reducer patterns and merge strategies
- `scripts/monitor_and_fix_snapshots.ts` - Monitoring implementation
- `scripts/check_stale_snapshots.ts` - Check-only implementation
