# Automatic Schema Expansion Architecture

_(Post-MVP Feature: User-Driven Schema Discovery and Expansion)_

---

## Purpose

This document defines the architectural approach for automatic schema expansion in Neotoma. This feature allows the system to automatically create and expand schemas based on patterns detected in user data, with user opt-in preference and retroactive review capabilities.

**Status:** Post-MVP feature. Documented for future implementation once MVP core functionality is complete.

---

## Overview

**Problem:** Users upload files with fields that don't match existing schemas. Currently, these fields are preserved in `extraction_metadata.unknown_fields`, but users must manually create schemas.

**Solution:** Automatic schema expansion detects patterns in `extraction_metadata.unknown_fields` across multiple records and automatically creates schemas when patterns are strong enough, with user opt-in control and retroactive review.

**Key Principle:** "Explicit control" means the user explicitly enables the capability once, not approval every time. Similar to how `cloudStorageEnabled` works.

---

## 1. User Preference Model

### Settings

Users can opt-in to automatic schema expansion via settings:

```typescript
interface Settings {
  autoExpandSchemas: boolean;  // Default: false
  autoSchemaConfidenceThreshold: 'high' | 'medium' | 'low';  // Default: 'high'
  autoSchemaMinOccurrences: number;  // Default: 5
  autoReextractOnSchemaCreate: boolean;  // Default: false
}
```

**Settings UI:**
- Checkbox: "Automatically expand schemas"
- Dropdown: Confidence threshold (high/medium/low)
- Number input: Minimum occurrences (field must appear in N+ records)
- Checkbox: "Re-extract records when schema created"

**Rationale:**
- Explicit user opt-in (respects NEOTOMA_MANIFEST.md Section 5.2)
- Configurable thresholds (user controls sensitivity)
- Reversible (user can disable anytime)

---

## 2. Pattern Detection Architecture

### Data Source

Pattern detection analyzes `extraction_metadata.unknown_fields` across records:

```sql
SELECT type, extraction_metadata->'unknown_fields' as unknown_fields
FROM records
WHERE created_at > NOW() - INTERVAL '30 days'
  AND extraction_metadata->'unknown_fields' IS NOT NULL
ORDER BY created_at DESC
LIMIT 1000;
```

### Pattern Analysis

**Algorithm:**
1. Group records by `type` (existing schema)
2. Extract field names from `unknown_fields` across records
3. Calculate frequency: how many records contain each unknown field
4. Calculate consistency: field appears in same context across records
5. Generate suggestions when patterns are strong

**Example:**
- 10 records with `type = 'document'` all have `unknown_fields.purchase_order`
- 9 records have `unknown_fields.client_organization`
- 8 records have `unknown_fields.timeline_weeks`
- → Suggest creating `project_proposal` schema or expanding `document` schema

### Schema Suggestion Structure

```typescript
interface SchemaSuggestion {
  type: 'new_type' | 'expand_existing';
  type_name?: string;  // For new types
  existing_type?: string;  // For expansions
  suggested_fields: Array<{
    field_name: string;
    field_type: 'string' | 'number' | 'date' | 'array' | 'object';
    frequency: number;  // How often this field appears
    sample_values: unknown[];  // Examples for user review
    confidence: 'high' | 'medium' | 'low';
  }>;
  affected_records: number;  // How many records would benefit
  pattern_evidence: {
    records_analyzed: number;
    pattern_consistency: number;  // 0-1 score
    extraction_quality: number;  // 0-1 score
  };
}
```

---

## 3. Automatic Schema Creation

### Deterministic Fingerprinting

**Requirement:** Same patterns MUST produce same schema (deterministic).

**Implementation:**
- Generate fingerprint from pattern: hash of field names + types + frequencies
- Check if schema with fingerprint already exists (idempotent)
- If exists, use existing schema; if not, create new

```typescript
function generateSchemaFingerprint(suggestion: SchemaSuggestion): string {
  const pattern = {
    fields: suggestion.suggested_fields.map(f => ({
      name: f.field_name,
      type: f.field_type,
      frequency: f.frequency
    })).sort((a, b) => a.name.localeCompare(b.name)),
    evidence: suggestion.pattern_evidence
  };
  return sha256(JSON.stringify(pattern));
}
```

### Auto-Creation Criteria

Schema is auto-created if:
1. User preference `autoExpandSchemas` is enabled
2. Pattern consistency score > 0.8
3. Affected records >= `autoSchemaMinOccurrences`
4. All suggested fields have confidence = 'high' (if threshold is 'high')

### Schema Storage

**Custom Schemas Table:**

