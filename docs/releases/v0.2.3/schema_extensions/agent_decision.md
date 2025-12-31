# Schema Extension: agent_decision

## Overview

- **Entity Type**: `agent_decision`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track technical decisions made by agents in Neotoma

## Description

The `agent_decision` entity type represents a technical decision made by an agent during development. These decisions capture the rationale, context, and decision type for historical reference and cross-session continuity.

## Use Cases

1. **Decision History**: Track technical decisions across agent sessions
2. **Context Restoration**: Agents can query past decisions for context
3. **Rationale Tracking**: Understand why technical choices were made
4. **Timeline Analysis**: See when and why architectural decisions were made
5. **Cross-Agent Learning**: Agents can learn from decisions made in previous sessions

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `decision` | string | Yes | Decision description | Min length: 10 chars |
| `rationale` | string | Yes | Decision rationale | Min length: 10 chars |
| `context` | object | No | Contextual information (session_id, task, etc.) | Valid JSON object |
| `decision_type` | string | No | Type of decision | Must be one of: technical, architectural, process, strategic |
| `timestamp` | timestamp | Yes | Decision timestamp | ISO 8601 format |
| `agent_id` | string | No | Agent identifier | Any string |

## Entity Resolution

**Resolution Strategy**: Content hash of (decision + timestamp)

Agent decisions are uniquely identified by a content hash of the decision text and timestamp. This allows:
- Duplicate decisions to be deduplicated
- Same decision made in different contexts to be tracked separately
- Historical decision tracking across sessions

**Example**: If an agent makes the decision "Use Neotoma for agent memory" at 2025-12-31T12:00:00Z, all observations referencing this decision+timestamp resolve to a single entity.

## Example Payloads

### Minimal Payload

