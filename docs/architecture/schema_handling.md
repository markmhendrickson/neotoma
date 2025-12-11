# Schema Handling Architecture

_(Layered Storage Model and Field Validation Patterns)_

---

## Purpose

This document defines the architectural approach for schema handling in Neotoma, including the three-layer storage model that preserves all extracted data while maintaining deterministic schema compliance.

---

## 1. Three-Layer Storage Model

Neotoma uses a **three-layer storage model** to reconcile two requirements:
1. **Preserve all extracted data** (users can upload any file without data loss)
2. **Maintain deterministic schemas** (structured, queryable truth layer)

### Layer 1: `raw_text` (Immutable Original)

**Purpose:** Store the original extracted text exactly as extracted.

**Characteristics:**
- Immutable after ingestion (per NEOTOMA_MANIFEST.md Section 5.4)
- Full source material preserved
- Used for re-extraction if schemas evolve

**Storage:** Separate column in `records` table

### Layer 2: `properties` (Schema-Compliant, Deterministic)

**Purpose:** Store only fields that match the assigned schema type definition.

**Characteristics:**
- Schema-compliant fields only
- Deterministic (same input → same output)
- Queryable via JSONB indexes
- Must include `schema_version: "1.0"`
- Used for entity extraction, event generation, structured queries

**Storage:** JSONB column in `records` table

**Example:**
```json
{
  "schema_version": "1.0",
  "invoice_number": "INV-001",
  "amount": 1500.00,
  "currency": "USD",
  "date_issued": "2024-01-15T00:00:00Z",
  "vendor_name": "Acme Corp"
}
```

### Layer 3: `extraction_metadata` (Preservation Layer)

**Purpose:** Store unknown fields, validation warnings, and extraction quality metrics.

**Characteristics:**
- Unknown fields (extracted but not in schema definition)
- Validation warnings (missing required fields, unknown fields)
- Extraction quality metrics (fields_extracted_count, fields_filtered_count)
- Used for debugging, quality tracking, future schema expansion

**Storage:** JSONB column in `records` table

**Example:**
```json
{
  "unknown_fields": {
    "purchase_order": "PO-789",
    "internal_cost_center": "CC-456"
  },
  "warnings": [
    {
      "type": "unknown_field",
      "field": "purchase_order",
      "message": "Field 'purchase_order' not defined for type 'invoice' - preserved in extraction_metadata"
    }
  ],
  "extraction_quality": {
    "fields_extracted_count": 7,
    "fields_filtered_count": 2,
    "matched_patterns": ["invoice_number_pattern", "amount_due_pattern"]
  }
}
```

### Why Three Layers?

**Problem:** Users want to upload any file without losing data, but we need deterministic schemas for queries and AI reasoning.

**Solution:**
- `raw_text`: Never loses source material
- `properties`: Maintains schema compliance for deterministic queries
- `extraction_metadata`: Preserves everything else for future use

**Benefits:**
1. **Zero data loss:** All extracted data preserved somewhere
2. **Schema compliance:** `properties` contains only valid schema fields
3. **Determinism:** Same input → same `properties` structure
4. **Queryability:** Structured queries use `properties` (indexed)
5. **Explainability:** Warnings explain what was filtered and why
6. **Future evolution:** Unknown fields available for schema expansion

---

## 2. Field Validation Pattern

### Extraction and Validation Flow

```typescript
function extractAndValidate(
  rawText: string,
  detectedType: string
): {
  properties: Record<string, unknown>;
  extraction_metadata: ExtractionMetadata;
} {
  // 1. Extract ALL fields (including unknown ones)
  const allExtracted = extractAllFields(rawText, detectedType);
  
  // 2. Get schema definition for detected type
  const typeDefinition = getTypeDefinition(detectedType);
  
  // 3. Partition into structured vs unknown
  const { structured, unknown } = partitionFields(allExtracted, typeDefinition);
  
  // 4. Validate required fields
  const warnings = validateRequired(structured, typeDefinition);
  
  // 5. Build structured properties (schema-compliant only)
  const properties = {
    schema_version: "1.0",
    ...structured
  };
  
  // 6. Build extraction metadata (preservation layer)
  const extraction_metadata: ExtractionMetadata = {
    ...(Object.keys(unknown).length > 0 && { unknown_fields: unknown }),
    ...(warnings.length > 0 && { warnings }),
    extraction_quality: {
      fields_extracted_count: Object.keys(allExtracted).length,
      fields_filtered_count: Object.keys(unknown).length,
      matched_patterns: getMatchedPatterns(rawText, detectedType)
    }
  };
  
  return { properties, extraction_metadata };
}
```

