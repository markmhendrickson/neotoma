# Schema Extension: architectural_decision

## Overview

- **Entity Type**: `architectural_decision`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track architectural decisions and their rationale in Neotoma

## Description

The `architectural_decision` entity type represents high-level architectural decisions that shape the system's design. These decisions capture the rationale, impact, alternatives considered, and status.

## Use Cases

1. **Architecture Documentation**: Document architectural decisions and rationale
2. **Historical Context**: Understand why architectural choices were made
3. **Alternative Analysis**: Review alternatives that were considered
4. **Impact Assessment**: Track impact of architectural decisions
5. **Decision Evolution**: Track how decisions evolve (proposed → accepted → deprecated)

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `decision` | string | Yes | Decision description | Min length: 10 chars |
| `rationale` | string | Yes | Decision rationale | Min length: 10 chars |
| `impact` | string | No | Impact assessment | Any string |
| `alternatives` | array<string> | No | Alternative approaches considered | Array of strings |
| `status` | string | No | Status | Must be one of: proposed, accepted, deprecated, superseded |
| `timestamp` | timestamp | Yes | Decision timestamp | ISO 8601 format |

## Entity Resolution

**Resolution Strategy**: Content hash of (decision + timestamp)

Architectural Decisions are uniquely identified by a content hash of the decision text and timestamp. This allows:
- Duplicate decisions to be deduplicated
- Same decision made in different contexts to be tracked separately
- Historical decision tracking across time

**Example**: If a decision "Use PostgreSQL for data storage" is made at 2025-12-31T12:00:00Z, all observations referencing this decision+timestamp resolve to a single entity.

## Example Payloads

### Minimal Payload

```json
{
  "decision": "Use event sourcing for data persistence",
  "rationale": "Provides audit trail and time-travel capabilities",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Complete Payload

```json
{
  "decision": "Use event sourcing for data persistence",
  "rationale": "Provides audit trail, time-travel capabilities, and enables replay for debugging",
  "impact": "Increases storage requirements but improves auditability and debugging",
  "alternatives": [
    "Traditional CRUD with audit log",
    "Temporal tables in PostgreSQL",
    "Change data capture"
  ],
  "status": "accepted",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Proposed Decision

```json
{
  "decision": "Migrate to serverless architecture",
  "rationale": "Reduces operational overhead and improves scalability",
  "impact": "Requires significant refactoring but reduces infrastructure costs",
  "alternatives": [
    "Continue with current VM-based architecture",
    "Migrate to Kubernetes",
    "Hybrid approach with selective serverless"
  ],
  "status": "proposed",
  "timestamp": "2026-01-15T10:00:00Z"
}
```

### Superseded Decision

```json
{
  "decision": "Use MongoDB for primary data storage",
  "rationale": "Flexible schema and horizontal scalability",
  "impact": "Decision superseded by PostgreSQL JSONB approach",
  "alternatives": [
    "PostgreSQL with JSONB",
    "MySQL with JSON columns"
  ],
  "status": "superseded",
  "timestamp": "2025-06-01T12:00:00Z"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Architectural Decisions are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Architectural Decision object with required fields
2. Agent submits via MCP (generic `submit_payload` with architectural_decision type)
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (content hash of decision + timestamp)
6. Neotoma computes entity snapshot

**No LLM extraction**: Architectural Decisions are not extracted from raw documents; they are created directly by agents.

## Relationships

Architectural Decisions can relate to:

- **Feature Unit**: Decisions may drive Feature Unit implementation
- **Release**: Decisions may be targeted for specific releases
- **Agent Decision**: Related to lower-level technical decisions
- **Codebase Entity**: Decisions may create or modify Codebase Entities

Relationships are tracked via:
- Timeline queries can find decisions related to specific entities
- Context links between decisions and entities

## Timeline Integration

Architectural Decisions participate in timeline generation:

- **Decision Event**: When decision is first submitted
- **Status Change Events**: When decision status changes (proposed → accepted → deprecated)
- **Related Entity Timeline**: Decisions appear in timelines for affected entities

**Timeline Query Example**:

```typescript
// Query architectural decisions timeline
const timeline = await mcpClient.query_entity_timeline({
  entity_type: "architectural_decision",
  start_date: "2025-01-01",
  end_date: "2026-01-31"
});

// Returns events including:
// - 2025-01-15: Decision: Use event sourcing (status: proposed)
// - 2025-02-01: Decision status changed to accepted
// - 2025-06-01: Decision: Use MongoDB (status: superseded)
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `decision` must be at least 10 characters
- `rationale` must be at least 10 characters
- `status` must be one of allowed values
- `timestamp` must be valid ISO 8601 timestamp
- `alternatives` must be array of strings

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
- `alternatives` array should have at least 1 item if provided (warning only)

## Usage Examples

### Recording a Decision

```typescript
// Foundation agent records architectural decision
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "architectural_decision",
    data: {
      decision: "Use event sourcing for data persistence",
      rationale: "Provides audit trail, time-travel capabilities, and enables replay for debugging",
      impact: "Increases storage requirements but improves auditability and debugging",
      alternatives: [
        "Traditional CRUD with audit log",
        "Temporal tables in PostgreSQL",
        "Change data capture"
      ],
      status: "accepted",
      timestamp: new Date().toISOString()
    }
  }
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Updating Decision Status

```typescript
// Foundation agent updates decision status
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "architectural_decision",
    data: {
      decision: "Use MongoDB for primary data storage",
      rationale: "Flexible schema and horizontal scalability",
      impact: "Decision superseded by PostgreSQL JSONB approach",
      alternatives: [
        "PostgreSQL with JSONB",
        "MySQL with JSON columns"
      ],
      status: "superseded", // Status updated
      timestamp: new Date("2025-06-01").toISOString()
    }
  }
});

