# Multi-Agent Orchestration for Release Execution

_(Using Cursor Background Agents API for Parallel Batch Execution)_

---

## Purpose

This document specifies how to execute release builds using Cursor's Background Agents API, enabling one orchestrator agent to spawn multiple worker agents for parallel Feature Unit execution within batches. This reduces calendar time by 25-35% compared to sequential execution.

**Integration:** Extends `release_workflow.md` Step 1 (Execute FU Batches) with programmatic agent spawning.

---

## Overview

### Architecture

```
Orchestrator Agent (Main Session)
  ├── Batch 0: Spawns 3 worker agents
  │   ├── Worker Agent A → FU-100
  │   ├── Worker Agent B → FU-300
  │   └── Worker Agent C → FU-700
  ├── Batch 1: Spawns 2 worker agents
  │   ├── Worker Agent A → FU-101
  │   └── Worker Agent B → FU-102
  └── Batch 2: Spawns 1 worker agent
      └── Worker Agent A → FU-103
```

**Key Components:**

1. **Orchestrator Agent**: Main Cursor session managing batch execution
2. **Worker Agents**: Background agents spawned via Cloud Agents API
3. **Status Tracking**: Shared state (file-based or API) for coordination
4. **Failure Handling**: Retry logic and rollback across agents

---

## Prerequisites

### Cursor Setup

1. **Cloud Agents API Access**: Requires Cursor Cloud subscription with Background Agents enabled
2. **API Credentials**: Configured in environment or Cursor settings
3. **Repository Access**: Worker agents need read/write access to repository

### Repository Setup

1. **Status Tracking**: Shared status file (e.g., `docs/releases/in_progress/{release_id}/agent_status.json`)
2. **Worktree Support**: Optional but recommended for isolation (`.cursor/worktrees.json` already configured)
3. **Execution Limits**: Enforced from `manifest.yaml` (`max_parallel_fus`, `max_high_risk_in_parallel`)

---

## Agent Spawning Strategy

### 1. Batch Execution Flow

**Orchestrator Agent Actions:**

```typescript
// Pseudo-code for orchestrator logic
for (const batch of executionSchedule.batches) {
  // 1. Check execution limits
  const activeAgents = getActiveWorkerAgents();
  const availableSlots = max_parallel_fus - activeAgents.length;
  
  if (batch.fus.length > availableSlots) {
    // Split batch into sub-batches respecting limits
    const subBatches = splitBatch(batch, availableSlots);
    await executeSubBatchesSequentially(subBatches);
  } else {
    // Spawn agents for all FUs in batch
    const workerAgents = await spawnWorkerAgents(batch.fus);
    await waitForBatchCompletion(workerAgents);
  }
  
  // 2. Run integration tests
  await runIntegrationTests(batch);
  
  // 3. Update status
  await updateBatchStatus(batch.id, 'completed');
}
```

### 2. Worker Agent Spawning

**API Call Pattern:**

```typescript
// Spawn worker agent for single FU
async function spawnWorkerAgent(fuId: string, batchId: number): Promise<string> {
  const agentId = await cursorCloudAPI.createBackgroundAgent({
    name: `FU-${fuId}-Batch-${batchId}`,
    repository: process.env.REPO_URL,
    branch: process.env.RELEASE_BRANCH || 'main',
    instructions: generateAgentInstructions(fuId, batchId),
    environment: {
      FU_ID: fuId,
      BATCH_ID: batchId.toString(),
      RELEASE_ID: process.env.RELEASE_ID,
      STATUS_FILE: `docs/releases/in_progress/${process.env.RELEASE_ID}/agent_status.json`,
    },
    max_duration_minutes: estimateFUDuration(fuId) + 30, // Buffer
  });
  
  // Register agent in status tracking
  await registerAgent(agentId, fuId, batchId);
  
  return agentId;
}
```

**Agent Instructions Template:**

