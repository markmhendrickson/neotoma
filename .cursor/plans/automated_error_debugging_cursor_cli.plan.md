# Automated Error Debugging with Cursor CLI

Set up automation to trigger Cursor CLI chat sessions for local error debugging, using Cursor's AI to fix bugs in local files automatically.**Foundation-Based Architecture:** This plan extends the foundation `/report_error` command with `--wait` mode and adds repo-specific error debugging automation scripts. All command enhancements are in foundation; scripts and configuration are repo-specific.

## Technology: Cursor CLI (Visible Chat Sessions)

**This implementation uses:**

- ✅ **Cursor CLI (`cursor`)** - Command-line interface to open Cursor
- ✅ **Visible Chat Sessions** - Opens new chats in Cursor UI (not headless)
- ✅ **Cursor's AI** - Local AI-powered bug fixing via visible chats
- ✅ **Local execution** - Works with local files and uncommitted changes
- ✅ **User-visible automation** - Chats appear in Cursor UI for monitoring

**Advantages:**

- ✅ Works with local files and uncommitted changes
- ✅ No subscription required (uses local Cursor installation)
- ✅ No API credentials needed
- ✅ Runs locally using Cursor's AI
- ✅ User can see and monitor chat sessions in Cursor UI
- ✅ Interactive - user can intervene if needed

**Does NOT use:**

- ❌ Headless mode (`--print` flag)
- ❌ Cursor Cloud Agents (remote, requires subscription)
- ❌ Claude Code (alternative local solution)
- ❌ Direct AI API calls

## How It Works

1. **Error Reporter** creates error reports in `.cursor/error_reports/pending.json`

- Optional: Agent uses `/report_error --wait` to monitor resolution

2. **Trigger Script** monitors pending.json (or is triggered by error creation)
3. **Script** opens Cursor (if not open) and triggers new visible chat session
4. **New Chat** appears in Cursor UI with instructions pre-filled to process errors
5. **User/AI** can see the chat, AI processes errors using Cursor's AI
6. **Chat** processes errors, updates reports, archives resolved errors
7. **If `--wait` flag used**: Agent monitors error report status and resumes/retries operations when resolved
8. **Continues** until queue empty or human intervention needed

## Prerequisites

### 1. Cursor CLI Installation

Install Cursor CLI (if not already installed):

```bash
curl https://cursor.com/install -fsS | bash
```

Verify installation:

```bash
cursor --version
# or
cursor-agent --version
```

Ensure the installation path (e.g., `~/.local/bin`) is in your `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```



### 2. Platform-Specific Automation

**macOS:** Uses AppleScript to trigger Cmd+L (new chat shortcut)**Linux:** Uses `xdotool` or similar to send keyboard shortcuts**Windows:** Uses PowerShell or AutoHotkey to send keyboard shortcuts

### 3. Repository Access

- Repository must be accessible locally
- No remote repository required
- Works with uncommitted changes
- Works with all local files

### 4. Working Directory

- Script should run from project root
- Cursor will open in project directory
- No special configuration needed

## Implementation Plan

### 1. Create CLI Trigger Script

**File:** `scripts/trigger_error_debug_cli.js`This script:

- Monitors `.cursor/error_reports/pending.json` for new errors
- Triggers Cursor CLI headless mode with instructions
- Manages error processing workflow

### 2. Chat Instructions Template

**File:** `scripts/error_debug_instructions.md`Instructions to paste into the new Cursor chat session:

- Read `.cursor/error_reports/pending.json`
- Select highest priority error
- Run `/debug_pending_errors --auto` workflow
- Use `/fix_feature_bug` to fix bugs
- Update error reports
- Archive resolved errors
- Continue until queue empty or human intervention needed

### 3. Integration with Error Reporting

The script integrates with existing error reporting system:

- Reads from `.cursor/error_reports/pending.json`
- Loads error reports from file paths
- Updates error reports with resolution status
- Archives resolved errors to `resolved/` directory
- Removes resolved errors from pending queue

## Opening Visible Chat Sessions

### Basic Approach

