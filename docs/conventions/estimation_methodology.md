# Estimation Methodology
## Core Principle: Velocity-Based Estimation
**Always base estimates on actual project velocity, not theoretical calculations.**
### v0.1.0 Baseline
- **26 Feature Units** completed in **2-3 days**
- **Velocity**: ~8-13 FUs per day
- **Execution Model**: Cursor agent execution with parallelization
This baseline demonstrates that with:
- Established architecture and patterns
- Comprehensive documentation
- Agent parallelization
- Existing foundation code
**Complex releases can be completed in days, not weeks.**
## Estimation Process
### Step 1: Identify Work Required
1. **List all FUs in the release**
2. **Mark which FUs are already complete** (from previous releases)
3. **Identify which FUs need new work** vs. polish/updates
4. **Account for dependencies** (can FUs run in parallel?)
### Step 2: Classify FU Complexity
**Low Complexity** (0.25-0.5 days):
- UI polish/refinement
- Minor service updates
- Configuration changes
- Documentation updates
**Medium Complexity** (0.5-1 day):
- New UI components/views
- Service integrations
- Database migrations (simple)
- MCP action implementations
**High Complexity** (1-2 days):
- RLS implementation (migration + policies + service updates)
- Complex database migrations
- Cross-cutting refactors
- Novel algorithms
### Step 3: Apply Velocity Baseline
**For releases with similar scope to v0.1.0:**
- Use v0.1.0 velocity: 8-13 FUs/day
- Account for parallelization: 3 FUs can run simultaneously
- Add 20% buffer for integration testing and polish
**For smaller releases:**
- Scale proportionally
- Example: 3 FUs = 0.5-1 day (not 1.5 weeks)
### Step 4: Account for Existing Foundation
**If foundation exists (architecture, patterns, docs):**
- Reduce estimates by 50-70%
- Example: Design system with existing components = polish (0.5 days), not greenfield (1.5 weeks)
**If greenfield work:**
- Use full estimates from `MVP_FEATURE_UNITS.md`
- Add 30% buffer for unknowns
## Common Estimation Mistakes
### ❌ Mistake 1: Using Theoretical Hour Estimates
**Wrong:**
- Spec (1-3h) + Implementation (2-8h) + Testing (1-4h) + Docs (0.5-1h) = 4.5-16h per FU
- 8 FUs × 16h = 128h = 16 days
**Right:**
- v0.1.0: 26 FUs in 2-3 days = 8-13 FUs/day
- 8 FUs ÷ 10 FUs/day = 0.8 days
### ❌ Mistake 2: Ignoring Existing Foundation
**Wrong:**
- FU-300: Design System = 1.5 weeks (greenfield estimate)
**Right:**
- FU-300: Design System = 0.5 days (StyleGuide.tsx exists, components implemented, needs polish)
### ❌ Mistake 3: Sequential Thinking
**Wrong:**
- FU-100 (2.5 days) + FU-300 (1.5 weeks) + FU-700 (1 week) = 3 weeks sequential
**Right:**
- FU-100 ✅ (complete) + FU-300 (0.5 days) + FU-700 (0.5-1 day) in parallel = 1 day
### ❌ Mistake 4: Not Accounting for Completed Work
**Wrong:**
- v1.0.0 needs FU-100, FU-101, FU-102, FU-103, FU-105 = 5 FUs × 1 day = 5 days
**Right:**
- v1.0.0 needs FU-100 ✅, FU-101 ✅, FU-102 ✅, FU-103 ✅, FU-105 ✅ = 0 days (already complete)
## Estimation Template
### For New Releases
```markdown
## Release Estimation
**Baseline Velocity:** v0.1.0 = 26 FUs in 2-3 days = ~8-13 FUs/day
**FUs in Scope:**
- FU-XXX: [Name] - [Status: Complete | New | Update]
- ...
**Work Required:**
- [List only FUs needing new work]
**Complexity Breakdown:**
- Low: X FUs (0.25-0.5 days each)
- Medium: Y FUs (0.5-1 day each)
- High: Z FUs (1-2 days each)
**Parallelization:**
- Batch 0: X FUs in parallel = max(individual estimates)
- Batch 1: Y FUs in parallel = max(individual estimates)
- ...
**Total Estimate:**
- Development: [X] days
- Integration Testing: [Y] days
- **Total: [X+Y] days**
```
## Updating Estimates
### When to Revise
1. **After each release completion:**
   - Record actual time taken (from `status.md` time tracking section)
   - Calculate estimation accuracy: (Actual / Estimated) × 100%
   - Update velocity baseline if significantly different
   - Adjust methodology if accuracy consistently off (>20% variance)
2. **When scope changes:**
   - Re-estimate based on new scope
   - Account for dependencies
3. **When foundation changes:**
   - If new architecture/patterns established, reduce future estimates
   - If breaking changes, increase estimates
### How to Revise
1. **Update `execution_schedule.md`** with revised estimates
2. **Add note** explaining revision rationale
3. **Update this document** if methodology changes
4. **Record time tracking data** in `status.md` for future reference
### Time Tracking Data Collection
**Required fields in `status.md` (Section 1.1):**
- Development Start Date: Recorded when status changes to `in_progress`
- Development Finish Date: Recorded when status changes to `ready_for_deployment`
- Deployment Date: Recorded when status changes to `deployed`
- Completion Date: Recorded when status changes to `completed`
- Estimated Development Time: From `execution_schedule.md`
- Actual Development Time: Calculated (Finish - Start)
- Estimation Accuracy: Calculated ((Actual / Estimated) × 100%)
**Use this data to:**
- Calibrate future estimates
- Identify estimation patterns (consistently over/under)
- Update velocity baseline
- Refine complexity classifications
## Example: v1.0.0 Revision
**Original Estimate:** 3-4 weeks
**Revision Rationale:**
- v0.1.0 demonstrated 26 FUs in 2-3 days
- v1.0.0 requires only 3 new FUs (FU-300 polish, FU-700 auth UI, FU-701 RLS)
- FU-100, FU-101, FU-102, FU-103, FU-105 already complete from v0.1.0
- Design system foundation exists (StyleGuide.tsx, components)
**Revised Estimate:** 2-3 days
**Breakdown:**
- Batch 0: FU-300 (0.5 days) + FU-700 (0.5-1 day) in parallel = 1 day
- Batch 3: FU-701 (1-2 days) = 1-2 days
- Integration testing: 0.5-1 day
- **Total: 2-3 days**
## Notes
- **Always validate estimates against actual velocity**
- **Prefer conservative estimates** (use upper bound)
- **Account for integration testing** (20% buffer)
- **Document estimation rationale** in release planning docs
