# GDPR Compliance with Immutability Guarantees

## Problem Statement

GDPR Article 17 (Right to Erasure) requires deletion of personal data upon user request, but Neotoma's architecture enforces immutability: observations cannot be modified or deleted once created. This plan implements a two-tier deletion system that satisfies both requirements.

## Architecture Overview

Two-tier deletion approach:

1. **Soft Delete (Immutable)**: Create deletion observations that mark entities/relationships as deleted

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Maintains immutability and full audit trail
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Used for normal user-initiated deletions
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Reducers exclude deleted items from snapshots
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Queries filter deleted items by default
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - **GDPR Status**: Not sufficient for GDPR compliance alone (data still retrievable)

2. **Hard Delete (GDPR Compliance)**: Cryptographic erasure or physical deletion

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Used when GDPR requires actual data removal
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Encrypt data with user-specific key, then delete key (cryptographic erasure)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Or physical deletion after legal retention period expires
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Maintains audit log of deletion requests
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - **GDPR Status**: Satisfies GDPR requirement for "erasure" and "irretrievable" data

## GDPR Requirements Analysis

### When Hard Deletion (Irretrievable) is Required

GDPR Article 17 requires data to be "erased" and "irretrievable" when:

1. **Data no longer necessary**: Personal data no longer needed for original purpose
2. **Consent withdrawn**: User withdraws consent and no other legal basis exists
3. **Objection to processing**: User objects and no overriding legitimate grounds
4. **Unlawful processing**: Data was processed unlawfully
5. **Legal obligation**: Union or Member State law requires erasure

**Key Point**: GDPR requires data to be "irretrievable" - it does NOT mandate physical deletion. Cryptographic erasure (encrypt then delete key) satisfies this requirement and is recognized as GDPR-compliant.

### When Soft Deletion May Be Permissible (Temporary)

Soft deletion may be acceptable as an interim measure when:

1. **Legal retention obligations**: Data must be retained for statutory period (e.g., tax records for 7 years)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Soft delete immediately, hard delete after retention expires
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Example: Tax records marked deleted but retained until 7-year period ends

2. **Technical constraints**: Immediate hard deletion technically difficult

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Soft delete immediately, hard delete when technically feasible
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Should be temporary (days/weeks, not months/years)

**Important**: Soft deletion alone does NOT satisfy GDPR Article 17. It must be followed by hard deletion (cryptographic or physical) to make data irretrievable.

### Recommended Approach for Neotoma

**For Normal User Deletions:**

1. Create soft deletion observation (immediate, immutable)
2. Perform cryptographic erasure (encrypt with user key, delete key)
3. Result: Data is irretrievable, GDPR-compliant, while maintaining immutability

**For Legal Obligations:**

1. Create soft deletion observation (immediate)
2. Schedule cryptographic erasure for after retention period expires
3. Result: Data retained as required, then made irretrievable

**Why Cryptographic Erasure is Ideal:**

- Satisfies GDPR "irretrievable" requirement
- Maintains database structure (no physical deletion)
- Preserves immutability (observations remain, just encrypted)
- Full audit trail maintained
- Recognized as GDPR-compliant by regulators

## Implementation Plan

### Phase 1: Soft Deletion (Immutable)

#### 1.1 Deletion Observation Schema

**File**: `supabase/migrations/[timestamp]_add_deletion_observations.sql`

Add deletion support to observations:

- Deletion observations use special field: `_deleted: true`
- Include metadata: `deleted_at`, `deleted_by`, `deletion_reason`
- High priority (`source_priority: 1000`) to ensure they override other observations
```sql
-- No schema changes needed - use existing observations table
-- Deletion observations stored as normal observations with special fields
```


#### 1.2 Deletion Observation Creation

**File**: `src/services/deletion.ts` (new)

Create service for deletion observations:

