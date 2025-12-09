# Release Orchestrator

_(Multi-Agent Orchestration for Parallel Release Execution)_

---

## Overview

The Release Orchestrator spawns and coordinates worker agents for parallel Feature Unit execution using Cursor's Cloud Agents API. This reduces calendar time by 25-35% compared to sequential execution.

---

## Prerequisites

1. **Cursor Cloud Subscription**: Requires Background Agents enabled
2. **API Credentials**: Configure environment variables:
   ```bash
   export CURSOR_CLOUD_API_URL="https://api.cursor.com/v1"
   export CURSOR_CLOUD_API_KEY="your_api_key_here"
   export REPO_URL="https://github.com/your-org/neotoma"
   export RELEASE_BRANCH="main"  # Optional, defaults to 'main'
   ```

3. **Release Manifest**: Ensure `manifest.yaml` has `execution_strategy.type: "multi_agent"`

---

## Usage

### Start Orchestrator

```bash
node scripts/release_orchestrator.js <release_id>
```

**Example:**

```bash
node scripts/release_orchestrator.js v0.1.0
```

### Monitor Execution

The orchestrator creates a status file at:

```
docs/releases/in_progress/<release_id>/agent_status.json
```

Monitor progress:

```bash
# Watch status file
watch -n 5 cat docs/releases/in_progress/v0.1.0/agent_status.json

# Or use jq for formatted output
watch -n 5 'cat docs/releases/in_progress/v0.1.0/agent_status.json | jq .'
```

---

## How It Works

### 1. Orchestrator Startup

- Loads `manifest.yaml` and `execution_schedule.md`
- Initializes `agent_status.json`
- Checks execution strategy (must be `"multi_agent"`)

### 2. Batch Execution

For each batch in execution schedule:

1. **Check Dependencies**: Verify previous batches complete
2. **Check Limits**: Ensure `max_parallel_fus` not exceeded
3. **Spawn Workers**: Create background agents for each FU in batch
4. **Monitor Progress**: Poll status file every minute
5. **Run Tests**: Execute integration tests after batch completion
6. **Mark Complete**: Update batch status to `completed`

### 3. Worker Agents

Each worker agent:

- Loads FU specification
- Executes Feature Unit workflow
- Updates status file every 5-10 minutes
- Reports completion or failures

---

## Status File Structure

```json
{
  "release_id": "v0.1.0",
  "orchestrator": {
    "agent_id": "orch_1234567890",
    "started_at": "2024-01-15T10:00:00Z",
    "current_batch": 0,
    "status": "running"
  },
  "batches": [
    {
      "batch_id": 0,
      "status": "running",
      "started_at": "2024-01-15T10:00:00Z",
      "feature_units": [
        {
          "fu_id": "FU-100",
          "worker_agent_id": "worker_1234567890_abc",
          "status": "running",
          "progress": 0.3,
          "started_at": "2024-01-15T10:00:05Z",
          "last_update": "2024-01-15T10:15:00Z"
        }
      ]
    }
  ],
  "errors": [],
  "completed_fus": []
}
```

---

## Configuration

### Manifest Configuration

Add to `docs/releases/in_progress/<release_id>/manifest.yaml`:

```yaml
execution_strategy:
  type: "multi_agent"  # or "sequential"
  max_parallel_fus: 3
  max_high_risk_in_parallel: 1
  agent_spawning:
    enabled: true
    status_tracking: "file"  # or "api"
    status_file: "docs/releases/in_progress/v0.1.0/agent_status.json"
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CURSOR_CLOUD_API_URL` | Cursor Cloud API endpoint | Yes |
| `CURSOR_CLOUD_API_KEY` | API authentication key | Yes |
| `REPO_URL` | Repository URL | Yes |
| `RELEASE_BRANCH` | Branch to execute on | No (default: `main`) |

---

## Failure Handling

### Worker Agent Failures

- **Timeout**: Agent exceeds `max_duration_minutes` → Mark as failed
- **Stale Status**: No update for 15+ minutes → Mark as stale
- **Error Reported**: Worker sets `status: "failed"` → Handle failure

### Recovery Strategies

1. **Automatic Retry**: P0 FUs retry up to 3 times
2. **Single Retry**: P1 FUs retry once
3. **Escalation**: P2 FUs or repeated failures → Human intervention

### Batch Failures

If integration tests fail:

1. Stop all active workers in batch
2. Report failure to orchestrator
3. Present options to user:
   - Fix and retry batch
   - Skip batch (defer FUs)
   - Abort release

---

## Troubleshooting

### Orchestrator Not Starting

**Check:**
- `execution_strategy.type` is `"multi_agent"` in manifest
- API credentials are set
- Execution schedule file exists

### Workers Not Spawning

**Check:**
- API credentials are valid
- Cursor Cloud subscription has Background Agents enabled
- Execution limits not exceeded

### Status File Not Updating

**Check:**
- File permissions (workers need write access)
- File locking (concurrent updates)
- Worker agents are running

### Batch Stuck

**Check:**
- Worker agents are still active (poll API)
- Dependencies are complete
- No errors in status file

---

## Implementation Status

### ✅ Completed

- Orchestrator script structure
- Status file management
- Batch dependency checking
- Execution limit enforcement
- Worker agent instructions template

### ⏳ TODO (Phase 1)

- [ ] Integrate actual Cursor Cloud Agents API calls
- [ ] Implement file locking for status updates
- [ ] Add retry logic for failed FUs
- [ ] Add integration test execution
- [ ] Add monitoring dashboard

### ⏳ TODO (Phase 2)

- [ ] API-based status tracking (instead of file)
- [ ] Dynamic load balancing
- [ ] Resource monitoring
- [ ] Cost optimization

---

## Related Documentation

- `docs/feature_units/standards/multi_agent_orchestration.md` — Complete specification
- `docs/feature_units/standards/release_workflow.md` — Release workflow
- `scripts/worker_agent_template.md` — Worker agent instructions template

