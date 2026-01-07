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
  description?: string;
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
## 3. Schema Versioning
### 3.1 Version Format
Schema versions use semantic versioning:
- `1.0` — Initial version
- `1.1` — Additive changes (new fields)
- `2.0` — Major changes (breaking changes avoided in MVP)
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
### 3.3 Schema Migration
**Migration Process:**
1. Register new schema version in registry
2. Set new version as active (deactivate old version)
3. Backfill observations if needed (lazy or immediate)
4. Recompute snapshots with new schema
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
