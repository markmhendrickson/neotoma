# v0.2.3 MCP Capabilities Documentation

## Overview

This document details the 7 new capability IDs added in v0.2.3 for codebase metadata management. These capabilities are used with existing generic MCP actions (`submit_payload`, `retrieve_records`, `retrieve_entities`, `list_timeline_events`) to enable foundation agents to store and query Feature Units, Releases, decisions, sessions, and other codebase-related entities via the Neotoma MCP server.

**Key Design Decision**: Instead of creating 7 new specific MCP actions, v0.2.3 leverages Neotoma's existing generic action architecture:
- **Storage**: Use `submit_payload` with capability IDs
- **Querying**: Use `retrieve_records` with `type` filters
- **Entity Queries**: Use `retrieve_entities` with `entity_type` filters
- **Timelines**: Use `list_timeline_events` with entity filters

This approach:
- Reduces API surface area (no new actions to learn)
- Maintains consistency with existing Neotoma patterns
- Enables future entity types without new actions
- Follows Agent Skills tool design principles (minimal complexity, high utility)

## Tool Design Principles

The generic actions used in v0.2.3 follow [Agent Skills for Context Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) tool design principles:

### 1. Clear Input/Output Contracts
- `submit_payload` has explicit capability_id + body + provenance schema
- `retrieve_records` has explicit type, properties, search, limit parameters
- All actions use JSON schema validation

### 2. Error Handling
- All actions provide clear, actionable error messages
- Error codes documented with resolution steps
- No silent failures

### 3. Minimal Complexity
- Each action has single, focused purpose
- No multi-purpose actions
- Capability IDs provide type-specific behavior without action proliferation

### 4. High Utility
- Generic actions work for all entity types (existing and future)
- Capability registry enables extensibility without code changes
- Consistent interface across all entity types

### 5. Validation at Boundary
- JSON schema validation for all inputs
- Capability validation ensures valid capability_id
- Field-level validation per capability rules

### 6. Graceful Degradation
- MCP server availability detection
- Fallback to `.cursor/memory/` if Neotoma unavailable
- Error handling includes fallback strategies

### 7. Idempotency Where Possible
- Entity resolution ensures same entity ID for same input
- Multiple submissions create new observations but resolve to same entity
- Queries are inherently idempotent

## Capability Summary

| Capability ID | Entity Type | Purpose |
|---------------|-------------|---------|
| `neotoma:store_feature_unit:v1` | `feature_unit` | Store Feature Unit records |
| `neotoma:store_release:v1` | `release` | Store Release records |
| `neotoma:store_agent_decision:v1` | `agent_decision` | Store agent decisions |
| `neotoma:store_agent_session:v1` | `agent_session` | Store session history |
| `neotoma:store_validation_result:v1` | `validation_result` | Store validation results |
| `neotoma:store_codebase_entity:v1` | `codebase_entity` | Store codebase entities |
| `neotoma:store_architectural_decision:v1` | `architectural_decision` | Store architectural decisions |

## Storage: Using `submit_payload`

All codebase metadata is stored using the existing `submit_payload` action with the appropriate capability ID.

### Generic `submit_payload` Action

**Action Name**: `submit_payload`

**Description**: Submit a payload envelope for compilation into payloads and observations. Agents submit `capability_id` + `body` + `provenance`; server handles schema reasoning, deduplication, and entity extraction.

**Input Schema**:
```json
{
  "capability_id": "string (required)",
  "body": {
    // Entity-specific fields (see capability sections below)
  },
  "provenance": {
    "source_refs": ["array<string>"],
    "extracted_at": "string (ISO 8601)",
    "extractor_version": "string",
    "agent_id": "string (optional)"
  },
  "client_request_id": "string (optional)"
}
```

**Response Schema**:
```json
{
  "payload_id": "string (UUID)",
  "payload_content_id": "string (hash-based)",
  "payload_submission_id": "string (UUIDv7)",
  "created": "boolean",
  "message": "string"
}
```

### Capability: `neotoma:store_feature_unit:v1`

**Entity Type**: `feature_unit`

**Body Schema**:
```json
{
  "id": "string (required)",              // Feature Unit ID (e.g., "FU-061")
  "description": "string (required)",     // Feature Unit description
  "status": "string (required)",          // Status: planning, in_progress, completed, deployed, deferred, cancelled
  "dependencies": ["array<string>"],      // Array of dependency IDs (optional)
  "risk_level": "string",                 // Risk level: low, medium, high (optional)
  "created_at": "string (required)",      // Creation timestamp (ISO 8601)
  "updated_at": "string (required)"       // Last update timestamp (ISO 8601)
}
```

