#!/bin/bash
# Setup script for test environment variables (local-only mode)
# Exports environment variables needed for integration/E2E tests with local SQLite

# Local SQLite backend (default for tests)
export NEOTOMA_SQLITE_PATH="${NEOTOMA_SQLITE_PATH:-.vitest/neotoma.db}"

# If credentials are provided in instructions but not exported, extract and export them
if [ -n "$1" ]; then
  while IFS='=' read -r key value; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      export "$key=$value"
    fi
  done <<< "$1"
fi

echo "Environment variables configured for tests (local mode)"
echo "NEOTOMA_SQLITE_PATH=${NEOTOMA_SQLITE_PATH}"
