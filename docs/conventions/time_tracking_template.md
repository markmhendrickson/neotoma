# Time Tracking Template
## Purpose
This template provides the standard format for recording time tracking data in release `status.md` files. Time tracking enables:
- Comparison of actual vs estimated development time
- Calibration of future estimates
- Velocity baseline updates
- Identification of estimation patterns
## Template Section (Add to `status.md` Section 1.1)
```markdown
### 1.1 Time Tracking
- **Development Start Date**: _[YYYY-MM-DD] (Recorded when status changes to `in_progress`)_
- **Development Finish Date**: _[YYYY-MM-DD] (Recorded when status changes to `ready_for_deployment`)_
- **Deployment Date**: _[YYYY-MM-DD] (Recorded when status changes to `deployed`)_
- **Completion Date**: _[YYYY-MM-DD] (Recorded when status changes to `completed`)_
- **Estimated Development Time**: _[X days] (From `execution_schedule.md`)_
- **Actual Development Time**: _[X days] (Calculated: Development Finish Date - Development Start Date)_
- **Estimation Accuracy**: _[X%] (Calculated: (Actual / Estimated) × 100%)_
```
## Recording Instructions
### When Status Changes to `in_progress`
1. Record **Development Start Date** = current date/time
2. Format: `YYYY-MM-DD` (e.g., `2025-12-11`)
### When Status Changes to `ready_for_deployment`
1. Record **Development Finish Date** = current date/time
2. Calculate **Actual Development Time** = Development Finish Date - Development Start Date
3. Calculate **Estimation Accuracy** = (Actual Development Time / Estimated Development Time) × 100%
4. If accuracy < 80% or > 120%, note in Decision Log for methodology review
### When Status Changes to `deployed`
1. Record **Deployment Date** = current date/time
### When Status Changes to `completed`
1. Record **Completion Date** = current date/time
2. Generate time tracking summary comparing actual vs estimated times
## Example: v0.1.0 Time Tracking
```markdown
### 1.1 Time Tracking
- **Development Start Date**: 2025-12-09 _(Estimated based on remediation date)_
- **Development Finish Date**: 2025-12-11
- **Deployment Date**: _[To be recorded when deployed]_
- **Completion Date**: _[To be recorded when status changes to `completed`]_
- **Estimated Development Time**: _[Not recorded in original plan]_
- **Actual Development Time**: ~2-3 days (Dec 9-11, 2025)
- **Estimation Accuracy**: _[Baseline established for future estimates]_
```
## Using Time Tracking Data
### For Estimation Calibration
1. **After each release completion:**
   - Compare Actual vs Estimated times
   - If accuracy < 80% or > 120%, review estimation methodology
   - Update velocity baseline if significantly different
2. **For future releases:**
   - Reference previous release actual times
   - Adjust estimates based on historical accuracy
   - Account for scope differences
### For Velocity Baseline Updates
1. **Calculate new velocity:**
   - Total FUs completed / Actual Development Time
   - Compare to previous baseline (v0.1.0: ~8-13 FUs/day)
2. **Update methodology:**
   - If velocity significantly different, update `estimation_methodology.md`
   - Adjust complexity classifications if needed
