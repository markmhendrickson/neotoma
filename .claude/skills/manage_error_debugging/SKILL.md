---
name: manage-error-debugging
description: Manage error debugging per foundation command.
triggers:
  - manage error debugging
  - /manage_error_debugging
  - manage-error-debugging
---

# Manage Error Debugging Automation

Manage the error debugging automation monitoring script (start, stop, status, logs).

## Command Usage

```bash
/manage_error_debugging [action]
```

**Actions:**
- `start` - Start the error debugging watcher in background
- `stop` - Stop the running watcher
- `status` - Check if watcher is running and show status
- `logs` - Show recent logs from the watcher
- `restart` - Stop and start the watcher
- (no action) - Show status (default)

## Prerequisites

- Error debugging automation enabled in `foundation-config.yaml`
- `scripts/trigger_error_debug_cli.js` exists and is executable
- Node.js installed

## Workflow

### Action: `start`

1. **Check if already running:**
   - Check for PID file: `.cursor/error_reports/watcher.pid`
   - If PID file exists, verify process is still running
   - If running, exit with message: "Error debugging watcher is already running (PID: {pid})"

2. **Verify configuration:**
   - Load `foundation-config.yaml`
   - Check `development.error_debugging.enabled === true`
   - If disabled, exit with error

3. **Create necessary directories:**
   - Ensure `.cursor/error_reports/` exists
   - Ensure log directory exists (if configured)

4. **Start watcher in background:**
   - Run: `node scripts/trigger_error_debug_cli.js --watch > .cursor/error_reports/watcher.log 2>&1 &`
   - Capture PID of background process
   - Write PID to `.cursor/error_reports/watcher.pid`
   - Output: "Started error debugging watcher (PID: {pid})"

5. **Verify start:**
   - Wait 1 second
   - Check if process is still running
   - If not running, read log file and show error

### Action: `stop`

1. **Check if running:**
   - Read PID from `.cursor/error_reports/watcher.pid`
   - If PID file doesn't exist, exit: "Error debugging watcher is not running"

2. **Verify process exists:**
   - Check if process with PID is running
   - If not running, remove stale PID file and exit: "Watcher process not found (stale PID file removed)"

3. **Stop process:**
   - Send TERM signal to process
   - Wait up to 5 seconds for graceful shutdown
   - If still running, send KILL signal
   - Remove PID file
   - Output: "Stopped error debugging watcher (PID: {pid})"

### Action: `status`

1. **Check PID file:**
   - Read `.cursor/error_reports/watcher.pid`
   - If not found: "Status: Not running"

2. **Check if process is running:**
   - Verify process with PID exists
   - If not: "Status: Not running (stale PID file)"
   - Remove stale PID file

3. **If running, show:**
   - PID
   - Uptime (how long it's been running)
   - Configuration status (enabled/disabled)
   - Last log entry (if log file exists)

### Action: `logs`

1. **Check log file:**
   - Read `.cursor/error_reports/watcher.log`
   - If not found: "No log file found. Watcher may not have started yet."

2. **Display logs:**
   - Show last 50 lines (configurable)
   - Or tail logs if `--follow` flag provided

### Action: `restart`

1. **Run stop action** (if running)
2. **Wait 1 second**
3. **Run start action**

## Implementation Notes

**PID File Management:**
- Store PID in: `.cursor/error_reports/watcher.pid`
- Remove PID file on stop or if process not found

**Log File:**
- Logs written to: `.cursor/error_reports/watcher.log`
- Rotate or truncate on restart (optional)

**Process Verification:**
```bash
# Check if process exists (cross-platform)
if ps -p $PID > /dev/null 2>&1; then
  # Process is running
fi
```

**Platform-Specific:**
- Use `ps` command (available on macOS, Linux)
- On Windows, may need `tasklist` or PowerShell `Get-Process`

## Configuration

Configure in `foundation-config.yaml`:

```yaml
development:
  error_debugging:
    enabled: true
    automation:
      watch_mode: true  # Enable continuous monitoring
      cursor_cli:
        # ... cursor_cli configuration ...
```

## Examples

```bash
# Check status
/manage_error_debugging
/manage_error_debugging status

# Start watcher
/manage_error_debugging start

# Stop watcher
/manage_error_debugging stop

# View logs
/manage_error_debugging logs

# Restart watcher
/manage_error_debugging restart
```

## Related Commands

- `/report` - Report an error (triggers debugging if automation enabled)
- `/debug` - Manually debug pending errors (deprecated: use `/debug` instead)

## Error Handling

- If watcher fails to start, show error from log file
- If PID file exists but process not found, clean up stale PID file
- If configuration disabled, prevent start and show message
- On stop, handle graceful shutdown with timeout fallback to KILL



