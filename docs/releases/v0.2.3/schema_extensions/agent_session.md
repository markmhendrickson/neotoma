# Schema Extension: agent_session

## Overview

- **Entity Type**: `agent_session`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track agent session history in Neotoma

## Description

The `agent_session` entity type represents a single agent session, including actions taken, checkpoints reached, outcomes produced, and session duration. This enables cross-session continuity and session restoration.

## Use Cases

1. **Session Restoration**: Agents can restore context from previous sessions
2. **Checkpoint Management**: Track checkpoints reached during session execution
3. **Historical Analysis**: Understand what actions were taken in past sessions
4. **Outcome Tracking**: See what was accomplished in each session
5. **Performance Analysis**: Track session duration and efficiency

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `session_id` | string | Yes | Session identifier | Min length: 5 chars |
| `actions` | array<object> | Yes | Array of actions taken | Min length: 1 item |
| `checkpoints` | array<object> | No | Array of checkpoint states | Valid JSON objects |
| `outcomes` | array<object> | No | Array of outcomes | Valid JSON objects |
| `duration` | number | No | Session duration in seconds | Must be positive |
| `started_at` | timestamp | Yes | Session start timestamp | ISO 8601 format |
| `ended_at` | timestamp | No | Session end timestamp | ISO 8601 format, must be >= started_at |

### Action Object Schema

```json
{
  "type": "string",        // Action type (required)
  "result": "string",      // Action result (required): success, failure, warning
  "details": "object",     // Action details (optional)
  "timestamp": "timestamp" // Action timestamp (optional)
}
```

### Checkpoint Object Schema

```json
{
  "name": "string",        // Checkpoint name (required)
  "state": "object",       // Checkpoint state (optional)
  "timestamp": "timestamp" // Checkpoint timestamp (required)
}
```

### Outcome Object Schema

```json
{
  "type": "string",        // Outcome type (required)
  "id": "string",          // Related entity ID (optional)
  "details": "object"      // Outcome details (optional)
}
```

## Entity Resolution

**Resolution Strategy**: Match by `session_id` field

Agent Sessions are uniquely identified by their `session_id`. If multiple observations reference the same Session ID, they are resolved to a single entity.

**Example**: If an agent updates a session multiple times (e.g., adding checkpoints), all observations resolve to a single Agent Session entity.

## Example Payloads

### Minimal Payload

```json
{
  "session_id": "abc123",
  "actions": [
    {
      "type": "create_feature_unit",
      "result": "success"
    }
  ],
  "started_at": "2025-12-31T11:00:00Z"
}
```

### Complete Payload

```json
{
  "session_id": "abc123",
  "actions": [
    {
      "type": "create_feature_unit",
      "result": "success",
      "details": { "feature_unit_id": "FU-061" },
      "timestamp": "2025-12-31T11:15:00Z"
    },
    {
      "type": "run_tests",
      "result": "passed",
      "details": { "test_count": 42, "pass_count": 42 },
      "timestamp": "2025-12-31T11:30:00Z"
    },
    {
      "type": "commit",
      "result": "success",
      "details": { "commit_sha": "abc123def" },
      "timestamp": "2025-12-31T11:45:00Z"
    }
  ],
  "checkpoints": [
    {
      "name": "spec_complete",
      "state": { "feature_unit_id": "FU-061", "status": "planning" },
      "timestamp": "2025-12-31T11:15:00Z"
    },
    {
      "name": "tests_passing",
      "state": { "feature_unit_id": "FU-061", "status": "in_progress" },
      "timestamp": "2025-12-31T11:30:00Z"
    }
  ],
  "outcomes": [
    {
      "type": "feature_unit_created",
      "id": "FU-061",
      "details": { "description": "Add sources table" }
    }
  ],
  "duration": 3600,
  "started_at": "2025-12-31T11:00:00Z",
  "ended_at": "2025-12-31T12:00:00Z"
}
```

### Session Update (Adding Checkpoints)

```json
{
  "session_id": "abc123",
  "actions": [
    {
      "type": "create_feature_unit",
      "result": "success"
    },
    {
      "type": "run_tests",
      "result": "passed"
    }
  ],
  "checkpoints": [
    {
      "name": "spec_complete",
      "timestamp": "2025-12-31T11:15:00Z"
    },
    {
      "name": "tests_passing",
      "timestamp": "2025-12-31T11:30:00Z"
    },
    {
      "name": "committed",
      "timestamp": "2025-12-31T11:45:00Z"
    }
  ],
  "started_at": "2025-12-31T11:00:00Z"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Agent Sessions are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Agent Session object with required fields
2. Agent submits via `submit_agent_session` MCP action
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (match by `session_id`)
6. Neotoma computes entity snapshot

**No LLM extraction**: Agent Sessions are not extracted from raw documents; they are created directly by agents.

## Relationships

Agent Sessions can relate to:

- **Feature Unit**: Sessions may create or update Feature Units
- **Release**: Sessions may work on Releases
- **Agent Decision**: Decisions made during sessions
- **Validation Result**: Validation results generated during sessions

Relationships are tracked via:
- Outcomes array can reference Feature Unit IDs, Release IDs, etc.
- Timeline queries can find sessions related to specific entities

## Timeline Integration

Agent Sessions participate in timeline generation:

- **Session Start Event**: When session begins
- **Checkpoint Events**: When checkpoints are reached
- **Session End Event**: When session ends
- **Related Entity Timeline**: Sessions appear in timelines for related entities

**Timeline Query Example**:

```typescript
// Query sessions related to FU-061
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "FU-061",
  start_date: "2025-12-01",
  end_date: "2026-01-31"
});

