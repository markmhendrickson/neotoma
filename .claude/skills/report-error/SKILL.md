---
name: report-error
description: Report error per foundation command.
triggers:
  - report error
  - /report_error
  - report-error
---

# Report Error Command

## Purpose

Enable agents to report errors for automated resolution by Cursor Cloud Agent. This command detects, classifies, and documents errors in a structured format for systematic resolution.

Supports **cross-repo reporting**: Report errors to sibling repositories (repos sharing the same parent directory) by passing the target repo name.

## Command Usage

```bash
/report_error [target-repo-name] [--no-wait] [--timeout SECONDS] [--poll-interval SECONDS]
```

**Parameters:**
- `target-repo-name` (optional): Name of sibling repository to report error to
  - Must be a sibling repository (shares same parent directory)
  - Example: If current repo is `/Users/user/Projects/personal`, target `neotoma` resolves to `/Users/user/Projects/neotoma`
  - If omitted: Auto-detect target repository based on error origin (see Auto-Detection below)
- `--no-wait` (optional): Disable wait-for-resolution mode (default: wait mode is enabled)
- `--timeout SECONDS` (optional): Maximum time to wait for resolution (default: 300 seconds / 5 minutes)
- `--poll-interval SECONDS` (optional): How often to check error status (default: 5 seconds)

**Default Behavior:**
- **Wait mode is enabled by default** - Agent will monitor error status until resolved or timeout
- **Auto-detection is enabled** - If target-repo-name is not provided, automatically detect target repository based on error origin

**Examples:**
```bash
# Auto-detect target repo and wait for resolution (default behavior)
/report_error

# Explicitly specify target repo (auto-detection disabled)
/report_error neotoma

# Disable wait mode (report and continue immediately)
/report_error --no-wait

# Custom timeout (10 minutes, default is 5 minutes)
/report_error --timeout 600

# Custom poll interval (check every 2 seconds, default is 5 seconds)
/report_error --poll-interval 2

# Explicit target repo with custom timeout
/report_error neotoma --timeout 600
```

## When to Use

Use this command when you encounter:
- Build errors (TypeScript compilation, module resolution)
- Runtime errors (MCP server errors, API failures, database errors)
- Test failures
- Dependency issues (missing modules, version conflicts)
- Configuration errors (missing env vars, invalid config)

**Auto-Detection:** The command automatically detects the target repository when errors originate from MCP servers or external modules. For example:
- Errors from `mcp_neotoma_*` functions → automatically report to `neotoma` repo
- Errors from `mcp_asana_*` functions → automatically report to `asana` repo (if exists)
- Errors with file paths containing `/Projects/neotoma/` → automatically report to `neotoma` repo

## Workflow

### 1. Target Repository Resolution

1. **Get Current Repository Path:**
   ```bash
   git rev-parse --show-toplevel
   ```
   Store as `current_repo_path`

2. **Auto-Detect Target Repository (if target-repo-name not provided):**
   
   Analyze error context to determine target repository:
   
   **MCP Error Detection:**
   - If error message contains `MCP error` or `mcp_` prefix:
     - Extract MCP server name from error context
     - Check `agent_context.command` for MCP function names (e.g., `mcp_neotoma_ingest_structured`)
     - Map MCP server to target repository using configured mapping or default patterns:
       - `mcp_neotoma` → `neotoma`
       - `mcp_asana` → `asana` (if exists)
       - `mcp_gmail` → `gmail` (if exists)
       - `mcp_google-calendar` or `mcp_google_calendar` → `google-calendar` (if exists)
       - Pattern: `mcp_<server-name>` → lookup in `mcp_server_mapping` config or use `<server-name>`
     - Validate target repository exists before using
   
   **Module Path Detection:**
   - If error contains file paths:
     - Extract repository name from path patterns:
       - `/Users/user/Projects/neotoma/` → `neotoma`
       - `/Users/user/Projects/foundation/` → `foundation`
     - Check if path matches sibling repository structure
   
   **Error Source Detection:**
   - If error originates from MCP call:
     - Check `agent_context.command` for MCP function names
     - Extract server name from command (e.g., `mcp_neotoma_ingest_structured` → `neotoma`)
   
   **Fallback:**
   - If auto-detection fails or no match found:
     - Use `current_repo_path` (local reporting)
     - Log warning: "Could not auto-detect target repository, using current repo"

3. **Resolve Target Repository Path:**
   - If `target-repo-name` parameter provided:
     - Use explicit target (skip auto-detection)
     - Get parent directory: `dirname(current_repo_path)`
     - Construct target path: `parent_dir/target-repo-name`
     - Example: Current repo at `/Users/user/Projects/personal`, target `neotoma` → `/Users/user/Projects/neotoma`
   - If parameter omitted and auto-detection succeeded:
     - Use auto-detected target repository
   - If parameter omitted and auto-detection failed:
     - Use `current_repo_path` (local reporting)

4. **Sanitize Repository Name** (if provided or auto-detected):
   - Ensure repo name doesn't contain path traversal characters (`..`, `/`, `\`)
   - Validate repo name is a valid directory name (alphanumeric, hyphens, underscores, dots)
   - Abort if repo name contains invalid characters

5. **Validate Target Repository:**
   - Verify target path exists and is a directory
   - Verify target contains `.git` directory (is a git repository)
   - Verify write permissions to target directory
   - If validation fails: abort with clear error message

### 2. Error Detection & Collection

Extract the following from context:
- Error message and stack trace
- Affected files/modules from error paths
- Agent context (agent_id, task being performed, command name)
- Environment details (Node version, OS, etc.)
- **MCP context**: Function names, server identifiers, module paths

**For Auto-Detection:**
- Extract MCP server name from error message (e.g., "MCP error" from `mcp_neotoma`)
- Extract command name from agent context (e.g., `mcp_neotoma_ingest_structured`)
- Extract repository paths from stack traces and affected files
- Map detected sources to sibling repository names

### 3. Error Classification

Classify error into one of these categories:
- **build**: TypeScript compilation, module resolution, missing dependencies
- **runtime**: MCP server errors, API failures, database errors
- **test**: Test failures, assertion errors
- **dependency**: Missing modules, version conflicts
- **configuration**: Missing env vars, invalid config

### 4. Severity Assessment

