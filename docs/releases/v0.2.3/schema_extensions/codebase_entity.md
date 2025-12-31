# Schema Extension: codebase_entity

## Overview

- **Entity Type**: `codebase_entity`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track codebase entities (subsystems, components, modules) in Neotoma

## Description

The `codebase_entity` entity type represents structural elements of a codebase, such as subsystems, components, modules, and packages. These entities help agents understand codebase architecture and relationships.

## Use Cases

1. **Architecture Tracking**: Document codebase architecture and subsystems
2. **Relationship Mapping**: Track dependencies and relationships between components
3. **Impact Analysis**: Understand which components are affected by changes
4. **Documentation**: Maintain living documentation of codebase structure
5. **Cross-Session Context**: Agents can query codebase structure across sessions

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `entity_type` | string | Yes | Type of entity | Must be one of: subsystem, component, module, package, service, api, database, integration |
| `name` | string | Yes | Entity name | Min length: 2 chars |
| `description` | string | No | Entity description | Any string |
| `path` | string | No | File system path | Valid path string |
| `relationships` | array<object> | No | Array of related entity IDs with relationship types | Valid JSON objects |

### Relationship Object Schema

```json
{
  "type": "string",        // Relationship type (required): depends_on, part_of, implements, extends, uses
  "target": "string",      // Target entity name (required)
  "description": "string"  // Relationship description (optional)
}
```

## Entity Resolution

**Resolution Strategy**: Match by `name` + `entity_type` combination

Codebase Entities are uniquely identified by their name and type combination. This allows:
- Same-named entities of different types to coexist (e.g., "auth" subsystem vs "auth" module)
- Entity updates to merge into existing entity
- Historical tracking of entity evolution

**Example**: If multiple observations reference "auth" with type "subsystem", they resolve to a single Codebase Entity.

## Example Payloads

### Minimal Payload

```json
{
  "entity_type": "subsystem",
  "name": "auth"
}
```

### Complete Payload

```json
{
  "entity_type": "subsystem",
  "name": "crypto",
  "description": "Cryptographic subsystem for end-to-end encryption, key management, and signature verification",
  "path": "src/crypto/",
  "relationships": [
    {
      "type": "uses",
      "target": "envelope",
      "description": "Uses envelope subsystem for secure message wrapping"
    },
    {
      "type": "part_of",
      "target": "neotoma",
      "description": "Core subsystem of Neotoma"
    }
  ]
}
```

### Component Entity

```json
{
  "entity_type": "component",
  "name": "FeatureUnitList",
  "description": "React component for displaying list of Feature Units",
  "path": "frontend/src/components/FeatureUnitList.tsx",
  "relationships": [
    {
      "type": "uses",
      "target": "FeatureUnitCard",
      "description": "Renders Feature Unit cards"
    },
    {
      "type": "part_of",
      "target": "frontend",
      "description": "Part of frontend subsystem"
    }
  ]
}
```

### Service Entity

```json
{
  "entity_type": "service",
  "name": "InterpretationService",
  "description": "Service for AI interpretation of raw data sources",
  "path": "src/services/interpretation.ts",
  "relationships": [
    {
      "type": "depends_on",
      "target": "SchemaRegistry",
      "description": "Validates extracted data against schema registry"
    },
    {
      "type": "depends_on",
      "target": "EntityResolution",
      "description": "Resolves extracted entities"
    }
  ]
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Codebase Entities are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Codebase Entity object with required fields
2. Agent submits via MCP (generic `submit_payload` with codebase_entity type)
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (match by name + entity_type)
6. Neotoma computes entity snapshot

**No LLM extraction**: Codebase Entities are not extracted from raw documents; they are created directly by agents.

## Relationships

Codebase Entities can relate to:

- **Feature Unit**: Feature Units may modify or create Codebase Entities
- **Release**: Releases may impact Codebase Entities
- **Agent Decision**: Decisions may reference Codebase Entities
- **Architectural Decision**: Architectural decisions create or modify Codebase Entities
- **Other Codebase Entities**: Entities relate to each other via `relationships` array

Relationships are tracked via:
- `relationships` array in entity payload
- Timeline queries can find entities related to specific entities

## Timeline Integration

Codebase Entities participate in timeline generation:

- **Creation Event**: When Codebase Entity is first submitted
- **Update Events**: When `description`, `path`, or `relationships` change
- **Related Entity Timeline**: Entities appear in timelines for related entities

**Timeline Query Example**:

```typescript
// Query timeline for crypto subsystem
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "crypto",
  start_date: "2025-01-01",
  end_date: "2026-01-31"
});

