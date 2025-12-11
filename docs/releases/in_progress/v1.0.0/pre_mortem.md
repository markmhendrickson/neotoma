## Release v1.0.0 — Pre-Mortem: Failure Mode Analysis

_(Identifying Likely Failure Modes and Mitigation Strategies)_

---

### Purpose

Before execution, identify likely failure modes and mitigation strategies to proactively address risks before they materialize.

**Review Schedule:**
- **Checkpoint 0.5** (after discovery): Update based on discovery findings
- **Checkpoint 1** (mid-release): Update based on execution progress
- **Checkpoint 2** (pre-deployment): Final review before production

**Related Documents:**
- `release_plan.md` — Release overview and scope
- `deployment_strategy.md` — Deployment and rollback procedures
- `status.md` — Current status and progress tracking

---

### 1. Identified Failure Modes

#### Failure Mode 1: RLS Implementation Issues (Per-User Isolation)

- **Probability**: Low (no existing data/users to migrate for MVP)
- **Impact**: Medium (new users affected, but no legacy data at risk)
- **Note**: MVP launches with fresh schema and no existing tenants. FU-701 adds `user_id` column and per-user RLS policies to tables that currently allow all authenticated users to see all records. Since there's no production data, this is building isolation from the start rather than migrating existing data.

**Early Warning Signals:**
- Test failures in multi-user isolation tests during FU-701 development
- Policy logic errors causing users to see wrong data or no data
- Service role queries failing (if policies too restrictive)
- User reports of missing records or cross-tenant data leakage (post-launch)

**Mitigation Strategy:**
- FU-701 includes comprehensive testing with multi-tenant fixtures
- Build `user_id` column and policies into schema from MVP start (not added later)
- Test RLS policies thoroughly with multiple test users before launch
- Verify service role can still perform background jobs (bypasses RLS correctly)
- Database migration dry-runs in staging before production

**Rollback Plan:**
- Revert schema changes (drop `user_id` column, remove policies) - simple since no data exists
- Temporarily revert to existing "public read" policy if needed
- Fix policies and redeploy (low impact on empty system)
- If users affected post-launch: Temporary workaround, notify affected users, fix within hours

---

#### Failure Mode 2: Graph Integrity Regressions (Orphans/Cycles)

- **Probability**: Medium (graph operations complex)
- **Impact**: High (breaks core product assumptions)

**Early Warning Signals:**
- Integration tests fail with orphan/cycle detection
- Graph integrity metrics show orphan_count > 0 or cycle_count > 0
- User reports of missing records or timeline inconsistencies

**Mitigation Strategy:**
- FU-103 includes property-based tests for graph operations
- Batch-level integration tests after each FU batch
- Continuous monitoring of graph integrity metrics
- Transactional inserts to maintain atomicity

**Rollback Plan:**
- Disable graph builder service immediately
- Revert to single-record inserts (simpler, less risky)
- Run graph repair scripts to fix orphans/cycles
- Full audit of graph data before re-enabling batch inserts

---

#### Failure Mode 3: MVP Date Slips by 2+ Weeks

- **Probability**: High (11-14 week estimate aggressive for 8 FUs)
- **Impact**: Medium (delays launch, extends costs)

**Early Warning Signals:**
- FU completion rate < 80% after 50% of batches complete (e.g., only 3/8 FUs done by Week 6)
- Critical FUs (FU-100, FU-103) taking 2x estimated time
- Integration test failures causing batch re-work
- Discovery findings require significant scope changes

**Mitigation Strategy:**
- Mid-release checkpoint (Checkpoint 1) after Batch 1 to assess progress
- Buffer time built into estimates (2-3 weeks per batch, not 1-2)
- Identify P1/P2 features that can be descoped if needed
- Continuous discovery reduces scope surprises

**Rollback Plan** (Scope Reduction):
- Move non-critical FUs to v1.1.0 (e.g., FU-105 if search can be basic)
- Focus on P0-only subset for MVP
- Adjust marketing timeline accordingly
- Update target ship date transparently

---

#### Failure Mode 4: OCR Determinism Fails in Production

- **Probability**: Low (feasibility validation in discovery should catch this)
- **Impact**: Critical (violates core product promise)

**Early Warning Signals:**
- Feasibility validation finds OCR non-deterministic edge cases
- User reports of different extraction results on same document
- Test suite shows flakiness in OCR output

**Mitigation Strategy:**
- Rigorous feasibility validation during discovery (100+ documents, 3x each)
- Pin tesseract version explicitly (v5.3.0)
- Test across different OS/environments
- Low-confidence flagging catches non-deterministic cases

**Rollback Plan:**
- If discovered pre-launch: Pivot to different OCR engine or defer PDF support
- If discovered post-launch: Mark affected records with warning, allow manual re-extraction
- Communication: Transparent about determinism limitations
- Long-term: Research alternative OCR solutions

---

#### Failure Mode 5: Discovery Reveals Low Willingness-to-Pay (< €25/month)

- **Probability**: Medium (pricing untested for this ICP)
- **Impact**: High (threatens business model)

**Early Warning Signals:**
- Business viability discovery shows < 40% willing to pay ≥€25/month
- Optimal price point (PSM intersection) < €25/month
- Users express confusion about value proposition

**Mitigation Strategy:**
- Early price sensitivity testing in discovery (Van Westendorp method)
- Clear value differentiation in discovery interviews
- Test multiple price anchors (€10, €25, €50, €125)

**Pivot Options:**
- **Option A**: Freemium model (free tier + paid features)
- **Option B**: Lower price point (€10-€15/month) with higher volume target
- **Option C**: Usage-based pricing (per document or per query)
- **Option D**: Defer monetization, focus on product-market fit first

**Go/No-Go Decision:**
- If < 30% willing to pay ≥€10/month → No-Go (defer MVP)
- If 30-50% willing to pay → Pivot to freemium or lower price
- If ≥50% willing to pay ≥€25/month → Go with planned pricing

---

### 2. Pre-Mortem Action Items

Before proceeding to discovery:

1. **Discovery Phase**: Validate OCR determinism rigorously (Failure Mode 4)
2. **Discovery Phase**: Test price sensitivity thoroughly (Failure Mode 5)
3. **Development**: Build buffer time into FU estimates (Failure Mode 3)
4. **FU-701**: Comprehensive RLS migration testing (Failure Mode 1)
5. **FU-103**: Property-based graph integrity tests (Failure Mode 2)
6. **Throughout**: Monitor early warning signals, adjust proactively

---

### 3. Review and Adjustment

Pre-mortem to be reviewed at:

- **Checkpoint 0.5** (after discovery): Update based on discovery findings
- **Checkpoint 1** (mid-release): Update based on execution progress
- **Checkpoint 2** (pre-deployment): Final review before production

---

### 4. Related Documents

- `release_plan.md` — Release overview and scope
- `deployment_strategy.md` — Deployment and rollback procedures
- `acceptance_criteria.md` — Release-level acceptance criteria
- `status.md` — Current status and progress tracking




