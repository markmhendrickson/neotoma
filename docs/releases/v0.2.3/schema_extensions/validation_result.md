# Schema Extension: validation_result

## Overview

- **Entity Type**: `validation_result`
- **Version**: `v1`
- **Status**: Proposed
- **Purpose**: Track validation checkpoint results in Neotoma

## Description

The `validation_result` entity type represents the result of a validation checkpoint (lint, test, security, compliance). These results enable quality tracking and cross-session validation history.

## Use Cases

1. **Quality Tracking**: Monitor validation pass/fail rates over time
2. **Compliance Verification**: Track compliance validation results
3. **Debugging**: Understand why validations failed in past sessions
4. **Timeline Analysis**: See validation results on entity timelines
5. **Automated Checks**: Record automated validation results for audit

## Field Definitions

| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| `validation_type` | string | Yes | Type of validation | Must be one of: lint, test, security, compliance, acceptance_criteria, custom |
| `status` | string | Yes | Status | Must be one of: passed, failed, warning, skipped |
| `details` | object | No | Validation details (errors, warnings, etc.) | Valid JSON object |
| `target` | string | No | Validation target (file, feature_unit, release) | Any string |
| `timestamp` | timestamp | Yes | Validation timestamp | ISO 8601 format |

### Details Object Schema (Common Fields)

```json
{
  "errors": ["array of error messages"],
  "warnings": ["array of warning messages"],
  "passed_count": "number",
  "failed_count": "number",
  "skipped_count": "number",
  "duration_ms": "number"
}
```

## Entity Resolution

**Resolution Strategy**: Content hash of (validation_type + target + timestamp)

Validation Results are uniquely identified by a content hash of the validation type, target, and timestamp. This allows:
- Duplicate validation results to be deduplicated
- Same validation run on different targets to be tracked separately
- Historical validation tracking across sessions

**Example**: If a validation runs on "FU-061" at 2025-12-31T12:00:00Z, all observations referencing this validation+target+timestamp resolve to a single entity.

## Example Payloads

### Minimal Payload

```json
{
  "validation_type": "test",
  "status": "passed",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Complete Payload

```json
{
  "validation_type": "test",
  "status": "passed",
  "details": {
    "passed_count": 42,
    "failed_count": 0,
    "skipped_count": 2,
    "duration_ms": 5432,
    "test_files": ["file_analysis.test.ts", "graph_builder.test.ts"]
  },
  "target": "FU-061",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Failed Validation

```json
{
  "validation_type": "lint",
  "status": "failed",
  "details": {
    "errors": [
      "src/services/file_analysis.ts:42:10 - 'any' type is not allowed",
      "src/services/graph_builder.ts:156:5 - Unused variable 'result'"
    ],
    "warnings": [
      "src/services/file_analysis.ts:100:1 - Function is too complex"
    ],
    "failed_count": 2,
    "warning_count": 1
  },
  "target": "FU-061",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

### Security Validation

```json
{
  "validation_type": "security",
  "status": "warning",
  "details": {
    "vulnerabilities": [
      {
        "severity": "medium",
        "package": "lodash",
        "version": "4.17.15",
        "advisory": "https://npmjs.com/advisories/1234"
      }
    ],
    "warning_count": 1
  },
  "target": "v0.2.3",
  "timestamp": "2025-12-31T12:00:00Z"
}
```

## Extraction Rules

**Agent-Created Data**: Direct property assignment

Since Validation Results are created by agents (not extracted from documents), the extraction process is straightforward:

1. Agent constructs Validation Result object with required fields
2. Agent submits via MCP (generic `submit_payload` with validation_result type)
3. Neotoma validates against schema
4. Neotoma creates observation with direct property mapping
5. Neotoma runs entity resolution (content hash of validation_type + target + timestamp)
6. Neotoma computes entity snapshot

**No LLM extraction**: Validation Results are not extracted from raw documents; they are created directly by agents.

## Relationships

Validation Results can relate to:

- **Feature Unit**: Validations may target Feature Units
- **Release**: Validations may target Releases
- **Agent Session**: Validations run during agent sessions
- **Codebase Entity**: Validations may target specific files or components

Relationships are tracked via:
- `target` field can reference Feature Unit IDs, Release IDs, file paths, etc.
- Timeline queries can find validations related to specific entities

## Timeline Integration

Validation Results participate in timeline generation:

- **Validation Event**: When validation runs
- **Related Entity Timeline**: Validations appear in timelines for target entities

**Timeline Query Example**:

```typescript
// Query validations related to FU-061
const timeline = await mcpClient.query_entity_timeline({
  entity_id: "FU-061",
  start_date: "2025-12-01",
  end_date: "2026-01-31"
});

// Returns events including:
// - 2025-12-01: Feature Unit FU-061 created
// - 2025-12-05: Validation: lint (status: passed)
// - 2025-12-10: Validation: test (status: passed)
// - 2025-12-15: Validation: security (status: warning)
```

## Validation Requirements

### Schema Validation

All fields validated against JSON schema at ingestion boundary:

- `validation_type` must be one of allowed values
- `status` must be one of allowed values
- `timestamp` must be valid ISO 8601 timestamp
- `details` must be valid JSON object

### Rejection Policy

Invalid payloads are rejected with error details:

```json
{
  "error": "schema_validation_failed",
  "details": {
    "field": "validation_type",
    "value": "invalid",
    "expected": "one of: lint, test, security, compliance, acceptance_criteria, custom",
    "message": "Validation type must be one of allowed values"
  }
}
```

### Consistency Validation

- `timestamp` should not be in the future (warning only)
- `details` object should be well-formed JSON

## Usage Examples

### Recording Test Results

```typescript
// Foundation agent records test validation
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "validation_result",
    data: {
      validation_type: "test",
      status: "passed",
      details: {
        passed_count: 42,
        failed_count: 0,
        skipped_count: 2,
        duration_ms: 5432
      },
      target: "FU-061",
      timestamp: new Date().toISOString()
    }
  }
});