1. **Open Cursor** in the workspace directory
2. **Trigger new chat** using platform-specific automation (keyboard shortcut)
3. **Pre-fill instructions** using clipboard or by writing to a temp file

### macOS (AppleScript)

```bash
# Open Cursor if not already open
cursor /path/to/neotoma

# Trigger new chat (Cmd+L) and paste instructions
osascript -e 'tell application "Cursor" to activate' -e 'tell application "System Events" to keystroke "l" using command down'
```



### Linux (xdotool)

```bash
# Open Cursor
cursor /path/to/neotoma

# Trigger new chat (Ctrl+L)
xdotool search --name "Cursor" windowactivate key ctrl+l
```



### Windows (PowerShell)

```powershell
# Open Cursor
cursor C:\path\to\neotoma

# Trigger new chat (Ctrl+L)
# Use SendKeys or similar automation
```



### Error Debugging Instructions Template

Instructions to paste into the new chat:

```javascript
Read .cursor/error_reports/pending.json
Select highest priority error
Load error report from file path
Run /debug_pending_errors workflow
Use /fix_feature_bug to fix the bug
Update error report resolution status
Archive resolved errors
Remove from pending queue
Continue until queue empty
```



## Script Implementation

### Option A: File Watcher + CLI Trigger

**File:** `scripts/watch_and_debug_errors.js`

```javascript
#!/usr/bin/env node

import { watch } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const PENDING_QUEUE_PATH = join(PROJECT_ROOT, '.cursor/error_reports/pending.json');
const INSTRUCTIONS_PATH = join(__dirname, 'error_debug_instructions.md');

let isProcessing = false;

async function loadPendingQueue() {
  try {
    const content = await readFile(PENDING_QUEUE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function sortErrorsByPriority(errors) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return errors.sort((a, b) => {
    const priorityDiff = priorityOrder[a.severity] - priorityOrder[b.severity];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.reported_at) - new Date(b.reported_at);
  });
}

async function openCursorChat(error) {
  const instructions = `Read .cursor/error_reports/pending.json
Select the error with ID: ${error.error_id}
Load error report from: ${error.report_path}
Run /debug_pending_errors workflow
Use /fix_feature_bug to fix the bug
Update error report resolution status
Archive resolved errors to .cursor/error_reports/resolved/
Remove from pending queue`;

  // Copy instructions to clipboard (platform-specific)
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS: Use pbcopy
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`echo "${instructions.replace(/"/g, '\\"')}" | pbcopy`);
    
    // Open Cursor in project directory
    exec(`cursor "${PROJECT_ROOT}"`, () => {});
    
    // Wait a bit for Cursor to open, then trigger new chat
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Trigger Cmd+L to open new chat
    await execAsync(`osascript -e 'tell application "Cursor" to activate' -e 'delay 0.5' -e 'tell application "System Events" to keystroke "l" using command down' -e 'delay 0.5' -e 'tell application "System Events" to keystroke "v" using command down'`);
    
  } else if (platform === 'linux') {
    // Linux: Use xclip or xsel
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync(`echo "${instructions.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
    } catch {
      await execAsync(`echo "${instructions.replace(/"/g, '\\"')}" | xsel --clipboard --input`);
    }
    
    exec(`cursor "${PROJECT_ROOT}"`, () => {});
    await new Promise(resolve => setTimeout(resolve, 2000));
    await execAsync(`xdotool search --name "Cursor" windowactivate key ctrl+l sleep 0.5 key ctrl+v`);
    
  } else if (platform === 'win32') {
    // Windows: Use clip.exe and PowerShell
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`echo ${instructions} | clip`);
    exec(`cursor "${PROJECT_ROOT}"`, () => {});
    // Windows automation would require PowerShell script or AutoHotkey
    console.log('[WATCHER] Please manually open chat (Ctrl+L) and paste instructions');
  }
}