```typescript
export async function createDeletionObservation(
  entityId: string,
  userId: string,
  reason?: string
): Promise<Observation> {
  // Create observation with deletion marker
  const deletionObservation = {
    entity_id: entityId,
    entity_type: await getEntityType(entityId),
    schema_version: "1.0",
    source_id: null, // No source for user deletions
    interpretation_id: null,
    observed_at: new Date().toISOString(),
    specificity_score: 1.0,
    source_priority: 1000, // High priority (user action)
    fields: {
      _deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      deletion_reason: reason || "User requested deletion"
    },
    user_id: userId
  };
  
  // Create observation (uses existing createObservation logic)
  return await createObservation(deletionObservation);
}
```

#### 1.3 Reducer Modifications

**File**: `src/reducers/observation_reducer.ts`

Modify `computeSnapshot` to check for deletion:

```typescript
async computeSnapshot(
  entityId: string,
  observations: Observation[],
): Promise<EntitySnapshot | null> {
  // Sort observations deterministically
  const sortedObservations = this.sortObservations(observations);
  
  // Check for deletion observation (highest priority wins)
  const deletionObs = sortedObservations.find(
    obs => obs.fields._deleted === true && obs.source_priority >= 1000
  );
  
  if (deletionObs) {
    // Return null or snapshot with deleted flag
    return null; // Or return snapshot with { _deleted: true }
  }
  
  // ... existing merge logic
}
```

#### 1.4 Query Filtering

**File**: `src/services/entities.ts`

Modify entity queries to exclude deleted:

```typescript
async function queryEntities(userId: string, filters: any) {
  return await supabase
    .from('entity_snapshots')
    .select('*')
    .eq('user_id', userId)
    .is('merged_to_entity_id', null) // Exclude merged
    .is('snapshot->_deleted', null) // Exclude deleted
    .match(filters);
}
```

#### 1.5 Relationship Deletion

**File**: `src/services/relationships.ts`

Add deletion support for relationships:

```typescript
async function deleteRelationship(
  relationshipType: RelationshipType,
  sourceEntityId: string,
  targetEntityId: string,
  userId: string,
  reason?: string
): Promise<void> {
  // Create deletion observation for relationship
  await createRelationshipObservations(
    [{
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      metadata: {
        _deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deletion_reason: reason
      }
    }],
    null, // No source
    null, // No interpretation
    userId,
    1000 // High priority
  );
}
```

### Phase 2: Hard Deletion (GDPR Compliance)

#### GDPR Timeline Requirements

**Article 17 Requirement**: Data must be erased "without undue delay"

**Standard Timeline:**

- **1 month (30 days)**: Standard deadline for completing deletion
- **Acknowledgment**: Should acknowledge request immediately or within days
- **Confirmation**: Must confirm completion within 30 days

**Extended Timeline:**

- **Up to 3 months (90 days)**: Allowed for complex requests
- **Notification required**: Must notify user of extension within first month
- **Reason required**: Must provide reason for delay

**Backup Deletion:**

- **Within backup retention period**: 30 days for Neotoma backups
- Can be done asynchronously after primary deletion

**Implementation Timeline:**

1. **Immediate (within hours/days)**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Acknowledge deletion request
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Perform soft deletion (create deletion observations)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Remove data from active queries
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Update deletion_requests.status = 'in_progress'

2. **Within 30 days (standard deadline)**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Complete cryptographic erasure
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Delete from backups (within backup retention period)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Confirm completion to user
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Update deletion_requests.status = 'completed'

3. **Extended (up to 90 days)**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - For complex requests (large datasets, multiple systems)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Notify user within first month
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Provide reason for delay
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Update deletion_requests.status = 'extended'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Set extended_until = requested_at + 90 days

#### 2.1 Deletion Request Tracking

**File**: `supabase/migrations/[timestamp]_add_deletion_requests.sql`

Create table to track GDPR deletion requests:

```sql
CREATE TABLE deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  request_type TEXT NOT NULL, -- 'soft' or 'hard'
  legal_basis TEXT, -- 'consent', 'contract', 'legal_obligation'
  retention_until TIMESTAMPTZ, -- For legal obligations
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected', 'extended'
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  deadline_at TIMESTAMPTZ NOT NULL, -- 30 days from request (or 90 if extended)
  extended_until TIMESTAMPTZ, -- If extended, new deadline
  extension_reason TEXT, -- Reason for extension
  soft_deleted_at TIMESTAMPTZ, -- When soft deletion completed
  hard_deleted_at TIMESTAMPTZ, -- When cryptographic erasure completed
  backup_deleted_at TIMESTAMPTZ, -- When backups deleted
  completed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  confirmation_sent_at TIMESTAMPTZ, -- When user notified
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX idx_deletion_requests_deadline ON deletion_requests(deadline_at) WHERE status IN ('pending', 'in_progress');
```

#### 2.2 Cryptographic Erasure Service

**File**: `src/services/gdpr_deletion.ts` (new)

Implement cryptographic erasure:

```typescript
export async function performCryptographicErasure(
  userId: string,
  entityIds: string[]
): Promise<void> {
  // Generate user-specific encryption key
  const userKey = await generateUserEncryptionKey(userId);
  
  // Encrypt observations with user key
  for (const entityId of entityIds) {
    const observations = await getObservationsForEntity(entityId);
    
    for (const obs of observations) {
      // Encrypt sensitive fields
      const encrypted = await encryptWithKey(obs.fields, userKey);
      
      // Replace fields with encrypted version
      await supabase
        .from('observations')
        .update({ fields: encrypted })
        .eq('id', obs.id);
    }
  }
  
  // Delete encryption key (makes data unrecoverable)
  await deleteUserEncryptionKey(userId);
  
  // Mark deletion request as completed
  await markDeletionRequestCompleted(userId, 'hard');
}
```

#### 2.3 Physical Deletion Service

**File**: `src/services/gdpr_deletion.ts`

Implement physical deletion after retention period:

```typescript
export async function performPhysicalDeletion(
  userId: string,
  entityIds: string[]
): Promise<void> {
  // Only delete if retention period expired
  const retentionExpired = await checkRetentionPeriod(userId);
  if (!retentionExpired) {
    throw new Error('Retention period not expired');
  }
  
  // Delete observations (cascade to snapshots)
  await supabase
    .from('observations')
    .delete()
    .in('entity_id', entityIds)
    .eq('user_id', userId);
  
  // Delete entity snapshots
  await supabase
    .from('entity_snapshots')
    .delete()
    .in('entity_id', entityIds)
    .eq('user_id', userId);
  
  // Delete relationship observations
  await supabase
    .from('relationship_observations')
    .delete()
    .or(`source_entity_id.in.(${entityIds.join(',')}),target_entity_id.in.(${entityIds.join(',')})`)
    .eq('user_id', userId);
  
  // Mark deletion request as completed
  await markDeletionRequestCompleted(userId, 'hard');
}
```

#### 2.4 GDPR Deletion Workflow

**File**: `src/actions.ts`

Add MCP action for GDPR deletion:

```typescript
app.post("/gdpr_delete", async (req, res) => {
  const { user_id, legal_basis, retention_until } = req.body;
  const requestReceivedAt = new Date();
  
  // 1. Verify user identity
  await verifyUserIdentity(user_id);
  
  // 2. Check legal basis
  if (legal_basis === 'legal_obligation' && retention_until) {
    // Legal obligation: Soft delete now, hard delete after retention period
    const entities = await getUserEntities(user_id);
    
    // Soft delete immediately (within hours)
    for (const entity of entities) {
      await createDeletionObservation(entity.id, user_id, 'GDPR request - legal obligation');
    }
    
    // Schedule cryptographic erasure after retention period
    await scheduleDeletionAfterRetention(user_id, retention_until);
    
    await logDeletionRequest(user_id, 'scheduled', legal_basis, retention_until, requestReceivedAt);
    
    // Confirm within 30 days (immediate confirmation for scheduled)
    return res.json({ 
      status: 'scheduled', 
      retention_until,
      confirmation_sent: true,
      estimated_completion: retention_until
    });
  }
  
  // 3. Normal GDPR deletion: Soft delete + cryptographic erasure
  const entities = await getUserEntities(user_id);
  const entityIds = entities.map(e => e.id);
  
  // 4. Perform soft deletion immediately (within hours, removes from active use)
  for (const entity of entities) {
    await createDeletionObservation(entity.id, user_id, 'GDPR request');
  }
  
  // 5. Perform cryptographic erasure (must complete within 30 days, ideally within days)
  // Note: Can be done asynchronously, but must complete within GDPR timeline
  await performCryptographicErasure(user_id, entityIds);
  
  // 6. Schedule backup deletion (within 30 days, as backups have 30-day retention)
  await scheduleBackupDeletion(user_id, entityIds);
  
  // 7. Log deletion request
  const completedAt = new Date();
  await logDeletionRequest(user_id, 'completed', legal_basis, null, requestReceivedAt, completedAt);
  
  // 8. Confirm to user (must be within 30 days of request)
  await sendDeletionConfirmation(user_id, completedAt);
  
  return res.json({ 
    status: 'completed',
    completed_at: completedAt,
    confirmation_sent: true
  });
});
```

**GDPR Timeline Requirements:**

- **"Without undue delay"**: GDPR Article 17 requires deletion "without undue delay"
- **Standard timeline**: Generally interpreted as **within 1 month (30 days)** from request
- **Extension allowed**: Can extend by 2 additional months (total 90 days) for complex requests
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Must notify user of extension within first month
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Must provide reason for delay
- **Backup deletion**: Can be within backup retention period (30 days for Neotoma)

**Implementation Timeline:**

1. **Immediate (within hours)**: 

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Soft deletion (create deletion observations)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Remove data from active queries
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Acknowledge request to user

2. **Within 30 days (standard)**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Complete cryptographic erasure
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Delete from backups (within backup retention period)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Confirm completion to user

3. **Extended timeline (up to 90 days)**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - For complex requests (large datasets, multiple systems)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Must notify user within first month
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Must provide reason for delay

**Workflow Decision Tree:**

```
User requests deletion
  │
  ├─ Legal obligation with retention period?
  │   ├─ Yes → Soft delete now, schedule cryptographic erasure after retention
  │   └─ No → Continue
  │
  ├─ Normal GDPR deletion
  │   ├─ 1. Create soft deletion observations (immutable)
  │   ├─ 2. Perform cryptographic erasure (GDPR-compliant)
  │   └─ 3. Log deletion request
  │
  └─ Result: Data is irretrievable, GDPR-compliant, immutability maintained
```

### Phase 3: Documentation and Compliance

#### 3.1 Update Compliance Documentation

**File**: `docs/legal/compliance.md`

Update deletion procedures to reflect two-tier approach:

```markdown
### Right to Erasure (Article 17)

**Two-Tier Deletion:**

1. **Soft Delete (Immutable):**
         - Creates deletion observation marking entity as deleted
         - Maintains full audit trail and provenance
         - Used for normal user-initiated deletions
         - Data remains in database but excluded from queries

2. **Hard Delete (GDPR Compliance):**
         - Cryptographic erasure: Encrypt with user key, then delete key
         - Physical deletion: After legal retention period expires
         - Used when GDPR requires actual data removal
         - Maintains audit log of deletion requests
```

#### 3.2 Update Architecture Documentation

**File**: `docs/subsystems/deletion.md` (new)

Document deletion architecture:

- Soft deletion via observations
- Hard deletion for GDPR compliance
- Reducer behavior with deleted entities
- Query filtering patterns
- Audit trail requirements

### Phase 4: Testing

#### 4.1 Unit Tests

**File**: `tests/services/deletion.test.ts` (new)

- Test deletion observation creation
- Test reducer exclusion of deleted entities
- Test query filtering
- Test relationship deletion

#### 4.2 Integration Tests

**File**: `tests/integration/gdpr_deletion.test.ts` (new)

