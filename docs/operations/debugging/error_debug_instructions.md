# Error Debug Instructions

Please process all pending errors in the error queue.

## Workflow

1. **Read Error Queue:**
   - Read `.cursor/error_reports/pending.json`
   - Sort errors by priority: critical → high → medium → low
   - Within same severity, oldest first

2. **Process Each Error:**
   - Load error report from file path
   - Analyze error: category, severity, affected files
   - Run `/debug --auto` workflow
   - Use `/fix_feature_bug` to fix bugs
   - Update error report with resolution status
   - Move to resolved archive
   - Remove from pending queue

3. **Continue Until:**
   - Pending queue is empty, OR
   - Human intervention needed (unclear design, security-sensitive changes)

4. **Human Intervention Required:**
   - Schema conflicts requiring architectural decisions
   - Security-sensitive changes
   - Breaking API changes
   - Missing context/documentation

## Commands to Use

- `/debug --auto` - Automated debugging workflow
- `/fix_feature_bug` - Fix bugs using error protocol
- Standard file operations (read, write, update)

## Error Report Status Updates

When processing errors, update the `resolution_status` field:

- Set to `"in_progress"` when starting to work on error
- Set to `"resolved"` when error is fixed (with `resolution_notes`)
- Set to `"failed"` if error cannot be resolved (with `resolution_notes` explaining why)

## Resolution Notes

Include details about:
- What was fixed
- How it was fixed
- Any follow-up actions needed
- Why resolution failed (if status is "failed")