// Returns events including:
// - 2025-01-01: Codebase Entity crypto (subsystem) created
// - 2025-02-15: Relationship added: uses envelope
// - 2025-03-20: Description updated
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `entity_type` must be one of allowed values
- `name` must be at least 2 characters
- `relationships` array must contain valid relationship objects
- Each relationship must have `type` and `target` fields

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "entity_type",
    "value": "invalid",
    "expected": "one of: subsystem, component, module, package, service, api, database, integration",
    "message": "Entity type must be one of allowed values"
  }
}
```

### Consistency Validation

- `relationships` array should not contain self-reference
- `path` should be valid file system path (warning only)
- Relationship `target` should reference existing entities (warning only)

## Usage Examples

### Recording a Subsystem

```typescript
// Foundation agent records subsystem
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "codebase_entity",
    data: {
      entity_type: "subsystem",
      name: "crypto",
      description: "Cryptographic subsystem for end-to-end encryption",
      path: "src/crypto/",
      relationships: [
        {
          type: "part_of",
          target: "neotoma",
          description: "Core subsystem of Neotoma"
        }
      ]
    }
  }
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Recording a Service

```typescript
// Foundation agent records service
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "codebase_entity",
    data: {
      entity_type: "service",
      name: "InterpretationService",
      description: "Service for AI interpretation of raw data sources",
      path: "src/services/interpretation.ts",
      relationships: [
        {
          type: "depends_on",
          target: "SchemaRegistry"
        },
        {
          type: "depends_on",
          target: "EntityResolution"
        }
      ]
    }
  }
});
```

### Querying Codebase Entities

```typescript
// Query all subsystems
const subsystems = await mcpClient.query_codebase_entities({
  entity_type: "codebase_entity",
  filters: {
    entity_type: "subsystem"
  }
});

// Returns array of Codebase Entity entities (subsystems only)
```

### Querying by Relationship

```typescript
// Query entities that depend on SchemaRegistry
const dependents = await mcpClient.query_codebase_entities({
  entity_type: "codebase_entity",
  filters: {
    "relationships.target": "SchemaRegistry",
    "relationships.type": "depends_on"
  }
});

// Returns all entities that depend on SchemaRegistry
```

### Querying Architecture

```typescript
// Query all entities in crypto subsystem
const cryptoEntities = await mcpClient.query_codebase_entities({
  entity_type: "codebase_entity",
  filters: {
    path: { starts_with: "src/crypto/" }
  }
});

// Returns all entities in crypto subsystem directory
```

## Integration with Foundation Agents

### When to Record Codebase Entities

Foundation agents record codebase entities when:

1. **Architecture Documentation**: When documenting subsystem architecture
2. **Feature Unit Implementation**: When creating new components or services
3. **Refactoring**: When restructuring codebase architecture
4. **Impact Analysis**: When analyzing which components are affected by changes
5. **Cross-Session Context**: When restoring codebase structure context

### Common Entity Types

- `subsystem`: Major subsystem (e.g., "crypto", "mcp", "events")
- `component`: React/UI component (e.g., "FeatureUnitList")
- `module`: Standalone module (e.g., "hash_chain")
- `package`: npm package or library
- `service`: Service class (e.g., "InterpretationService")
- `api`: API endpoint or route
- `database`: Database table or schema
- `integration`: External integration (e.g., "Plaid", "OpenAI")

### Common Relationship Types

- `depends_on`: Depends on another entity
- `part_of`: Is part of another entity
- `implements`: Implements an interface or contract
- `extends`: Extends or inherits from another entity
- `uses`: Uses or calls another entity

### Memory Access Pattern

```typescript
// Agent queries codebase architecture
async function getSubsystemArchitecture(subsystemName: string) {
  // Query subsystem entity
  const subsystem = await mcpClient.query_codebase_entities({
    entity_type: "codebase_entity",
    filters: {
      entity_type: "subsystem",
      name: subsystemName
    }
  });
  
  if (subsystem.length === 0) {
    return null;
  }
  
  // Query all entities in subsystem
  const entities = await mcpClient.query_codebase_entities({
    entity_type: "codebase_entity",
    filters: {
      "relationships.target": subsystemName,
      "relationships.type": "part_of"
    }
  });
  
  return {
    subsystem: subsystem[0].snapshot,
    entities: entities.map(e => e.snapshot)
  };
}
```

## Notes

- **Immutability**: Codebase Entity observations are immutable; updates create new observations
- **Entity Resolution**: Multiple observations for same name+type resolve to single entity
- **Timeline**: Entity evolution tracked in timeline
- **Cross-Session**: Codebase architecture persists across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' codebase entities
- **Living Documentation**: Enables agents to maintain up-to-date architecture documentation

## Migration from .cursor/memory/

Codebase Entities currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/codebase/` directory
2. Extract entity data from files
3. Map to `codebase_entity` schema
4. Submit via MCP
5. Verify entity resolution
6. Validate relationship integrity

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
