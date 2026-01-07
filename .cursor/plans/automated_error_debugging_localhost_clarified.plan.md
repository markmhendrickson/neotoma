# Automated Error Debugging for Localhost

Set up automated error debugging that automatically debugs and fixes errors when they're reported, running fully automatically unless human intervention is required due to unclear design needs.

## Clarification: Technology Stack

**This implementation uses:**
- ✅ **Local Node.js file system watcher** - Pure Node.js script that monitors files
- ✅ **Existing Cursor commands** - Uses `/debug_pending_errors` and `/fix_feature_bug` commands
- ✅ **No Cloud Agents** - Runs entirely locally on your machine
- ✅ **No Claude Code** - Uses Cursor's built-in command system

**If you want Cloud Agents or Claude Code instead, those require different implementations (see alternatives below).**

## Three Approaches Comparison

### Option 1: Local File System Watcher (RECOMMENDED - This Plan)
**What it is:** A Node.js script that watches `.cursor/error_reports/pending.json` and automatically runs the debug workflow when errors are added.

**Technology:** Pure Node.js (fs.watch), uses existing Cursor commands
**Cloud Agents:** ❌ No
**Claude Code:** ❌ No

**Pros:**
- ✅ Fast response (triggers immediately when errors added)
- ✅ Low overhead (only active when files change)
- ✅ No subscription required
- ✅ Works completely locally on your machine
- ✅ Uses existing debug_pending_errors command
- ✅ No external dependencies beyond Node.js

**Cons:**
- ❌ Runs only when script is active (needs to be started)
- ❌ Uses your local resources

### Option 2: Cursor Cloud Agents (Alternative - Not This Plan)
**What it is:** Use Cursor's Cloud Agents API to spawn background agents that process error queue remotely.

**Technology:** Cursor Cloud Agents API (remote background agents)
**Cloud Agents:** ✅ Yes (required)
**Claude Code:** ❌ No

**Pros:**
- ✅ Runs in background automatically
- ✅ Doesn't consume local resources
- ✅ Can run even when your machine is off (if repo is accessible)

**Cons:**
- ❌ Requires Cursor Cloud subscription with Background Agents enabled
- ❌ Requires API credentials (CURSOR_CLOUD_API_URL, CURSOR_CLOUD_API_KEY)
- ❌ More complex setup (API integration)
- ❌ Runs remotely, not truly "localhost"
- ❌ Need to configure repo access

### Option 3: Claude Code Integration (Alternative - Not This Plan)
**What it is:** Use Anthropic's Claude Code CLI to process errors via Claude Code commands.

