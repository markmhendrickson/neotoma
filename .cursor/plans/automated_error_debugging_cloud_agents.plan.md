# Automated Error Debugging with Cursor Cloud Agents

Set up Cursor Cloud Agents to automatically monitor and debug error reports, using Cursor's AI to fix bugs automatically.

## Technology: Cursor Cloud Agents

**This implementation uses:**

- ✅ **Cursor Cloud Agents API** - Spawn background agents that process errors
- ✅ **Cursor's AI** - Agents use Cursor's AI to analyze and fix bugs
- ✅ **Remote execution** - Agents run in Cursor's cloud environment
- ✅ **Full automation** - Complete AI-powered bug fixing

**Does NOT use:**

- ❌ Local file watcher
- ❌ Claude Code
- ❌ Direct AI API calls

## How It Works

1. **Error Reporter** creates error reports in `.cursor/error_reports/pending.json`
2. **Cloud Agent Spawner** monitors pending.json (or is triggered by error creation)
3. **Cloud Agent** is spawned via Cursor Cloud Agents API with instructions to process errors
4. **Agent** reads pending.json, selects highest priority error, fixes it using Cursor's AI
5. **Agent** updates error report, archives resolved errors, continues with next error
6. **Agent** terminates when queue is empty or encounters errors requiring human review

## Prerequisites

### 1. Cursor Cloud Subscription

- Requires Cursor Cloud subscription with Background Agents enabled
- Check subscription status in Cursor Settings

### 2. API Credentials

Configure environment variables:

```bash
export CURSOR_CLOUD_API_URL="https://api.cursor.com/v1"
export CURSOR_CLOUD_API_KEY="your_api_key_here"
export REPO_URL="https://github.com/your-org/neotoma"  # or your repo URL
```

**Getting API Key:**

- Check Cursor Settings → Cloud Agents → API Key
- Or contact Cursor support for API access

### 3. Repository Access

- Repository must be accessible to Cloud Agents
- Ensure repo is public or Cloud Agents have access permissions
- Configure in Cursor Cloud Agents Settings if needed

### 4. Remote Repository Requirement ⚠️

**Critical limitation:**
- Cloud Agents work with **committed and pushed code only**
- They clone the remote repository (GitHub)
- Uncommitted local changes are **not accessible**
- Errors in local-only changes cannot be fixed by Cloud Agents

**Workaround:**
- Commit error-producing changes before using Cloud Agents
- Or use local solution (Claude Code) for uncommitted changes

## Implementation Plan

### 1. Create Agent Spawner Script

**File:** `scripts/spawn_error_debug_agent.js`This script:

- Monitors `.cursor/error_reports/pending.json` for new errors
- Spawns Cloud Agents when errors are detected
- Manages agent lifecycle (spawn, monitor, cleanup)

### 2. Agent Instructions

**File:** `scripts/error_debug_agent_instructions.md` (or embedded in spawn script)Instructions for the Cloud Agent:

- Read pending.json
- Select highest priority error
- Run `/debug_pending_errors --auto` workflow
- Use `/fix_feature_bug` to fix bugs
- Update error reports
- Archive resolved errors
- Continue until queue empty or human intervention needed

### 3. Integration with Error Reporting

- Modify `report_error` workflow to optionally trigger agent spawn
- Or use file watcher to detect new errors and spawn agents
- Or use git hooks to spawn agents on commits

### 4. Configuration

**Add to `foundation-config.yaml`:**

```yaml
development:
  error_debugging:
    enabled: true
    cloud_agents:
      enabled: true
      api_url: "${CURSOR_CLOUD_API_URL}"
      api_key: "${CURSOR_CLOUD_API_KEY}"
      repo_url: "${REPO_URL}"
      auto_spawn: true  # Auto-spawn agents when errors detected
      max_concurrent_agents: 1  # One agent at a time for error queue
      agent_instructions_file: "scripts/error_debug_agent_instructions.md"
```



## Cloud Agent Spawner Implementation

### Option A: File Watcher + Cloud Agent Spawner

```javascript
// scripts/watch_and_spawn_agent.js
const fs = require('fs');
const path = require('path');

const WATCH_FILE = '.cursor/error_reports/pending.json';
const API_URL = process.env.CURSOR_CLOUD_API_URL;
const API_KEY = process.env.CURSOR_CLOUD_API_KEY;
const REPO_URL = process.env.REPO_URL;

let agentSpawned = false;

async function spawnErrorDebugAgent() {
  if (agentSpawned) {
    console.log('[SPAWNER] Agent already spawned, skipping...');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/v0/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instruction: `Process all pending errors in the error queue.
        