```json
{
  "decision": "Use Neotoma for all foundation agent memory",
  "rationale": "Unified memory system with entity resolution",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Complete Payload

```json
{
  "decision": "Use Neotoma for all foundation agent memory",
  "rationale": "Unified memory system with entity resolution and timeline generation provides better cross-session continuity than .cursor/memory/ directory",
  "context": {
    "session_id": "abc123",
    "task": "Design agent memory system",
    "feature_unit": "FU-061"
  },
  "decision_type": "architectural",
  "timestamp": "2025-12-31T12:00:00Z",
  "agent_id": "cursor-agent-1"
}
```

### Technical Decision

```json
{
  "decision": "Use PostgreSQL JSONB for flexible schema storage",
  "rationale": "JSONB provides schema flexibility while maintaining query performance",
  "context": {
    "session_id": "def456",
    "feature_unit": "FU-062"
  },
  "decision_type": "technical",
  "timestamp": "2026-01-05T10:30:00Z",
  "agent_id": "cursor-agent-2"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Agent Decisions are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Agent Decision object with required fields
2. Agent submits via `submit_agent_decision` MCP action
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (content hash of decision + timestamp)
6. Neotoma computes entity snapshot

**No LLM extraction**: Agent Decisions are not extracted from raw documents; they are created directly by agents.

## Relationships

Agent Decisions can relate to:

- **Feature Unit**: Decisions may reference Feature Units in `context` object
- **Release**: Decisions may reference Releases in `context` object
- **Agent Session**: Decisions made during specific agent sessions
- **Architectural Decision**: Related to high-level architectural decisions

Relationships are tracked via:
- Context object can reference Feature Unit IDs, Release IDs, etc.
- Timeline queries can find decisions related to specific entities

## Timeline Integration

Agent Decisions participate in timeline generation:

- **Decision Event**: When decision is first submitted
- **Related Entity Timeline**: Decisions appear in timelines for related entities

**Timeline Query Example**:

```typescript
// Query decisions related to FU-061
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "FU-061",
  start_date: "2025-12-01",
  end_date: "2026-01-31"
});

// Returns events including:
// - 2025-12-01: Feature Unit FU-061 created
// - 2025-12-05: Decision: Use content-addressed storage (agent_decision entity)
// - 2025-12-15: Decision: Defer async retry to v0.3.0 (agent_decision entity)
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `decision` must be at least 10 characters
- `rationale` must be at least 10 characters
- `decision_type` must be one of allowed values
- `timestamp` must be valid ISO 8601 timestamp
- `context` must be valid JSON object

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "decision",
    "value": "Bad",
    "expected": "min_length: 10",
    "message": "Decision must be at least 10 characters"
  }
}
```

### Consistency Validation

- `timestamp` should not be in the future (warning only)
- `context` object should be well-formed JSON

## Usage Examples

### Recording a Decision

```typescript
// Foundation agent records technical decision
const result = await mcpClient.submit_agent_decision({
  decision: "Use Neotoma for all foundation agent memory",
  rationale: "Unified memory system with entity resolution and timeline generation",
  context: {
    session_id: "abc123",
    task: "Design agent memory system",
    feature_unit: "FU-061"
  },
  decision_type: "architectural",
  timestamp: new Date().toISOString(),
  agent_id: "cursor-agent-1"
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Querying Decisions

```typescript
// Query architectural decisions
const decisions = await mcpClient.query_codebase_entities({
  entity_type: "agent_decision",
  filters: {
    decision_type: "architectural"
  },
  limit: 10
});

// Returns array of Agent Decision entities with snapshots
```

### Querying Decisions by Context

```typescript
// Query decisions related to FU-061
const decisions = await mcpClient.query_codebase_entities({
  entity_type: "agent_decision",
  filters: {
    "context.feature_unit": "FU-061"
  }
});

// Returns all decisions that reference FU-061 in context
```

### Querying Decision Timeline

```typescript
// Query all decisions in date range
const decisions = await mcpClient.query_codebase_entities({
  entity_type: "agent_decision",
  filters: {
    timestamp: {
      gte: "2025-12-01T00:00:00Z",
      lte: "2026-01-31T23:59:59Z"
    }
  },
  order_by: "timestamp",
  order: "asc"
});

// Returns decisions in chronological order
```

## Integration with Foundation Agents

### When to Record Decisions

Foundation agents record decisions when:

1. **Architectural Choices**: When making architectural decisions (e.g., "Use Neotoma for memory")
2. **Technical Trade-offs**: When choosing between technical alternatives
3. **Process Changes**: When changing development processes or workflows
4. **Strategic Decisions**: When making strategic choices affecting multiple features
5. **Hold Points**: When pausing work pending decision (documented for future reference)

### Context Fields

Recommended context fields:

- `session_id`: Current agent session ID
- `task`: High-level task being performed
- `feature_unit`: Related Feature Unit ID
- `release`: Related Release ID
- `alternatives_considered`: Array of alternative approaches
- `trade_offs`: Key trade-offs in decision

### Memory Access Pattern

```typescript
// Agent queries past decisions for context
async function getRelatedDecisions(featureUnitId: string) {
  // Query Neotoma for decisions related to Feature Unit
  const decisions = await mcpClient.query_codebase_entities({
    entity_type: "agent_decision",
    filters: {
      "context.feature_unit": featureUnitId
    },
    order_by: "timestamp",
    order: "desc"
  });
  
  // Return decision history
  return decisions.map(d => ({
    decision: d.snapshot.decision,
    rationale: d.snapshot.rationale,
    decision_type: d.snapshot.decision_type,
    timestamp: d.snapshot.timestamp
  }));
}
```

## Notes

- **Immutability**: Agent Decision observations are immutable; decisions cannot be changed after recording
- **Entity Resolution**: Multiple observations for same decision+timestamp resolve to single entity
- **Timeline**: Decisions appear in timelines for related entities (Feature Units, Releases)
- **Cross-Session**: Decisions persist across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' decisions
- **Learning**: Agents can learn from past decisions by querying decision history

## Migration from .cursor/memory/

Agent Decisions currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/decisions/` directory
2. Extract decision data from files
3. Map to `agent_decision` schema
4. Submit via `submit_agent_decision` MCP action
5. Verify entity resolution
6. Validate timeline integration

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