### Partition Logic

**Function:** Separate extracted fields into schema-compliant vs unknown

**Rules:**
- Fields defined in schema definition → `structured` → `properties`
- Fields not defined in schema definition → `unknown` → `extraction_metadata.unknown_fields`
- Missing required fields → warning in `extraction_metadata.warnings`
- Unknown fields → warning in `extraction_metadata.warnings`

**Example:**
```typescript
// Extracted: { invoice_number, amount, purchase_order, internal_cost_center }
// Schema definition for 'invoice': { invoice_number, amount, currency, date_issued }

// Partition result:
// structured: { invoice_number, amount } → goes to properties
// unknown: { purchase_order, internal_cost_center } → goes to extraction_metadata.unknown_fields
```

### Validation Rules

**MUST:**
- Always create record (never reject entire record)
- Filter unknown fields to `extraction_metadata.unknown_fields`
- Log warnings for filtered fields and missing required fields
- Include `schema_version: "1.0"` in all `properties`
- Preserve all extracted data (in `properties` or `extraction_metadata`)

**MUST NOT:**
- Reject records due to unknown fields
- Reject records due to missing optional fields
- Store unknown fields in `properties`
- Modify or guess field values

---

## 3. Extraction Metadata Usage

### Query Patterns

**Structured queries (use `properties`):**
```sql
-- Find invoices from Acme Corp
SELECT * FROM records
WHERE type = 'invoice'
  AND properties @> '{"vendor_name": "Acme Corp"}'::jsonb;
```

**Quality monitoring (use `extraction_metadata`):**
```sql
-- Find records with extraction issues
SELECT * FROM records
WHERE extraction_metadata->'warnings' IS NOT NULL
  AND jsonb_array_length(extraction_metadata->'warnings') > 0;
```

**Schema evolution data (use `extraction_metadata`):**
```sql
-- Find records with unknown fields (potential schema expansion candidates)
SELECT * FROM records
WHERE extraction_metadata->'unknown_fields' IS NOT NULL;
```

### Entity and Event Extraction

**Important:** Entity extraction and event generation MUST use fields from `properties` only, NOT from `extraction_metadata.unknown_fields`.

**Rationale:**
- Entities and events must be deterministic and schema-compliant
- Unknown fields are not yet part of the schema definition
- Future schema expansion can migrate `unknown_fields` to `properties` and then extract entities/events

**Example:**
```typescript
// Entity extraction from invoice
const vendorName = properties.vendor_name; // ✅ Use this
// NOT: extraction_metadata.unknown_fields.vendor_name // ❌ Don't use this
```

---

## 4. Migration and Evolution

### When Schemas Evolve

**Additive Evolution Only:**
- New fields added to schema definition
- Existing records retain old `schema_version`
- New records use new `schema_version`
- Application handles both versions gracefully

### Future: Automatic Schema Expansion

Unknown fields in `extraction_metadata.unknown_fields` can be analyzed to suggest schema expansions:
- Pattern detection across multiple records
- User approval for schema changes
- Deterministic schema fingerprinting
- See `docs/architecture/schema_expansion.md` (post-MVP)

---

## 5. Related Documentation

- **Schema structure:** `docs/subsystems/schema.md` Section 3.11
- **Type definitions:** `docs/subsystems/record_types.md` Section 4
- **Validation rules:** `docs/subsystems/record_types.md` Section 10
- **Manifest constraints:** `docs/NEOTOMA_MANIFEST.md` Sections 5.4, 12.2, 14.4
- **Implementation guide:** `docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md` Section 5

---

## Agent Instructions

### When to Load This Document

Load `docs/architecture/schema_handling.md` when:
- Implementing field extraction and validation logic
- Understanding how unknown fields are preserved
- Designing queries that need to access unknown fields
- Planning schema evolution strategies

### Constraints Agents Must Enforce

1. **Always preserve data:** Unknown fields MUST go to `extraction_metadata`, never discarded
2. **Never reject records:** Records MUST be created even with missing required fields (warn only)
3. **Schema compliance:** Only schema-defined fields in `properties`
4. **Determinism:** Same input → same `properties` structure always
5. **Entity/Event extraction:** Use `properties` only, not `extraction_metadata`

---

**END OF DOCUMENT**









