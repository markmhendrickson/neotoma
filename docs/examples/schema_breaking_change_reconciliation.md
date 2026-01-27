# Schema Breaking Change Reconciliation Example

## Scenario: Removing a Field (Breaking Change)

This example demonstrates how an entity snapshot is reconciled when a breaking schema change removes a field.

### Initial State: Schema 1.0.0

**Schema Definition:**
```json
{
  "entity_type": "invoice",
  "schema_version": "1.0.0",
  "schema_definition": {
    "fields": {
      "invoice_number": { "type": "string", "required": true },
      "vendor_name": { "type": "string", "required": true },
      "amount_due": { "type": "number", "required": true },
      "old_field": { "type": "string", "required": false }  // ← Will be removed
    }
  },
  "reducer_config": {
    "merge_policies": {
      "invoice_number": { "strategy": "last_write" },
      "vendor_name": { "strategy": "highest_priority" },
      "amount_due": { "strategy": "last_write" },
      "old_field": { "strategy": "last_write" }
    }
  }
}
```

**Observation 1 (created with schema 1.0.0):**
```json
{
  "id": "obs_001",
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "1.0.0",  // ← Immutable: stored at creation
  "observed_at": "2025-01-15T10:00:00Z",
  "source_priority": 100,
  "fields": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corp",
    "amount_due": 1000.00,
    "old_field": "deprecated_value"  // ← Field that will be removed
  }
}
```

**Snapshot (computed with schema 1.0.0):**
```json
{
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "1.0.0",
  "snapshot": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corp",
    "amount_due": 1000.00,
    "old_field": "deprecated_value"  // ← Included
  },
  "provenance": {
    "invoice_number": "obs_001",
    "vendor_name": "obs_001",
    "amount_due": "obs_001",
    "old_field": "obs_001"
  }
}
```

---

### Breaking Change: Schema 2.0.0 (Removes `old_field`)

**New Schema Definition:**
```json
{
  "entity_type": "invoice",
  "schema_version": "2.0.0",  // ← Major version bump (breaking change)
  "schema_definition": {
    "fields": {
      "invoice_number": { "type": "string", "required": true },
      "vendor_name": { "type": "string", "required": true },
      "amount_due": { "type": "number", "required": true }
      // old_field removed
    }
  },
  "reducer_config": {
    "merge_policies": {
      "invoice_number": { "strategy": "last_write" },
      "vendor_name": { "strategy": "highest_priority" },
      "amount_due": { "strategy": "last_write" }
      // old_field policy removed
    }
  }
}
```

**New Observation 2 (created with schema 2.0.0):**
```json
{
  "id": "obs_002",
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "2.0.0",  // ← Uses new schema
  "observed_at": "2025-01-20T14:00:00Z",
  "source_priority": 100,
  "fields": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corporation",  // ← Updated value
    "amount_due": 1200.00  // ← Updated value
    // old_field not present (removed from schema)
  }
}
```

---

### Reconciliation: Snapshot Recomputed with Schema 2.0.0

**Reducer Process:**

1. **Load Active Schema** (schema 2.0.0):
   ```typescript
   const schemaEntry = await schemaRegistry.loadActiveSchema("invoice");
   // Returns schema 2.0.0 (old_field removed)
   ```

2. **Collect All Observations** (both old and new):
   ```typescript
   const observations = [
     obs_001,  // schema_version: "1.0.0", has old_field
     obs_002   // schema_version: "2.0.0", no old_field
   ];
   ```

3. **Extract All Unique Fields from Observations** (not from schema):
   ```typescript
   const allFields = new Set<string>();
   for (const obs of observations) {
     Object.keys(obs.fields).forEach((field) => allFields.add(field));
   }
   // Result: ["invoice_number", "vendor_name", "amount_due", "old_field"]
   // Note: old_field is included because it exists in obs_001
   ```

