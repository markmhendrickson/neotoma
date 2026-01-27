# Neotoma Schema Registry — Config-Driven Schema Evolution

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers:
- Schema registry table structure
- [Entity schema](../vocabulary/canonical_terms.md#entity-schema) definition format
- [Reducer](../vocabulary/canonical_terms.md#reducer) configuration patterns
- [Entity schema](../vocabulary/canonical_terms.md#entity-schema) versioning and migration
- Active [entity schema](../vocabulary/canonical_terms.md#entity-schema) lookup

This document does NOT cover:
- Database schema details (see `docs/subsystems/schema.md`)
- Automated schema promotion (see `docs/architecture/schema_expansion.md`)
- [Reducer](../vocabulary/canonical_terms.md#reducer) implementation (see `docs/subsystems/reducer.md`)
## 1. Schema Registry Overview

### 1.1 Purpose

The schema registry enables:
- **Runtime [entity schema](../vocabulary/canonical_terms.md#entity-schema) evolution** without code deployments
- **Config-driven [entity schemas](../vocabulary/canonical_terms.md#entity-schema)** (not hard-coded in code)
- **[Entity schema](../vocabulary/canonical_terms.md#entity-schema) versioning** for backward compatibility
- **Merge policy configuration** per field
- **Deterministic migrations** via manifests
### 1.2 Core Principle

**Core physical DB schema is stable and minimal. All domain-specific [entity schemas](../vocabulary/canonical_terms.md#entity-schema) live in a versioned schema_registry.**
See [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) for complete architectural rationale.
## 2. Schema Registry Structure
### 2.1 Database Table
```sql
CREATE TABLE schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  schema_definition JSONB NOT NULL,
  reducer_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, schema_version)
);
```
See [`docs/subsystems/schema.md`](./schema.md) for complete table definition.
### 2.2 Schema Definition Format
```typescript
interface SchemaDefinition {
  fields: Record<string, FieldDefinition>;
}

interface FieldDefinition {
  type: "string" | "number" | "date" | "boolean" | "array" | "object";
  required?: boolean;
  validator?: string; // Validator function name
  preserveCase?: boolean; // Preserve case for this field during canonicalization
  description?: string; // Field description
  converters?: ConverterDefinition[]; // Field type converters
}

interface ConverterDefinition {
  from: "number" | "string" | "boolean" | "array" | "object";
  to: "string" | "number" | "date" | "boolean" | "array" | "object";
  function: string; // Converter function name
  deterministic: boolean; // Must be true for MVP
}
```
**Example:**
```json
{
  "fields": {
    "vendor_name": {
      "type": "string",
      "required": true,
      "description": "Vendor company name"
    },
    "amount_due": {
      "type": "number",
      "required": true,
      "validator": "positive_number"
    },
    "date_issued": {
      "type": "date",
      "required": true,
      "validator": "iso8601_date"
    },
    "created_at": {
      "type": "date",
      "required": false,
      "converters": [
        {
          "from": "number",
          "to": "date",
          "function": "timestamp_nanos_to_iso",
          "deterministic": true
        }
      ]
    }
  }
}
```
### 2.3 Reducer Configuration Format
```typescript
interface ReducerConfig {
  merge_policies: Record<string, MergePolicy>;
}
interface MergePolicy {
  strategy: "last_write" | "highest_priority" | "most_specific" | "merge_array";
  tie_breaker?: "observed_at" | "source_priority";
}
```
**Example:**
```json
{
  "merge_policies": {
    "vendor_name": {
      "strategy": "highest_priority"
    },
    "amount_due": {
      "strategy": "last_write"
    },
    "status": {
      "strategy": "last_write"
    },
    "aliases": {
      "strategy": "merge_array"
    }
  }
}
```

### 2.4 Field Type Converters

Field type converters enable automatic type conversion when source data doesn't match the schema field type. This allows deterministic transformation of values while preserving the original data in `raw_fragments`.

**Purpose:**
- Handle type mismatches automatically (e.g., numeric timestamps → ISO date strings)
- Maintain zero data loss (original values preserved in `raw_fragments`)
- Enable schema evolution without reprocessing all source data
- Support multiple input formats for the same logical field

**Architecture:**

```
Source Data (numeric timestamp)
  ↓
Field Validation
  ↓
Type Match? → No → Converter Defined? → Yes → Apply Converter
  ↓                                              ↓
  Yes                                   Conversion Successful?
  ↓                                              ↓
Store in observations                            Yes → Store converted value in observations
                                                 ↓
                                                 Store original in raw_fragments
```

**Converter Definition:**

```typescript
interface ConverterDefinition {
  from: "number" | "string" | "boolean" | "array" | "object";
  to: "string" | "number" | "date" | "boolean" | "array" | "object";
  function: string; // Converter function name (must exist in CONVERTER_REGISTRY)
  deterministic: boolean; // Must be true (Neotoma requirement)
}
```

**Available Converters:**

| Converter Function | From Type | To Type | Description |
| --- | --- | --- | --- |
| `timestamp_nanos_to_iso` | `number` | `date` | Convert nanosecond timestamp to ISO 8601 string |
| `timestamp_ms_to_iso` | `number` | `date` | Convert millisecond timestamp to ISO 8601 string |
| `timestamp_s_to_iso` | `number` | `date` | Convert second timestamp to ISO 8601 string |
| `number_to_string` | `number` | `string` | Convert number to string |
| `string_to_number` | `string` | `number` | Parse string to number |
| `boolean_to_string` | `boolean` | `string` | Convert boolean to "true"/"false" |
| `string_to_boolean` | `string` | `boolean` | Parse "true"/"false" to boolean |

**Example: Timestamp Conversion**

```json
{
  "fields": {
    "created_at": {
      "type": "date",
      "required": false,
      "converters": [
        {
          "from": "number",
          "to": "date",
          "function": "timestamp_nanos_to_iso",
          "deterministic": true
        }
      ]
    }
  }
}
```

**Multiple Converters:**

Converters are applied in order. The first successful conversion is used:

```json
{
  "fields": {
    "created_at": {
      "type": "date",
      "required": false,
      "converters": [
        {
          "from": "number",
          "to": "date",
          "function": "timestamp_nanos_to_iso",
          "deterministic": true
        },
        {
          "from": "number",
          "to": "date",
          "function": "timestamp_ms_to_iso",
          "deterministic": true
        },
        {
          "from": "number",
          "to": "date",
          "function": "timestamp_s_to_iso",
          "deterministic": true
        }
      ]
    }
  }
}
```

**Conversion Behavior:**

1. **Type matches directly**: Value stored in observations, no conversion needed
2. **Type doesn't match, no converters**: Value routed to `raw_fragments` as unknown field
3. **Type doesn't match, converter defined**: Converter applied
   - **Success**: Converted value stored in observations, original value stored in `raw_fragments` with `reason: "converted_value_original"`
   - **Failure**: Value routed to `raw_fragments` as unknown field

**Determinism Requirement:**

All converters MUST be deterministic:
- Same input → same output (always)
- No external API calls
- No randomness
- No current timestamp dependencies

**Zero Data Loss:**

Original values are ALWAYS preserved in `raw_fragments`, even after successful conversion. This enables:
- Reprocessing with different converters
- Audit trails of data transformations
- Future schema evolution without data loss

**Implementation:**

Converters are defined in `src/services/field_converters.ts` and registered in `CONVERTER_REGISTRY`. All converters are validated during schema registration.

## 3. Schema Versioning
### 3.1 Version Format
Schema versions use semantic versioning (major.minor.patch):
- `1.0.0` — Initial version
- `1.1.0` — Minor version: Additive changes (new optional fields, new converters) - backward compatible
- `1.1.1` — Patch version: Non-functional changes (documentation, formatting)
- `2.0.0` — Major version: Breaking changes (removing fields, changing types, making fields required)

**Version Increment Rules:**
- **Major (X.0.0)**: Breaking changes that require migration
  - Removing fields
  - Changing field types (not just adding converters)
  - Changing field from optional to required
  - Removing converters
- **Minor (x.Y.0)**: Additive, backward-compatible changes
  - Adding new optional fields
  - Adding converters to existing fields
  - Changing reducer strategies (non-breaking)
- **Patch (x.y.Z)**: Non-functional changes
  - Documentation updates
  - Formatting changes
  - No schema structure changes

**Backward Compatibility:**
- Old schema versions (e.g., `1.0.0`) remain readable
- Observations store their `schema_version` at creation time (immutable)
- Snapshots are computed using the active schema, which can read observations from any version
- Reducers handle missing fields gracefully (optional fields may be absent in old observations)
### 3.2 Active Schema
Only one active schema version per entity_type at a time:
```sql
SELECT * FROM schema_registry
WHERE entity_type = 'invoice'
  AND active = true;
```
**Public Schema Snapshots:**
Schema snapshots are automatically exported to [`docs/subsystems/schema_snapshots/`](./schema_snapshots/) whenever schemas are registered, activated, or deactivated. The export runs asynchronously in the background and does not block schema operations.
You can also manually export all schemas:
```bash
npm run schema:export
```
This creates versioned JSON files (e.g., `invoice/v1.0.json`) containing complete schema definitions and reducer configs. See the [schema snapshots README](./schema_snapshots/README.md) for details.
### 3.3 Schema Migration and Breaking Changes

**How Breaking Changes Work with Existing Data:**

Neotoma's immutable observation model enables breaking schema changes without data loss:

1. **Observations are Immutable**: Each observation stores its `schema_version` at creation time and never changes
2. **Multiple Versions Coexist**: Old observations (e.g., `schema_version: "1.0.0"`) and new observations (e.g., `schema_version: "2.0.0"`) can exist simultaneously
3. **Snapshots Use Active Schema**: Entity snapshots are computed using the active schema, which must handle missing fields from old observations
4. **Backward Compatibility**: The active schema must be able to read observations from all previous versions

**Migration Process for Breaking Changes:**

1. **Register new schema version** (e.g., `2.0.0`) in registry
2. **Ensure backward compatibility**: New schema must handle missing fields from old observations
3. **Set new version as active** (deactivates old version)
4. **New observations** automatically use new schema version
5. **Old observations remain unchanged** (immutable)
6. **Snapshots recomputed** using new schema (handles missing fields gracefully)

**Reconciliation Example:**

See [`docs/examples/schema_breaking_change_reconciliation.md`](../examples/schema_breaking_change_reconciliation.md) for a detailed example showing how an entity snapshot is reconciled when a breaking change removes a field.

**Key Reconciliation Behavior:**

- **Reducer collects fields from observations**, not from the schema
- If a field exists in any observation (even from old schema), it can appear in the snapshot
- Removed fields from schema don't prevent them from appearing in snapshots
- Fields without merge policies use default `"last_write"` strategy
- Old observations keep their original `schema_version` (immutable)
- Snapshot's `schema_version` reflects the active schema used for computation

**Example: Removing a Field (Breaking Change)**

See [`docs/examples/schema_breaking_change_reconciliation.md`](../examples/schema_breaking_change_reconciliation.md) for a complete example.

**Key Behavior:**
- Reducer collects fields from **all observations**, not just the schema
- If `old_field` exists in old observations, it will still appear in the snapshot
- Removed fields use default merge policy (`last_write`)
- Old observations keep their original `schema_version` (immutable)

**Migration Process for Non-Breaking Changes:**

1. Register new schema version (e.g., `1.1.0` for minor, `1.0.1` for patch)
2. Set new version as active
3. New observations automatically use new schema
4. Optionally backfill historical data via `migrate_existing=true` (moves raw_fragments to observations)
5. Snapshots recomputed (new fields appear in snapshots)
**Example:**
```typescript
async function migrateSchema(
  entityType: string,
  fromVersion: string,
  toVersion: string
): Promise<void> {
  // 1. Register new schema
  await schemaRegistry.register({
    entity_type: entityType,
    schema_version: toVersion,
    schema_definition: newSchema,
    reducer_config: newReducerConfig,
  });
  // 2. Deactivate old version, activate new
  await schemaRegistry.deactivate(entityType, fromVersion);
  await schemaRegistry.activate(entityType, toVersion);
  // 3. Recompute snapshots (lazy or immediate)
  const entities = await getEntitiesByType(entityType);
  for (const entity of entities) {
    await reducerEngine.computeSnapshot(entity.id);
  }
}
```
## 4. Schema Registry Service
### 4.1 Service Interface
```typescript
class SchemaRegistry {
  async register(config: {
    entity_type: string;
    schema_version: string;
    schema_definition: SchemaDefinition;
    reducer_config: ReducerConfig;
  }): Promise<void>;
  async loadActiveSchema(entityType: string): Promise<Schema>;
  async activate(entityType: string, version: string): Promise<void>;
  async deactivate(entityType: string, version: string): Promise<void>;
  async migrateSchema(
    entityType: string,
    fromVersion: string,
    toVersion: string
  ): Promise<void>;
}
```
### 4.2 Schema Validation
Schemas MUST be validated before registration:
- Field definitions must be valid
- Merge policies must reference valid fields
- Schema version must be unique per entity_type

### 4.3 Incremental Schema Updates

The schema registry supports incremental schema updates without full schema replacement:

```typescript
class SchemaRegistry {
  async updateSchemaIncremental(options: {
    entity_type: string;
    fields_to_add: Array<{
      field_name: string;
      field_type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
      required?: boolean;
      reducer_strategy?: 'last_write' | 'highest_priority' | 'most_specific' | 'merge_array';
    }>;
    schema_version?: string; // Auto-increments if not provided
    user_specific?: boolean; // Create user-specific schema variant
    user_id?: string; // Required if user_specific=true
    activate?: boolean; // Default: true - activate immediately
    migrate_existing?: boolean; // Default: false - only for historical data backfill
  }): Promise<SchemaRegistryEntry>;
}
```

**Key Features:**
- **Add fields without full replacement**: Merge new fields with existing schema
- **Immediate application**: New schema applies to all new data immediately after activation
- **Optional migration**: Backfill historical data only if needed (not required for new data)
- **Semantic versioning**: Automatically increments version based on change type:
  - `1.0.0` → `1.1.0` (adding optional field - minor)
  - `1.1.0` → `1.1.1` (patch change)
  - `1.1.1` → `2.0.0` (breaking change - major)

**Example Workflow:**
1. Store data with unknown fields → fields go to `raw_fragments`
2. Analyze `raw_fragments` to identify candidates
3. Call `updateSchemaIncremental` to add approved fields
4. New data automatically uses updated schema (no migration needed)
5. Optionally backfill historical data via `migrate_existing=true`

### 4.4 User-Specific Schemas

The schema registry supports both global and user-specific schemas:

**Database Schema Extension:**
```sql
ALTER TABLE schema_registry 
ADD COLUMN user_id UUID REFERENCES auth.users(id),
ADD COLUMN scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user'));
```

**Schema Resolution:**
```typescript
class SchemaRegistry {
  async loadActiveSchema(
    entityType: string,
    userId?: string
  ): Promise<SchemaRegistryEntry | null> {
    // 1. Try user-specific schema first (if userId provided)
    if (userId) {
      const userSchema = await this.loadUserSpecificSchema(entityType, userId);
      if (userSchema) return userSchema;
    }
    
    // 2. Fall back to global schema
    return await this.loadGlobalSchema(entityType);
  }
}
```

**Use Cases:**
- **User customizations**: Users can extend schemas with custom fields for their data
- **Experimentation**: Test new schemas without affecting other users
- **Schema reconciliation**: Successful user-specific fields can be promoted to global schemas
- **Multi-tenancy**: Different users can have different schema requirements

**Schema Reconciliation:**

User-specific schemas can be promoted to global schemas when patterns emerge:

```typescript
interface ReconciliationCriteria {
  min_users_with_field: number;     // e.g., 3+ users
  min_usage_frequency: number;       // e.g., 50+ entities per user
  type_consistency: number;          // e.g., 90%+ same type across users
  confidence_threshold: number;      // e.g., 0.8
}
```

When a field appears in multiple user-specific schemas with consistent types and high usage, it can be promoted to the global schema, making it available to all users.

### 4.5 Auto-Enhancement

The schema registry supports automatic schema enhancement based on `raw_fragments` analysis:

**Auto-Enhancement Workflow:**
1. Unknown fields are stored in `raw_fragments` (preservation layer)
2. System analyzes frequency, type consistency, source diversity
3. High-confidence fields (95%+ type consistency, 2+ sources, 3+ occurrences) are automatically promoted
4. Schema is updated and activated immediately
5. New data automatically uses updated schema

**Configuration:**
```typescript
interface AutoEnhancementConfig {
  enabled: boolean;                 // Master switch
  threshold: 1 | 2 | 3 | 'pattern'; // Occurrences before auto-enhance
  min_confidence: number;           // 0-1, minimum confidence
  auto_enhance_high_confidence: boolean;
  user_specific_aggressive: boolean; // More aggressive for user data
  global_conservative: boolean;      // More conservative for global schemas
}
```

**Risk Mitigation:**
- **Field blacklist**: Prevent noise fields (_test*, *_debug, etc.)
- **Field name validation**: Reject suspicious patterns
- **Type validation**: Multi-pass type detection with conservative fallbacks
- **Source diversity**: Require 2+ different sources
- **Idempotency**: Prevent duplicate enhancements
- **Database locking**: Prevent race conditions

## 5. Integration with Observations
### 5.1 Observation Schema Reference
Observations reference schema version:
```typescript
interface Observation {
  entity_type: string;
  schema_version: string; // References schema_registry
  fields: Record<string, any>; // Must match schema_definition
}
```
### 5.2 Deterministic Replay
Schema version enables deterministic replay:
- Same observation + same schema version → same snapshot
- Schema changes don't affect historical observations
- Historical snapshots can be recomputed with original schema
## 6. Integration with Reducers
### 6.1 Reducer Configuration
Reducers load merge policies from schema registry:
```typescript
async function computeSnapshot(entityId: string): Promise<EntitySnapshot> {
  const observations = await observationRepo.findByEntity(entityId);
  const schema = await schemaRegistry.loadActiveSchema(
    observations[0].entity_type
  );
  // Use merge policies from schema registry
  const snapshot = {};
  for (const [field, policy] of Object.entries(
    schema.reducer_config.merge_policies
  )) {
    const { value } = mergeField(field, observations, policy);
    snapshot[field] = value;
  }
  return snapshot;
}
```
## Agent Instructions
### When to Load This Document
Load `docs/subsystems/schema_registry.md` when:
- Implementing schema registry service
- Configuring merge policies
- Managing schema versions
- Performing schema migrations
### Constraints Agents Must Enforce
1. **Schemas MUST be versioned** (no unversioned schemas)
2. **Only one active schema per entity_type** (version switching required)
3. **Schema changes MUST be additive** (no breaking changes)
4. **Merge policies MUST be configured** (no ad-hoc merge logic)
### Forbidden Patterns
- ❌ Unversioned schemas
- ❌ Multiple active schemas per entity_type
- ❌ Breaking schema changes
- ❌ Ad-hoc merge policies (must use schema registry)
### Validation Checklist
- [ ] Schemas are versioned (semantic versioning)
- [ ] Only one active schema per entity_type
- [ ] Schema changes are additive (no breaking changes)
- [ ] Merge policies configured for all fields
- [ ] Schema registry integrated with observation creation
- [ ] Schema registry integrated with reducer execution
- [ ] Tests verify schema versioning and migration
- [ ] Documentation updated for new schema versions
