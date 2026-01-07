#!/bin/bash

# Manage error debugging automation watcher
# Usage: ./scripts/manage_error_debugging.sh [start|stop|status|logs|restart]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.cursor/error_reports/watcher.pid"
LOG_FILE="$PROJECT_ROOT/.cursor/error_reports/watcher.log"
WATCHER_SCRIPT="$PROJECT_ROOT/scripts/trigger_error_debug_cli.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if process is running
is_running() {
  local pid=$1
  if [ -z "$pid" ]; then
    return 1
  fi
  if ps -p "$pid" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Function to get PID from file
get_pid() {
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE"
  else
    echo ""
  fi
}

# Function to start watcher
start_watcher() {
  # Check if already running
  local pid=$(get_pid)
  if [ -n "$pid" ] && is_running "$pid"; then
    echo -e "${YELLOW}Error debugging watcher is already running (PID: $pid)${NC}"
    return 0
  fi

  # Clean up stale PID file
  if [ -f "$PID_FILE" ]; then
    rm -f "$PID_FILE"
  fi

  # Check if watcher script exists
  if [ ! -f "$WATCHER_SCRIPT" ]; then
    echo -e "${RED}Error: Watcher script not found: $WATCHER_SCRIPT${NC}"
    exit 1
  fi

  # Create directories if needed
  mkdir -p "$(dirname "$PID_FILE")"
  mkdir -p "$(dirname "$LOG_FILE")"

  # Check configuration
  if [ ! -f "$PROJECT_ROOT/foundation-config.yaml" ]; then
    echo -e "${YELLOW}Warning: foundation-config.yaml not found, using defaults${NC}"
  fi

  # Start watcher in background
  echo -e "${GREEN}Starting error debugging watcher...${NC}"
  cd "$PROJECT_ROOT"
  nohup node "$WATCHER_SCRIPT" --watch > "$LOG_FILE" 2>&1 &
  local new_pid=$!

  # Save PID
  echo "$new_pid" > "$PID_FILE"

  # Wait a moment and verify it's still running
  sleep 1
  if is_running "$new_pid"; then
    echo -e "${GREEN}Started error debugging watcher (PID: $new_pid)${NC}"
    echo "Logs: $LOG_FILE"
  else
    echo -e "${RED}Failed to start watcher${NC}"
    rm -f "$PID_FILE"
    if [ -f "$LOG_FILE" ]; then
      echo "Last log entries:"
      tail -20 "$LOG_FILE"
    fi
    exit 1
  fi
}

# Function to stop watcher
stop_watcher() {
  local pid=$(get_pid)
  
  if [ -z "$pid" ]; then
    echo -e "${YELLOW}Error debugging watcher is not running${NC}"
    return 0
  fi

  if ! is_running "$pid"; then
    echo -e "${YELLOW}Watcher process not found (stale PID file removed)${NC}"
    rm -f "$PID_FILE"
    return 0
  fi

  echo -e "${GREEN}Stopping error debugging watcher (PID: $pid)...${NC}"
  
  # Try graceful shutdown
  kill "$pid" 2>/dev/null || true
  
  # Wait for process to stop (max 5 seconds)
  local count=0
  while [ $count -lt 5 ] && is_running "$pid"; do
    sleep 1
    count=$((count + 1))
  done

  # Force kill if still running
  if is_running "$pid"; then
    echo -e "${YELLOW}Force killing watcher...${NC}"
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
  fi

  # Remove PID file
  rm -f "$PID_FILE"
  
  if ! is_running "$pid"; then
    echo -e "${GREEN}Stopped error debugging watcher${NC}"
  else
    echo -e "${RED}Failed to stop watcher${NC}"
    exit 1
  fi
}

# Function to show status
show_status() {
  local pid=$(get_pid)
  
  if [ -z "$pid" ]; then
    echo -e "${YELLOW}Status: Not running${NC}"
    return 0
  fi

  if ! is_running "$pid"; then
    echo -e "${YELLOW}Status: Not running (stale PID file removed)${NC}"
    rm -f "$PID_FILE"
    return 0
  fi

  echo -e "${GREEN}Status: Running${NC}"
  echo "PID: $pid"
  
  # Show uptime (approximate)
  if command -v ps > /dev/null 2>&1; then
    local etime=$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ')
    if [ -n "$etime" ]; then
      echo "Uptime: $etime"
    fi
  fi

  # Show last log entry
  if [ -f "$LOG_FILE" ]; then
    echo ""
    echo "Last log entry:"
    tail -1 "$LOG_FILE" | sed 's/^/  /'
  fi
}

# Function to show logs
show_logs() {
  if [ ! -f "$LOG_FILE" ]; then
    echo -e "${YELLOW}No log file found. Watcher may not have started yet.${NC}"
    return 0
  fi

  echo "Log file: $LOG_FILE"
  echo "---"
  tail -50 "$LOG_FILE"
}

# Function to restart watcher
restart_watcher() {
  stop_watcher
  sleep 1
  start_watcher
}

# Main logic
ACTION="${1:-status}"

case "$ACTION" in
  start)
    start_watcher
    ;;
  stop)
    stop_watcher
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  restart)
    restart_watcher
    ;;
  *)
    echo "Usage: $0 [start|stop|status|logs|restart]"
    echo ""
    echo "Actions:"
    echo "  start   - Start the error debugging watcher"
    echo "  stop    - Stop the running watcher"
    echo "  status  - Show watcher status (default)"
    echo "  logs    - Show recent logs"
    echo "  restart - Stop and start the watcher"
    exit 1
    ;;
esac