```markdown
You are a worker agent executing Feature Unit {{FU_ID}} in Batch {{BATCH_ID}} for Release {{RELEASE_ID}}.

**Your Task:**
1. Load FU specification: `docs/feature_units/completed/{{FU_ID}}/FU-{{FU_ID}}_spec.md` or `docs/specs/MVP_FEATURE_UNITS.md`
2. Execute Feature Unit workflow:
   - Check if FU spec exists (if not, create it)
   - If UI FU and no prototype, create prototype
   - Run implementation workflow
   - Run tests (unit, integration, E2E)
   - Update status file: `{{STATUS_FILE}}`
3. Report completion:
   - Update status: `{"fu_id": "{{FU_ID}}", "status": "completed", "timestamp": "..."}`
   - Report any errors or blockers

**Constraints:**
- Follow all constraints from `docs/foundation/agent_instructions.md`
- Update status file atomically (use file locking)
- Do not modify FUs assigned to other agents
- Report failures immediately (don't retry indefinitely)
```

### 3. Status Tracking

**Shared Status File Structure:**

```json
{
  "release_id": "v0.1.0",
  "orchestrator": {
    "agent_id": "orch_abc123",
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
          "worker_agent_id": "worker_xyz789",
          "status": "running",
          "started_at": "2024-01-15T10:00:05Z",
          "progress": 0.3,
          "last_update": "2024-01-15T10:15:00Z"
        },
        {
          "fu_id": "FU-300",
          "worker_agent_id": "worker_def456",
          "status": "running",
          "started_at": "2024-01-15T10:00:05Z",
          "progress": 0.1,
          "last_update": "2024-01-15T10:10:00Z"
        }
      ]
    }
  ],
  "errors": [],
  "completed_fus": []
}
```

**Status Update Protocol:**

- **Atomic Updates**: Use file locking or append-only log
- **Update Frequency**: Worker agents update every 5-10 minutes
- **Completion Signal**: Worker sets `status: "completed"` and `progress: 1.0`

---

## Coordination Mechanism

### 1. Shared State Management

**File-Based (Recommended for MVP):**

- Single JSON file: `docs/releases/in_progress/{release_id}/agent_status.json`
- File locking: Use `flock` (Unix) or equivalent for atomic updates
- Append-only log: `agent_status.log` for audit trail

**API-Based (Future Enhancement):**

- REST API endpoint for status updates
- WebSocket for real-time updates
- Database-backed for multi-orchestrator scenarios

### 2. Communication Patterns

**Orchestrator → Worker:**

- **Spawn**: API call to create background agent with instructions
- **Monitor**: Poll status file or API for updates
- **Cancel**: API call to terminate agent if needed

**Worker → Orchestrator:**

- **Status Updates**: Write to shared status file
- **Completion**: Set `status: "completed"` in status file
- **Errors**: Append to `errors` array in status file

**Worker ↔ Worker:**

- **Read-Only**: Workers can read status file to see other FUs' progress
- **No Direct Communication**: Workers don't communicate directly (prevents conflicts)

### 3. Dependency Resolution

**Pre-Batch Checks:**

```typescript
async function canStartBatch(batch: Batch): Promise<boolean> {
  // Check all dependencies are complete
  for (const dep of batch.dependencies) {
    const depStatus = await getFUStatus(dep);
    if (depStatus !== 'completed') {
      return false;
    }
  }
  
  // Check execution limits
  const activeAgents = await getActiveWorkerAgents();
  if (activeAgents.length >= max_parallel_fus) {
    return false; // Wait for slot
  }
  
  return true;
}
```

---

## Failure Handling

### 1. Worker Agent Failures

**Failure Detection:**

- **Timeout**: Agent exceeds `max_duration_minutes`
- **Status Stale**: No status update for 15+ minutes
- **Error Reported**: Worker sets `status: "failed"` in status file

**Recovery Strategies:**

```typescript
async function handleWorkerFailure(agentId: string, fuId: string): Promise<void> {
  // 1. Log failure
  await logFailure(agentId, fuId, 'Worker agent failed');
  
  // 2. Determine retry strategy
  const retryCount = await getRetryCount(fuId);
  const fuSpec = await loadFUSpec(fuId);
  
  if (retryCount < 3 && fuSpec.priority === 'P0') {
    // Retry with new agent
    await spawnWorkerAgent(fuId, batchId);
  } else if (fuSpec.priority === 'P1' && retryCount < 1) {
    // Single retry for P1
    await spawnWorkerAgent(fuId, batchId);
  } else {
    // Escalate to human
    await escalateToHuman(fuId, `Failed after ${retryCount} retries`);
    await haltBatchExecution(batchId);
  }
}
```

### 2. Batch-Level Failures

**Integration Test Failures:**

