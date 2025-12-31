# Schema Extension: feature_unit

## Overview

- **Entity Type**: `feature_unit`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track Feature Unit development records in Neotoma

## Description

The `feature_unit` entity type represents a unit of development work in a codebase. Feature Units are the atomic units of work in the foundation development workflow, each with a spec, dependencies, risk level, and status.

## Use Cases

1. **Development Tracking**: Foundation agents track Feature Unit progress across sessions
2. **Dependency Management**: Query Feature Units by dependencies for impact analysis
3. **Release Planning**: Link Feature Units to releases for release management
4. **Historical Analysis**: Query development timeline to understand when Feature Units were created and completed
5. **Risk Assessment**: Track risk levels for Feature Units across releases

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | string | Yes | Feature unit identifier (e.g., "FU-061") | Must match pattern `FU-\d+` |
| `description` | string | Yes | Feature unit description | Min length: 10 chars |
| `status` | string | Yes | Status | Must be one of: planning, in_progress, completed, deployed, deferred, cancelled |
| `dependencies` | array<string> | No | Array of dependency IDs | Each must match pattern `FU-\d+` |
| `risk_level` | string | No | Risk level | Must be one of: low, medium, high |
| `created_at` | timestamp | Yes | Creation timestamp | ISO 8601 format |
| `updated_at` | timestamp | Yes | Last update timestamp | ISO 8601 format, must be >= created_at |

## Entity Resolution

**Resolution Strategy**: Match by `id` field

Feature Units are uniquely identified by their `id` (e.g., "FU-061"). If multiple observations reference the same Feature Unit ID, they are resolved to a single entity.

**Example**: If an agent submits observations for "FU-061" in multiple sessions, Neotoma resolves them to a single Feature Unit entity.

## Example Payloads

### Minimal Payload

```json
{
  "id": "FU-061",
  "description": "Add sources table for raw storage",
  "status": "planning",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-01T00:00:00Z"
}
```

### Complete Payload

```json
{
  "id": "FU-061",
  "description": "Add sources table for raw storage with content-addressed deduplication",
  "status": "completed",
  "dependencies": ["FU-050", "FU-051"],
  "risk_level": "medium",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-15T00:00:00Z"
}
```

### Update Status

```json
{
  "id": "FU-061",
  "description": "Add sources table for raw storage with content-addressed deduplication",
  "status": "deployed",
  "dependencies": ["FU-050", "FU-051"],
  "risk_level": "medium",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-20T00:00:00Z"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Feature Units are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Feature Unit object with required fields
2. Agent submits via `submit_feature_unit` MCP action
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (match by `id`)
6. Neotoma computes entity snapshot

**No LLM extraction**: Feature Units are not extracted from raw documents; they are created directly by agents.

## Relationships

Feature Units can relate to:

- **Release**: Feature Units are grouped into releases
- **Agent Decision**: Technical decisions may reference Feature Units
- **Validation Result**: Validation results may target Feature Units
- **Agent Session**: Sessions may create or update Feature Units

Relationships are tracked via:
- Release entities reference Feature Unit IDs in `feature_units` array
- Agent decisions reference Feature Units in `context` object
- Validation results reference Feature Units in `target` field
- Agent sessions reference Feature Units in `outcomes` array

## Timeline Integration

Feature Units participate in timeline generation:

- **Creation Event**: When Feature Unit is first submitted
- **Status Update Events**: When `status` field changes
- **Dependency Events**: When `dependencies` array changes
- **Deployment Events**: When status changes to "deployed"

**Timeline Query Example**:

```typescript
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "FU-061",
  start_date: "2025-12-01",
  end_date: "2025-12-31"
});