**Technology:** Claude Code CLI (Anthropic's tool)
**Cloud Agents:** ❌ No
**Claude Code:** ✅ Yes (required)

**Pros:**
- ✅ Uses Claude's code understanding capabilities
- ✅ Separate tool from Cursor (independent)

**Cons:**
- ❌ Requires Claude Code installation and setup
- ❌ Need to build integration with error reporting system
- ❌ Additional tool to maintain
- ❌ Not as tightly integrated with Cursor

## Recommendation: Option 1 - Local File System Watcher

**This plan implements Option 1 because:**
- It's the simplest and most direct solution
- Works entirely on localhost as requested
- No subscription or external dependencies
- Integrates cleanly with existing commands
- Uses your existing Cursor setup (no new tools)

**To use Cloud Agents or Claude Code instead**, you would need a different implementation (see alternatives section below).

## Implementation Plan (Hybrid Automation - Option A)

**This plan implements Option A (Hybrid):** Automates infrastructure fixes, logs code bugs for review.

### 1. Create Watcher Script

**File:** `scripts/watch_error_reports.js`

- Monitor `.cursor/error_reports/pending.json` for changes using Node.js `fs.watch`
- When changes detected, execute debug workflow automatically
- Use existing `debug_pending_errors` command logic (via --auto flag)
- Log all actions for audit trail

### 2. Implement Hybrid Debug Logic

- Create `scripts/debug_error_reports.js` with automated fix logic
- **Automatic fixes (no AI needed):**
  - Database migrations: Run `npm run migrate` if table missing
  - Missing directories: Create `.cursor/error_reports/` if needed
  - Configuration: Check env vars, suggest fixes
  - Simple file operations: Create missing files, update configs
- **Code bugs (requires AI):**
  - Log to `.cursor/error_reports/needs_ai_review.json`
  - Include error details and affected files
  - You review these in Cursor and run `/debug_pending_errors` manually
- No AI API calls - pure automation for infrastructure, logging for code bugs

### 3. Startup Script

**File:** `scripts/start_error_watcher.js` (or npm script)

- Start file watcher in background
- Handle graceful shutdown (Ctrl+C)
- Restart on crashes (optional)
- Log watcher status

### 4. Configuration

**Add to `foundation-config.yaml`:**

```yaml
development:
  error_debugging:
    enabled: true
    auto_select_highest_priority: true
    require_confirmation: false  # Auto-mode
    integrate_fix_feature_bug: true
    auto_archive_resolved: true
    watcher:
      enabled: true
      watch_file: ".cursor/error_reports/pending.json"
      debounce_ms: 1000  # Wait 1s after file change before processing
      auto_mode: true
```

### 5. npm Scripts

**Add to `package.json`:**

```json
{
  "scripts": {
    "watch:errors": "node scripts/watch_error_reports.js",
    "watch:errors:background": "node scripts/watch_error_reports.js > .cursor/error_watcher.log 2>&1 &"
  }
}
```

## Important: The AI Question

**Which AI is actually debugging?**

This is a critical question. The file watcher is just a Node.js script - it can't reason about code or write fixes. Here are the realistic options:

### Option A: Hybrid Automation (RECOMMENDED)
**What:** Watcher automates infrastructure fixes only, flags code bugs for manual AI review

**Handles automatically:**
- ✅ Database migrations (`npm run migrate`)
- ✅ Missing configuration files
- ✅ Simple file/directory creation
- ✅ Running tests to verify fixes

**Requires AI (logged for review):**
- ❌ Code bugs requiring reasoning
- ❌ Schema/architecture decisions
- ❌ Complex logic fixes

**AI Used:** None (just automation) + You review flagged items in Cursor

### Option B: Direct AI API Integration
**What:** Watcher calls OpenAI/Anthropic API directly to analyze and fix bugs

**Handles automatically:**
- ✅ Code analysis via AI API
- ✅ Bug fixes generated by AI
- ✅ Code changes written programmatically

**AI Used:** OpenAI API or Anthropic API (direct API calls, bypassing Cursor)

**Requirements:**
- API keys for OpenAI/Anthropic
- Implement code analysis and fix generation
- Git operations to apply fixes

### Option C: Cursor Agent Triggering (Doesn't Work)
**What:** Watcher somehow triggers Cursor agents/commands

**Problem:** Cursor commands require active chat sessions - a Node.js script can't create these.

### Recommendation: Option A (Hybrid)

For localhost automation, **Option A is most practical:**
- Handles the 80% of errors that are infrastructure/configuration issues
- Logs code bugs that need AI reasoning
- You review flagged items in Cursor when needed
- Simple, reliable, no API dependencies

If you want full AI automation, **Option B** requires implementing AI API integration (more complex).

## File System Watcher Implementation

```javascript
// scripts/watch_error_reports.js
const fs = require('fs');
const path = require('path');

const WATCH_FILE = '.cursor/error_reports/pending.json';
const DEBOUNCE_MS = 1000;
const REPO_ROOT = process.cwd();

let debounceTimer = null;
let isProcessing = false;

async function processPendingErrors() {
  if (isProcessing) {
    console.log('[WATCHER] Already processing errors, skipping...');
    return;
  }

  isProcessing = true;
  console.log('[WATCHER] Detected change in pending.json, processing errors...');

  try {
    // Read pending.json
    const pendingPath = path.join(REPO_ROOT, WATCH_FILE);
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    
    if (pending.length === 0) {
      console.log('[WATCHER] No pending errors');
      isProcessing = false;
      return;
    }

    // Extract and run debug logic directly (not via Cursor command)
    // This requires implementing the debug workflow as a Node.js function
    // See "Extracted Debug Logic" section below
    
    await debugPendingErrors(pending, { auto: true });
    
  } catch (error) {
    console.error('[WATCHER] Error processing:', error);
  } finally {
    isProcessing = false;
  }
}

// Watch for file changes
if (!fs.existsSync(WATCH_FILE)) {
  console.log(`[WATCHER] Warning: ${WATCH_FILE} does not exist. Creating it...`);
  fs.writeFileSync(WATCH_FILE, '[]', 'utf8');
}

fs.watch(WATCH_FILE, (eventType) => {
  if (eventType === 'change') {
    // Debounce: wait for file write to complete
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processPendingErrors, DEBOUNCE_MS);
  }
});

console.log(`[WATCHER] Monitoring ${path.resolve(WATCH_FILE)} for changes...`);
console.log('[WATCHER] Press Ctrl+C to stop');
```

## Automated Fix Logic (Hybrid Approach)

**File:** `scripts/debug_error_reports.js` (NEW - automated fixes only)

This file implements automated fixes for infrastructure errors, logs code bugs for AI review:

```javascript
// scripts/debug_error_reports.js
async function processErrorAuto(errorReport) {
  const category = errorReport.category;
  const message = errorReport.error_message;

  // Infrastructure fixes (automatic, no AI)
  if (category === 'runtime' && message.includes('table') && message.includes('not found')) {
    // Database migration needed
    console.log('[AUTO] Running database migrations...');
    await exec('npm run migrate');
    return { fixed: true, method: 'migration' };
  }

  if (category === 'configuration' && message.includes('missing env')) {
    // Check .env file, suggest fix
    console.log('[AUTO] Configuration issue detected - logged for review');
    return { fixed: false, needs_review: true };
  }

  // Code bugs require AI - log for manual review
  if (category === 'build' || (category === 'runtime' && !canFixAutomatically(message))) {
    await logForAIReview(errorReport);
    return { fixed: false, needs_ai_review: true };
  }

  return { fixed: false, reason: 'requires_ai' };
}

async function logForAIReview(errorReport) {
  // Append to review queue
  const reviewFile = '.cursor/error_reports/needs_ai_review.json';
  // ... log error for manual review in Cursor
}

module.exports = { processErrorAuto };
```

**Key Point:** This handles infrastructure only. Code bugs are logged for you to fix in Cursor with `/debug_pending_errors`.

## Alternative Approaches (Not Implemented in This Plan)

### If You Want Cloud Agents Instead

This would require a different implementation:

1. **Setup:**
   ```bash
   export CURSOR_CLOUD_API_URL="https://api.cursor.com/v1"
   export CURSOR_CLOUD_API_KEY="your_api_key_here"
   ```

2. **Create script to spawn agents:**
   ```javascript
   // scripts/spawn_error_debug_agent.js
   const response = await fetch(`${process.env.CURSOR_CLOUD_API_URL}/v0/agents`, {
     method: 'POST',
     headers: { 
       'Authorization': `Bearer ${process.env.CURSOR_CLOUD_API_KEY}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       instruction: 'Run /debug_pending_errors --auto for repository',
       repo_url: process.env.REPO_URL || 'https://github.com/your-org/neotoma'
     })
   });
   ```

3. **Differences:**
   - Requires Cursor Cloud subscription
   - Agents run remotely, not on localhost
   - More complex setup
   - Different architecture (API-based vs file watcher)

**This plan does NOT implement Cloud Agents - it uses local file watcher.**

### If You Want Claude Code Instead

This would require a different implementation:

1. **Install Claude Code:**
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Create integration script:**
   ```javascript
   // scripts/claude_debug_errors.js
   const { exec } = require('child_process');
   // Use Claude Code CLI to process errors
   // Would need to format error reports for Claude Code
   ```

3. **Differences:**
   - Requires Claude Code installation
   - Uses Claude's AI instead of Cursor's commands
   - Less integrated with Cursor ecosystem
   - Different tooling stack

**This plan does NOT implement Claude Code - it uses Cursor commands directly.**

## Human Intervention Points

Auto-mode should only stop for human input when:

1. **Unclear design needs:**
   - Schema conflicts require architectural decision
   - Multiple valid fix approaches need selection
   - Missing context/documentation for proper fix

2. **Security-sensitive changes:**
   - Credential handling
   - Permission changes
   - Security policy updates

3. **Breaking changes:**
   - API contract changes
   - Database schema migrations (for production)
   - Behavioral changes affecting other systems

4. **Configuration required:**
   - Missing environment variables
   - External service configuration
   - User-specific settings

## Integration Points

### With debug_pending_errors Command (Documentation)

- The Cursor command (`/debug_pending_errors`) uses the same logic as the extracted function
- Both share the same workflow (sort, select, fix, archive)
- Command is for manual/interactive use, extracted function is for automation

### With fix_feature_bug Logic (Extracted)

- Extract `fix_feature_bug` workflow into callable Node.js functions
- Automatically classifies and fixes bugs
- Logs when human intervention needed (doesn't stop execution)
- All actions logged for review

### With git hooks (Optional Enhancement)

- Pre-commit hook: Check for pending errors before commit
- Post-merge hook: Process errors after pulling changes

## Startup Options

### Option 1: Manual Start
```bash
npm run watch:errors
```

### Option 2: Background Process
```bash
npm run watch:errors:background
# Check logs: tail -f .cursor/error_watcher.log
```

### Option 3: Auto-start with Dev Server
Integrate into `npm run dev` to start watcher automatically

## Monitoring & Logging

- Log all processed errors to `.cursor/error_watcher.log`
- Include timestamps, error IDs, resolution status
- Alert on repeated failures
- Summary stats (errors processed, fixed, failed)

## Error Handling

- Handle file read errors gracefully
- Skip invalid JSON in pending.json
- Continue processing if one error fails
- Retry failed fixes after delay

## Testing

1. Create test error report
2. Verify watcher detects change
3. Verify auto-debug runs
4. Verify error archived after fix
5. Verify logs created

## Files to Create

1. `scripts/watch_error_reports.js` - Main watcher script
2. `scripts/debug_error_reports.js` - Extracted debug logic (if needed, to make it callable)
3. Update `package.json` - Add npm scripts
4. Update `foundation-config.yaml` - Add watcher config
5. `.cursor/error_watcher.log` - Log file (gitignored)

## Files to Modify

1. `foundation/agent_instructions/cursor_commands/debug_pending_errors.md` - Document auto-mode integration
2. `docs/developer/getting_started.md` - Document watcher setup
3. `.gitignore` - Add error_watcher.log

## Configuration Options

```yaml
development:
  error_debugging:
    watcher:
      enabled: true  # Enable/disable watcher
      watch_file: ".cursor/error_reports/pending.json"
      debounce_ms: 1000  # Delay before processing (ms)
      auto_mode: true  # Run with --auto flag
      stop_on_human_intervention: true  # Pause when human input needed
      max_concurrent: 1  # Process one error at a time
      retry_failed: true  # Retry failed fixes
      retry_delay_ms: 5000  # Delay before retry
      log_file: ".cursor/error_watcher.log"
```

## Summary

**This plan implements:** Local Node.js file system watcher with hybrid automation
**AI Used:** None (just automation) - you review code bugs in Cursor
**Automatically fixes:** Infrastructure issues (migrations, config, files)
**Logs for review:** Code bugs requiring AI reasoning
**Does NOT use:** Cursor Cloud Agents, Claude Code, or AI APIs
**Does NOT trigger:** Cursor commands or chat sessions automatically
**Runs on:** Your localhost machine as a background script

**How it works:**
1. Watcher monitors pending.json
2. For infrastructure errors → fixes automatically (migrations, configs)
3. For code bugs → logs to `needs_ai_review.json`
4. You review logged items in Cursor and run `/debug_pending_errors` manually

**If you want full AI automation** (Option B), that requires:
- OpenAI/Anthropic API integration
- Code analysis and fix generation
- More complex implementation

**This plan is simpler:** Handles the 80% of errors that are infrastructure issues, logs the rest for manual AI review.

