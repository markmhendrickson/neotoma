# Migration Plan: v1.0.0 (Plaintext) → v2.0.0 (E2EE)
## Migration Overview
### Current State (v1.0.0)
- Records stored in Supabase (server-side)
- Service role can access all records (RLS bypass)
- MCP servers see plaintext
- Browser is client (no local datastore)
### Target State (v2.0.0)
- Records stored locally (SQLite WASM + OPFS)
- Records encrypted before transmission
- Server stores only ciphertext
- Browser is authoritative datastore
- MCP servers cannot decrypt user data
### Migration Challenge
- Migrate existing user records from Supabase to local encrypted datastore
- Ensure zero data loss
- Maintain backward compatibility during transition
- Support gradual rollout
## Migration Phases
### Phase 1: Dual-Mode Deployment (Weeks 1-4)
**Goal:** Deploy v2.0.0 with feature flag, support both modes simultaneously.
**Actions:**
1. Deploy v2.0.0 with `ENCRYPTION_ENABLED=false` (default)
2. New users can opt into E2EE via settings
3. Existing users continue using plaintext mode
4. Monitor adoption metrics
**User Experience:**
- Existing users: No change, continue using plaintext
- New users: Option to enable E2EE in settings
- Migration tool available but not promoted
**Success Criteria:**
- ✅ v2.0.0 deployed without breaking existing functionality
- ✅ E2EE opt-in works for new users
- ✅ Zero migration-related support tickets
### Phase 2: Opt-In Migration (Weeks 5-8)
**Goal:** Enable migration tool for all users, provide in-app migration wizard.
**Actions:**
1. Enable migration tool for all users
2. Add in-app migration wizard (Settings → Security → Enable Encryption)
3. Support both modes simultaneously
4. Monitor migration success rate
**User Experience:**
- Users see migration prompt in settings
- One-click migration wizard:
  1. Generate encryption keys (if not exists)
  2. Download records from Supabase
  3. Encrypt records locally
  4. Verify integrity (checksums)
  5. Enable E2EE mode
  6. Option to keep Supabase backup (recommended)
**Migration Wizard Flow:**
```
1. User clicks "Enable End-to-End Encryption"
2. System checks: Has encryption keys? → Generate if not
3. System downloads all records from Supabase (paginated)
4. System encrypts each record locally
5. System verifies integrity (compare checksums)
6. System enables E2EE mode (feature flag)
7. System prompts: "Keep Supabase backup?" (recommended: Yes)
8. Migration complete
```
**Success Criteria:**
- ✅ Migration completion rate ≥ 80%
- ✅ Zero data loss during migration
- ✅ Migration time < 5 minutes for typical users (<1000 records)
- ✅ Support ticket volume < 5% of migrated users
### Phase 3: Default E2EE (Weeks 9-12)
**Goal:** New users default to E2EE, existing users prompted to migrate.
**Actions:**
1. Change default: `ENCRYPTION_ENABLED=true` for new users
2. Add migration prompt for existing plaintext users (non-intrusive)
3. Support both modes (backward compatibility)
4. Monitor adoption rate
**User Experience:**
- New users: E2EE enabled by default, no migration needed
- Existing users: Banner/prompt in settings: "Upgrade to end-to-end encryption"
- Plaintext mode still supported (backward compatibility)
**Success Criteria:**
- ✅ 100% of new users use E2EE
- ✅ ≥60% of existing users migrate
- ✅ Plaintext mode still functional (backward compatibility)
### Phase 4: E2EE-Only (Future, v3.0.0)
**Goal:** Remove plaintext mode, all records encrypted.
**Actions:**
1. Deprecate plaintext mode (6-month notice)
2. Force migration for remaining plaintext users
3. Remove plaintext code paths
4. Server stores only ciphertext
**User Experience:**
- Users must migrate (no opt-out)
- Migration tool becomes mandatory
- Plaintext mode no longer available
**Success Criteria:**
- ✅ 100% of users migrated
- ✅ Zero plaintext records in system
- ✅ Plaintext code paths removed
## Migration Tool Specification
### Tool: `migrate-to-e2ee`
**Location:** `src/migration/migrate-to-e2ee.ts`
**Functionality:**
1. **Download Records**
   - Fetch all records from Supabase (paginated)
   - Include `raw_text`, `properties`, `extraction_metadata`, `file_urls`
   - Preserve timestamps, relationships, entity edges
2. **Generate Keys** (if not exists)
   - Generate X25519 + Ed25519 keypairs
   - Store securely in browser (IndexedDB)
   - Export private key for user backup
3. **Encrypt Records**
   - Encrypt each record using envelope encryption
   - Store encrypted records in local SQLite
   - Preserve record IDs (UUIDs)
4. **Verify Integrity**
   - Compare checksums (pre-encryption vs post-decryption)
   - Verify all records migrated
   - Report any discrepancies
5. **Enable E2EE Mode**
   - Set feature flag: `ENCRYPTION_ENABLED=true`
   - Update user preferences
   - Disable Supabase sync (optional)
