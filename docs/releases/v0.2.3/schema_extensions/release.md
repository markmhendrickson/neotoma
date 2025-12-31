# Schema Extension: release

## Overview

- **Entity Type**: `release`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track version release records in Neotoma

## Description

The `release` entity type represents a version release that bundles multiple Feature Units. Releases have a version number, status, acceptance criteria, and target ship date.

## Use Cases

1. **Release Planning**: Track releases and their Feature Unit composition
2. **Status Tracking**: Monitor release progress (planning → in_progress → ready_for_deployment → deployed)
3. **Historical Analysis**: Query release timeline to understand deployment history
4. **Dependency Analysis**: Query which Feature Units are in which releases
5. **Acceptance Criteria Tracking**: Validate release readiness against acceptance criteria

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `id` | string | Yes | Release identifier (e.g., "v0.2.3") | Must match pattern `v\d+\.\d+\.\d+` |
| `version` | string | Yes | Version number (e.g., "0.2.3") | Must match pattern `\d+\.\d+\.\d+` |
| `feature_units` | array<string> | Yes | Array of feature unit IDs | Each must match pattern `FU-\d+` |
| `status` | string | Yes | Status | Must be one of: planning, in_progress, ready_for_deployment, deployed, cancelled |
| `acceptance_criteria` | array<string> | Yes | Array of acceptance criteria | Min length: 1 item |
| `target_ship_date` | date | No | Target ship date | ISO 8601 date format |
| `created_at` | timestamp | Yes | Creation timestamp | ISO 8601 format |
| `updated_at` | timestamp | Yes | Last update timestamp | ISO 8601 format, must be >= created_at |

## Entity Resolution

**Resolution Strategy**: Match by `id` field

Releases are uniquely identified by their `id` (e.g., "v0.2.3"). If multiple observations reference the same Release ID, they are resolved to a single entity.

**Example**: If an agent submits observations for "v0.2.3" in multiple sessions, Neotoma resolves them to a single Release entity.

## Example Payloads

### Minimal Payload

```json
{
  "id": "v0.2.3",
  "version": "0.2.3",
  "feature_units": ["FU-061", "FU-062"],
  "status": "planning",
  "acceptance_criteria": [
    "All schema extensions documented",
    "All MCP actions implemented"
  ],
  "created_at": "2025-12-31T00:00:00Z",
  "updated_at": "2025-12-31T00:00:00Z"
}
```

### Complete Payload

```json
{
  "id": "v0.2.3",
  "version": "0.2.3",
  "feature_units": ["FU-061", "FU-062", "FU-063"],
  "status": "in_progress",
  "acceptance_criteria": [
    "All schema extensions documented",
    "All MCP actions implemented",
    "Integration tests passing",
    "Migration guide complete"
  ],
  "target_ship_date": "2026-01-15",
  "created_at": "2025-12-31T00:00:00Z",
  "updated_at": "2026-01-05T00:00:00Z"
}
```

### Update Status

```json
{
  "id": "v0.2.3",
  "version": "0.2.3",
  "feature_units": ["FU-061", "FU-062", "FU-063"],
  "status": "deployed",
  "acceptance_criteria": [
    "All schema extensions documented",
    "All MCP actions implemented",
    "Integration tests passing",
    "Migration guide complete"
  ],
  "target_ship_date": "2026-01-15",
  "created_at": "2025-12-31T00:00:00Z",
  "updated_at": "2026-01-15T00:00:00Z"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Releases are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Release object with required fields
2. Agent submits via `submit_release` MCP action
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (match by `id`)
6. Neotoma computes entity snapshot

**No LLM extraction**: Releases are not extracted from raw documents; they are created directly by agents.

## Relationships

Releases can relate to:

- **Feature Unit**: Releases reference Feature Units in `feature_units` array
- **Agent Decision**: Technical decisions may reference Releases
- **Validation Result**: Validation results may target Releases
- **Agent Session**: Sessions may create or update Releases

Relationships are tracked via:
- Release entities reference Feature Unit IDs in `feature_units` array
- Agent decisions reference Releases in `context` object
- Validation results reference Releases in `target` field
- Agent sessions reference Releases in `outcomes` array

## Timeline Integration

Releases participate in timeline generation:

- **Creation Event**: When Release is first submitted
- **Status Update Events**: When `status` field changes
- **Feature Unit Addition**: When `feature_units` array changes
- **Deployment Events**: When status changes to "deployed"

**Timeline Query Example**:

```typescript
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "v0.2.3",
  start_date: "2025-12-01",
  end_date: "2026-01-31"
});

