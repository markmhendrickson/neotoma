# Debug Pending Errors Command

Create a Cursor command that enables agents to check pending error reports and debug/resolve them.

## Command Structure

### Command Name

`debug_pending_errors` or `debug-pending-errors`

### Command Usage

```bash
/debug_pending_errors [target-repo-name]
```

**Parameters:**

- `target-repo-name` (optional): Name of sibling repository to check for pending errors
- Must be a sibling repository (shares same parent directory)
- If omitted: Checks current repository's pending errors

**Examples:**

```bash
# Check current repo's pending errors
/debug_pending_errors

# Check sibling repo's pending errors
/debug_pending_errors neotoma
/debug_pending_errors personal-project
```



## Workflow

### 1. Target Repository Resolution

1. **Get Current Repository Path:**
   ```bash
         git rev-parse --show-toplevel
   ```




2. **Resolve Target Repository Path:**

- If `target-repo-name` provided:
                                                                - Get parent directory: `dirname(current_repo_path)`
                                                                - Construct target path: `parent_dir/target-repo-name`
                                                                - Validate repo name (same sanitization rules as `report_error`)
- If omitted:
                                                                - Use `current_repo_path`

3. **Validate Target Repository:**

- Path exists and is a directory
- Contains `.git` directory (is git repo)
- Has `.cursor/error_reports/` directory
- Has `pending.json` file

### 2. Load Pending Errors

1. **Read Pending Queue:**
   ```javascript
         const pendingPath = path.join(targetRepoPath, '.cursor', 'error_reports', 'pending.json');
         
         if (!fs.existsSync(pendingPath)) {
           console.log('No pending errors found.');
           return;
         }
         
         const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
   ```




2. **Sort by Priority:**

- Critical errors first
- Then high, medium, low
- Within same severity, sort by timestamp (oldest first)

3. **Display Pending Errors:**
   ```javascript
         Found {count} pending error(s) in {target_repo_name}:
         
                                                                                                            1. [CRITICAL] Build Error (error_20250131_143022_build.json)
                                                                                                                                                            - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
                                                                                                                                                            - Timestamp: 2025-01-31T14:30:22Z
                                                                                                                                                            - Message: Cannot find module '../db'
         
                                                                                                            2. [HIGH] Runtime Error (error_20250131_144510_runtime.json)
                                                                                                                                                            - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U1
                                                                                                                                                            - Timestamp: 2025-01-31T14:45:10Z
                                                                                                                                                            - Message: MCP error -32603: UNKNOWN_CAPABILITY
   ```




### 3. Select Error to Debug

**Options:**

- **a) Auto-select highest priority**: Debug the first error (highest severity, oldest timestamp)
- **b) Prompt user to choose**: Display list and ask user which error to debug
- **c) Debug all**: Process all pending errors in priority order

**Recommendation:** Use option (a) auto-select highest priority with user confirmation**User Prompt:**

```javascript
Debugging highest priority error:

Error ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
Category: build
Severity: critical
Message: Cannot find module '../db'
Affected files: src/services/raw_storage.ts

Proceed with debugging? (yes/no/choose-different)
```



### 4. Load Error Details

1. **Read Error Report:**
   ```javascript
         const errorReport = JSON.parse(fs.readFileSync(errorJsonPath, 'utf8'));
   ```




2. **Extract Debug Context:**

- Error message and stack trace
- Affected files and modules
- Agent context (original task)
- Repository metadata (source and target)
- Environment details

3. **Display Error Details:**
   ```javascript
         Error Report Details:
         
         Error ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
         Category: build
         Severity: critical
         Timestamp: 2025-01-31T14:30:22Z
         
         Error Message:
         Cannot find module '../db'
         
         Stack Trace:
         Error: Cannot find module '../db'
           at Object.<anonymous> (src/services/raw_storage.ts:1:1)
           at Module._compile (node:internal/modules/cjs/loader:1376:14)
           ...
         
         Affected Files:
                                                                                                            - src/services/raw_storage.ts
                                                                                                            - src/services/interpretation.ts
                                                                                                            - src/services/entity_queries.ts
         
         Original Task:
         Transfer contacts from Parquet to Neotoma
         
         Source Repository:
         personal-project (/Users/user/Projects/personal-project)
         
         Target Repository:
         neotoma (/Users/user/Projects/neotoma)
   ```