async function processNextError() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const errors = await loadPendingQueue();
    if (errors.length === 0) {
      console.log('[WATCHER] No pending errors, waiting...');
      isProcessing = false;
      return;
    }

    const sortedErrors = sortErrorsByPriority(errors);
    const nextError = sortedErrors[0];

    console.log(`[WATCHER] Processing error: ${nextError.error_id} (${nextError.severity})`);
    await openCursorChat(nextError);

    // After CLI completes, check if error was resolved
    const updatedErrors = await loadPendingQueue();
    const stillPending = updatedErrors.filter(e => e.error_id !== nextError.error_id);
    
    if (stillPending.length < errors.length) {
      console.log(`[WATCHER] Error ${nextError.error_id} resolved, ${stillPending.length} remaining`);
    }

    // Continue processing if more errors
    if (stillPending.length > 0) {
      setTimeout(() => processNextError(), 1000);
    }
  } catch (error) {
    console.error('[WATCHER] Error processing:', error);
  } finally {
    isProcessing = false;
  }
}

// Watch for changes to pending.json
watch(PENDING_QUEUE_PATH, async (eventType) => {
  if (eventType === 'change') {
    console.log('[WATCHER] pending.json changed, processing errors...');
    await processNextError();
  }
});

// Initial check
processNextError();

console.log('[WATCHER] Monitoring for errors, will open Cursor chat sessions when detected...');
```



### Option B: Direct Trigger on Error Report

**File:** `scripts/trigger_error_debug.sh` (macOS example)

```bash
#!/bin/bash

PROJECT_ROOT="$(pwd)"
INSTRUCTIONS="Read .cursor/error_reports/pending.json
Sort errors by priority (critical → low, oldest first)
Select highest priority error
Load error report from file path
Run /debug_pending_errors workflow
Use /fix_feature_bug to fix the bug
Update error report resolution status
Archive resolved errors
Remove from pending queue
Continue until queue empty or human intervention needed"

# Copy instructions to clipboard
echo "$INSTRUCTIONS" | pbcopy

# Open Cursor
cursor "$PROJECT_ROOT"

# Wait for Cursor to open, then trigger new chat
sleep 2
osascript -e 'tell application "Cursor" to activate' \
  -e 'delay 0.5' \
  -e 'tell application "System Events" to keystroke "l" using command down' \
  -e 'delay 0.5' \
  -e 'tell application "System Events" to keystroke "v" using command down'
```



### Option C: Git Hook Trigger

**File:** `.git/hooks/post-commit`

```bash
#!/bin/bash

# Trigger error debugging after commit
node scripts/trigger_error_debug_cli.js
```



## Chat Instructions Template

**File:** `scripts/error_debug_instructions.md`Full instructions that will be pasted into the new Cursor chat:

```markdown
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
    - Run `/debug_pending_errors --auto` workflow
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
```



## Commands to Use

The Cursor CLI session should use these commands:

- `/debug_pending_errors --auto` - Automated debugging workflow
- `/fix_feature_bug` - Fix bugs using Neotoma's error protocol
- Standard file operations (read, write, update)

## Error Processing Workflow

1. Load pending.json
2. Process errors in priority order (critical → low)
3. For each error:

- Load error report
- Debug and fix using `/debug_pending_errors` and `/fix_feature_bug`
- Update resolution status
- Archive resolved errors

4. Stop when queue empty or human intervention needed

## Script Configuration

**File:** `scripts/config/error_debug_cli.json`

```json
{
  "cursor_cli": {
    "command": "cursor-agent",
    "flags": ["--print", "--force"],
    "working_dir": ".",
    "max_concurrent": 1,
    "retry_on_failure": true,
    "max_retries": 3
  }
}
```



## Agent Lifecycle Management

### Open Cursor Chat

```javascript
// Open Cursor in project directory
exec(`cursor "${PROJECT_ROOT}"`, () => {});

