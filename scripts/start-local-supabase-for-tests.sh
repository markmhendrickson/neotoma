#!/bin/bash
# Start local Supabase instance for E2E tests
# This eliminates rate limiting and improves test speed

set -euo pipefail

echo "🚀 Starting local Supabase for tests..."

cd "$(git rev-parse --show-toplevel)"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
  echo "❌ Supabase CLI not found. Install with: brew install supabase/tap/supabase"
  exit 1
fi

# Check if Docker is running
if ! docker ps &> /dev/null; then
  echo "❌ Docker is not running. Please start Docker Desktop."
  exit 1
fi

# Stop any existing instance
echo "Stopping any existing Supabase instance..."
supabase stop 2>/dev/null || true

# Start Supabase
echo "Starting Supabase..."
supabase start

# Get status and credentials
echo ""
echo "✅ Local Supabase is running!"
echo ""
echo "To use local Supabase for tests, set:"
echo "  export USE_LOCAL_SUPABASE=1"
echo ""
echo "Or add to .env:"
echo "  USE_LOCAL_SUPABASE=1"
echo ""
echo "Local Supabase URLs:"
supabase status | grep -E "API URL|DB URL|Studio URL" || true
echo ""
echo "Default keys (same for all local instances):"
echo "  Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
echo "  Service Role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
echo ""
echo "To stop: supabase stop"
