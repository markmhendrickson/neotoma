# Release Orchestrator
## Overview
The Release Orchestrator supports two execution modes:
1. **Single-Agent Mode**: Executes Feature Units sequentially with model recommendations based on release complexity
2. **Multi-Agent Mode**: Spawns and coordinates worker agents for parallel Feature Unit execution using Cursor's Cloud Agents API, reducing calendar time by 25-35% compared to sequential execution
## Prerequisites
### For Single-Agent Mode
- No special prerequisites required
- Model recommendation provided based on release analysis
### For Multi-Agent Mode
1. **Cursor Cloud Subscription**: Requires Background Agents enabled
2. **API Credentials**: Configure environment variables:
   ```bash
   export CURSOR_CLOUD_API_URL="https://api.cursor.com/v1"
   export CURSOR_CLOUD_API_KEY="your_api_key_here"
   export REPO_URL="https://github.com/your-org/neotoma"
   export RELEASE_BRANCH="main"  # Optional, defaults to 'main'
   ```
3. **Release Manifest**: Set `execution_strategy.type: "multi_agent"` in `manifest.yaml` (or select via prompt)
## Usage
### Start Orchestrator
```bash
node scripts/release_orchestrator.js <release_id>
```
**Example:**
```bash
node scripts/release_orchestrator.js v0.1.0
```
### Execution Strategy Selection
When you start the orchestrator, it will:
1. Check `manifest.yaml` for `execution_strategy.type`
2. If not set, **prompt you** to select execution mode:
   ```
   === Release Execution Strategy Selection ===
   
   How would you like to execute this release build?
     1. Single-agent (sequential execution)
     2. Multi-agent (parallel execution)
   
   Enter choice (1 or 2):
   ```
3. If single-agent is selected, display model recommendation:
   ```
   [INFO] Model recommendation: claude-3-5-sonnet-20241022 (medium tier)
   [INFO] Reasoning: Release has 8 FUs with average complexity 4.2, 2 high-risk FUs, 
         5 P0 FUs, 4 batches, and estimated 22.5 hours total. Medium tier model 
         recommended for balanced performance and cost.
   [INFO] Note: Use this model in your Cursor session for optimal execution
   ```
4. Save selected strategy to `manifest.yaml` for future runs
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
## How It Works
### 1. Orchestrator Startup
- Loads `manifest.yaml` and `execution_schedule.md`
- Initializes `agent_status.json`
- Prompts for execution strategy if not set in `manifest.yaml`
- For single-agent mode: Analyzes release and recommends model
- For multi-agent mode: Validates prerequisites (API credentials)
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
## Configuration
### Manifest Configuration
Add to `docs/releases/in_progress/<release_id>/manifest.yaml`:
```yaml
execution_strategy:
  type: "single_agent" # or "multi_agent" (defaults to prompt if not set)
  max_parallel_fus: 3  # For multi-agent mode only
  max_high_risk_in_parallel: 1  # For multi-agent mode only
  agent_spawning:  # For multi-agent mode only
    enabled: true
    status_tracking: "file" # or "api"
    status_file: "docs/releases/in_progress/v0.1.0/agent_status.json"
```
**Note:** If `execution_strategy.type` is not set, the orchestrator will prompt you to choose when starting the release build.
### Environment Variables
**For Multi-Agent Mode Only:**
| Variable               | Description               | Required             |
| ---------------------- | ------------------------- | -------------------- |
| `CURSOR_CLOUD_API_URL` | Cursor Cloud API endpoint | Yes (multi-agent)    |
| `CURSOR_CLOUD_API_KEY` | API authentication key    | Yes (multi-agent)    |
| `REPO_URL`             | Repository URL            | Yes (multi-agent)    |
| `RELEASE_BRANCH`       | Branch to execute on      | No (default: `dev`)  |
**For Single-Agent Mode:**
No special environment variables required. The orchestrator will recommend a model based on release complexity analysis.
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
## Troubleshooting
### Orchestrator Not Starting
**Check:**
- Execution schedule file exists
- For multi-agent mode: `execution_strategy.type` is `"multi_agent"` in manifest (or select via prompt)
- For multi-agent mode: API credentials are set (CURSOR_CLOUD_API_URL, CURSOR_CLOUD_API_KEY, REPO_URL)
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