1. Read .cursor/error_reports/pending.json
2. Sort errors by priority (critical → low, oldest first)
3. For each error:
    - Load error report details
    - Run /debug_pending_errors workflow
    - Use /fix_feature_bug to fix the bug
    - Update error report resolution status
    - Archive resolved errors
    - Remove from pending queue
4. Continue until queue is empty
5. If human intervention needed (unclear design), log error and stop

Repository: ${REPO_URL}`,
        repo_url: REPO_URL
      })
    });

    if (response.ok) {
      const agent = await response.json();
      console.log(`[SPAWNER] Cloud Agent spawned: ${agent.id}`);
      agentSpawned = true;
      
      // Monitor agent status
      monitorAgent(agent.id);
    } else {
      console.error('[SPAWNER] Failed to spawn agent:', await response.text());
    }
  } catch (error) {
    console.error('[SPAWNER] Error spawning agent:', error);
  }
}

// Watch for new errors
fs.watch(WATCH_FILE, async (eventType) => {
  if (eventType === 'change') {
    const pending = JSON.parse(fs.readFileSync(WATCH_FILE, 'utf8'));
    if (pending.length > 0 && !agentSpawned) {
      await spawnErrorDebugAgent();
    }
  }
});

console.log('[SPAWNER] Monitoring for errors, will spawn Cloud Agent when detected...');
```



### Option B: Direct Spawn on Error Report

Modify `report_error` workflow to spawn agent after creating error report:

```javascript
// In report_error command logic (when error report created)
if (config.cloud_agents?.enabled && config.cloud_agents?.auto_spawn) {
  await spawnErrorDebugAgent(errorReport);
}
```



### Option C: Git Hook Trigger

Use git hook to spawn agent after commits that add error reports:

```bash
# .git/hooks/post-commit
if git diff HEAD~1 --name-only | grep -q "\.cursor/error_reports/pending\.json"; then
  node scripts/spawn_error_debug_agent.js
fi
```



## Agent Instructions Template

**File:** `scripts/error_debug_agent_instructions.md`

```markdown
# Error Debug Agent Instructions

You are a Cloud Agent tasked with automatically debugging and fixing errors in the error queue.

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

## Commands to Use

- `/debug_pending_errors --auto` - Debug highest priority error
- `/fix_feature_bug` - Fix the bug
- Update error reports directly via file operations

## Success Criteria

- All errors processed
- Error reports updated with resolution status
- Resolved errors archived
- Pending queue empty (or errors requiring human review logged)
```



## API Integration Details

Based on release orchestrator pattern:

```javascript
// scripts/spawn_error_debug_agent.js
const API_URL = process.env.CURSOR_CLOUD_API_URL || 'https://api.cursor.com/v1';
const API_KEY = process.env.CURSOR_CLOUD_API_KEY;
const REPO_URL = process.env.REPO_URL || 'https://github.com/your-org/neotoma';
const ENDPOINT = `${API_URL}/v0/agents`;

async function spawnErrorDebugAgent() {
  const instruction = `Process all pending errors in the error queue automatically.

1. Read .cursor/error_reports/pending.json
2. Process errors in priority order (critical → low)
3. For each error:
    - Load error report
    - Debug and fix using /debug_pending_errors and /fix_feature_bug
    - Update resolution status
    - Archive resolved errors
4. Stop when queue empty or human intervention needed

