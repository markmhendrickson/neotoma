# Type Detection Analytics Strategy for v0.1.0

_(Forward-Compatible Approach for E2EE Migration)_

---

## Purpose

This document defines how to store type detection metadata in v0.1.0 in a way that:
1. Works immediately (accessible via service role in v0.1.0)
2. Remains accessible to app creators after E2EE (v2.0.0)
3. Supports user debugging and schema expansion

---

## Problem Statement

**Requirement:** Track unknown schema types being uploaded to inform schema expansion decisions.

**Challenge:**
- v0.1.0: Data stored in Supabase, service role can access (no encryption)
- v2.0.0: Data encrypted end-to-end, app creators cannot decrypt user data
- Need: Analytics data accessible to app creators even after E2EE

---

## Solution: Dual-Storage Approach

### 1. Store in `extraction_metadata` (User-Facing)

**Purpose:** User debugging, future schema expansion, data preservation

**Location:** `extraction_metadata.type_detection` (JSONB in `records` table)

**Structure:**
```typescript
extraction_metadata: {
  type_detection: {
    detected_type: "document",  // Final assigned type
    fallback_reason: "no_type_matched_2_plus_patterns",
    attempted_types: {
      "invoice": 1,  // Matched 1 pattern
      "receipt": 1,  // Matched 1 pattern
      "transaction": 0,
      // ... all types with match counts
    },
    filename_hint?: "invoice_2024.pdf",  // If filename suggested a type
    detection_timestamp: "2024-01-15T10:30:00Z"
  },
  // ... other extraction_metadata fields
}
```

**Access:**
- v0.1.0: Accessible via service role (app creators can query)
- v2.0.0: Encrypted, only user can access (for debugging)

---

### 2. Emit Telemetry Events (App Creator Analytics)

**Purpose:** Analytics accessible to app creators (always, even after E2EE)

**Location:** Telemetry/analytics system (PostHog/Mixpanel, Prometheus, or separate analytics table)

**Event Type:** `schema_detection.fallback` or `schema_detection.attempted`

**Structure:**
```typescript
// Emitted BEFORE encryption (in v0.1.0) or BEFORE encryption (in v2.0.0)
{
  event_type: "schema_detection.fallback",
  timestamp: "2024-01-15T10:30:00Z",
  payload: {
    record_id: "rec_xyz",  // UUID only, no PII
    detected_type: "document",
    fallback_reason: "no_type_matched_2_plus_patterns",
    attempted_types: {
      "invoice": 1,
      "receipt": 1,
      // ... match counts (no PII)
    },
    filename_extension?: ".pdf",  // Extension only, not full filename
    file_size_bytes: 1048576,  // Size only, no content
  },
  user_id?: "user_abc",  // For analytics aggregation
  trace_id?: "trace_123"
}
```

**Access:**
- v0.1.0: Accessible via analytics platform (PostHog/Mixpanel)
- v2.0.0: Still accessible (emitted BEFORE encryption)

**Storage Options:**
1. **PostHog/Mixpanel** (recommended for v0.1.0+)
   - Already planned for product analytics (FU-803)
   - Designed for app creator access
   - No PII (only metadata)

2. **Separate Analytics Table** (alternative)
   - `schema_detection_analytics` table (not encrypted)
   - Accessible via service role (always)
   - Aggregated queries for analytics

3. **Prometheus Metrics** (for aggregated stats)
   - `neotoma_schema_detection_fallback_total{type="document"}`
   - `neotoma_schema_detection_attempted_total{type="invoice",match_count="1"}`
   - Aggregated counters (no per-record data)

---

## Implementation for v0.1.0

### Step 1: Store in `extraction_metadata`

**Location:** `src/services/file_analysis.ts` or schema detection function

**Code:**
```typescript
function detectSchemaType(rawText: string, fileName?: string): {
  detectedType: string;
  typeDetectionMetadata: TypeDetectionMetadata;
} {
  const matchCounts: Record<string, number> = {};
  
  // Count pattern matches for each type
  for (const [type, patterns] of Object.entries(SCHEMA_DETECTION_PATTERNS)) {
    matchCounts[type] = patterns.filter(pattern => pattern.test(rawText)).length;
  }
  
  // Find types with 2+ matches
  const candidates = Object.entries(matchCounts)
    .filter(([_, count]) => count >= 2)
    .sort(([_, countA], [__, countB]) => countB - countA);
  
  const detectedType = candidates.length > 0 ? candidates[0][0] : "document";
  const fallbackReason = detectedType === "document" 
    ? "no_type_matched_2_plus_patterns" 
    : undefined;
  
  // Extract filename hint (extension only, not full filename)
  const filenameHint = fileName 
    ? extractFilenameHint(fileName)  // e.g., "invoice.pdf" → "invoice"
    : undefined;
  
  return {
    detectedType,
    typeDetectionMetadata: {
      detected_type: detectedType,
      fallback_reason: fallbackReason,
      attempted_types: matchCounts,  // All types with match counts
      filename_hint: filenameHint,
      detection_timestamp: new Date().toISOString()
    }
  };
}
```

**Storage:**
```typescript
// In record creation flow
const { detectedType, typeDetectionMetadata } = detectSchemaType(rawText, fileName);

const extraction_metadata = {
  type_detection: typeDetectionMetadata,
  // ... other extraction_metadata fields
};

await db.insert('records', {
  type: detectedType,
  properties: structuredProperties,
  extraction_metadata: extraction_metadata,
  // ...
});
```

---

### Step 2: Emit Telemetry Events

**Location:** `src/services/file_analysis.ts` or schema detection function

