#!/bin/bash
# Enable anonymous authentication in local Supabase
# This is required for E2E tests that use guest authentication

set -e

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

echo "Enabling anonymous authentication in local Supabase..."

# Use Supabase Management API to enable anonymous sign-ins
# Note: This uses the local Supabase Management API endpoint
curl -X PUT "${SUPABASE_URL}/rest/v1/rpc/enable_anonymous_signins" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  2>/dev/null || {
  echo "Note: Management API endpoint may not be available."
  echo "Please enable anonymous sign-ins manually:"
  echo "1. Open Supabase Studio: http://localhost:54323"
  echo "2. Go to Authentication → Providers"
  echo "3. Find 'Anonymous' provider and click 'Enable'"
  exit 0
}

echo "✅ Anonymous authentication enabled (or already enabled)"