// Trigger new chat (platform-specific)
// macOS: AppleScript to send Cmd+L
// Linux: xdotool to send Ctrl+L
// Windows: PowerShell/AutoHotkey
```



### User Interaction

- Chat session appears in Cursor UI
- User can monitor progress
- User can intervene if needed
- Instructions are pre-filled in chat input

### Cleanup

- No cleanup needed - chat sessions remain in Cursor
- User can close chats manually when done
- Script doesn't need to monitor chat completion

## Error Handling

### Automation Errors

- Handle command not found (install Cursor CLI, xdotool, etc.)
- Handle permission errors (accessibility permissions on macOS)
- Fallback: Print instructions for manual paste

### Processing Errors

- Log failures
- Option to retry
- Fallback to manual review

### Human Intervention

- Chat session remains open for user review
- User can intervene directly in the chat
- Script logs error details for reference

## Files to Create/Modify

### Foundation Files (Shared Across Repos)

1. **Update:** `foundation/agent_instructions/cursor_commands/report_error.md`

- Add `--wait`, `--timeout`, `--poll-interval` flag documentation
- Add wait-for-resolution workflow section
- Add status monitoring implementation details
- After update, available via symlink: `.cursor/commands/foundation_report_error.md`
- Run `setup_symlinks` to create symlink after updating foundation

### Repository-Specific Files

2. **Create:** `scripts/trigger_error_debug_cli.js` - Main trigger script (platform-aware)
3. **Create:** `scripts/error_debug_instructions.md` - Instructions template for chat sessions (optional)
4. **Update:** `foundation-config.yaml` (in repository root) - Add error reporting and debugging configuration
5. **Update:** `package.json` - Add npm scripts for error debugging automation (if needed)

**Note:** Configuration goes in repository's `foundation-config.yaml`, NOT in foundation submodule (per foundation configuration management rules).

## Usage

### Manual Trigger

```bash
npm run debug:errors:cli
```



### Continuous Monitoring

```bash
npm run watch:errors:cli
```



### Git Hook (Optional)

Add to `.git/hooks/post-commit`:

```bash
#!/bin/bash
node scripts/trigger_error_debug_cli.js
```



## Testing

1. Create test error report in pending.json
2. Run trigger script
3. Verify new chat session opens in Cursor UI
4. Verify instructions are pasted into chat
5. Monitor chat as AI processes errors
6. Check error report updated and archived
7. Verify fix applied to code

## Comparison: Visible Cursor CLI vs Cloud Agents vs Claude Code

| Feature | Visible Cursor CLI | Cloud Agents | Claude Code ||---------|-------------------|--------------|-------------|| AI-powered fixes | ✅ Yes (Cursor's AI) | ✅ Yes (Cursor's AI) | ✅ Yes (Claude's AI) || Code bug fixes | ✅ Yes | ✅ Yes | ✅ Yes || Local file access | ✅ Yes | ❌ No (remote repo only) | ✅ Yes || Uncommitted changes | ✅ Yes | ❌ No | ✅ Yes || Execution location | Local (visible) | Remote (cloud) | Local || Subscription required | ❌ No | ✅ Yes | ❌ No || API credentials | ❌ Not needed | ✅ Required | ❌ Not needed || Visible in UI | ✅ Yes (chats appear) | ❌ No (background) | ✅ Yes (if using UI) || User monitoring | ✅ Yes (can watch) | ❌ No | ✅ Yes (if using UI) || User intervention | ✅ Easy (in same UI) | ❌ No | ✅ Yes (if using UI) || Setup complexity | Low-Medium | Medium | Low |

## Summary

**This plan implements:**

1. Cursor CLI to trigger visible chat sessions for error debugging
2. Enhanced `/report_error` command with `--wait` mode for resolution monitoring

**AI Used:** Cursor's AI (via visible chat sessions in Cursor UI)**Processes:** All errors (infrastructure + code bugs) in local files**Requires:** Cursor CLI installation, platform-specific automation tools (no subscription)**Runs:** Locally using Cursor's AI, visible in Cursor UI**How it works:**

1. Error reporter creates error in pending.json (optionally with `--wait` flag)
2. Trigger script detects error and opens Cursor (if not open)
3. Script triggers new chat session (Cmd+L / Ctrl+L) using platform automation
4. Instructions are copied to clipboard and pasted into chat
5. New chat appears in Cursor UI with instructions pre-filled
6. Cursor's AI processes instructions, debugs and fixes errors
7. Error report status updated (`pending` → `in_progress` → `resolved`/`failed`)
8. If agent used `--wait` flag: Agent monitors status and resumes/retries operations when resolved
9. User can monitor progress in the visible chat session
10. Process continues until queue empty or human intervention needed

**Key Enhancement - /report_error --wait:**