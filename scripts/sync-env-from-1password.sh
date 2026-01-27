#!/bin/bash
# Wrapper script to sync environment variables from 1Password
# Uses the foundation script: foundation/scripts/op_sync_env_from_1password.py

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if foundation symlink exists
if [ ! -L "$REPO_ROOT/foundation" ] && [ ! -d "$REPO_ROOT/foundation" ]; then
    echo "Error: Foundation directory not found."
    echo "Please run: npm run setup:foundation"
    exit 1
fi

# Check if the Python script exists
PYTHON_SCRIPT="$REPO_ROOT/foundation/scripts/op_sync_env_from_1password.py"
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "Error: 1Password sync script not found at: $PYTHON_SCRIPT"
    echo "Please ensure the foundation directory is properly set up."
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not found."
    echo "Please install Python 3.9 or later."
    exit 1
fi

# Check if 1Password CLI is available
if ! command -v op &> /dev/null; then
    echo "Error: 1Password CLI (op) is required but not found."
    echo "Please install it from: https://developer.1password.com/docs/cli/get-started"
    exit 1
fi

# Authenticate with 1Password once and reuse session for all op calls
# This batches authentication so the user only needs to auth once
# The session token is exported so all subsequent op calls (including in Python script) use it

# Check if we already have a session token in environment
HAS_SESSION_ENV=false
for var in $(env | grep "^OP_SESSION_" | cut -d'=' -f1); do
    if [ -n "${!var}" ]; then
        HAS_SESSION_ENV=true
        break
    fi
done

# Check if op whoami works (existing session)
if op whoami &>/dev/null; then
    if [ "$HAS_SESSION_ENV" = "true" ]; then
        echo "✓ Using existing 1Password session from environment"
    else
        echo "✓ Using existing 1Password session"
    fi
else
    # No active session, need to sign in
    echo "No active 1Password session found."
    
    # Try to get account identifier
    ACCOUNT=$(op account list 2>/dev/null | head -1 | awk '{print $NF}' 2>/dev/null || echo "")
    
    echo "Signing in to 1Password..."
    echo "Please complete authentication (biometric/password prompt may appear)..."
    # Use eval to properly export session token and trigger interactive prompt
    # op signin outputs export commands that need to be evaluated
    if eval "$(op signin)" 2>&1; then
        echo "✓ 1Password session established"
    else
        echo "Error: Failed to sign in to 1Password."
        echo "Please run manually: op signin"
        exit 1
    fi
fi

# Set up environment variables for parquet MCP server
# These point to the parquet MCP server in the personal repo
export PARQUET_MCP_SERVER_PATH="${PARQUET_MCP_SERVER_PATH:-/Users/markmhendrickson/repos/personal/truth/mcp-servers/parquet/parquet_mcp_server.py}"
export PARQUET_MCP_PYTHON="${PARQUET_MCP_PYTHON:-/Users/markmhendrickson/repos/personal/execution/venv/bin/python3}"

# Set DATA_DIR if not already set (needed for parquet MCP server)
if [ -z "$DATA_DIR" ]; then
  # Try to get from .env file if it exists
  if [ -f "$REPO_ROOT/.env" ]; then
    DATA_DIR_FROM_ENV=$(grep "^DATA_DIR=" "$REPO_ROOT/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ -n "$DATA_DIR_FROM_ENV" ]; then
      export DATA_DIR="$DATA_DIR_FROM_ENV"
    fi
  fi
  # Fallback to default location
  export DATA_DIR="${DATA_DIR:-/Users/markmhendrickson/Library/Mobile Documents/com~apple~CloudDocs/Documents/data}"
fi

# Run the Python script with any passed arguments
cd "$REPO_ROOT"
python3 "$PYTHON_SCRIPT" "$@"