Assign severity based on impact:
- **critical**: Server crashes, data loss, security issues
- **high**: Feature breakage, blocking errors
- **medium**: Non-blocking errors, warnings
- **low**: Cosmetic issues, deprecation warnings

### 5. Generate Error Report

Create a structured error report with:
- Error ID (UUIDv7 or timestamp-based)
- Timestamp (ISO 8601)
- Category and severity
- Sanitized error message (no PII)
- Truncated stack trace (max 5000 chars)
- Affected files and modules
- Agent context
- Environment details
- **Repository metadata** (source_repo, target_repo)
- Resolution status (initially "pending")

### 6. Store Error Report in Target Repository

1. **Ensure Target Directory Structure:**
   - Create `target_repo/.cursor/error_reports/` if missing
   - Create `target_repo/.cursor/error_reports/pending/` if missing
   - Create `target_repo/.cursor/error_reports/resolved/` if missing

2. **Write Error Report Files:**
   - Save JSON: `target_repo/.cursor/error_reports/pending/error_[timestamp]_[category].json`
   - Save Markdown: `target_repo/.cursor/error_reports/pending/error_[timestamp]_[category].md`

3. **Update Pending Queue:**
   - Append to `target_repo/.cursor/error_reports/pending.json`
   - Include priority/severity for processing order
   - File paths in pending.json should reference the pending/ subdirectory

### 7. Output Summary

Present to user:
- Error ID and category
- Severity level
- Target repository path (indicate if auto-detected)
- Location of report files
- Queue status

### 8. Wait-for-Resolution (Default Behavior)

**IMPORTANT**: Wait mode is enabled by default unless `--no-wait` is specified.

After creating error report, monitor resolution status:

1. **Check Wait Mode:**
   - If `--no-wait` flag provided: Skip wait mode, exit immediately
   - Otherwise: Proceed with wait mode

2. **Monitor Resolution:**
   - Poll error report file for status changes
   - **Critical**: Check both `pending/` and `resolved/` directories on each poll
     - Files are moved from `pending/` to `resolved/` by Cursor Cloud Agent upon resolution
     - If file not found in `pending/`, check `resolved/` before assuming file is missing
   - Check `resolution_status` field in JSON report
   - Status values: `pending` → `in_progress` → `resolved` | `failed`
   - Use configured timeout and poll interval

3. **Resolution Detection:**
   - **Resolved:** Status changes to `"resolved"`
     - Output resolution notes
     - Exit with success
   - **Failed:** Status changes to `"failed"`
     - Output failure reason
     - Exit with error
   - **Timeout:** Timeout reached while status is `pending` or `in_progress`
     - Output current status
     - Exit with warning (non-fatal)

