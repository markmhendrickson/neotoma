#!/bin/bash
# Setup script for test environment variables (local-only mode)
# Exports environment variables needed for integration/E2E tests with local SQLite

# Local SQLite backend (default for tests: DB at .vitest/neotoma.db)
export NEOTOMA_DATA_DIR="${NEOTOMA_DATA_DIR:-.vitest}"

# If credentials are provided in instructions but not exported, extract and export them
if [ -n "$1" ]; then
  while IFS='=' read -r key value; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      export "$key=$value"
    fi
  done <<< "$1"
fi

echo "Environment variables configured for tests (local mode)"
echo "NEOTOMA_DATA_DIR=${NEOTOMA_DATA_DIR}"