### 5. Debug & Fix Error

**Integration with `fix_feature_bug` Command:**

1. **Trigger Bug Fix Workflow:**

- Call `fix_feature_bug` command with error context
- Pass affected files and modules
- Pass error message and stack trace

2. **Follow Standard Bug Fix Process:**

- Load relevant documents (specs, subsystems)
- Classify bug (if error classification configured)
- Apply correction rules
- Add regression test
- Run tests

3. **Alternative: Manual Debugging:**

- If user prefers manual debugging, present error details
- User can investigate and fix manually
- User updates resolution status when done

### 6. Update Resolution Status

1. **Update Error Report:**
   ```javascript
         errorReport.resolution_status = 'resolved'; // or 'failed'
         errorReport.resolution_notes = 'Fixed by correcting import path in raw_storage.ts';
         
         fs.writeFileSync(errorJsonPath, JSON.stringify(errorReport, null, 2), 'utf8');
   ```




2. **Move to Resolved Directory:**
   ```javascript
         const resolvedDir = path.join(targetRepoPath, '.cursor', 'error_reports', 'resolved');
         fs.mkdirSync(resolvedDir, { recursive: true });
         
         const resolvedJsonPath = path.join(resolvedDir, path.basename(errorJsonPath));
         const resolvedMdPath = path.join(resolvedDir, path.basename(errorMdPath));
         
         fs.renameSync(errorJsonPath, resolvedJsonPath);
         fs.renameSync(errorMdPath, resolvedMdPath);
   ```




3. **Remove from Pending Queue:**
   ```javascript
         const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
         const filtered = pending.filter(e => e.error_id !== errorReport.error_id);
         fs.writeFileSync(pendingPath, JSON.stringify(filtered, null, 2), 'utf8');
   ```




### 7. Output Summary

Present resolution summary:

```javascript
Error resolved successfully.

Error ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
Resolution: Fixed by correcting import path in raw_storage.ts
Files changed: src/services/raw_storage.ts

Moved to resolved archive:
- {target_repo}/.cursor/error_reports/resolved/error_20250131_143022_build.json
- {target_repo}/.cursor/error_reports/resolved/error_20250131_143022_build.md

Remaining pending errors: {count}
```



## Command Options & Flags

### Display Only Mode

```bash
/debug_pending_errors --list-only
```

Display pending errors without debugging (useful for checking status)

### Debug All Mode

```bash
/debug_pending_errors --all
```

Process all pending errors in priority order

### Skip Confirmation Mode

```bash
/debug_pending_errors --auto
```

Auto-debug highest priority error without user confirmation

## Configuration

Add to `foundation-config.yaml`:

```yaml
development:
  error_debugging:
    enabled: true
    auto_select_highest_priority: true
    require_confirmation: true  # Prompt before debugging
    integrate_fix_feature_bug: true  # Use fix_feature_bug for resolution
    max_errors_to_display: 10
    auto_archive_resolved: true  # Move resolved errors to archive
```



## Integration Points

### With `report_error` Command

- Reads error reports created by `report_error`
- Updates resolution status
- Moves resolved errors to archive

### With `fix_feature_bug` Command

- Automatically triggers `fix_feature_bug` for each error
- Passes error context to bug fix workflow
- Updates error report with fix results

### With Cursor Cloud Agent

- Can be used by Cloud Agent to process error queue
- Updates resolution status as Cloud Agent works
- Provides structured feedback on resolution progress

## File Structure

```javascript
target_repo/.cursor/
  error_reports/
    pending.json          # Queue of errors awaiting resolution
    error_[timestamp]_[category].json  # Individual error reports
    error_[timestamp]_[category].md    # Human-readable summaries
    resolved/            # Archived resolved errors (moved here after resolution)
      error_[timestamp]_[category].json
      error_[timestamp]_[category].md
```



