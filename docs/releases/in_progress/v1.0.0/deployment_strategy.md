## Release v1.0.0 — Deployment and Rollback Strategy

_(Staging-First Deployment Strategy with Rollback Procedures)_

---

### Purpose

This document defines the deployment strategy for v1.0.0, including staging deployment, production deployment, and rollback procedures.

**Strategy**: `staging_first` — All releases deploy to staging first, validate, then deploy to production.

**Related Documents:**
- `release_plan.md` — Release overview and scope
- `acceptance_criteria.md` — Release-level acceptance criteria
- `pre_mortem.md` — Failure mode analysis
- `status.md` — Current status and progress tracking

---

### 1. Deployment Strategy: Staging First

#### 1.1 Staging Deployment

**Pre-deployment Checklist:**

- All P0 FUs marked `completed` with passing tests
- Integration test suite passes (see `integration_tests.md`)
- Database migrations tested in staging environment
- Environment variables validated
- SSL certificates valid
- Monitoring and alerting configured

**Deploy to Staging:**

1. Tag release: `git tag v1.0.0-staging`
2. Deploy application to staging.neotoma.app
3. Run database migrations
4. Verify health checks pass

**Staging Validation:**

- Run full integration test suite against staging
- Run smoke tests (core workflows)
- Performance benchmarks:
  - Upload latency P95 < 5s
  - Search latency P95 < 500ms
- Manual testing:
  - Upload various file types (PDF, CSV, images)
  - Verify extraction, timeline, search
  - Test MCP access with Claude/ChatGPT
  - Test auth and RLS isolation

**Staging Sign-Off Criteria:**

- All integration tests pass
- All smoke tests pass
- Performance benchmarks met
- Manual testing complete with no critical issues
- Sign-off from owner (Mark Hendrickson)

---

#### 1.2 Production Deployment

**Pre-deployment:**

1. Tag production release: `git tag v1.0.0`
2. Backup production database
3. Notify monitoring systems (expect deploy)
4. Prepare rollback plan

**Deploy to Production:**

1. Deploy application to app.neotoma.app
2. Run database migrations
3. Verify health checks pass
4. Enable production traffic

**Post-deployment Validation:**

- Run smoke tests against production
- Verify core metrics:
  - Upload success rate ≥ 95%
  - P95 latency < 5s
  - No orphans/cycles in graph
- Monitor for 1 hour:
  - Error rates < 1%
  - Latency within SLAs
  - No alerts triggered

**Production Sign-Off:**

- All smoke tests pass
- Metrics within acceptable ranges
- No critical errors or alerts
- Sign-off from owner

---

### 2. Rollback Plan

#### 2.1 Rollback Triggers

- Critical errors affecting > 10% of requests
- Data integrity issues (orphans/cycles detected)
- Upload success rate < 80%
- P95 latency > 10s for > 5 minutes
- Database migration failure
- Security vulnerability discovered

#### 2.2 Rollback Procedure

**Immediate Actions:**

1. **STOP**: Halt all deployment activities
2. **ALERT**: Notify owner immediately
3. **ASSESS**: Determine severity and impact

**Application Rollback:**

1. Revert to previous release tag: `v0.9.x` (last known-good)
2. Redeploy previous version
3. Verify health checks pass

**Database Rollback (if needed):**

1. Assess migration impact
2. If safe: Run down migrations to revert schema
3. If unsafe: Restore from pre-deployment backup
4. Verify data integrity after restore

**Post-Rollback Validation:**

1. Run smoke tests against rolled-back version
2. Verify core metrics restored
3. Monitor for 30 minutes
4. Investigate root cause

**Communication:**

- Internal: Post-mortem document
- External (if users affected): Status page update, apology, ETA for fix

#### 2.3 Rollback Testing

- Rollback procedure tested in staging before production deploy
- Database restore tested with production snapshot (anonymized)
- Rollback time target: < 15 minutes from decision to restored service

---

### 3. Deployment Timeline

**Staging Deployment:**
- Target: T-3 days (3 days before production)
- Duration: ~2 hours (including validation)

**Production Deployment:**
- Target: Day 0 (launch date)
- Duration: ~1 hour (including validation)
- Maintenance window: TBD (if needed)

---

### 4. Related Documents

- `release_plan.md` — Release overview and scope
- `acceptance_criteria.md` — Release-level acceptance criteria
- `pre_mortem.md` — Failure mode analysis
- `monitoring_plan.md` — Post-release monitoring and observability
- `status.md` — Current status and progress tracking