**Example Request**:
```json
{
  "capability_id": "neotoma:store_feature_unit:v1",
  "body": {
    "id": "FU-061",
    "description": "Add codebase metadata schema extensions",
    "status": "completed",
    "dependencies": ["FU-060"],
    "risk_level": "low",
    "created_at": "2025-12-31T10:00:00Z",
    "updated_at": "2025-12-31T15:30:00Z"
  },
  "provenance": {
    "source_refs": [],
    "extracted_at": "2025-12-31T15:30:00Z",
    "extractor_version": "neotoma-mcp:v0.2.3",
    "agent_id": "cursor-agent"
  }
}
```

### Capability: `neotoma:store_release:v1`

**Entity Type**: `release`

**Body Schema**:
```json
{
  "id": "string (required)",              // Release ID (e.g., "v0.2.3")
  "version": "string (required)",         // Version string
  "feature_units": ["array<string>"],     // Array of Feature Unit IDs (optional)
  "status": "string (required)",          // Status: planning, in_progress, completed, deployed
  "acceptance_criteria": ["array<string>"], // Acceptance criteria (optional)
  "created_at": "string (required)",      // Creation timestamp (ISO 8601)
  "updated_at": "string (required)"       // Last update timestamp (ISO 8601)
}
```

### Capability: `neotoma:store_agent_decision:v1`

**Entity Type**: `agent_decision`

**Body Schema**:
```json
{
  "decision": "string (required)",        // Decision text
  "rationale": "string (required)",       // Rationale for decision
  "context": "string (optional)",         // Context in which decision was made
  "timestamp": "string (required)",       // Decision timestamp (ISO 8601)
  "related_entities": ["array<string>"]   // Related entity IDs (optional)
}
```

### Capability: `neotoma:store_agent_session:v1`

**Entity Type**: `agent_session`

**Body Schema**:
```json
{
  "session_id": "string (required)",      // Session identifier
  "actions": ["array<object>"],            // Array of actions taken (optional)
  "checkpoints": ["array<object>"],       // Array of checkpoints (optional)
  "outcomes": "string (optional)",        // Session outcomes
  "started_at": "string (required)",      // Session start timestamp (ISO 8601)
  "ended_at": "string (optional)"         // Session end timestamp (ISO 8601)
}
```

### Capability: `neotoma:store_validation_result:v1`

**Entity Type**: `validation_result`

**Body Schema**:
```json
{
  "validation_type": "string (required)", // Type of validation (e.g., "test", "lint", "build")
  "status": "string (required)",         // Status: passed, failed, skipped
  "details": "object (optional)",        // Validation details
  "timestamp": "string (required)",      // Validation timestamp (ISO 8601)
  "related_entity_id": "string (optional)" // Related entity ID (e.g., Feature Unit ID)
}
```

### Capability: `neotoma:store_codebase_entity:v1`

**Entity Type**: `codebase_entity`

**Body Schema**:
```json
{
  "name": "string (required)",            // Entity name
  "type": "string (required)",            // Entity type: subsystem, component, pattern
  "description": "string (optional)",     // Description
  "location": "string (optional)",        // File path or location
  "dependencies": ["array<string>"],      // Dependency names (optional)
  "created_at": "string (required)",      // Creation timestamp (ISO 8601)
  "updated_at": "string (required)"       // Last update timestamp (ISO 8601)
}
```

### Capability: `neotoma:store_architectural_decision:v1`

**Entity Type**: `architectural_decision`

**Body Schema**:
```json
{
  "decision": "string (required)",        // Decision text
  "rationale": "string (required)",       // Rationale for decision
  "impact": "string (optional)",          // Impact assessment
  "alternatives": ["array<string>"],      // Considered alternatives (optional)
  "timestamp": "string (required)",       // Decision timestamp (ISO 8601)
  "related_entities": ["array<string>"]   // Related entity IDs (optional)
}
```

## Querying: Using `retrieve_records`

Query codebase metadata using the existing `retrieve_records` action with `type` filters.

### Generic `retrieve_records` Action

**Action Name**: `retrieve_records`

**Description**: Query records by type and property filters. Supports semantic search using embeddings for fuzzy matching.

**Input Schema**:
```json
{
  "type": "string (optional)",            // Record type filter (e.g., "feature_unit", "release")
  "properties": {
    // Property filters (e.g., {"status": "completed"})
  },
  "search": ["array<string>"],            // Search terms (optional)
  "search_mode": "string",                // "semantic", "keyword", or "both" (default: "both")
  "limit": "number (optional)",          // Maximum results (default: 100)
  "ids": ["array<string>"],              // Specific record IDs (optional)
  "include_total_count": "boolean"        // Include total count (optional)
}
```

**Response Schema**:
```json
{
  "records": [
    {
      "id": "string",
      "type": "string",
      "properties": {},
      "created_at": "string",
      "updated_at": "string"
    }
  ],
  "total_count": "number (optional)"
}
```

### Query Examples

**Query Feature Units by Status**:
```json
{
  "type": "feature_unit",
  "properties": {
    "status": "completed"
  },
  "limit": 20
}
```

