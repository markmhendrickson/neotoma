#!/bin/bash
# Setup script for test environment variables
# This script exports environment variables needed for integration/E2E tests

# Supabase credentials (required for integration tests)
if [ -n "$DEV_SUPABASE_URL" ]; then
  export DEV_SUPABASE_URL="$DEV_SUPABASE_URL"
  export SUPABASE_URL="$DEV_SUPABASE_URL"
fi

if [ -n "$DEV_SUPABASE_SERVICE_KEY" ]; then
  export DEV_SUPABASE_SERVICE_KEY="$DEV_SUPABASE_SERVICE_KEY"
  export SUPABASE_SERVICE_KEY="$DEV_SUPABASE_SERVICE_KEY"
fi

# If credentials are provided in instructions but not exported, extract and export them
# This handles cases where env vars are passed as part of the agent instructions
if [ -n "$1" ]; then
  # Parse and export any provided key=value pairs
  while IFS='=' read -r key value; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      export "$key=$value"
    fi
  done <<< "$1"
fi

echo "Environment variables configured for tests"
echo "DEV_SUPABASE_URL=${DEV_SUPABASE_URL:-not set}"
echo "DEV_SUPABASE_SERVICE_KEY=${DEV_SUPABASE_SERVICE_KEY:+set}"