4. **Apply Merge Strategy for Each Field**:

   **Field: `invoice_number`**
   - Observations with field: [obs_001, obs_002]
   - Merge policy: `last_write`
   - Result: `"INV-001"` from obs_002 (most recent)

   **Field: `vendor_name`**
   - Observations with field: [obs_001, obs_002]
   - Merge policy: `highest_priority`
   - Result: `"Acme Corporation"` from obs_002 (same priority, but more recent)

   **Field: `amount_due`**
   - Observations with field: [obs_001, obs_002]
   - Merge policy: `last_write`
   - Result: `1200.00` from obs_002 (most recent)

   **Field: `old_field`** (removed from schema but exists in old observation)
   - Observations with field: [obs_001] (obs_002 doesn't have it)
   - Merge policy: `last_write` (default, since not in schema 2.0.0)
   - Result: `"deprecated_value"` from obs_001

5. **Create Snapshot**:

**Reconciled Snapshot (computed with schema 2.0.0):**
```json
{
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "2.0.0",  // ← Uses active schema version
  "snapshot": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corporation",
    "amount_due": 1200.00,
    "old_field": "deprecated_value"  // ← Still included! (exists in old observation)
  },
  "provenance": {
    "invoice_number": "obs_002",
    "vendor_name": "obs_002",
    "amount_due": "obs_002",
    "old_field": "obs_001"  // ← From old observation
  },
  "observation_count": 2,
  "last_observation_at": "2025-01-20T14:00:00Z"
}
```

---

## Key Points

### 1. Observations Are Immutable
- `obs_001` keeps `schema_version: "1.0.0"` forever
- `obs_002` uses `schema_version: "2.0.0"`
- Both coexist in the database

### 2. Snapshot Uses Active Schema
- Snapshot's `schema_version` is `"2.0.0"` (the active schema)
- But snapshot can include fields from old observations

### 3. Field Inclusion Logic
- **Reducer collects fields from observations**, not from schema
- If a field exists in any observation, it can appear in the snapshot
- Removed fields from schema don't prevent them from appearing in snapshots

### 4. Merge Policy Fallback
- If a field is removed from schema, it has no merge policy
- Reducer uses default `"last_write"` strategy (line 93 in `observation_reducer.ts`)

### 5. Backward Compatibility
- Old observations remain readable
- New schema must handle missing fields gracefully (optional fields)
- Removed fields from old observations still appear in snapshots

---

## Alternative: Field Completely Disappears

If you want `old_field` to disappear from snapshots, you have two options:

### Option 1: Filter in Application Layer
```typescript
// When reading snapshots, filter out deprecated fields
const snapshot = await getEntitySnapshot(entityId);
const filteredSnapshot = Object.fromEntries(
  Object.entries(snapshot.snapshot).filter(
    ([key]) => !DEPRECATED_FIELDS.includes(key)
  )
);
```

### Option 2: Create New Observation with Explicit Null
```json
{
  "id": "obs_003",
  "schema_version": "2.0.0",
  "fields": {
    "old_field": null  // Explicitly null to override old value
  }
}
```

However, this violates immutability principles - you shouldn't modify old observations.

---

## Scenario: Changing a Field Type (Breaking Change)

This example demonstrates how an entity snapshot is reconciled when a field's type changes.

### Initial State: Schema 1.0.0

**Schema Definition:**
```json
{
  "entity_type": "invoice",
  "schema_version": "1.0.0",
  "schema_definition": {
    "fields": {
      "invoice_number": { "type": "string", "required": true },
      "amount_due": { "type": "string", "required": true }  // ← String type
    }
  },
  "reducer_config": {
    "merge_policies": {
      "invoice_number": { "strategy": "last_write" },
      "amount_due": { "strategy": "last_write" }
    }
  }
}
```

**Observation 1 (created with schema 1.0.0):**
```json
{
  "id": "obs_001",
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "1.0.0",
  "observed_at": "2025-01-15T10:00:00Z",
  "fields": {
    "invoice_number": "INV-001",
    "amount_due": "1000.00"  // ← String value
  }
}
```

---

### Breaking Change: Schema 2.0.0 (Changes `amount_due` from string to number)

**New Schema Definition:**
```json
{
  "entity_type": "invoice",
  "schema_version": "2.0.0",  // ← Major version bump (breaking change)
  "schema_definition": {
    "fields": {
      "invoice_number": { "type": "string", "required": true },
      "amount_due": { 
        "type": "number",  // ← Changed from string to number
        "required": true,
        "converters": [  // ← Converter added to handle old string values
          {
            "from": "string",
            "to": "number",
            "function": "string_to_number",
            "deterministic": true
          }
        ]
      }
    }
  },
  "reducer_config": {
    "merge_policies": {
      "invoice_number": { "strategy": "last_write" },
      "amount_due": { "strategy": "last_write" }
    }
  }
}
```

**New Observation 2 (created with schema 2.0.0):**
```json
{
  "id": "obs_002",
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "2.0.0",
  "observed_at": "2025-01-20T14:00:00Z",
  "fields": {
    "invoice_number": "INV-001",
    "amount_due": 1200.00  // ← Number value (native type)
  }
}
```

---

### Reconciliation: Snapshot Recomputed with Schema 2.0.0

**Reducer Process:**

1. **Load Active Schema** (schema 2.0.0):
   ```typescript
   const schemaEntry = await schemaRegistry.loadActiveSchema("invoice");
   // Returns schema 2.0.0 (amount_due is now number type with converter)
   ```

2. **Collect All Observations**:
   ```typescript
   const observations = [
     obs_001,  // schema_version: "1.0.0", amount_due: "1000.00" (string)
     obs_002   // schema_version: "2.0.0", amount_due: 1200.00 (number)
   ];
   ```

3. **Extract All Unique Fields**:
   ```typescript
   // Result: ["invoice_number", "amount_due"]
   ```

4. **Apply Merge Strategy for `amount_due`**:

   **Reducer Behavior (With Type Conversion):**
   - Observations with field: [obs_001, obs_002]
   - obs_001 has `"1000.00"` (string) - stored as-is from schema 1.0.0
   - obs_002 has `1200.00` (number) - stored as-is from schema 2.0.0
   - Merge policy: `last_write`
   - **Step 1**: Apply merge strategy → `1200.00` from obs_002 (most recent)
   - **Step 2**: Check if value matches schema type → Already a number, no conversion needed
   - Result: `1200.00` (number) - matches schema 2.0.0 type

   **If obs_001 wins merge strategy (e.g., higher priority):**
   - **Step 1**: Apply merge strategy → `"1000.00"` from obs_001 (string)
   - **Step 2**: Check if value matches schema type → String, but schema expects number
   - **Step 3**: Apply converter `string_to_number` → `1000.00` (number)
   - Result: `1000.00` (number) - converted to match schema 2.0.0 type

   **✅ Converter Application:**
   - The reducer applies converters during snapshot computation
   - Ensures snapshot values always match the active schema's type definitions
   - Old observations keep their original types (immutable)
   - Converters are applied during snapshot computation to ensure type consistency

**Reconciled Snapshot (computed with schema 2.0.0):**
```json
{
  "entity_id": "ent_inv_123",
  "entity_type": "invoice",
  "schema_version": "2.0.0",
  "snapshot": {
    "invoice_number": "INV-001",
    "amount_due": 1200.00  // ← Number type (from obs_002, most recent, already correct type)
  },
  "provenance": {
    "invoice_number": "obs_002",
    "amount_due": "obs_002"
  }
}
```

**If obs_001 wins merge strategy (e.g., higher priority):**
```json
{
  "snapshot": {
    "amount_due": 1000.00  // ← Number type (converted from obs_001's string value)
  },
  "provenance": {
    "amount_due": "obs_001"  // ← Still traces to original observation
  }
}
```

**Important Notes:**
- Old observation (obs_001) still has `amount_due: "1000.00"` as string (immutable)
- **Reducer applies converters** during snapshot computation to ensure type consistency
- If old observation wins merge strategy, its value is converted to match active schema type
- Converters are applied both during observation creation AND snapshot computation
- **Snapshot always conforms to active schema type** - type mismatches are resolved via converters

---

## Scenario: Changing Field from Optional to Required

### Initial State: Schema 1.0.0

**Schema Definition:**
```json
{
  "fields": {
    "vendor_name": { "type": "string", "required": false }  // ← Optional
  }
}
```

**Observation 1:**
```json
{
  "schema_version": "1.0.0",
  "fields": {
    "invoice_number": "INV-001"
    // vendor_name not present (was optional)
  }
}
```

### Breaking Change: Schema 2.0.0 (Makes `vendor_name` required)

**New Schema Definition:**
```json
{
  "schema_version": "2.0.0",
  "fields": {
    "vendor_name": { "type": "string", "required": true }  // ← Now required
  }
}
```

**Observation 2:**
```json
{
  "schema_version": "2.0.0",
  "fields": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corp"  // ← Now provided
  }
}
```

### Reconciliation

**Snapshot:**
```json
{
  "schema_version": "2.0.0",
  "snapshot": {
    "invoice_number": "INV-001",
    "vendor_name": "Acme Corp"  // ← From obs_002
  }
}
```

**Key Points:**
- Old observation (obs_001) doesn't have `vendor_name` (was optional)
- New observation (obs_002) has `vendor_name` (now required)
- Snapshot includes `vendor_name` from obs_002
- Old observations without required fields are still valid (they were created when field was optional)
- New observations must include required fields (enforced during creation)

---

## Summary

**Breaking changes work because:**
1. Observations are immutable (keep their original `schema_version`)
2. Reducer collects fields from observations, not schema
3. Old fields can still appear in snapshots if they exist in old observations
4. New schema must be backward-compatible (handle missing fields)
5. Removed fields use default merge policy (`last_write`)
6. **Type changes**: 
   - Reducer applies converters during snapshot computation to ensure type consistency
   - If old observation wins merge strategy, its value is converted to match active schema type
   - Converters are applied both during observation creation AND snapshot computation
   - **Snapshot always conforms to active schema type** - type mismatches are resolved
7. **Required status changes**: Old observations without required fields are still valid

**The snapshot reflects the "current truth" using the active schema, but includes all data from all observations regardless of their schema version.**