// Returns events including:
// - 2025-12-01: Session abc123 started (agent_session entity)
// - 2025-12-01: Checkpoint: spec_complete
// - 2025-12-01: Checkpoint: tests_passing
// - 2025-12-01: Session abc123 ended
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `session_id` must be at least 5 characters
- `actions` array must have at least 1 item
- Each action must have `type` and `result` fields
- `started_at` must be valid ISO 8601 timestamp
- `ended_at` (if provided) must be >= `started_at`
- `duration` (if provided) must be positive

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "actions",
    "value": [],
    "expected": "min_length: 1",
    "message": "Actions array must have at least 1 item"
  }
}
```

### Consistency Validation

- `ended_at` must be >= `started_at`
- `duration` should match `ended_at - started_at` (warning only)
- Checkpoint timestamps should be between `started_at` and `ended_at`

## Usage Examples

### Recording a Session

```typescript
// Foundation agent records session
const result = await mcpClient.submit_agent_session({
  session_id: "abc123",
  actions: [
    {
      type: "create_feature_unit",
      result: "success",
      details: { feature_unit_id: "FU-061" },
      timestamp: new Date("2025-12-31T11:15:00Z").toISOString()
    },
    {
      type: "run_tests",
      result: "passed",
      timestamp: new Date("2025-12-31T11:30:00Z").toISOString()
    }
  ],
  checkpoints: [
    {
      name: "spec_complete",
      timestamp: new Date("2025-12-31T11:15:00Z").toISOString()
    }
  ],
  outcomes: [
    {
      type: "feature_unit_created",
      id: "FU-061"
    }
  ],
  duration: 3600,
  started_at: new Date("2025-12-31T11:00:00Z").toISOString(),
  ended_at: new Date("2025-12-31T12:00:00Z").toISOString()
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Updating Session (Adding Checkpoints)

```typescript
// Foundation agent updates session with new checkpoint
const result = await mcpClient.submit_agent_session({
  session_id: "abc123",
  actions: [
    {
      type: "create_feature_unit",
      result: "success"
    },
    {
      type: "run_tests",
      result: "passed"
    },
    {
      type: "commit",
      result: "success"
    }
  ],
  checkpoints: [
    {
      name: "spec_complete",
      timestamp: new Date("2025-12-31T11:15:00Z").toISOString()
    },
    {
      name: "committed",
      timestamp: new Date("2025-12-31T11:45:00Z").toISOString()
    }
  ],
  started_at: new Date("2025-12-31T11:00:00Z").toISOString()
});

// New observation created; entity snapshot updated
```

### Querying Sessions

```typescript
// Query recent sessions
const sessions = await mcpClient.query_agent_history({
  limit: 10,
  order_by: "started_at",
  order: "desc"
});

// Returns array of Agent Session entities
```

### Querying Specific Session

```typescript
// Query specific session by ID
const session = await mcpClient.query_agent_history({
  session_id: "abc123"
});

// Returns Agent Session entity with full history
```

### Restoring Checkpoint

```typescript
// Agent restores previous checkpoint
async function restoreCheckpoint(sessionId: string, checkpointName: string) {
  // Query session
  const session = await mcpClient.query_agent_history({
    session_id: sessionId
  });
  
  // Find checkpoint
  const checkpoint = session.snapshot.checkpoints.find(
    cp => cp.name === checkpointName
  );
  
  if (!checkpoint) {
    throw new Error(`Checkpoint ${checkpointName} not found`);
  }
  
  // Restore checkpoint state
  return checkpoint.state;
}
```

## Integration with Foundation Agents

### When to Record Sessions

Foundation agents record sessions:

1. **Session Start**: Record session ID when agent starts work
2. **Checkpoint Progress**: Update session with checkpoints as work progresses
3. **Session End**: Record final outcomes and duration when session ends
4. **Error Recovery**: Record failed actions for debugging

### Common Action Types

- `create_feature_unit`: Created Feature Unit
- `run_tests`: Ran tests
- `commit`: Committed changes
- `deploy`: Deployed release
- `validate`: Ran validation
- `analyze`: Performed analysis
- `document`: Created documentation

### Common Checkpoint Names

- `spec_complete`: Feature Unit spec complete
- `tests_passing`: All tests passing
- `committed`: Changes committed
- `deployed`: Release deployed
- `validated`: Validation passed

### Memory Access Pattern

```typescript
// Agent starts new session
async function startSession(sessionId: string) {
  // Check for previous session
  const previousSessions = await mcpClient.query_agent_history({
    limit: 1,
    order_by: "started_at",
    order: "desc"
  });
  
  if (previousSessions.length > 0) {
    const lastSession = previousSessions[0];
    console.log(`Previous session: ${lastSession.snapshot.session_id}`);
    console.log(`Last checkpoint: ${lastSession.snapshot.checkpoints[lastSession.snapshot.checkpoints.length - 1]?.name}`);
    
    // Optionally restore checkpoint
    if (shouldRestoreCheckpoint(lastSession)) {
      return restoreCheckpoint(lastSession.snapshot.session_id, lastCheckpointName);
    }
  }
  
  // Start new session
  return { session_id: sessionId, actions: [], checkpoints: [] };
}
```

## Notes

- **Immutability**: Agent Session observations are immutable; updates create new observations
- **Entity Resolution**: Multiple observations for same session ID resolve to single entity
- **Timeline**: Sessions and checkpoints appear in timelines for related entities
- **Cross-Session**: Sessions persist across agent restarts via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' sessions
- **Restoration**: Agents can restore checkpoint state from previous sessions

## Migration from .cursor/memory/

Agent Sessions currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/sessions/` directory
2. Extract session data from files
3. Map to `agent_session` schema
4. Submit via `submit_agent_session` MCP action
5. Verify entity resolution
6. Validate timeline integration

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