// Returns events like:
// - 2025-12-01: Feature Unit FU-061 created (status: planning)
// - 2025-12-05: Status changed to in_progress
// - 2025-12-15: Status changed to completed
// - 2025-12-20: Status changed to deployed
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `id` must match pattern `FU-\d+`
- `status` must be one of allowed values
- `dependencies` array must contain valid Feature Unit IDs
- `risk_level` must be one of allowed values
- `created_at` and `updated_at` must be valid ISO 8601 timestamps

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "id",
    "value": "INVALID",
    "expected": "FU-\\d+",
    "message": "Feature Unit ID must match pattern FU-\\d+"
  }
}
```

### Consistency Validation

- `updated_at` must be >= `created_at`
- `dependencies` array must not contain self-reference
- Status transitions must be valid (cannot go from "deployed" to "planning")

## Usage Examples

### Creating a Feature Unit

```typescript
// Foundation agent creates Feature Unit
const result = await mcpClient.submit_feature_unit({
  id: "FU-061",
  description: "Add sources table for raw storage",
  status: "planning",
  dependencies: ["FU-050"],
  risk_level: "medium",
  created_at: new Date("2025-12-01").toISOString(),
  updated_at: new Date("2025-12-01").toISOString()
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Updating Status

```typescript
// Foundation agent updates status
const result = await mcpClient.submit_feature_unit({
  id: "FU-061",
  description: "Add sources table for raw storage",
  status: "completed", // Status changed
  dependencies: ["FU-050"],
  risk_level: "medium",
  created_at: new Date("2025-12-01").toISOString(),
  updated_at: new Date("2025-12-15").toISOString() // Updated timestamp
});

// New observation created; entity snapshot updated
```

### Querying Feature Units

```typescript
// Query all completed Feature Units
const featureUnits = await mcpClient.query_codebase_entities({
  entity_type: "feature_unit",
  filters: {
    status: "completed"
  },
  limit: 10
});

// Returns array of Feature Unit entities with snapshots
```

### Querying by Dependencies

```typescript
// Query Feature Units that depend on FU-050
const dependentFUs = await mcpClient.query_codebase_entities({
  entity_type: "feature_unit",
  filters: {
    dependencies: { contains: "FU-050" }
  }
});

// Returns all Feature Units with FU-050 in dependencies array
```

## Integration with Foundation Agents

### When to Create Feature Units

Foundation agents create Feature Unit records when:

1. **Feature Unit Spec Created**: When `create-feature-unit` command completes
2. **Status Updates**: When Feature Unit status changes (in_progress, completed, deployed)
3. **Cross-Session Restoration**: When agent needs to restore Feature Unit state from memory

### Field Mapping from Feature Unit Spec

| Spec Field | Schema Field | Mapping Notes |
|------------|--------------|---------------|
| Feature Unit ID | `id` | Direct mapping |
| Overview | `description` | Direct mapping |
| Status | `status` | Map to allowed values |
| Dependencies | `dependencies` | Array of FU IDs |
| Risk Level | `risk_level` | Direct mapping |
| Created | `created_at` | ISO 8601 format |
| Updated | `updated_at` | ISO 8601 format |

### Memory Access Pattern

```typescript
// Agent starts new session
async function restoreFeatureUnitContext(featureUnitId: string) {
  // Query Neotoma for Feature Unit
  const entities = await mcpClient.query_codebase_entities({
    entity_type: "feature_unit",
    filters: { id: featureUnitId }
  });
  
  if (entities.length === 0) {
    // Feature Unit not found; create new
    return null;
  }
  
  // Restore Feature Unit state from snapshot
  const snapshot = entities[0].snapshot;
  return {
    id: snapshot.id,
    description: snapshot.description,
    status: snapshot.status,
    dependencies: snapshot.dependencies,
    risk_level: snapshot.risk_level
  };
}
```

## Notes

- **Immutability**: Feature Unit observations are immutable; status updates create new observations
- **Entity Resolution**: Multiple observations for same Feature Unit ID resolve to single entity
- **Timeline**: Full history of status changes preserved in timeline
- **Cross-Session**: Feature Units persist across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' Feature Units

## Migration from .cursor/memory/

Feature Units currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/feature_units/` directory
2. Extract Feature Unit data from files
3. Map to `feature_unit` schema
4. Submit via `submit_feature_unit` MCP action
5. Verify entity resolution
6. Validate timeline generation

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