4. **Resume/Retry Logic:**
   - After resolution, agent can:
     - **Retry:** Re-execute the operation that failed
     - **Skip:** If error indicates operation should be skipped
     - **Continue:** Proceed with next operation

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
  "repositories": {
    "source_repo": {
      "path": "/absolute/path/to/source/repo",
      "name": "repo-name",
      "remote_url": "git@github.com:user/repo.git"
    },
    "target_repo": {
      "path": "/absolute/path/to/target/repo",
      "name": "target-repo-name",
      "remote_url": "git@github.com:user/target.git"
    }
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

## Path Sanitization Rules

**Repository Name Validation:**
- Ensure repo name doesn't contain path traversal: `..`, `/`, `\`
- Allow only valid directory name characters: alphanumeric, hyphens, underscores, dots
- Reject repo names that don't match pattern: `^[a-zA-Z0-9._-]+$`
- Example valid names: `neotoma`, `personal-project`, `my_repo`, `repo.2`
- Example invalid names: `../other`, `repo/subdir`, `../../secret`

**Path Construction:**
```javascript
// Get current repo root
const currentRepoPath = execSync('git rev-parse --show-toplevel').toString().trim();

// If target repo name provided
if (targetRepoName) {
  // Sanitize repo name first
  if (!/^[a-zA-Z0-9._-]+$/.test(targetRepoName)) {
    throw new Error(`Invalid repo name: ${targetRepoName}. Only alphanumeric, hyphens, underscores, and dots allowed.`);
  }
  
  // Get parent directory
  const parentDir = path.dirname(currentRepoPath);
  
  // Construct target repo path
  const targetPath = path.join(parentDir, targetRepoName);
  
  return targetPath;
} else {
  // Use current repo
  return currentRepoPath;
}
```

## Target Repository Validation

Before writing error report, validate target repository:

1. **Path Exists:**
   ```javascript
   if (!fs.existsSync(targetPath)) {
     throw new Error(`Target repository not found: ${targetPath}`);
   }
   ```

2. **Is Directory:**
   ```javascript
   if (!fs.statSync(targetPath).isDirectory()) {
     throw new Error(`Target path is not a directory: ${targetPath}`);
   }
   ```

3. **Is Git Repository:**
   ```javascript
   const gitPath = path.join(targetPath, '.git');
   if (!fs.existsSync(gitPath)) {
     throw new Error(`Target path is not a git repository: ${targetPath}`);
   }
   ```

4. **Is Writable:**
   ```javascript
   try {
     fs.accessSync(targetPath, fs.constants.W_OK);
   } catch {
     throw new Error(`No write permission for target repository: ${targetPath}`);
   }
   ```

If any validation fails, abort with clear error message and do not write error report.

## Error Message Sanitization Rules

Apply these rules when generating reports:
1. Remove PII from error messages
2. Truncate stack traces to max 5000 characters
3. Replace sensitive paths with placeholders
4. Redact API keys, tokens, credentials
5. Remove user-specific data from file paths

## Error Handling & User Feedback

**Validation Failures:**

1. **Invalid Repo Name:**
   ```
   Error: Invalid repo name: ../other. Only alphanumeric, hyphens, underscores, and dots allowed.
   ```

2. **Target Repo Not Found:**
   ```
   Error: Target repository not found: /Users/user/Projects/non-existent-repo
   
   Available sibling repositories:
   - neotoma
   - personal-project
   - another-repo
   ```

3. **Not a Git Repository:**
   ```
   Error: Target path is not a git repository: /Users/user/Projects/some-dir
   
   Target must be a git repository (contains .git directory).
   ```

4. **No Write Permission:**
   ```
   Error: No write permission for target repository: /Users/user/Projects/neotoma
   
   Check file permissions and try again.
   ```

**Success Feedback:**
```
Error report created successfully.

Error ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
Category: build
Severity: high
Target: /Users/user/Projects/neotoma

Report saved to:
- /Users/user/Projects/neotoma/.cursor/error_reports/pending/error_20250131_143022_build.json
- /Users/user/Projects/neotoma/.cursor/error_reports/pending/error_20250131_143022_build.md

Added to pending queue for resolution.
```

## Example Usage

### Scenario 1: Auto-Detection from File Path

```
Agent: I encountered a TypeScript compilation error while building the project.

Error: Cannot find module '../db'
  at Object.<anonymous> (/Users/user/Projects/neotoma/src/services/raw_storage.ts:1:1)
  ...

Command: /report_error
```

Agent will:
1. Auto-detect target repo: Extract `/Users/user/Projects/neotoma/` from stack trace → target: `neotoma`
2. Validate target repo exists and is writable
3. Classify as "build" error with "high" severity
4. Extract affected files: `src/services/raw_storage.ts`, etc.
5. Generate error report with sanitized paths
6. Save to neotoma repo's `.cursor/error_reports/pending/error_20250131_143022_build.json`
7. Add to neotoma's pending queue
8. Wait for resolution (default behavior)
9. Output summary with error ID and auto-detected target

### Scenario 2: Auto-Detection from MCP Error

```
Agent: Working in personal-project repo, encountered MCP error.

Error: MCP error -32603: Failed to upload to storage: Bucket not found
Command: mcp_neotoma_ingest_structured

Command: /report_error
```

Agent will:
1. Auto-detect target repo: Extract `mcp_neotoma` from command context → target: `neotoma`
2. Resolve target repo: `/Users/user/Projects/neotoma` (sibling of personal-project)
3. Validate target repo exists and is writable
4. Classify as "runtime" error with "high" severity
5. Generate error report with repository metadata (source: personal-project, target: neotoma)
6. Save to neotoma repo's `.cursor/error_reports/pending/`
7. Add to neotoma's pending queue
8. Wait for resolution (default behavior)
9. Output summary showing auto-detected target repo path

### Scenario 2b: Explicit Target (Overrides Auto-Detection)

```
Agent: Working in personal-project repo, want to explicitly report to neotoma.

Error: MCP error -32603: Failed to upload to storage: Bucket not found

Command: /report_error neotoma
```

Agent will:
1. Skip auto-detection (explicit target provided)
2. Resolve target repo: `/Users/user/Projects/neotoma` (sibling of personal-project)
3. Validate target repo exists and is writable
4. Classify as "runtime" error with "high" severity
5. Generate error report with repository metadata (source: personal-project, target: neotoma)
6. Save to neotoma repo's `.cursor/error_reports/pending/`
7. Add to neotoma's pending queue
8. Wait for resolution (default behavior)
9. Output summary showing target repo path

### Scenario 3: Auto-Detection Fallback to Local

```
Agent: Encountered error with no clear repository origin.

Error: Generic runtime error
Command: /report_error
```

Agent will:
1. Attempt auto-detection: No MCP patterns, no clear repo paths found
2. Fallback to current repository (local reporting)
3. Log warning: "Could not auto-detect target repository, using current repo"
4. Generate error report
5. Save to current repo's `.cursor/error_reports/pending/`
6. Wait for resolution (default behavior)

### Scenario 4: Invalid Target Repo

```
Command: /report_error ../secret-repo
```

Agent will:
1. Detect invalid repo name (contains `..`)
2. Abort with error: "Invalid repo name: ../secret-repo. Only alphanumeric, hyphens, underscores, and dots allowed."
3. Do not create error report

## Cross-Repo File Writing Logic

**Directory Creation:**
```javascript
const errorReportsDir = path.join(targetRepoPath, '.cursor', 'error_reports');
const pendingDir = path.join(errorReportsDir, 'pending');
const resolvedDir = path.join(errorReportsDir, 'resolved');

// Create directories if they don't exist
fs.mkdirSync(errorReportsDir, { recursive: true });
fs.mkdirSync(pendingDir, { recursive: true });
fs.mkdirSync(resolvedDir, { recursive: true });
```

**File Naming:**
```javascript
const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const jsonFilename = `error_${timestamp}_${category}.json`;
const mdFilename = `error_${timestamp}_${category}.md`;

const jsonPath = path.join(pendingDir, jsonFilename);
const mdPath = path.join(pendingDir, mdFilename);
```

**Write Error Reports:**
```javascript
// Write JSON report
fs.writeFileSync(jsonPath, JSON.stringify(errorReport, null, 2), 'utf8');

// Write Markdown summary
fs.writeFileSync(mdPath, markdownSummary, 'utf8');

// Update pending queue
const pendingPath = path.join(errorReportsDir, 'pending.json');
let pending = [];
if (fs.existsSync(pendingPath)) {
  pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
}
pending.push({
  error_id: errorReport.error_id,
  timestamp: errorReport.timestamp,
  category: errorReport.category,
  severity: errorReport.severity,
  file_path: jsonPath
});
fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2), 'utf8');
```

## File Structure

Error reports are stored in the **target repository's** `.cursor/error_reports/` directory:

```
target_repo/.cursor/
  error_reports/
    pending.json                           # Queue of errors awaiting resolution
    pending/                               # Pending error reports
      error_20250131_143022_build.json    # Individual error reports (JSON)
      error_20250131_143022_build.md      # Human-readable summaries (Markdown)
    resolved/                              # Archived resolved errors
      error_20250131_143022_build.json
      error_20250131_143022_build.md
```

## Integration with Cursor Cloud Agent

The Cursor Cloud Agent will:
1. Monitor `.cursor/error_reports/pending.json`
2. Process errors in priority order (critical → low)
3. Update `resolution_status` when working on error
4. **Move resolved errors from `.cursor/error_reports/pending/` to `.cursor/error_reports/resolved/`**
5. Add resolution notes to error report

**Important for Wait Mode**: When monitoring for resolution, the agent must check both `pending/` and `resolved/` directories, as the Cursor Cloud Agent moves files upon resolution. If a file is not found in `pending/`, check `resolved/` before assuming the file is missing.

## Integration with Existing Commands

### With `fix_feature_bug`

- Errors classified as bugs can trigger the `fix-feature-bug` skill
- Agent can auto-classify certain error types as bugs
- Bug fix workflow will update error report resolution status

### With `analyze`

- Can analyze error patterns across multiple reports
- Identify recurring issues
- Generate error trend reports

## Configuration

Error reporting behavior can be configured in `foundation-config.yaml`:

```yaml
development:
  error_reporting:
    enabled: true
    auto_detect: true  # Enable automatic target repository detection
    auto_classify_bugs: true
    severity_threshold: "medium"
    max_stack_trace_length: 5000
    retention_days: 30
    output_directory: ".cursor/error_reports"
    wait_by_default: true  # Enable wait mode by default (can disable with --no-wait)
    mcp_server_mapping:  # Map MCP server names to repository names
      neotoma: "neotoma"
      asana: "asana"
      gmail: "gmail"
      google_calendar: "google-calendar"
      google-calendar: "google-calendar"
    wait_mode:
      default_timeout: 300  # Default timeout in seconds (5 minutes)
      default_poll_interval: 5  # Default poll interval in seconds
      max_timeout: 3600  # Maximum allowed timeout (1 hour)
      min_poll_interval: 1  # Minimum allowed poll interval
```

## Error Detection Patterns

Auto-detect errors matching these patterns:
- MCP error responses: `MCP error -32603`, `UNKNOWN_CAPABILITY`, etc.
- Build errors: TypeScript compilation failures, `tsc` errors
- Module resolution: `Cannot find module`, `Module not found`
- Runtime exceptions: Stack traces with `Error:`, `Exception:`
- Test failures: `Test failed`, `AssertionError`

## Implementation Checklist

When reporting an error:
- [ ] Parse target-repo-name parameter (if provided)
- [ ] If target-repo-name not provided: Auto-detect target repository from error origin
  - [ ] Check for MCP error patterns (`MCP error`, `mcp_` prefix)
  - [ ] Extract MCP server name from error message/stack trace
  - [ ] Check agent context for MCP command names
  - [ ] Check affected files for repository paths
  - [ ] Map detected source to sibling repository
  - [ ] Fallback to current repo if auto-detection fails
- [ ] Sanitize repo name (validate pattern)
- [ ] Resolve target repository path (parent_dir + repo_name or auto-detected)
- [ ] Validate target repository (exists, is git repo, writable)
- [ ] Extract error message and stack trace
- [ ] Classify error category
- [ ] Assign severity level
- [ ] Sanitize sensitive data
- [ ] Collect repository metadata (source and target)
- [ ] Generate unique error ID
- [ ] Create target repo directory structure if missing
- [ ] Create JSON report file in target repo (pending/ subdirectory)
- [ ] Create Markdown summary file in target repo (pending/ subdirectory)
- [ ] Update pending queue in target repo
- [ ] Output summary to user with target repo path (indicate if auto-detected)
- [ ] If wait mode enabled (default): Monitor error status until resolved or timeout

## Example Error Report Files

### JSON Report (`error_20250131_143022_build.json`)

**Example: Local Reporting**
```json
{
  "error_id": "01JQZ8X9K2M3N4P5Q6R7S8T9U0",
  "timestamp": "2025-01-31T14:30:22Z",
  "category": "build",
  "severity": "high",
  "error_message": "Cannot find module '../db'",
  "stack_trace": "Error: Cannot find module '../db'\n  at Object.<anonymous> (src/services/raw_storage.ts:1:1)\n  at Module._compile (node:internal/modules/cjs/loader:1376:14)\n  ...",
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
  "repositories": {
    "source_repo": {
      "path": "/Users/user/Projects/neotoma",
      "name": "neotoma",
      "remote_url": "git@github.com:user/neotoma.git"
    },
    "target_repo": {
      "path": "/Users/user/Projects/neotoma",
      "name": "neotoma",
      "remote_url": "git@github.com:user/neotoma.git"
    }
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

**Example: Cross-Repo Reporting**
```json
{
  "error_id": "01JQZ8X9K2M3N4P5Q6R7S8T9U1",
  "timestamp": "2025-01-31T14:35:10Z",
  "category": "runtime",
  "severity": "high",
  "error_message": "MCP error -32603: Failed to upload to storage: Bucket not found",
  "stack_trace": "...",
  "affected_files": ["src/actions.ts"],
  "affected_modules": ["mcp_neotoma"],
  "agent_context": {
    "agent_id": "cursor-agent",
    "task": "Ingest structured contact data",
    "command": "ingest_structured"
  },
  "repositories": {
    "source_repo": {
      "path": "/Users/user/Projects/personal-project",
      "name": "personal-project",
      "remote_url": "git@github.com:user/personal-project.git"
    },
    "target_repo": {
      "path": "/Users/user/Projects/neotoma",
      "name": "neotoma",
      "remote_url": "git@github.com:user/neotoma.git"
    }
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

### Markdown Summary (`error_20250131_143022_build.md`)

**Example: Cross-Repo Reporting**
```markdown
# Error Report: Runtime Error

**Error ID:** `01JQZ8X9K2M3N4P5Q6R7S8T9U1`  
**Timestamp:** 2025-01-31T14:35:10Z  
**Category:** runtime  
**Severity:** high  
**Status:** pending

## Error Message

MCP error -32603: Failed to upload to storage: Bucket not found

## Source Repository

- **Name:** personal-project
- **Path:** /Users/user/Projects/personal-project
- **Remote:** git@github.com:user/personal-project.git

## Target Repository

- **Name:** neotoma
- **Path:** /Users/user/Projects/neotoma
- **Remote:** git@github.com:user/neotoma.git

## Affected Files

- `src/actions.ts`

## Affected Modules

- mcp_neotoma

## Stack Trace

```
...
```

## Context

Agent was ingesting structured contact data when this runtime error occurred.

## Environment

- Node: v20.11.0
- OS: darwin
- Environment: development

## Resolution

Awaiting resolution by Cursor Cloud Agent.
```

## Best Practices

1. **Always sanitize**: Remove PII and sensitive data before storing
2. **Be specific**: Include relevant context about the task being performed
3. **Truncate wisely**: Keep stack traces informative but not excessive
4. **Update status**: Mark errors as resolved when fixed
5. **Archive old errors**: Move resolved errors to archive directory
6. **Review patterns**: Periodically analyze error reports for trends
7. **Use cross-repo reporting**: Report errors to appropriate repo (e.g., foundation errors to neotoma)
8. **Validate target repo**: Always validate target exists and is writable before attempting to write

## Testing Scenarios

### Test 1: Auto-Detection with MCP Error
```bash
/report_error
```
Error: "MCP error -32603: Failed to create interpretation run"
Expected: 
- Auto-detects target as `neotoma` (from `mcp_neotoma` in error context)
- Error report written to `../neotoma/.cursor/error_reports/pending/`
- Wait mode enabled by default

### Test 2: Explicit Target Repo (Overrides Auto-Detection)
```bash
/report_error neotoma
```
Expected: 
- Auto-detection skipped (explicit target provided)
- Error report written to `../neotoma/.cursor/error_reports/pending/`
- Wait mode enabled by default

### Test 3: Non-Existent Sibling Repo
```bash
/report_error non-existent-repo
```
Expected: Error message: "Target repository not found: /Users/user/Projects/non-existent-repo"

### Test 4: Invalid Repo Name (Path Traversal)
```bash
/report_error ../other-dir
```
Expected: Error message: "Invalid repo name: ../other-dir. Only alphanumeric, hyphens, underscores, and dots allowed."

### Test 5: Valid Name but Not Git Repo
```bash
/report_error some-directory
```
Expected: Error message: "Target path is not a git repository: /Users/user/Projects/some-directory"

### Test 6: Cross-Repo with Directory Creation
```bash
/report_error neotoma
```
(Where neotoma repo exists but `.cursor/error_reports/pending/` doesn't exist yet)
Expected: Directories created automatically, error report written successfully

## Wait-for-Resolution Mode

**Wait mode is enabled by default.** The agent will automatically monitor the error report status and wait for resolution before continuing, unless `--no-wait` is specified.

### Workflow with Wait Mode (Default)

1. **Report Error:**
   - Agent executes `/report_error` (wait mode enabled by default)
   - Error report created with `resolution_status: "pending"`
   - Error ID returned to agent
   - Auto-detection determines target repository if not specified

2. **Monitor Resolution:**
   - Agent polls error report file for status changes
   - **Important**: Check both `pending/` and `resolved/` directories, as resolved errors are moved from `pending/` to `resolved/` by the Cursor Cloud Agent
   - Checks `resolution_status` field in JSON report
   - Status values: `pending` → `in_progress` → `resolved` | `failed`

3. **Resolution Detection:**
   - **Resolved:** Status changes to `"resolved"`
     - Agent can resume/retry the operation that failed
     - Check `resolution_notes` for details about the fix
   - **Failed:** Status changes to `"failed"`
     - Agent should handle failure case (log, skip, or escalate)
     - Check `resolution_notes` for failure reason

4. **Timeout Handling:**
   - If timeout reached while status is still `pending` or `in_progress`:
     - Agent logs warning and continues (assumes resolution in progress)
     - Agent can check status later or proceed without waiting

5. **Resume/Retry Logic:**
   - After resolution, agent can:
     - **Resume:** Continue from where error occurred
     - **Retry:** Re-execute the operation that failed
     - **Skip:** If error indicates operation should be skipped

### Configuration

Wait mode settings are read from `foundation-config.yaml`:
- `error_reporting.wait_mode.default_timeout` - Default timeout (overridden by `--timeout`)
- `error_reporting.wait_mode.default_poll_interval` - Default poll interval (overridden by `--poll-interval`)
- `error_reporting.wait_mode.max_timeout` - Maximum allowed timeout
- `error_reporting.wait_mode.min_poll_interval` - Minimum allowed poll interval

### Auto-Detection Implementation

```javascript
function autoDetectTargetRepo(error, currentRepoPath) {
  const parentDir = path.dirname(currentRepoPath);
  
  // 1. Check for MCP errors
  if (error.message && error.message.includes('MCP error')) {
    // Extract MCP server name from error context
    const mcpMatch = error.message.match(/mcp_(\w+)/i) || 
                     error.stack?.match(/mcp_(\w+)/i);
    if (mcpMatch) {
      const serverName = mcpMatch[1];
      // Map common MCP servers to repos
      const repoMap = {
        'neotoma': 'neotoma',
        'asana': 'asana',
        'gmail': 'gmail',
        'google-calendar': 'google-calendar',
        'google_calendar': 'google-calendar'
      };
      const targetRepo = repoMap[serverName] || serverName;
      const targetPath = path.join(parentDir, targetRepo);
      if (fs.existsSync(targetPath) && fs.existsSync(path.join(targetPath, '.git'))) {
        return targetPath;
      }
    }
  }
  
  // 2. Check agent context for MCP commands
  if (error.agent_context?.command) {
    const cmd = error.agent_context.command;
    if (cmd.startsWith('mcp_')) {
      const serverName = cmd.split('_')[1];
      const targetPath = path.join(parentDir, serverName);
      if (fs.existsSync(targetPath) && fs.existsSync(path.join(targetPath, '.git'))) {
        return targetPath;
      }
    }
  }
  
  // 3. Check affected files/modules for repo paths
  if (error.affected_files) {
    for (const file of error.affected_files) {
      const repoMatch = file.match(/\/Projects\/([^\/]+)\//);
      if (repoMatch) {
        const repoName = repoMatch[1];
        const targetPath = path.join(parentDir, repoName);
        if (fs.existsSync(targetPath) && fs.existsSync(path.join(targetPath, '.git'))) {
          return targetPath;
        }
      }
    }
  }
  
  // 4. Fallback to current repo
  return currentRepoPath;
}
```

### Implementation Example

```javascript
// Agent workflow (wait mode enabled by default)
try {
  await performOperation();
} catch (error) {
  // Report error with auto-detection and wait for resolution (default)
  const result = await reportError('--timeout', '600');
  
  if (result.resolved) {
    // Retry operation after resolution
    console.log(`Retrying operation after error resolution: ${result.errorId}`);
    await performOperation(); // Retry
  } else if (result.failed) {
    // Handle failure case
    console.log(`Error resolution failed: ${result.resolutionNotes}`);
    throw new Error(`Operation failed and could not be resolved: ${result.errorId}`);
  } else if (result.timeout) {
    // Timeout - proceed or skip
    console.log(`Timeout waiting for resolution, skipping operation`);
    // Agent decides whether to skip or continue
  }
}
```

### Status Monitoring

The agent polls the error report JSON file for status changes. **Important**: When errors are resolved, the Cursor Cloud Agent moves the report files from `pending/` to `resolved/`. The wait logic must check both directories.

```javascript
async function waitForErrorResolution(errorId, errorReportPath, options = {}) {
  const {
    timeout = 300, // 5 minutes default
    pollInterval = 5, // 5 seconds default
  } = options;

  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  // Normalize error report path - extract base filename
  let baseFilename = path.basename(errorReportPath);
  if (!baseFilename.endsWith('.json')) {
    baseFilename = `${baseFilename}.json`;
  }

  // Get directory structure
  const errorReportsDir = path.dirname(path.dirname(errorReportPath)); // Go up from pending/ or resolved/
  const pendingDir = path.join(errorReportsDir, 'pending');
  const resolvedDir = path.join(errorReportsDir, 'resolved');

  // Start with pending path
  let currentPath = path.join(pendingDir, baseFilename);

  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for error resolution: ${errorId}`);
    }

    // Check if file exists in pending/ or resolved/
    let reportPath = null;
    if (fs.existsSync(path.join(pendingDir, baseFilename))) {
      reportPath = path.join(pendingDir, baseFilename);
    } else if (fs.existsSync(path.join(resolvedDir, baseFilename))) {
      reportPath = path.join(resolvedDir, baseFilename);
    } else {
      // File not found in either location - might have been deleted or moved
      throw new Error(`Error report file not found: ${baseFilename}`);
    }

    // Read error report
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const status = report.resolution_status;

    // Check if resolved or failed
    if (status === 'resolved') {
      return {
        status: 'resolved',
        errorId,
        resolutionNotes: report.resolution_notes || '',
        report,
        reportPath // Return actual path (may be in resolved/)
      };
    }

    if (status === 'failed') {
      return {
        status: 'failed',
        errorId,
        resolutionNotes: report.resolution_notes || '',
        report,
        reportPath // Return actual path (may be in resolved/)
      };
    }

    // Still pending or in_progress, wait and check again
    console.log(`[WAIT] Error ${errorId} status: ${status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
  }
}
```

### Shell Script Example

For shell-based implementations, check both directories:

```bash
ERROR_REPORT_PATH="/path/to/target/.cursor/error_reports/pending/error_TIMESTAMP_runtime.json"
ERROR_REPORTS_DIR="/path/to/target/.cursor/error_reports"
PENDING_DIR="$ERROR_REPORTS_DIR/pending"
RESOLVED_DIR="$ERROR_REPORTS_DIR/resolved"
BASE_FILENAME=$(basename "$ERROR_REPORT_PATH")

TIMEOUT=300
POLL_INTERVAL=5
START_TIME=$(date +%s)

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  # Check timeout
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "⏱️  Timeout reached (${TIMEOUT}s) while waiting for resolution"
    # Check final status in either directory
    if [ -f "$RESOLVED_DIR/$BASE_FILENAME" ]; then
      STATUS=$(cat "$RESOLVED_DIR/$BASE_FILENAME" | jq -r '.resolution_status' || echo "unknown")
    elif [ -f "$PENDING_DIR/$BASE_FILENAME" ]; then
      STATUS=$(cat "$PENDING_DIR/$BASE_FILENAME" | jq -r '.resolution_status' || echo "unknown")
    else
      STATUS="unknown"
    fi
    echo "Final status: $STATUS"
    exit 0
  fi
  
  # Check both pending/ and resolved/ directories
  REPORT_PATH=""
  if [ -f "$PENDING_DIR/$BASE_FILENAME" ]; then
    REPORT_PATH="$PENDING_DIR/$BASE_FILENAME"
  elif [ -f "$RESOLVED_DIR/$BASE_FILENAME" ]; then
    REPORT_PATH="$RESOLVED_DIR/$BASE_FILENAME"
  else
    echo "⚠️  Error report file not found in pending/ or resolved/: $BASE_FILENAME"
    exit 1
  fi
  
  # Read status
  STATUS=$(cat "$REPORT_PATH" | jq -r '.resolution_status' 2>/dev/null || echo "pending")
  echo "[WAIT] Error status: $STATUS (elapsed: ${ELAPSED}s)"
  
  # Check if resolved or failed
  if [ "$STATUS" = "resolved" ]; then
    echo "✅ Error resolved!"
    cat "$REPORT_PATH" | jq -r '.resolution_notes // "No resolution notes provided."'
    exit 0
  fi
  
  if [ "$STATUS" = "failed" ]; then
    echo "❌ Error resolution failed"
    cat "$REPORT_PATH" | jq -r '.resolution_notes // "No failure reason provided."'
    exit 1
  fi
  
  # Still pending or in_progress, wait and check again
  sleep $POLL_INTERVAL
done
```

## Helper Scripts

The following scripts are provided in `foundation/scripts/` to simplify error reporting implementation. These can be used by agents when implementing the `/report_error` command.

**Script Location:** `foundation/scripts/report_error_*.sh`

**Usage:** Scripts can be called directly from the foundation submodule, or copied/referenced as needed.

### Script: Validate Target Repository

**File:** `foundation/scripts/report_error_validate_target.sh`

```bash
#!/bin/bash
# validate_target_repo.sh
# Usage: validate_target_repo.sh <target-repo-path>

TARGET_REPO="$1"

if [ -z "$TARGET_REPO" ]; then
  echo "❌ Error: Target repository path required"
  exit 1
fi

# Check if path exists
if [ ! -d "$TARGET_REPO" ]; then
  echo "❌ Error: Target repository not found: $TARGET_REPO"
  exit 1
fi

# Check if it's a git repository
if [ ! -d "$TARGET_REPO/.git" ]; then
  echo "❌ Error: Target path is not a git repository: $TARGET_REPO"
  exit 1
fi

# Check write permissions
if [ ! -w "$TARGET_REPO" ]; then
  echo "❌ Error: No write permission for target repository: $TARGET_REPO"
  exit 1
fi

echo "✅ Target repository validated: $TARGET_REPO"
exit 0
```

### Script: Generate Error ID and Timestamp

**File:** `foundation/scripts/report_error_generate_id.sh`

```bash
#!/bin/bash
# generate_error_id.sh
# Outputs: ERROR_ID|TIMESTAMP

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%S")
ERROR_ID="01JQ$(echo $TIMESTAMP | tr -d 'T' | cut -c1-20)"
echo "${ERROR_ID}|${TIMESTAMP}"
```

### Script: Create Error Report Directories

**File:** `foundation/scripts/report_error_create_dirs.sh`

```bash
#!/bin/bash
# create_error_report_dirs.sh
# Usage: create_error_report_dirs.sh <target-repo-path>

TARGET_REPO="$1"
ERROR_REPORTS_DIR="$TARGET_REPO/.cursor/error_reports"
PENDING_DIR="$ERROR_REPORTS_DIR/pending"
RESOLVED_DIR="$ERROR_REPORTS_DIR/resolved"

mkdir -p "$PENDING_DIR" "$RESOLVED_DIR"
echo "✅ Created error report directories in $TARGET_REPO"
```

### Script: Create Error Report Files

```bash
#!/bin/bash
# create_error_report.sh
# Usage: create_error_report.sh <target-repo-path> <error-id> <timestamp> <category> <severity> <error-message> <json-data>

TARGET_REPO="$1"
ERROR_ID="$2"
TIMESTAMP="$3"
CATEGORY="$4"
SEVERITY="$5"
ERROR_MSG="$6"
JSON_DATA="$7"

ERROR_REPORTS_DIR="$TARGET_REPO/.cursor/error_reports"
PENDING_DIR="$ERROR_REPORTS_DIR/pending"

# Generate filenames
JSON_FILENAME="error_${TIMESTAMP}_${CATEGORY}.json"
MD_FILENAME="error_${TIMESTAMP}_${CATEGORY}.md"
JSON_PATH="$PENDING_DIR/$JSON_FILENAME"
MD_PATH="$PENDING_DIR/$MD_FILENAME"

# Write JSON report
echo "$JSON_DATA" > "$JSON_PATH"

# Generate Markdown summary
cat > "$MD_PATH" << EOF
# Error Report: $(echo $CATEGORY | tr '[:lower:]' '[:upper:]') Error

**Error ID:** \`$ERROR_ID\`  
**Timestamp:** $(echo $TIMESTAMP | sed 's/\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)/\1-\2-\3T\4:\5:\6Z/')  
**Category:** $CATEGORY  
**Severity:** $SEVERITY  
**Status:** pending

## Error Message

$ERROR_MSG

## Resolution

Awaiting resolution by Cursor Cloud Agent.
EOF

echo "$JSON_PATH|$MD_PATH"
```

### Script: Update Pending Queue

```bash
#!/bin/bash
# update_pending_queue.sh
# Usage: update_pending_queue.sh <target-repo-path> <error-id> <timestamp> <category> <severity> <json-path>

TARGET_REPO="$1"
ERROR_ID="$2"
TIMESTAMP="$3"
CATEGORY="$4"
SEVERITY="$5"
JSON_PATH="$6"

PENDING_FILE="$TARGET_REPO/.cursor/error_reports/pending.json"
NEW_ENTRY="{\"error_id\": \"$ERROR_ID\", \"timestamp\": \"$(echo $TIMESTAMP | sed 's/\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)/\1-\2-\3T\4:\5:\6Z/')\", \"category\": \"$CATEGORY\", \"severity\": \"$SEVERITY\", \"file_path\": \"$JSON_PATH\"}"

if [ -f "$PENDING_FILE" ]; then
  cat "$PENDING_FILE" | jq ". + [$NEW_ENTRY]" > "$PENDING_FILE.tmp" && mv "$PENDING_FILE.tmp" "$PENDING_FILE"
else
  echo "[$NEW_ENTRY]" > "$PENDING_FILE"
fi

echo "✅ Pending queue updated"
```

### Script: Wait for Error Resolution

**File:** `foundation/scripts/report_error_wait_resolution.sh`

```bash
#!/bin/bash
# wait_for_resolution.sh
# Usage: wait_for_resolution.sh <target-repo-path> <base-filename> [timeout] [poll-interval]

TARGET_REPO="$1"
BASE_FILENAME="$2"
TIMEOUT="${3:-300}"
POLL_INTERVAL="${4:-5}"

ERROR_REPORTS_DIR="$TARGET_REPO/.cursor/error_reports"
PENDING_DIR="$ERROR_REPORTS_DIR/pending"
RESOLVED_DIR="$ERROR_REPORTS_DIR/resolved"

START_TIME=$(date +%s)

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - START_TIME))
  
  # Check timeout
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "⏱️  Timeout reached (${TIMEOUT}s) while waiting for resolution"
    # Check final status in either directory
    if [ -f "$RESOLVED_DIR/$BASE_FILENAME" ]; then
      STATUS=$(cat "$RESOLVED_DIR/$BASE_FILENAME" | jq -r '.resolution_status' || echo "unknown")
    elif [ -f "$PENDING_DIR/$BASE_FILENAME" ]; then
      STATUS=$(cat "$PENDING_DIR/$BASE_FILENAME" | jq -r '.resolution_status' || echo "unknown")
    else
      STATUS="unknown"
    fi
    echo "Final status: $STATUS"
    exit 0
  fi
  
  # Check both pending/ and resolved/ directories
  REPORT_PATH=""
  if [ -f "$PENDING_DIR/$BASE_FILENAME" ]; then
    REPORT_PATH="$PENDING_DIR/$BASE_FILENAME"
  elif [ -f "$RESOLVED_DIR/$BASE_FILENAME" ]; then
    REPORT_PATH="$RESOLVED_DIR/$BASE_FILENAME"
  else
    echo "⚠️  Error report file not found in pending/ or resolved/: $BASE_FILENAME"
    exit 1
  fi
  
  # Read status
  STATUS=$(cat "$REPORT_PATH" | jq -r '.resolution_status' 2>/dev/null || echo "pending")
  echo "[WAIT] Error status: $STATUS (elapsed: ${ELAPSED}s)"
  
  # Check if resolved or failed
  if [ "$STATUS" = "resolved" ]; then
    echo "✅ Error resolved!"
    cat "$REPORT_PATH" | jq -r '.resolution_notes // "No resolution notes provided."'
    exit 0
  fi
  
  if [ "$STATUS" = "failed" ]; then
    echo "❌ Error resolution failed"
    cat "$REPORT_PATH" | jq -r '.resolution_notes // "No failure reason provided."'
    exit 1
  fi
  
  # Still pending or in_progress, wait and check again
  sleep $POLL_INTERVAL
done
```

### Complete Workflow Script

```bash
#!/bin/bash
# report_error_workflow.sh
# Complete workflow for reporting an error
# Usage: report_error_workflow.sh <target-repo-name> <error-message> <category> <severity> [--no-wait] [--timeout SECONDS]

set -e

# Parse arguments
TARGET_REPO_NAME="$1"
ERROR_MSG="$2"
CATEGORY="$3"
SEVERITY="$4"
NO_WAIT=false
TIMEOUT=300

shift 4
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-wait)
      NO_WAIT=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Get current repo path
CURRENT_REPO=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$CURRENT_REPO")

# Resolve target repo
if [ -n "$TARGET_REPO_NAME" ]; then
  TARGET_REPO="$PARENT_DIR/$TARGET_REPO_NAME"
else
  # Auto-detect (simplified - would need full MCP detection logic)
  TARGET_REPO="$CURRENT_REPO"
fi

# Validate target repo
if [ ! -d "$TARGET_REPO" ] || [ ! -d "$TARGET_REPO/.git" ]; then
  echo "❌ Error: Invalid target repository: $TARGET_REPO"
  exit 1
fi

# Generate error ID and timestamp
ID_TIMESTAMP=$(TIMESTAMP=$(date -u +"%Y%m%dT%H%M%S") && ERROR_ID="01JQ$(echo $TIMESTAMP | tr -d 'T' | cut -c1-20)" && echo "${ERROR_ID}|${TIMESTAMP}")
ERROR_ID=$(echo "$ID_TIMESTAMP" | cut -d'|' -f1)
TIMESTAMP=$(echo "$ID_TIMESTAMP" | cut -d'|' -f2)

# Create directories
mkdir -p "$TARGET_REPO/.cursor/error_reports/pending" "$TARGET_REPO/.cursor/error_reports/resolved"

# Create error report (simplified - would need full JSON structure)
JSON_FILENAME="error_${TIMESTAMP}_${CATEGORY}.json"
JSON_PATH="$TARGET_REPO/.cursor/error_reports/pending/$JSON_FILENAME"

# Generate JSON report (simplified structure)
cat > "$JSON_PATH" << EOF
{
  "error_id": "$ERROR_ID",
  "timestamp": "$(echo $TIMESTAMP | sed 's/\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)/\1-\2-\3T\4:\5:\6Z/')",
  "category": "$CATEGORY",
  "severity": "$SEVERITY",
  "error_message": "$(echo "$ERROR_MSG" | jq -Rs .)",
  "resolution_status": "pending",
  "resolution_notes": ""
}
EOF

# Update pending queue
PENDING_FILE="$TARGET_REPO/.cursor/error_reports/pending.json"
NEW_ENTRY="{\"error_id\": \"$ERROR_ID\", \"timestamp\": \"$(echo $TIMESTAMP | sed 's/\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)/\1-\2-\3T\4:\5:\6Z/')\", \"category\": \"$CATEGORY\", \"severity\": \"$SEVERITY\", \"file_path\": \"$JSON_PATH\"}"
if [ -f "$PENDING_FILE" ]; then
  cat "$PENDING_FILE" | jq ". + [$NEW_ENTRY]" > "$PENDING_FILE.tmp" && mv "$PENDING_FILE.tmp" "$PENDING_FILE"
else
  echo "[$NEW_ENTRY]" > "$PENDING_FILE"
fi

echo "Error report created successfully."
echo "Error ID: $ERROR_ID"
echo "Category: $CATEGORY"
echo "Severity: $SEVERITY"
echo "Target: $TARGET_REPO"
echo "Report saved to: $JSON_PATH"

# Wait for resolution if enabled
if [ "$NO_WAIT" = false ]; then
  echo ""
  echo "⏳ Waiting for resolution (timeout: ${TIMEOUT}s)..."
  BASE_FILENAME=$(basename "$JSON_PATH")
  "$(dirname "$0")/wait_for_resolution.sh" "$TARGET_REPO" "$BASE_FILENAME" "$TIMEOUT"
fi
```

### Usage in Agent Implementation

Agents can use these scripts as building blocks. Scripts are located in `foundation/scripts/`:

```bash
# Example: Report error using helper scripts
FOUNDATION_DIR="foundation"  # or path to foundation submodule
TARGET_REPO_NAME="neotoma"
CURRENT_REPO=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$CURRENT_REPO")
TARGET_REPO="$PARENT_DIR/$TARGET_REPO_NAME"

# Validate target repository
"$FOUNDATION_DIR/scripts/report_error_validate_target.sh" "$TARGET_REPO"

# Generate error ID and timestamp
ID_TIMESTAMP=$("$FOUNDATION_DIR/scripts/report_error_generate_id.sh")
ERROR_ID=$(echo "$ID_TIMESTAMP" | cut -d'|' -f1)
TIMESTAMP=$(echo "$ID_TIMESTAMP" | cut -d'|' -f2)

# Create directories
"$FOUNDATION_DIR/scripts/report_error_create_dirs.sh" "$TARGET_REPO"

# ... create error report files (JSON and Markdown) ...
# ... update pending queue ...

# Wait for resolution (if wait mode enabled)
BASE_FILENAME="error_${TIMESTAMP}_runtime.json"
"$FOUNDATION_DIR/scripts/report_error_wait_resolution.sh" "$TARGET_REPO" "$BASE_FILENAME" 300 5
```

**Note:** If `foundation` is a submodule, use the relative path from the repository root. If scripts are symlinked or copied, adjust paths accordingly.

## Related Documentation

- Skill `fix-feature-bug` (`.cursor/skills/fix-feature-bug/SKILL.md`) - Bug fix workflow
- Skill `analyze` (`.cursor/skills/analyze/SKILL.md`) - Analysis workflow
- Skill `debug` (`.cursor/skills/debug/SKILL.md`) - Debug workflow
- `foundation-config.yaml` - Configuration file (in repository root)