**Query Releases**:
```json
{
  "type": "release",
  "limit": 10
}
```

**Query Agent Sessions**:
```json
{
  "type": "agent_session",
  "properties": {
    "outcomes": "success"
  },
  "limit": 50
}
```

**Search Codebase Entities**:
```json
{
  "type": "codebase_entity",
  "search": ["authentication", "auth"],
  "search_mode": "both",
  "limit": 10
}
```

## Entity Queries: Using `retrieve_entities`

Query entities (resolved, deduplicated) using the existing `retrieve_entities` action.

### Generic `retrieve_entities` Action

**Action Name**: `retrieve_entities`

**Description**: Query entities with filters (type, pagination). Returns entities with their snapshots.

**Input Schema**:
```json
{
  "entity_type": "string (optional)",     // Filter by entity type (e.g., "feature_unit", "release")
  "limit": "number (optional)",          // Maximum results (default: 100)
  "offset": "number (optional)",         // Pagination offset (default: 0)
  "include_snapshots": "boolean"         // Include entity snapshots (default: true)
}
```

**Response Schema**:
```json
{
  "entities": [
    {
      "entity_id": "string",
      "entity_type": "string",
      "snapshot": {},
      "observation_count": "number"
    }
  ]
}
```

### Query Examples

**Query Feature Unit Entities**:
```json
{
  "entity_type": "feature_unit",
  "limit": 20,
  "include_snapshots": true
}
```

**Query Release Entities**:
```json
{
  "entity_type": "release",
  "limit": 10
}
```

## Timeline Queries: Using `list_timeline_events`

Query timeline events for codebase entities using the existing `list_timeline_events` action.

### Generic `list_timeline_events` Action

**Action Name**: `list_timeline_events`

**Description**: Query timeline events with filters (type, date range, source record). Returns chronological events.

**Input Schema**:
```json
{
  "event_type": "string (optional)",      // Filter by event type
  "after_date": "string (optional)",      // Filter events after this date (ISO 8601)
  "before_date": "string (optional)",     // Filter events before this date (ISO 8601)
  "source_record_id": "string (optional)", // Filter by source record ID
  "limit": "number (optional)",           // Maximum results (default: 100)
  "offset": "number (optional)"           // Pagination offset (default: 0)
}
```

**Response Schema**:
```json
{
  "events": [
    {
      "event_id": "string",
      "event_type": "string",
      "event_timestamp": "string",
      "source_record_id": "string",
      "entity_ids": ["array<string>"]
    }
  ]
}
```

### Query Examples

**Query Timeline for Feature Unit**:
```json
{
  "source_record_id": "record-uuid-for-feature-unit",
  "limit": 50
}
```

**Query Recent Development Events**:
```json
{
  "after_date": "2025-12-01T00:00:00Z",
  "limit": 100
}
```

## Error Handling

All generic actions use consistent error handling:

| Error Code | HTTP | Meaning | Retry? |
|------------|------|---------|--------|
| `VALIDATION_ERROR` | 400 | Invalid request schema | No |
| `UNKNOWN_CAPABILITY` | 400 | Capability ID not found (for `submit_payload`) | No |
| `DB_QUERY_FAILED` | 500 | Database query failed | Yes |
| `DB_INSERT_FAILED` | 500 | Database write failed | Yes |

## Graceful Degradation

Foundation agents should check Neotoma availability and fall back to `.cursor/memory/` if unavailable:

```typescript
async function storeFeatureUnit(featureUnit: FeatureUnit) {
  if (await isNeotomaAvailable()) {
    try {
      return await mcpClient.submit_payload({
        capability_id: "neotoma:store_feature_unit:v1",
        body: featureUnit,
        provenance: {
          source_refs: [],
          extracted_at: new Date().toISOString(),
          extractor_version: "neotoma-mcp:v0.2.3"
        }
      });
    } catch (error) {
      console.error('Failed to store in Neotoma, falling back to local memory:', error);
      return writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
    }
  } else {
    return writeToLocalMemory('feature_units', featureUnit.id, featureUnit);
  }
}
```

## Migration from .cursor/memory/

When migrating from `.cursor/memory/` to Neotoma:

1. Parse `.cursor/memory/` files
2. Transform to Neotoma schema format
3. Submit via `submit_payload` with appropriate capability IDs
4. Verify via `retrieve_records` queries

See `migration_guide.md` for detailed migration steps.

## Summary

v0.2.3 adds 7 new capability IDs that work with existing generic MCP actions:
- **Storage**: Use `submit_payload` with capability IDs
- **Querying**: Use `retrieve_records` with `type` filters
- **Entity Queries**: Use `retrieve_entities` with `entity_type` filters
- **Timelines**: Use `list_timeline_events` with entity filters

This approach maintains consistency with Neotoma's existing architecture while enabling codebase metadata management without action proliferation.