// New observation created; entity snapshot updated
```

### Querying Decisions

```typescript
// Query accepted architectural decisions
const decisions = await mcpClient.query_codebase_entities({
  entity_type: "architectural_decision",
  filters: {
    status: "accepted"
  },
  order_by: "timestamp",
  order: "desc"
});

// Returns array of Architectural Decision entities
```

### Querying by Keyword

```typescript
// Query decisions related to "storage"
const decisions = await mcpClient.query_codebase_entities({
  entity_type: "architectural_decision",
  filters: {
    decision: { contains: "storage" }
  }
});

// Returns all decisions mentioning "storage"
```

### Querying Decision Timeline

```typescript
// Query architectural decisions timeline
const timeline = await mcpClient.query_entity_timeline({
  entity_type: "architectural_decision",
  start_date: "2025-01-01",
  end_date: "2026-01-31"
});

// Returns chronological timeline of architectural decisions
```

## Integration with Foundation Agents

### When to Record Architectural Decisions

Foundation agents record architectural decisions when:

1. **System Design**: When making high-level design decisions
2. **Technology Choices**: When choosing technologies or frameworks
3. **Pattern Selection**: When selecting architectural patterns
4. **Infrastructure Decisions**: When making infrastructure choices
5. **Process Changes**: When changing development processes
6. **Trade-off Analysis**: When documenting architectural trade-offs

### Common Decision Types

- **Data Architecture**: Event sourcing, CRUD, temporal tables, etc.
- **Technology Choices**: PostgreSQL vs MongoDB, REST vs GraphQL, etc.
- **Patterns**: Event sourcing, CQRS, microservices, monolith, etc.
- **Infrastructure**: Serverless, VMs, Kubernetes, etc.
- **Security**: Authentication, authorization, encryption, etc.
- **Scalability**: Horizontal scaling, vertical scaling, sharding, etc.

### Common Status Values

- `proposed`: Decision proposed but not yet accepted
- `accepted`: Decision accepted and in use
- `deprecated`: Decision deprecated but still in use
- `superseded`: Decision replaced by another decision

### Memory Access Pattern

```typescript
// Agent queries architectural decisions for context
async function getArchitecturalContext(topic: string) {
  // Query Neotoma for decisions related to topic
  const decisions = await mcpClient.query_codebase_entities({
    entity_type: "architectural_decision",
    filters: {
      decision: { contains: topic },
      status: "accepted"
    },
    order_by: "timestamp",
    order: "desc"
  });
  
  // Return decision history
  return decisions.map(d => ({
    decision: d.snapshot.decision,
    rationale: d.snapshot.rationale,
    impact: d.snapshot.impact,
    alternatives: d.snapshot.alternatives,
    status: d.snapshot.status,
    timestamp: d.snapshot.timestamp
  }));
}
```

### Decision Review Pattern

```typescript
// Agent reviews alternatives for new decision
async function reviewAlternatives(proposedDecision: string) {
  // Query similar decisions
  const similarDecisions = await mcpClient.query_codebase_entities({
    entity_type: "architectural_decision",
    filters: {
      decision: { contains: proposedDecision.split(' ')[0] }
    },
    order_by: "timestamp",
    order: "desc",
    limit: 5
  });
  
  // Extract alternatives from similar decisions
  const allAlternatives = similarDecisions.flatMap(
    d => d.snapshot.alternatives || []
  );
  
  // Return unique alternatives
  return [...new Set(allAlternatives)];
}
```

## Notes

- **Immutability**: Architectural Decision observations are immutable; status updates create new observations
- **Entity Resolution**: Multiple observations for same decision+timestamp resolve to single entity
- **Timeline**: Decision evolution tracked in timeline (proposed → accepted → deprecated)
- **Cross-Session**: Architectural decisions persist across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' architectural decisions
- **Learning**: Agents can learn from past architectural decisions and alternatives

## Migration from .cursor/memory/

Architectural Decisions currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/architecture/` directory
2. Extract decision data from files
3. Map to `architectural_decision` schema
4. Submit via MCP
5. Verify entity resolution
6. Validate timeline integration

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
