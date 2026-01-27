---
title: "GDPR Compliance with Immutability Guarantees"
status: "proposal"
source_plan: "gdpr_compliance_with_immutability_b51593ad.plan.md"
migrated_date: "2026-01-22"
priority: "p1"
estimated_effort: "4-6 weeks (phased implementation)"
---

# GDPR Compliance with Immutability Guarantees

## Proposal Context

This proposal was migrated from `.cursor/plans/gdpr_compliance_with_immutability_b51593ad.plan.md` on 2026-01-22.

**Original Status:** pending - 12 todos defined
**Relevance:** Critical for GDPR compliance (Article 17 Right to Erasure) while maintaining Neotoma's immutability guarantees. Required for EU/EEA users and general data protection compliance.
**Architecture Alignment:** Verified - aligns with observation-snapshot model, maintains immutability principles

## Overview

GDPR Article 17 (Right to Erasure) requires deletion of personal data upon user request, but Neotoma's architecture enforces immutability: observations cannot be modified or deleted once created. This proposal implements a two-tier deletion system that satisfies both requirements through:

1. **Soft Deletion (Immutable)**: Deletion observations that mark entities/relationships as deleted
2. **Cryptographic Erasure (GDPR-Compliant)**: Encrypt data with user-specific key, then delete key to make data irretrievable

## Architecture Overview

### Two-Tier Deletion Approach

**Soft Delete (Immutable):**
- Creates deletion observation marking entity as deleted
- Maintains immutability and full audit trail
- Used for normal user-initiated deletions
- Reducers exclude deleted items from snapshots
- Queries filter deleted items by default
- **GDPR Status**: Not sufficient alone (data still retrievable)

**Hard Delete (GDPR Compliance):**
- Cryptographic erasure: Encrypt with user key, then delete key
- Physical deletion: After legal retention period expires
- Makes data irretrievable (GDPR-compliant)
- Maintains database structure and immutability
- Recognized as GDPR-compliant by regulators

### GDPR Requirements Analysis

**When Hard Deletion (Irretrievable) is Required:**

GDPR Article 17 requires data to be "erased" and "irretrievable" when:
1. Data no longer necessary for original purpose
2. Consent withdrawn (no other legal basis)
3. User objects to processing (no overriding legitimate grounds)
4. Unlawful processing
5. Legal obligation requires erasure

**Key Point**: GDPR requires data to be "irretrievable" - it does NOT mandate physical deletion. Cryptographic erasure (encrypt then delete key) satisfies this requirement and is recognized as GDPR-compliant.

**Timeline Requirements:**
- **Standard**: 30 days from request
- **Extended**: Up to 90 days for complex requests (must notify user within first month)
- **Immediate**: Soft deletion should happen within hours
- **Backup deletion**: Within 30-day backup retention period

## Technical Details

### Phase 1: Soft Deletion (Immutable)

**Deletion Observation Schema:**
- Uses existing `observations` table (no schema changes)
- Special field: `_deleted: true`
- Metadata: `deleted_at`, `deleted_by`, `deletion_reason`
- High priority (`source_priority: 1000`) to override other observations

**Implementation:**
- `src/services/deletion.ts`: Create deletion observation service
- `src/reducers/observation_reducer.ts`: Modify to exclude deleted entities
- `src/services/entities.ts`: Update queries to filter deleted items
- `src/services/relationships.ts`: Add relationship deletion support

### Phase 2: Hard Deletion (GDPR Compliance)

**Deletion Request Tracking:**
- `deletion_requests` table with deadline tracking
- Status: `pending`, `in_progress`, `completed`, `rejected`, `extended`
- Tracks soft/hard deletion timestamps, backup deletion, confirmations

**Cryptographic Erasure:**
- `src/services/gdpr_deletion.ts`: Encrypt observations with user-specific key
- Delete encryption key (makes data unrecoverable)
- Maintains database structure and immutability

**Physical Deletion:**
- Only used after legal retention periods expire
- Deletes observations, snapshots, relationship observations
- Breaks immutability (last resort)