```typescript
async function handleBatchFailure(batch: Batch): Promise<void> {
  // 1. Stop all active workers in batch
  await cancelActiveWorkers(batch);
  
  // 2. Report to orchestrator
  await updateBatchStatus(batch.id, 'failed');
  
  // 3. Present options to user
  await promptUser({
    message: `Batch ${batch.id} failed integration tests`,
    options: [
      'Fix and retry batch',
      'Skip batch (defer FUs)',
      'Abort release'
    ]
  });
}
```

### 3. Orchestrator Failures

**Recovery:**

- **Status File Persistence**: Orchestrator can resume from status file
- **Checkpointing**: Save orchestrator state periodically
- **Manual Resume**: Human can restart orchestrator with same release_id

---

## Integration with Release Workflow

### Modified Step 1: Execute FU Batches

**Original Workflow** (`release_workflow.md` line 570-604):

```markdown
1. For each batch in execution schedule (in order):
   a. Start all FUs in batch (in parallel if multiple)
   b. Wait for all FUs in batch to complete
   c. Run cross-FU integration tests
   d. Update Release status
```

**Enhanced Workflow (Multi-Agent):**

```markdown
1. For each batch in execution schedule (in order):
   a. **Check execution limits** (max_parallel_fus, max_high_risk_in_parallel)
   b. **Spawn worker agents** for all FUs in batch (via Cloud Agents API)
   c. **Monitor worker agents** (poll status file, handle failures)
   d. **Wait for all FUs in batch to complete** (all workers report completion)
   e. **Run cross-FU integration tests** (orchestrator executes)
   f. **Update Release status** (mark batch complete, update progress)
   g. **Cleanup worker agents** (terminate completed agents)
```

### Configuration

**Add to `manifest.yaml`:**

```yaml
execution_strategy:
  type: "multi_agent" # or "sequential"
  max_parallel_fus: 3
  max_high_risk_in_parallel: 1
  agent_spawning:
    enabled: true
    api_endpoint: "${CURSOR_CLOUD_API_URL}"
    api_key: "${CURSOR_CLOUD_API_KEY}"
    status_tracking: "file" # or "api"
    status_file: "docs/releases/in_progress/{release_id}/agent_status.json"
```

---

## Implementation Steps

### Phase 1: Basic Spawning (MVP)

1. **Setup Cloud Agents API**:
   - Configure API credentials
   - Test agent spawning with simple task
   - Verify agent can access repository

2. **Implement Status Tracking**:
   - Create `agent_status.json` structure
   - Implement file locking for atomic updates
   - Add status update functions

3. **Implement Orchestrator Logic**:
   - Batch iteration with dependency checks
   - Agent spawning for each FU in batch
   - Status monitoring loop
   - Integration test execution

4. **Implement Worker Agent Instructions**:
   - Template for agent instructions
   - Status update protocol
   - Error reporting format

### Phase 2: Failure Handling

1. **Timeout Detection**: Monitor agent duration
2. **Retry Logic**: Implement retry strategies per priority
3. **Error Escalation**: Human notification for critical failures
4. **Rollback**: Cancel active agents on batch failure

### Phase 3: Optimization

1. **Dynamic Load Balancing**: Adjust agent count based on FU complexity
2. **Resource Monitoring**: Track agent resource usage
3. **Cost Optimization**: Terminate agents promptly after completion
4. **API-Based Status**: Migrate from file-based to API-based status tracking

---

## Example: v0.1.0 Release Execution

**Execution Schedule:**

```
Batch 0.5: FU-050, FU-051 (parallel)
Batch 0.6: FU-052, FU-053, FU-054 (parallel)
Batch 1: FU-100
Batch 2: FU-101, FU-102 (parallel)
Batch 3: FU-103
Batch 4: FU-200, FU-201, FU-202, FU-203, FU-204, FU-205, FU-206 (parallel, max 3)
Batch 5: FU-055, FU-056, FU-057, FU-058, FU-059, FU-061 (parallel, max 3)
```

**Multi-Agent Execution:**

