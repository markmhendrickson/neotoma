# v0.2.15 Deployment Checklist

**Version:** 0.2.15  
**Release Type:** Major (Breaking Changes)  
**Deployment Date:** TBD

## Pre-Deployment

### Code Review ✅

- [x] All deprecated MCP actions removed
- [x] Unified `ingest()` action implemented
- [x] New HTTP API endpoints created
- [x] Frontend updated to use new endpoints
- [x] All TypeScript errors resolved
- [x] All type checks passing
- [x] UI build successful
- [x] Backend build successful

### Documentation Review ✅

- [x] Canonical vocabulary applied to 40+ files
- [x] README.md updated
- [x] Architecture docs updated
- [x] Subsystem docs updated
- [x] Release notes created
- [x] Migration guide created
- [x] Changelog created

### Testing ⏳

- [ ] Apply migrations to test database
- [ ] Test unified `ingest()` with file content
- [ ] Test unified `ingest()` with entities array
- [ ] Test new HTTP endpoints
- [ ] Test frontend functionality
- [ ] Verify entity queries working
- [ ] Verify observations created correctly
- [ ] Verify entity merge functionality

## Deployment Steps

### 1. Database Migration ⏳

**Development Environment:**
```bash
# Login to Supabase
npx supabase login

# Link project
npx supabase link --project-ref YOUR_DEV_PROJECT_REF

# Apply migrations
npx supabase db push
```

**Verify migrations applied:**
```sql
-- Check table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'interpretations'
);

-- Check column renamed
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'observations' 
  AND column_name = 'interpretation_id';

-- Check new tables exist
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'source_entity_edges'
);
```

**Expected Results:**
- `interpretations` table exists ✅
- `interpretation_runs` table does NOT exist ✅
- `observations.interpretation_id` column exists ✅
- `source_entity_edges` table exists ✅
- `source_event_edges` table exists ✅

### 2. Application Deployment ⏳

**Build artifacts:**
```bash
npm run build        # Backend
npm run build:ui     # Frontend
```

**Deploy:**
- [ ] Deploy backend server
- [ ] Deploy frontend static assets
- [ ] Update MCP server configuration
- [ ] Restart services

### 3. Verification ⏳

**Smoke Tests:**

```bash
# Test unified ingest (structured)
curl -X POST http://localhost:8080/api/observations/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "user_id": "test-user",
    "entity_type": "note",
    "entity_identifier": "test-note",
    "fields": {"title": "Test"}
  }'

# Test entity query
curl -X POST http://localhost:8080/api/entities/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "entity_type": "note",
    "limit": 10
  }'

# Test MCP ingest action (via MCP client)
# Should succeed with new unified API
```

**Expected Results:**
- All endpoints return 200 OK
- No "Unknown tool" errors for `ingest` action
- Entities returned from query endpoint
- Observations created successfully

### 4. Monitoring ⏳

- [ ] Check error logs for any issues
- [ ] Monitor API response times
- [ ] Verify database performance
- [ ] Check for any deprecated action attempts

## Post-Deployment

### Communication 📢

- [ ] Update API documentation
- [ ] Notify users of deprecated actions
- [ ] Provide migration guide link
- [ ] Announce new unified `ingest()` action

### Monitoring Metrics 📊

Track these metrics for 7 days post-deployment:

- **API Endpoints:**
  - `/api/entities/query` usage
  - `/api/observations/create` usage
  - Legacy endpoint usage (should trend to zero)

- **MCP Actions:**
  - `ingest()` calls (should increase)
  - Errors for deprecated actions (should be none after migration)

- **Performance:**
  - Entity query response times
  - Observation creation times
  - Database query performance

### Rollback Plan 🔄

If critical issues found:

1. **Code rollback:**
   ```bash
   git checkout v0.2.14
   npm install
   npm run build
   npm run build:ui
   ```

2. **Database rollback:**
   - Rename `interpretations` → `interpretation_runs`
   - Rename `interpretation_id` → `interpretation_run_id`
   - Drop new tables (`source_entity_edges`, `source_event_edges`)
   
   **Note:** Rollback requires manual SQL. Test thoroughly before deploying.

## Success Criteria

All criteria must be met:

- [x] Code builds successfully
- [ ] Database migrations applied
- [ ] All smoke tests passing
- [ ] No errors in production logs (24hr window)
- [ ] Frontend functioning correctly
- [ ] MCP actions working correctly
- [ ] Performance metrics acceptable

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Database migration fails | High | Test in dev first, have rollback ready |
| Breaking existing MCP clients | High | Provide migration guide, deprecated action warnings |
| Performance degradation | Medium | Monitor metrics, optimize queries if needed |
| Data loss during migration | High | Backup before migration, dry-run testing |

## Approvals

- [ ] Technical review complete
- [ ] Migration plan approved
- [ ] Rollback plan tested
- [ ] Deployment window scheduled

## Timeline

- **Code Complete:** January 1, 2026 ✅
- **Migration Ready:** January 1, 2026 ✅
- **Deployment:** TBD
- **Verification:** TBD (24hr post-deployment)
- **Cleanup (v0.2.16):** TBD (after stable period)

## Notes

- Migrations are **forward-only** - no automatic rollback
- Legacy HTTP endpoints maintained temporarily for backward compatibility
- Full legacy removal scheduled for v0.2.16
- Data migration script (Phase 4) to be created post-deployment

---

**Status:** ✅ Ready for database migration and deployment