**Error Handling:**
- Retry failed downloads (exponential backoff)
- Resume interrupted migrations
- Rollback on verification failure
- Report errors to user
**Progress Tracking:**
- Show progress bar (records downloaded/encrypted)
- Estimate remaining time
- Allow cancellation (resume later)
## Data Integrity Verification
### Pre-Migration Checksum
```typescript
function generatePreMigrationChecksum(records: Record[]): string {
  const data = records.map((r) => ({
    id: r.id,
    type: r.type,
    properties: r.properties,
    raw_text: r.raw_text,
    // ... all fields
  }));
  return sha256(JSON.stringify(data));
}
```
### Post-Migration Verification
```typescript
async function verifyMigrationIntegrity(
  originalChecksum: string,
  encryptedRecords: EncryptedRecord[]
): Promise<boolean> {
  const decrypted = await decryptAll(encryptedRecords);
  const newChecksum = generatePreMigrationChecksum(decrypted);
  return originalChecksum === newChecksum;
}
```
### Verification Steps
1. Generate checksum before migration
2. Encrypt records
3. Decrypt records (test decryption)
4. Generate checksum after decryption
5. Compare checksums (must match)
6. Report verification result
## Rollback Procedures
### User-Level Rollback
**Scenario:** User wants to revert to plaintext mode.
**Procedure:**
1. User disables E2EE in settings
2. System downloads encrypted records from local SQLite
3. System decrypts records
4. System uploads plaintext records to Supabase
5. System disables E2EE mode
6. System deletes local encrypted records (optional)
**Tool:** `migrate-from-e2ee.ts`
### System-Level Rollback
**Scenario:** Critical bug requires disabling E2EE for all users.
**Procedure:**
1. Set feature flag: `ENCRYPTION_ENABLED=false` (global)
2. All users revert to plaintext mode
3. Local encrypted records remain (not deleted)
4. Users can re-enable E2EE after fix
**Rollback Time:** < 5 minutes (feature flag change)
## Migration Monitoring
### Key Metrics
- **Migration Completion Rate:** % of users who successfully migrate
- **Migration Time:** Average time to complete migration
- **Data Loss Incidents:** Count of verification failures
- **Support Ticket Volume:** Migration-related support requests
- **E2EE Adoption Rate:** % of users using E2EE
### Dashboards
- Migration progress dashboard (users migrated vs total)
- Error rate dashboard (migration failures)
- Performance dashboard (migration time distribution)
### Alerts
- Migration failure rate > 5% → Alert team
- Data loss detected → Immediate escalation
- Migration time > 10 minutes → Investigate performance
## User Communication
### Pre-Migration
- **Email:** "End-to-End Encryption Coming Soon"
- **In-App:** Banner: "Upgrade to end-to-end encryption for enhanced privacy"
### During Migration
- **In-App:** Migration wizard with clear steps
- **Documentation:** Migration guide with screenshots
### Post-Migration
- **Email:** "Your data is now end-to-end encrypted"
- **In-App:** Confirmation message with key export reminder
## Testing Strategy
### Unit Tests
- Migration tool logic (download, encrypt, verify)
- Checksum generation and verification
- Error handling and retry logic
### Integration Tests
- End-to-end migration (Supabase → local SQLite)
- Integrity verification
- Rollback procedures
### E2E Tests
- Migration wizard flow (Playwright)
- Error scenarios (network failures, interruptions)
- Performance (large datasets)
### Security Tests
- Key generation (cryptographic randomness)
- Encryption strength (envelope encryption)
- Key storage (secure browser storage)
## Risk Mitigation
### Data Loss Risk
**Mitigation:**
- Pre-migration backup (Supabase records preserved)
- Checksum verification (pre vs post)
- Dry-run mode (test migration without enabling E2EE)
- Rollback tool (revert to plaintext)
### Performance Risk
**Mitigation:**
- Paginated downloads (avoid memory issues)
- Async encryption (non-blocking)
- Progress tracking (user feedback)
- Performance benchmarks (target: <5min for 1000 records)
### User Adoption Risk
**Mitigation:**
- Clear migration wizard (one-click)
- Educational content (why E2EE matters)
- Opt-in by default (new users)
- Backward compatibility (plaintext still works)
## Success Criteria
**Migration is Successful When:**
1. ✅ ≥80% of users successfully migrate
2. ✅ Zero data loss incidents
3. ✅ Migration time < 5 minutes (P95)
4. ✅ Support ticket volume < 5% of migrated users
5. ✅ E2EE adoption rate ≥ 60%
6. ✅ Performance impact < 200ms latency (P95)
## Timeline Summary
**Assumption:** All timeline estimates assume Cursor agent execution (not human developers).
| Phase                     | Duration | Goal                              | Success Metric        |
| ------------------------- | -------- | --------------------------------- | --------------------- |
| Phase 1: Dual-Mode        | 4 weeks  | Deploy v2.0.0, support both modes | Zero breaking changes |
| Phase 2: Opt-In Migration | 4 weeks  | Enable migration tool             | ≥80% completion rate  |
| Phase 3: Default E2EE     | 4 weeks  | New users default to E2EE         | ≥60% adoption rate    |
| Phase 4: E2EE-Only        | Future   | Remove plaintext mode             | 100% migrated         |
**Total Migration Duration:** 12 weeks (3 months, assumes Cursor agent execution) + optional Phase 4