```
Orchestrator starts:
  → Batch 0.5: Spawns 2 agents (FU-050, FU-051)
  → Waits for completion (2-3 days)
  → Batch 0.6: Spawns 3 agents (FU-052, FU-053, FU-054)
  → Waits for completion (2-3 days)
  → Batch 1: Spawns 1 agent (FU-100)
  → Waits for completion (1-2 weeks)
  → Batch 2: Spawns 2 agents (FU-101, FU-102)
  → Waits for completion (2-3 weeks)
  → Batch 3: Spawns 1 agent (FU-103)
  → Waits for completion (2-3 weeks)
  → Batch 4: Spawns 3 agents (FU-200, FU-201, FU-202), then 3 more (FU-203, FU-204, FU-205), then 1 (FU-206)
  → Waits for completion (2-3 weeks)
  → Batch 5: Spawns 3 agents (FU-055, FU-056, FU-057), then 3 more (FU-058, FU-059, FU-061)
  → Waits for completion (2-3 weeks)
```

**Calendar Time Savings:**

- **Sequential**: ~14-20 weeks
- **Multi-Agent**: ~8-12 weeks (40% reduction)

---

## Monitoring and Observability

### Status Dashboard

**Real-Time View:**

- Active worker agents (count, FU assignments)
- Batch progress (current batch, completion %)
- FU status (running, completed, failed)
- Error log (recent failures, retries)

### Metrics

- **Agent Utilization**: Active agents / max_parallel_fus
- **Average FU Duration**: Per FU type, per batch
- **Failure Rate**: Failures / total FUs
- **Retry Rate**: Retries / total FUs
- **Calendar Time Savings**: Actual vs sequential estimate

### Alerts

- **Agent Timeout**: Worker exceeds max duration
- **Batch Stalled**: No progress for 30+ minutes
- **High Failure Rate**: >20% failures in batch
- **Integration Test Failure**: Batch integration tests fail

---

## Security Considerations

### API Credentials

- **Storage**: Use environment variables or secure secret management
- **Rotation**: Rotate API keys periodically
- **Scope**: Limit API key permissions to necessary operations

### Repository Access

- **Read-Only**: Consider read-only access for worker agents initially
- **Branch Protection**: Use release branch with protection rules
- **Audit Log**: Track all agent actions (commits, file changes)

### Status File Security

- **Permissions**: Restrict write access to orchestrator and workers
- **Validation**: Validate status file updates (prevent tampering)
- **Backup**: Regular backups of status file

---

## Testing Strategy

### Unit Tests

- Status file read/write operations
- Agent spawning logic
- Dependency resolution
- Failure detection

### Integration Tests

- End-to-end batch execution (single batch)
- Multi-batch execution
- Failure recovery (simulated agent failure)
- Status file consistency under concurrent updates

### E2E Tests

- Full release execution (small release, 2-3 batches)
- Failure scenarios (agent timeout, integration test failure)
- Recovery scenarios (orchestrator restart, batch retry)

---

## Related Documentation

- `docs/feature_units/standards/release_workflow.md` — Base release workflow
- `docs/releases/in_progress/{release_id}/manifest.yaml` — Execution limits and configuration
- `docs/releases/in_progress/{release_id}/execution_schedule.md` — Batch definitions
- [Cursor Background Agents Documentation](https://docs.cursor.com/en/background-agents)
- [Cursor Cloud Agents API](https://docs.cursor.com/en/cloud-agents-api)

---

## Agent Instructions

### When to Load This Document

Load when:
- Executing release with `execution_strategy.type: "multi_agent"` in manifest
- Implementing multi-agent orchestration
- Debugging agent spawning or coordination issues
- Optimizing release execution time

### Required Co-Loaded Documents

- `docs/feature_units/standards/release_workflow.md` (base workflow)
- `docs/releases/in_progress/{release_id}/manifest.yaml` (execution limits)
- `docs/releases/in_progress/{release_id}/execution_schedule.md` (batch definitions)

### Constraints Agents Must Enforce

1. **ALWAYS respect execution limits** (`max_parallel_fus`, `max_high_risk_in_parallel`)
2. **ALWAYS wait for batch dependencies** before spawning agents
3. **ALWAYS update status file atomically** (use file locking)
4. **ALWAYS run integration tests** after batch completion
5. **ALWAYS handle failures gracefully** (retry, escalate, or abort)
6. **NEVER spawn agents** for FUs with incomplete dependencies
7. **NEVER exceed max_parallel_fus** limit (split batches if needed)

### Forbidden Patterns

- Spawning agents without checking execution limits
- Bypassing dependency checks
- Modifying status file without locking
- Ignoring agent failures
- Exceeding max_parallel_fus limit
- Spawning agents for FUs in wrong batch order