**Code:**
```typescript
// Emit telemetry event BEFORE storing record
async function emitTypeDetectionTelemetry(
  recordId: string,
  typeDetectionMetadata: TypeDetectionMetadata,
  fileSize?: number,
  fileName?: string
): Promise<void> {
  // Only emit if fallback occurred (unknown type)
  if (typeDetectionMetadata.fallback_reason) {
    await emitTelemetryEvent({
      event_type: "schema_detection.fallback",
      timestamp: typeDetectionMetadata.detection_timestamp,
      payload: {
        record_id: recordId,
        detected_type: typeDetectionMetadata.detected_type,
        fallback_reason: typeDetectionMetadata.fallback_reason,
        attempted_types: typeDetectionMetadata.attempted_types,
        filename_extension: fileName ? getFileExtension(fileName) : undefined,
        file_size_bytes: fileSize,
      },
      // user_id added by telemetry service (from auth context)
      // trace_id added by telemetry service
    });
  }
  
  // Also emit attempted types for analytics (even if not fallback)
  // This helps track which types are close matches
  for (const [type, matchCount] of Object.entries(typeDetectionMetadata.attempted_types)) {
    if (matchCount > 0) {
      await emitTelemetryEvent({
        event_type: "schema_detection.attempted",
        timestamp: typeDetectionMetadata.detection_timestamp,
        payload: {
          record_id: recordId,
          attempted_type: type,
          match_count: matchCount,
          detected_type: typeDetectionMetadata.detected_type,
        },
      });
    }
  }
}
```

**Telemetry Service:**
```typescript
// src/services/telemetry.ts
async function emitTelemetryEvent(event: TelemetryEvent): Promise<void> {
  // Option 1: PostHog/Mixpanel (if integrated)
  if (config.posthogApiKey) {
    await posthog.capture({
      distinctId: event.user_id || 'anonymous',
      event: event.event_type,
      properties: event.payload,
      timestamp: event.timestamp,
    });
  }
  
  // Option 2: Separate analytics table (fallback for v0.1.0)
  await db.insert('schema_detection_analytics', {
    event_type: event.event_type,
    timestamp: event.timestamp,
    payload: event.payload,
    user_id: event.user_id,
    trace_id: event.trace_id,
  });
  
  // Option 3: Prometheus metrics (aggregated)
  if (event.event_type === 'schema_detection.fallback') {
    metrics.schemaDetectionFallbackTotal.inc({
      type: event.payload.detected_type,
    });
  }
}
```

---

## Analytics Queries

### Query 1: Unknown Schema Types (Most Common Fallbacks)

**PostHog/Mixpanel:**
```sql
-- Count fallback events by detected_type
SELECT detected_type, COUNT(*) as count
FROM schema_detection_analytics
WHERE event_type = 'schema_detection.fallback'
GROUP BY detected_type
ORDER BY count DESC
```

**Prometheus:**
```
neotoma_schema_detection_fallback_total
```

### Query 2: Near-Miss Types (Types That Almost Matched)

**PostHog/Mixpanel:**
```sql
-- Find types that matched 1 pattern (near-misses)
SELECT attempted_type, COUNT(*) as count
FROM schema_detection_analytics
WHERE event_type = 'schema_detection.attempted'
  AND match_count = 1
  AND detected_type = 'document'  -- Only for fallback cases
GROUP BY attempted_type
ORDER BY count DESC
```

### Query 3: Filename Hints (What Users Are Trying to Upload)

**PostHog/Mixpanel:**
```sql
-- Analyze filename hints for fallback cases
SELECT filename_extension, COUNT(*) as count
FROM schema_detection_analytics
WHERE event_type = 'schema_detection.fallback'
  AND filename_extension IS NOT NULL
GROUP BY filename_extension
ORDER BY count DESC
```

---

## Migration to v2.0.0

**No Changes Required:**
- Telemetry events already emitted BEFORE encryption
- Analytics remain accessible (not encrypted)
- `extraction_metadata` becomes encrypted (user-only access)

**Optional Enhancement:**
- Add analytics aggregation job (pre-compute common queries)
- Create analytics dashboard (unknown types, near-misses)
- Alert on new unknown types (potential schema candidates)

---

## Privacy Considerations

**What's Stored:**
- ✅ Record IDs (UUIDs, not PII)
- ✅ Schema types (not PII)
- ✅ Pattern match counts (not PII)
- ✅ File extensions (not full filenames)
- ✅ File sizes (not content)

**What's NOT Stored:**
- ❌ Full filenames (may contain PII)
- ❌ File content (PII)
- ❌ Properties (PII)
- ❌ Raw text (PII)

**Compliance:**
- No PII in telemetry events (per `docs/subsystems/privacy.md`)
- Analytics data separate from user data
- User data remains encrypted in v2.0.0

---

## Success Criteria

**v0.1.0 Implementation:**
- ✅ Type detection metadata stored in `extraction_metadata`
- ✅ Telemetry events emitted for fallback cases
- ✅ Analytics queries functional (unknown types, near-misses)
- ✅ Zero PII in telemetry events

**v2.0.0 Compatibility:**
- ✅ Analytics remain accessible (emitted before encryption)
- ✅ User data encrypted (extraction_metadata encrypted)
- ✅ No changes required to analytics system

---

## Related Documentation

- `docs/architecture/schema_handling.md` — Extraction metadata structure
- `docs/subsystems/privacy.md` — PII handling rules
- `docs/observability/metrics_standard.md` — Telemetry standards
- `docs/specs/MVP_FEATURE_UNITS.md` — FU-803 (Product Analytics)