**Deadline Monitoring:**
- `src/services/deletion_monitor.ts`: Daily cron to check deadlines
- Alerts for approaching deadlines (within 7 days)
- Escalates overdue requests

### Phase 3: Documentation and Compliance

- Update `docs/legal/compliance.md` with two-tier deletion approach
- Create `docs/subsystems/deletion.md` documenting deletion architecture
- Document GDPR timeline requirements and compliance verification

### Phase 4: Testing

- Unit tests: Deletion observation creation, reducer behavior, query filtering
- Integration tests: Soft/hard deletion workflows, retention periods, audit trails

## Implementation Steps

### Phase 1: Soft Deletion (Week 1-2)
1. Create deletion observation service
2. Modify observation reducer to exclude deleted entities
3. Update entity and relationship queries to filter deleted items
4. Add relationship deletion support

### Phase 2: Hard Deletion (Week 3-4)
1. Create `deletion_requests` table migration
2. Implement cryptographic erasure service
3. Implement physical deletion service (for retention periods)
4. Create GDPR deletion workflow MCP action
5. Implement deadline monitoring service

### Phase 3: Documentation (Week 5)
1. Update compliance documentation
2. Create deletion architecture documentation
3. Document GDPR timeline requirements

### Phase 4: Testing (Week 6)
1. Write unit tests for deletion services
2. Write integration tests for GDPR workflows
3. Test deadline monitoring and alerts

## Testing Strategy

**Unit Tests:**
- Deletion observation creation with various scenarios
- Reducer exclusion of deleted entities
- Query filtering for deleted items
- Relationship deletion

**Integration Tests:**
- Complete soft deletion workflow
- Cryptographic erasure workflow
- Legal obligation retention period handling
- Deadline monitoring and alerts
- Extension handling (up to 90 days)

## Implementation Considerations

**What's Already Done:**
- None - this is a new feature

**What's Still Needed:**
- All phases (1-4) as outlined above
- 12 todos from original plan

**Potential Conflicts:**
- None identified - aligns with existing observation-snapshot architecture
- May need to coordinate with backup retention policies

**Dependencies:**
- Existing observation and snapshot infrastructure
- Encryption key management system (may need to be implemented)
- Backup deletion system (may need to be implemented)

## Key Design Decisions

1. **Two-Tier Approach**: Separates immutable soft deletion from GDPR-compliant hard deletion
2. **Observation-Based**: Uses existing observation model for consistency
3. **Reducer Exclusion**: Reducers return null for deleted entities
4. **Query Filtering**: Default queries exclude deleted items (like merged entities)
5. **Cryptographic Erasure**: Encrypt then delete key (makes data unrecoverable while maintaining structure)
6. **Audit Trail**: All deletion requests logged in `deletion_requests` table

## GDPR Compliance Summary

**What GDPR Requires:**
- Data must be "erased" (removed from active processing)
- Data must be "irretrievable" (cannot be recovered)

**How This Proposal Satisfies GDPR:**
- ✅ Soft deletion immediately removes data from active use
- ✅ Cryptographic erasure makes data irretrievable (GDPR-compliant)
- ✅ Maintains immutability (observations remain, just encrypted)
- ✅ Full audit trail maintained
- ✅ Timeline compliance (30 days standard, 90 days extended)
- ✅ Legal obligations respected (retention periods)

**Recommended Implementation:**
- **Default**: Soft deletion + Cryptographic erasure (immediate)
- **Legal obligations**: Soft delete now, cryptographic erasure after retention period

## References

- Original plan: `.cursor/plans/gdpr_compliance_with_immutability_b51593ad.plan.md`
- Related docs: 
  - `docs/legal/compliance.md` - GDPR compliance procedures
  - `docs/subsystems/observation_architecture.md` - Observation model
  - `docs/subsystems/entity_merge.md` - Similar pattern for merged entities
  - `docs/foundation/philosophy.md` - Immutability principles