// Returns: { entity_id: "...", observation_count: 1 }
```

### Recording Lint Results

```typescript
// Foundation agent records lint validation
const result = await mcpClient.submit_payload({
  capability_id: "neotoma:submit_codebase_metadata:v1",
  body: {
    entity_type: "validation_result",
    data: {
      validation_type: "lint",
      status: "failed",
      details: {
        errors: [
          "src/file.ts:42:10 - 'any' type is not allowed"
        ],
        failed_count: 1
      },
      target: "FU-061",
      timestamp: new Date().toISOString()
    }
  }
});
```

### Querying Validation Results

```typescript
// Query failed validations for FU-061
const validations = await mcpClient.query_codebase_entities({
  entity_type: "validation_result",
  filters: {
    target: "FU-061",
    status: "failed"
  },
  order_by: "timestamp",
  order: "desc"
});

// Returns array of failed Validation Result entities
```

### Querying Validation History

```typescript
// Query all validations in date range
const validations = await mcpClient.query_codebase_entities({
  entity_type: "validation_result",
  filters: {
    timestamp: {
      gte: "2025-12-01T00:00:00Z",
      lte: "2026-01-31T23:59:59Z"
    }
  },
  order_by: "timestamp",
  order: "asc"
});

// Returns validations in chronological order
```

## Integration with Foundation Agents

### When to Record Validation Results

Foundation agents record validation results when:

1. **Running Tests**: After `npm test` or `vitest` runs
2. **Running Linters**: After `eslint` or `tsc` runs
3. **Security Audits**: After `npm audit` or security scans
4. **Compliance Checks**: After compliance validation scripts
5. **Acceptance Criteria**: After checking release acceptance criteria

### Common Validation Types

- `lint`: ESLint, TypeScript compiler, code formatting
- `test`: Unit tests, integration tests, e2e tests
- `security`: npm audit, security scans, vulnerability checks
- `compliance`: Feature Unit compliance, release compliance
- `acceptance_criteria`: Release acceptance criteria checks
- `custom`: Custom validation scripts

### Common Status Values

- `passed`: Validation passed with no errors
- `failed`: Validation failed with errors
- `warning`: Validation passed but has warnings
- `skipped`: Validation was skipped

### Memory Access Pattern

```typescript
// Agent checks previous validation results
async function getValidationHistory(target: string, validationType: string) {
  // Query Neotoma for validation results
  const validations = await mcpClient.query_codebase_entities({
    entity_type: "validation_result",
    filters: {
      target: target,
      validation_type: validationType
    },
    order_by: "timestamp",
    order: "desc",
    limit: 10
  });
  
  // Return validation history
  return validations.map(v => ({
    validation_type: v.snapshot.validation_type,
    status: v.snapshot.status,
    timestamp: v.snapshot.timestamp,
    details: v.snapshot.details
  }));
}
```

## Notes

- **Immutability**: Validation Result observations are immutable
- **Entity Resolution**: Multiple observations for same validation+target+timestamp resolve to single entity
- **Timeline**: Validations appear in timelines for target entities
- **Cross-Session**: Validation history persists across agent sessions via Neotoma
- **Privacy**: User-scoped; agents cannot access other users' validation results
- **Quality Tracking**: Enables tracking validation pass/fail rates over time

## Migration from .cursor/memory/

Validation Results currently stored in `.cursor/memory/` can be migrated:

1. Parse `.cursor/memory/validations/` directory
2. Extract validation data from files
3. Map to `validation_result` schema
4. Submit via MCP
5. Verify entity resolution
6. Validate timeline integration

See `docs/releases/v0.2.3/migration_guide.md` for detailed migration process.