// Returns events like:
// - 2025-12-31: Release v0.2.3 created (status: planning)
// - 2026-01-05: Status changed to in_progress
// - 2026-01-10: Feature Unit FU-063 added
// - 2026-01-15: Status changed to deployed
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `id` must match pattern `v\d+\.\d+\.\d+`
- `version` must match pattern `\d+\.\d+\.\d+`
- `status` must be one of allowed values
- `feature_units` array must contain valid Feature Unit IDs
- `acceptance_criteria` array must have at least 1 item
- `target_ship_date` must be valid ISO 8601 date

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "id",
    "value": "INVALID",
    "expected": "v\\d+\\.\\d+\\.\\d+",
    "message": "Release ID must match pattern v\\d+\\.\\d+\\.\\d+"
  }
}
```

### Consistency Validation

- `updated_at` must be >= `created_at`
- `feature_units` array must not contain duplicates
- Status transitions must be valid (cannot go from "deployed" to "planning")
- `target_ship_date` should be in the future (warning only)

## Usage Examples

### Creating a Release

```typescript
// Foundation agent creates Release
const result = await mcpClient.submit_release({
  id: "v0.2.3",
  version: "0.2.3",
  feature_units: ["FU-061", "FU-062"],
  status: "planning",
  acceptance_criteria: [
    "All schema extensions documented",
    "All MCP actions implemented"
  ],
  target_ship_date: "2026-01-15",
  created_at: new Date("2025-12-31").toISOString(),
  updated_at: new Date("2025-12-31").toISOString()
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Updating Status

```typescript
// Foundation agent updates status
const result = await mcpClient.submit_release({
  id: "v0.2.3",
  version: "0.2.3",
  feature_units: ["FU-061", "FU-062"],
  status: "deployed", // Status changed
  acceptance_criteria: [
    "All schema extensions documented",
    "All MCP actions implemented"
  ],
  target_ship_date: "2026-01-15",
  created_at: new Date("2025-12-31").toISOString(),
  updated_at: new Date("2026-01-15").toISOString() // Updated timestamp
});

// New observation created; entity snapshot updated
```

### Querying Releases

```typescript
// Query all deployed Releases
const releases = await mcpClient.query_codebase_entities({
  entity_type: "release",
  filters: {
    status: "deployed"
  },
  limit: 10
});

// Returns array of Release entities with snapshots
```

### Querying by Feature Unit

```typescript
// Query Releases that include FU-061
const releases = await mcpClient.query_codebase_entities({
  entity_type: "release",
  filters: {
    feature_units: { contains: "FU-061" }
  }
});

// Returns all Releases with FU-061 in feature_units array
```

## Integration with Foundation Agents

### When to Create Releases

Foundation agents create Release records when:

1. **Release Planning**: When `create-release` command completes
2. **Status Updates**: When Release status changes (in_progress, ready_for_deployment, deployed)
3. **Feature Unit Changes**: When Feature Units are added/removed from Release
4. **Cross-Session Restoration**: When agent needs to restore Release state from memory

### Field Mapping from Release Spec

| Spec Field | Schema Field | Mapping Notes |
|------------|--------------|---------------|
| Release ID | `id` | Direct mapping |
| Version | `version` | Direct mapping |
| Feature Units | `feature_units` | Array of FU IDs |
| Status | `status` | Map to allowed values |
| Acceptance Criteria | `acceptance_criteria` | Array of strings |
| Target Ship Date | `target_ship_date` | ISO 8601 date format |
| Created | `created_at` | ISO 8601 format |
| Updated | `updated_at` | ISO 8601 format |

### Memory Access Pattern

```typescript
// Agent starts new session
async function restoreReleaseContext(releaseId: string) {
  // Query Neotoma for Release
  const entities = await mcpClient.query_codebase_entities({
    entity_type: "release",
    filters: { id: releaseId }
  });
  
  if (entities.length === 0) {
    // Release not found; create new
    return null;
  }
  
  // Restore Release state from snapshot
  const snapshot = entities[0].snapshot;
  return {
    id: snapshot.id,
    version: snapshot.version,
    feature_units: snapshot.feature_units,
    status: snapshot.status,
    acceptance_criteria: snapshot.acceptance_criteria,
    target_ship_date: snapshot.target_ship_date
  };
}
```

## Notes

- **Immutability**: Release observations are immutable; status updates create new observations
- **Entity Resolution**: Multiple observations for same Release ID resolve to single entity
- **Timeline**: Full history of status changes and Feature Unit additions preserved in timeline
- **Cross-Session**: Releases persist across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' Releases

## Migration from .cursor/memory/

Releases currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/releases/` directory
2. Extract Release data from files
3. Map to `release` schema
4. Submit via `submit_release` MCP action
5. Verify entity resolution
6. Validate timeline generation

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
