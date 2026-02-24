#!/bin/bash
# Secure credential setup script for cloud agents
# This script creates a temporary .env file with credentials from base64-encoded input
# Usage: echo <base64_encoded_creds> | bash scripts/setup_agent_credentials.sh

set -e

# Read base64-encoded credentials from stdin
ENCODED_CREDS="${1:-}"

if [ -z "$ENCODED_CREDS" ]; then
  echo "[ERROR] No credentials provided. Usage: bash scripts/setup_agent_credentials.sh <base64_encoded_creds>"
  exit 1
fi

# Decode and write to temporary .env file
DECODED=$(echo "$ENCODED_CREDS" | base64 -d)
echo "$DECODED" > .env.agent.tmp

# Source the file to export variables
export $(grep -v '^#' .env.agent.tmp | xargs)

echo "[INFO] Credentials loaded from encoded input"