Repository: ${REPO_URL}`;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      instruction: instruction,
      repo_url: REPO_URL,
      // Additional agent configuration if available
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to spawn agent: ${response.statusText}`);
  }

  return await response.json();
}
```



## Agent Lifecycle Management

### Monitoring Agent Status

```javascript
async function monitorAgent(agentId) {
  const statusEndpoint = `${API_URL}/v0/agents/${agentId}/status`;
  
  // Poll agent status
  const interval = setInterval(async () => {
    const response = await fetch(statusEndpoint, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    const status = await response.json();
    
    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
      console.log(`[SPAWNER] Agent ${agentId} finished: ${status.status}`);
      agentSpawned = false; // Allow spawning new agent
    }
  }, 5000); // Poll every 5 seconds
}
```



### Cleanup

- Agents should terminate when queue is empty
- Log agent activity for audit trail
- Handle agent failures gracefully

## Error Handling

### API Errors

- Handle authentication failures
- Handle rate limits
- Retry with backoff

### Agent Failures

- Log failures
- Option to retry
- Fallback to manual review

### Human Intervention

- Agent stops when unclear design needed
- Logs error with details
- Notify user (optional: email, notification)

## Configuration Options

```yaml
development:
  error_debugging:
    cloud_agents:
      enabled: true
      api_url: "${CURSOR_CLOUD_API_URL}"
      api_key: "${CURSOR_CLOUD_API_KEY}"
      repo_url: "${REPO_URL}"
      auto_spawn: true
      max_concurrent_agents: 1
      spawn_on_new_error: true  # Spawn when new error added
      spawn_on_commit: false  # Spawn on git commit with errors
      poll_interval_ms: 1000  # How often to check for new errors
      agent_instruction_template: "scripts/error_debug_agent_instructions.md"
      monitor_agent: true  # Monitor agent status
      retry_failed: true  # Retry if agent fails
      max_retries: 3
```



## Files to Create

1. `scripts/spawn_error_debug_agent.js` - Main spawner script
2. `scripts/monitor_error_agent.js` - Agent monitoring (optional)
3. `scripts/error_debug_agent_instructions.md` - Agent instructions template
4. Update `package.json` - Add npm scripts
5. Update `foundation-config.yaml` - Add Cloud Agents config

## Files to Modify

1. `foundation/agent_instructions/cursor_commands/report_error.md` - Document Cloud Agent integration
2. `docs/developer/getting_started.md` - Document Cloud Agents setup
3. `.env.example` - Add Cloud Agents API credentials

## npm Scripts

```json
{
  "scripts": {
    "watch:errors:agent": "node scripts/watch_and_spawn_agent.js",
    "spawn:error-agent": "node scripts/spawn_error_debug_agent.js"
  }
}
```



## Usage

### Manual Spawn

```bash
npm run spawn:error-agent
```



### Continuous Monitoring

```bash
npm run watch:errors:agent
```



### Git Hook (Optional)

Add to `.git/hooks/post-commit`:

```bash
#!/bin/bash
node scripts/spawn_error_debug_agent.js
```



## Testing

1. Create test error report
2. Verify agent spawns
3. Monitor agent processing
4. Verify errors resolved and archived
5. Verify agent terminates when done

## Limitations

- Requires Cursor Cloud subscription
- Requires API credentials
- Agents run remotely (not truly "localhost")
- API rate limits may apply
- Agent execution time varies

## Comparison with File Watcher Approach

| Feature | Cloud Agents | File Watcher |

|---------|-------------|--------------|

| AI-powered fixes | ✅ Yes (Cursor's AI) | ❌ No (infrastructure only) |

| Code bug fixes | ✅ Yes | ❌ No (logged for review) |

| Local execution | ❌ No (remote) | ✅ Yes |

| Subscription required | ✅ Yes | ❌ No |

| API credentials | ✅ Required | ❌ Not needed |

| Full automation | ✅ Yes | ⚠️ Partial |

## Summary

**This plan implements:** Cursor Cloud Agents for automated error debugging

**AI Used:** Cursor's AI (via Cloud Agents)

**Automatically fixes:** All errors (infrastructure + code bugs) **in committed/pushed code**

**Requires:** Cursor Cloud subscription, API credentials, remote repository access

**Runs:** Remotely in Cursor's cloud environment

**⚠️ Limitation:** Only works with committed/pushed code, not uncommitted local changes

**How it works:**
1. Error reporter creates error in pending.json (from committed code)
2. Spawner script detects error and calls Cloud Agents API
3. Cloud Agent spawned with instructions to process errors
4. Agent clones remote repository (GitHub)
5. Agent uses Cursor's AI to analyze and fix bugs in committed code
6. Agent commits fixes and updates error reports
7. Agent terminates when queue empty

**For uncommitted local changes:** Consider Claude Code instead, or commit changes first, then use Cloud Agents.

## Alternative: Claude Code for Local Development

If you need to fix errors in **uncommitted local changes**, Claude Code would be superior:

**Claude Code advantages:**
- ✅ Works with local files directly
- ✅ No subscription required
- ✅ No API credentials needed
- ✅ Immediate access to uncommitted changes

**Implementation would require:**
- Installing Claude Code CLI
- Creating integration script that calls Claude Code
- Formatting error reports for Claude Code input

Should I create a separate plan for Claude Code integration for local development?