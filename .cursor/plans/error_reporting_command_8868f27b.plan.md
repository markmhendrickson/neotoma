---
name: Error Reporting Command
overview: Create a Cursor command that allows agents to report errors for resolution via Cursor Cloud Agent. The command will collect structured error information and store it in a format that Cursor Cloud Agent can discover and process.
todos: []
---

# Error Reporting Command

Create a Cursor command that enables agents to report errors for automated resolution by Cursor Cloud Agent.

## Files to Create/Modify

1. **`.cursor/commands/report_error.md`** - Main command documentation
2. **`.cursor/commands.json`** - Register the new command
3. **`foundation-config.yaml`** (optional) - Add configuration for error reporting

## Command Structure

### Command Name

`report_error` or `report-error`

### Command Location

- Source: `foundation/agent_instructions/cursor_commands/report_error.md`
- Symlink: `.cursor/commands/report_error.md` (via setup_symlinks)

## Workflow

1. **Error Detection & Collection**

- Extract error message and stack trace from context
- Identify affected files/modules from error paths
- Capture agent context (agent_id, task being performed)
- Determine error category (build, runtime, test, dependency, etc.)

2. **Error Classification**

- **Build Error**: TypeScript compilation, module resolution, missing dependencies
- **Runtime Error**: MCP server errors, API failures, database errors
- **Test Error**: Test failures, assertion errors
- **Dependency Error**: Missing modules, version conflicts
- **Configuration Error**: Missing env vars, invalid config

3. **Generate Error Report**

- Create structured error report with:
    - Error ID (UUID or timestamp-based)
    - Error category
    - Error message (sanitized, no PII)
    - Stack trace (truncated if too long)
    - Affected files/modules
    - Agent context
    - Timestamp
    - Severity (critical, high, medium, low)

4. **Store Error Report**

- Save to `.cursor/error_reports/` directory
- Filename format: `error_[timestamp]_[category].json`
- Also create human-readable markdown summary: `error_[timestamp]_[category].md`

5. **Notify/Queue for Resolution**

- Create or append to `.cursor/error_reports/pending.json` (queue file)
- Format suitable for Cursor Cloud Agent consumption
- Include priority/severity for processing order

6. **Output Summary**

- Present error report summary to user
- Show error ID and location
- Indicate if error was queued for resolution

## Error Report Schema

```json
{
  "error_id": "uuid-v7",
  "timestamp": "ISO-8601",
  "category": "build|runtime|test|dependency|configuration",
  "severity": "critical|high|medium|low",
  "error_message": "sanitized error message",
  "stack_trace": "truncated stack trace",
  "affected_files": ["path/to/file1.ts", "path/to/file2.ts"],
  "affected_modules": ["module_name"],
  "agent_context": {
    "agent_id": "cursor-agent",
    "task": "description of task",
    "command": "command_name if applicable"
  },
  "environment": {
    "node_version": "v20.x.x",
    "os": "darwin|linux|windows",
    "neotoma_env": "development|production"
  },
  "resolution_status": "pending|in_progress|resolved|failed",
  "resolution_notes": ""
}
```



## Integration Points

### With Cursor Cloud Agent

- Cursor Cloud Agent monitors `.cursor/error_reports/pending.json`
- Processes errors in priority order (critical → low)
- Updates `resolution_status` when working on error
- Moves resolved errors to `.cursor/error_reports/resolved/`

### With Existing Bug Fix Workflow

- Can trigger existing `fix_feature_bug` command if error is classified as bug
- Option to auto-classify certain error types as bugs

## Command Usage

### Explicit Invocation

```javascript
/report_error
```

Agent prompts for error details if not in context.

### Automatic Detection

- Detect error patterns in agent output
- Auto-trigger when MCP errors occur
- Auto-trigger on build failures

## Configuration

Add to `foundation-config.yaml`:

```yaml
development:
  error_reporting:
    enabled: true
    auto_detect: true
    auto_classify_bugs: true
    severity_threshold: "medium"  # Only report medium and above
    max_stack_trace_length: 5000
    retention_days: 30
    output_directory: ".cursor/error_reports"
```



## File Structure

```javascript
.cursor/
  error_reports/
    pending.json          # Queue of errors awaiting resolution
    error_[timestamp]_[category].json  # Individual error reports
    error_[timestamp]_[category].md    # Human-readable summaries
    resolved/            # Resolved errors (archived)
      error_[timestamp]_[category].json
```



## Implementation Details

### Error Detection Patterns

- MCP error responses (e.g., "MCP error -32603")
- Build errors (TypeScript compilation failures)
- Module resolution errors (e.g., "Cannot find module")
- Runtime exceptions in agent output

### Sanitization Rules

- Remove PII from error messages
- Truncate stack traces to max length
- Remove sensitive paths (replace with placeholders)
- Redact API keys, tokens, credentials

### Priority Calculation

- **Critical**: Server crashes, data loss, security issues
- **High**: Feature breakage, blocking errors
- **Medium**: Non-blocking errors, warnings
- **Low**: Cosmetic issues, deprecation warnings

## Example Error Report

**JSON** (`.cursor/error_reports/error_20250127_143022_build.json`):

```json
{
  "error_id": "01JQZ8X9K2M3N4P5Q6R7S8T9U0",
  "timestamp": "2025-01-27T14:30:22Z",
  "category": "build",
  "severity": "high",
  "error_message": "Cannot find module '../db'",
  "stack_trace": "Error: Cannot find module '../db'\n  at ...",
  "affected_files": [
    "src/services/raw_storage.ts",
    "src/services/interpretation.ts",
    "src/services/entity_queries.ts"
  ],
  "affected_modules": ["db"],
  "agent_context": {
    "agent_id": "cursor-agent",
    "task": "Transfer contacts from Parquet to Neotoma",
    "command": null
  },
  "environment": {
    "node_version": "v20.11.0",
    "os": "darwin",
    "neotoma_env": "development"
  },
  "resolution_status": "pending",
  "resolution_notes": ""
}
```

**Markdown** (`.cursor/error_reports/error_20250127_143022_build.md`):

```markdown
# Error Report: Build Error

**Error ID:** `01JQZ8X9K2M3N4P5Q6R7S8T9U0`  
**Timestamp:** 2025-01-27T14:30:22Z  
**Category:** build  
**Severity:** high  
**Status:** pending

## Error Message
Cannot find module '../db'

## Affected Files
- `src/services/raw_storage.ts`
- `src/services/interpretation.ts`
- `src/services/entity_queries.ts`

## Context
Agent was transferring contacts from Parquet to Neotoma when this build error occurred.

## Resolution
Awaiting resolution by Cursor Cloud Agent.
```



## Related Commands

- `fix_feature_bug` - Can be triggered from error report if classified as bug
- `analyze` - Could analyze error patterns across reports

## Testing