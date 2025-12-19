# Feature Unit: FU-112 Storage Infrastructure

**Status:** Completed
**Priority:** P0 (Critical)
**Risk Level:** Medium
**Target Release:** v0.2.0
**Owner:** Worker Agent
**Created:** 2025-12-19
**Last Updated:** 2025-12-19

---

## Overview

**Brief Description:**
Implement storage infrastructure tables to support upload queue management and per-user storage usage tracking. This enables async upload retry mechanisms and quota enforcement.

**User Value:**
Users gain reliable file upload with automatic retry on failure, and the system can enforce fair storage limits per user.

**Defensible Differentiation:**
Enables privacy-first architecture by tracking storage per user, supporting data isolation and eventual quota enforcement.

**Technical Approach:**
- Create `upload_queue` table for tracking file uploads and retry states
- Create `storage_usage` table for per-user storage accounting
- Add RLS policies for user isolation
- Create indexes for efficient queries

---

## Requirements

### Functional Requirements

1. **Upload Queue Table:** Track pending, in-progress, completed, and failed uploads
2. **Storage Usage Table:** Track bytes used per user across storage buckets
3. **RLS Policies:** Enforce per-user data isolation
4. **Indexes:** Enable efficient queries for queue processing and usage lookups

### Non-Functional Requirements

1. **Performance:** Queue queries must complete in <50ms
2. **Determinism:** Table schema is static; queue processing is bounded eventual
3. **Consistency:** Strong consistency for usage counters (increment/decrement)
4. **Accessibility:** N/A (backend tables)
5. **Internationalization:** N/A (backend tables)

### Invariants (MUST/MUST NOT)

**MUST:**
- Upload queue entries MUST have user_id for RLS
- Storage usage MUST be tracked per user_id
- All tables MUST have RLS policies enabled
- Queue status transitions MUST be tracked with timestamps

**MUST NOT:**
- MUST NOT allow cross-user access via RLS
- MUST NOT expose access_tokens or secrets in upload_queue
- MUST NOT allow negative storage_bytes values

---

## Affected Subsystems

**Primary Subsystems:**
- Database schema: New tables and migrations
- Storage: Upload tracking and quotas

**Dependencies:**
- None (foundational infrastructure)

**Blocks:**
- FU-120: Raw Storage Service (depends on upload_queue)
- FU-130: Upload Queue Processor (depends on upload_queue)

**Documentation to Load:**
- `docs/foundation/layered_architecture.md`
- `supabase/schema.sql`

---

## Schema Changes

**New Tables:**

### upload_queue
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User who initiated upload (for RLS) |
| file_name | TEXT | Original file name |
| file_size_bytes | BIGINT | File size in bytes |
| mime_type | TEXT | MIME type of file |
| storage_path | TEXT | Target path in storage bucket |
| status | TEXT | pending, in_progress, completed, failed |
| attempt_count | INTEGER | Number of retry attempts |
| max_attempts | INTEGER | Maximum retry attempts allowed |
| error_message | TEXT | Last error if failed |
| queued_at | TIMESTAMPTZ | When upload was queued |
| started_at | TIMESTAMPTZ | When processing started |
| completed_at | TIMESTAMPTZ | When completed or failed |
| created_at | TIMESTAMPTZ | Record creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

### storage_usage
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User for usage tracking (unique) |
| total_bytes | BIGINT | Total bytes stored |
| file_count | INTEGER | Number of files stored |
| quota_bytes | BIGINT | User's storage quota (nullable for unlimited) |
| last_calculated_at | TIMESTAMPTZ | When usage was last recalculated |
| created_at | TIMESTAMPTZ | Record creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**Migration Required:** Yes

Migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_storage_infrastructure.sql`

---

## API/MCP Changes

**New MCP Actions:** None (infrastructure only)

**Modified MCP Actions:** None

---

## UI Changes

None (backend infrastructure)

---

## Observability

**Metrics:**
- `upload_queue_depth`: Gauge of pending uploads
- `upload_queue_failed_total`: Counter of failed uploads
- `storage_usage_bytes`: Gauge of bytes used per user

**Logs:**
- `info`: "Upload queued" (fields: user_id, file_name, file_size_bytes)
- `error`: "Upload failed" (fields: user_id, error_message, attempt_count)

---

## Testing Strategy

**Unit Tests:**
- Table creation verification
- RLS policy enforcement
- Index existence verification

**Integration Tests:**
- Insert into upload_queue respects RLS
- Insert into storage_usage respects uniqueness
- Queue status transitions work correctly

**Expected Coverage:**
- Schema tests: 100%
- RLS tests: 100%

---

## Error Scenarios

| Scenario | Error Code | Message | Recovery |
|----------|------------|---------|----------|
| User not found | `USER_NOT_FOUND` | "User ID not valid" | Verify user authentication |
| Quota exceeded | `QUOTA_EXCEEDED` | "Storage quota exceeded" | Delete files or upgrade quota |

---

## Rollout and Deployment

**Feature Flags:** No

**Rollback Plan:**
- Drop tables via migration rollback

**Monitoring:**
- Watch upload_queue depth for backlogs
- Watch storage_usage for quota violations