```sql
CREATE TABLE custom_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL UNIQUE,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  definition JSONB NOT NULL,
  detection_patterns TEXT[],
  extraction_rules JSONB,
  fingerprint TEXT UNIQUE,  -- Deterministic hash of patterns
  auto_created BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Schema Definition Structure:**

```typescript
interface SchemaDefinition {
  type: string;
  schema_version: string;
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'date' | 'array' | 'object';
    required: boolean;
    extraction_pattern?: string;  // Regex pattern
    description?: string;
  }>;
  detection_patterns: string[];  // Regex patterns for type detection
}
```

---

## 4. Background Processing

### Integration Point

Automatic schema expansion runs in background (non-blocking) after record creation:

```typescript
async function processUploadWithAutoSchema(
  rawText: string,
  fileName: string,
  userId: string
): Promise<NeotomaRecord> {
  // Normal extraction
  const extraction = await extractAndValidate(rawText, detectedType);
  const record = await createRecord({ ...extraction, user_id: userId });
  
  // Background auto-expansion (non-blocking)
  if (await getSetting(userId, 'autoExpandSchemas')) {
    analyzeAndAutoExpandSchemas(userId, record).catch(err => 
      logError('Auto schema expansion failed', err)
    );
  }
  
  return record;
}
```

### Processing Flow

1. Query recent records with `unknown_fields` (last 30 days)
2. Analyze patterns (group by type, calculate frequencies)
3. Generate suggestions if patterns are strong
4. Auto-create schemas if criteria met
5. Optionally re-extract affected records with new schema

**Error Handling:**
- Failures in background processing don't block record creation
- Errors logged for debugging
- User can review failed expansions in UI

---

## 5. Schema Review and Management

### Schema Management UI

**Features:**
- List canonical schemas (read-only, 16 MVP types)
- List custom schemas (manual + auto-created)
- Show record count per schema
- Actions per schema:
  - View details
  - Lock (auto-created → manual, prevent deletion)
  - Delete (if unused)

**Badges:**
- "Auto-created" vs "Manual"
- "Locked" (previously auto-created, now locked)

**Filters:**
- All schemas
- Canonical only
- Custom only
- Auto-created only
- Manual only

### Retroactive Control

**User Actions:**
1. **Disable auto-expansion:** Turn off `autoExpandSchemas` setting
2. **Delete auto-created schema:** Remove schema if unused
3. **Lock schema:** Convert auto-created to manual (prevent deletion)
4. **Review suggestions:** View pending suggestions before auto-creation (optional UI)

**Rationale:**
- User maintains control retroactively
- Can disable feature anytime
- Can clean up unwanted auto-created schemas
- Can lock important auto-created schemas

---

## 6. Deterministic Behavior

### Requirements

**MUST:**
- Same patterns → same schema (fingerprinting ensures idempotent creation)
- Deterministic extraction with new schemas (regex patterns only)
- Same input → same output (maintains manifest requirement)

**MUST NOT:**
- Create different schemas for same patterns
- Use non-deterministic logic in pattern detection
- Use LLM for schema creation (respects MVP constraint)

### Fingerprinting Example

```typescript
// Pattern detected:
// - purchase_order (string, appears in 8/10 records)
// - client_organization (string, appears in 9/10 records)
// - timeline_weeks (number, appears in 7/10 records)

// Fingerprint: sha256("purchase_order:string:0.8,client_organization:string:0.9,timeline_weeks:number:0.7")

// Result: Same pattern always generates same fingerprint
// → If schema with this fingerprint exists, use it
// → If not, create new schema with this fingerprint
```

---

## 7. Future Implementation Notes

### MCP Actions Required

1. **`suggest_schema_expansion`**: Return schema suggestions for review
2. **`create_schema`**: Create custom schema (manual or auto)
3. **`list_schemas`**: List all schemas (canonical + custom)
4. **`delete_schema`**: Delete custom schema (if unused)
5. **`lock_schema`**: Convert auto-created schema to manual

### UI Components Required

1. **Settings UI:** Schema management section with auto-expansion toggle
2. **Schemas View:** List, filter, and manage all schemas
3. **Schema Details:** View schema definition, extraction rules, record count
4. **Schema Suggestions:** Review pending suggestions (optional)

### Integration Points

1. **Ingestion pipeline:** Trigger background analysis after record creation
2. **Extraction service:** Check custom schemas before canonical schemas
3. **Settings service:** Store and retrieve user preferences
4. **Schema service:** Pattern analysis, fingerprinting, schema creation

### Database Migrations

1. Create `custom_schemas` table
2. Add indexes for fast schema lookup
3. Add indexes for pattern analysis queries

---

## 8. Constraints and Compliance

### Manifest Compliance

**Respects:**
- ✅ Explicit user control (user opts in via settings)
- ✅ No synthetic data (schemas derived from actual extraction patterns)
- ✅ Deterministic (same patterns → same schema via fingerprinting)
- ✅ Reversible (can disable, delete, or revert schemas)
- ✅ No LLM (pattern detection uses frequency analysis, not inference)

**Post-MVP Rationale:**
- MVP requires only 16 canonical schemas + `document` fallback
- Automatic expansion is enhancement, not core requirement
- Reduces MVP complexity and risk

---

## 9. Related Documentation

- **Layered storage model:** `docs/architecture/schema_handling.md`
- **Extraction metadata:** `docs/subsystems/schema.md` Section 3.11
- **Schema definitions:** `docs/subsystems/record_types.md` Section 4
- **Manifest constraints:** `docs/NEOTOMA_MANIFEST.md` Sections 5.2, 5.6, 12.2

---

## Agent Instructions

### When to Load This Document

Load `docs/architecture/schema_expansion.md` when:
- Planning automatic schema expansion implementation (post-MVP)
- Understanding pattern detection requirements
- Designing schema review and management UI
- Implementing MCP actions for schema management

### Implementation Status

**MVP:** Documented but not implemented. Focus on core extraction and layered storage.

**Post-MVP:** Implement automatic schema expansion following this architecture.

---

**END OF DOCUMENT**