## Example Usage Scenarios

### Scenario 1: Check & Debug Current Repo

```bash
/debug_pending_errors
```

Output:

```javascript
Found 2 pending error(s) in neotoma:

1. [CRITICAL] Build Error
                                                - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
                                                - Message: Cannot find module '../db'
   
2. [HIGH] Runtime Error
                                                - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U1
                                                - Message: MCP error -32603: UNKNOWN_CAPABILITY

Debugging highest priority error (CRITICAL)...

[Proceeds with debugging workflow]
```



### Scenario 2: Check Sibling Repo

```bash
/debug_pending_errors neotoma
```

Output:

```javascript
Checking pending errors in: /Users/user/Projects/neotoma

Found 1 pending error(s) in neotoma:

1. [HIGH] Runtime Error
                                                - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U1
                                                - Message: Storage bucket not found
                                                - Source: personal-project

Debugging error...
```



### Scenario 3: List Only Mode

```bash
/debug_pending_errors --list-only
```

Output:

```javascript
Found 2 pending error(s) in neotoma:

1. [CRITICAL] Build Error (2025-01-31T14:30:22Z)
                                                - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U0
                                                - Message: Cannot find module '../db'
                                                - Affected: src/services/raw_storage.ts
   
2. [HIGH] Runtime Error (2025-01-31T14:45:10Z)
                                                - ID: 01JQZ8X9K2M3N4P5Q6R7S8T9U1
                                                - Message: MCP error -32603: UNKNOWN_CAPABILITY
                                                - Affected: src/server.ts

Use /debug_pending_errors to debug highest priority error.
```



### Scenario 4: No Pending Errors

```bash
/debug_pending_errors
```

Output:

```javascript
No pending errors found in current repository.

All clear!
```



## Implementation Checklist

When debugging pending errors:

- [ ] Parse target-repo-name parameter (if provided)
- [ ] Resolve target repository path
- [ ] Validate target repository and error reports directory
- [ ] Read pending.json queue
- [ ] Sort errors by priority (severity + timestamp)
- [ ] Display pending errors to user
- [ ] Select error to debug (highest priority or user choice)
- [ ] Load error report details
- [ ] Display error context to user
- [ ] Prompt user for confirmation (unless --auto flag)
- [ ] Trigger fix_feature_bug with error context
- [ ] Update resolution_status in error report
- [ ] Move resolved error to archive
- [ ] Remove from pending queue
- [ ] Output resolution summary

## Error Handling

**Validation Failures:**

1. **No Pending Errors Directory:**
   ```javascript
         No error reports found in {target_repo}.
         
         Directory .cursor/error_reports/ does not exist.
         Use /report_error to create error reports.
   ```




2. **Empty Pending Queue:**
   ```javascript
         No pending errors found in {target_repo}.
         
         All clear!
   ```




3. **Invalid Target Repo:**
   ```javascript
         Error: Target repository not found: /Users/user/Projects/non-existent-repo
         
         Check repo name and try again.
   ```




4. **Permission Error:**
   ```javascript
         Error: No write permission for target repository: /Users/user/Projects/neotoma
         
         Cannot update error reports. Check file permissions.
   ```




## Related Commands

- `report_error` - Creates error reports that this command debugs
- `fix_feature_bug` - Used to fix bugs found in error reports
- `analyze` - Could analyze error patterns before debugging

## Testing Scenarios

### Test 1: Debug Current Repo with Pending Errors

Expected: Display pending errors, debug highest priority

### Test 2: Debug Sibling Repo with Pending Errors

Expected: Display pending errors from sibling repo, debug highest priority

### Test 3: No Pending Errors

Expected: Message "No pending errors found"

### Test 4: Missing Error Reports Directory

Expected: Error message with instruction to use /report_error

### Test 5: Invalid Target Repo Name

Expected: Error message about target repo not found

### Test 6: List Only Mode

Expected: Display errors without debugging