- Test soft deletion workflow
- Test hard deletion (cryptographic erasure)
- Test retention period handling
- Test audit trail creation

## Key Design Decisions

1. **Two-Tier Approach**: Separates immutable soft deletion from GDPR-compliant hard deletion
2. **Observation-Based**: Uses existing observation model for consistency
3. **Reducer Exclusion**: Reducers return null for deleted entities (or snapshot with deleted flag)
4. **Query Filtering**: Default queries exclude deleted items (like merged entities)
5. **Cryptographic Erasure**: Encrypt then delete key (makes data unrecoverable while maintaining structure)
6. **Audit Trail**: All deletion requests logged in `deletion_requests` table

## Migration Strategy

1. Deploy soft deletion (Phase 1) - non-breaking
2. Deploy hard deletion infrastructure (Phase 2) - optional
3. Update compliance procedures (Phase 3)
4. Migrate existing deletion requests to new system

## GDPR Compliance Summary

### What GDPR Requires

GDPR Article 17 requires personal data to be:

- **Erased** - removed from active processing
- **Irretrievable** - cannot be recovered or accessed

**Important**: GDPR does NOT require physical deletion. It requires data to be irretrievable.

### How This Plan Satisfies GDPR

1. **Soft Deletion (Observation-Based)**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Immediately removes data from active use (queries filtered)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Maintains immutability and audit trail
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ❌ Alone does NOT satisfy GDPR (data still retrievable)

2. **Cryptographic Erasure**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Makes data irretrievable (key deleted = data unrecoverable)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Satisfies GDPR "irretrievable" requirement
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Maintains database structure and immutability
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Recognized as GDPR-compliant by regulators

3. **Physical Deletion**

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Makes data irretrievable
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ✅ Satisfies GDPR requirement
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ❌ Breaks immutability (observations deleted)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - ⚠️ Only used after legal retention periods expire

### Recommended Implementation

**Default for GDPR requests**: Soft deletion + Cryptographic erasure

- Immediate: Soft delete (removes from active use)
- Immediate: Cryptographic erasure (makes irretrievable, GDPR-compliant)
- Result: GDPR satisfied, immutability maintained

**For legal obligations**: Soft delete now, cryptographic erasure after retention

- Immediate: Soft delete (removes from active use)
- Scheduled: Cryptographic erasure after retention period expires
- Result: Legal obligation satisfied, then GDPR-compliant

#### 2.5 Deadline Monitoring

**File**: `src/services/deletion_monitor.ts` (new)

Monitor deletion requests to ensure GDPR deadlines are met:

```typescript
export async function monitorDeletionDeadlines(): Promise<void> {
  // Find requests approaching deadline (within 7 days)
  const { data: approaching } = await supabase
    .from('deletion_requests')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .lte('deadline_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
    .gt('deadline_at', new Date().toISOString());
  
  // Alert if deadline approaching
  for (const request of approaching || []) {
    await sendDeadlineAlert(request);
  }
  
  // Find overdue requests
  const { data: overdue } = await supabase
    .from('deletion_requests')
    .select('*')
    .in('status', ['pending', 'in_progress'])
    .lt('deadline_at', new Date().toISOString());
  
  // Escalate overdue requests
  for (const request of overdue || []) {
    await escalateOverdueRequest(request);
  }
}
```

**Cron Job**: Run daily to check deadlines

## Compliance Verification

- ✅ Maintains immutability (observations never modified, only encrypted)
- ✅ Supports GDPR deletion (cryptographic erasure makes data irretrievable)
- ✅ Full audit trail (deletion requests logged with timestamps)
- ✅ Legal obligations respected (retention periods)
- ✅ User control (explicit deletion requests)
- ✅ GDPR Article 17 compliance (data is erased and irretrievable)
- ✅ Timeline compliance (soft delete immediate, hard delete within 30 days)
- ✅ Deadline monitoring (alerts for approaching/overdue requests)
- ✅ Extension handling (up to 90 days with user notification)