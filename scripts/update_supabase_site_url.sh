#!/bin/bash
# Update Supabase site_url configuration
#
# Usage:
#   ./scripts/update_supabase_site_url.sh http://localhost:5173

set -e

NEW_SITE_URL="${1:-http://localhost:5173}"

# Validate URL format
if [[ ! "$NEW_SITE_URL" =~ ^https?:// ]]; then
  echo "❌ Invalid URL format. Must start with http:// or https://"
  echo "Usage: $0 http://localhost:5173"
  exit 1
fi

# Load environment variables
if [ -f .env ]; then
  SUPABASE_PROJECT_ID=$(grep "^SUPABASE_PROJECT_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_ACCESS_TOKEN=$(grep "^SUPABASE_ACCESS_TOKEN=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
else
  echo "❌ .env file not found"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_ID" ] || [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN"
  exit 1
fi

echo "🔧 Updating Supabase site_url to: ${NEW_SITE_URL}"

SUPABASE_URL="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth"

# Update site_url
RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH \
  "${SUPABASE_URL}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"site_url\": \"${NEW_SITE_URL}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
  echo "✅ Successfully updated site_url to: ${NEW_SITE_URL}"
  echo ""
  echo "Confirmation email links will now point to: ${NEW_SITE_URL}"
else
  echo "❌ Failed to update site_url (HTTP ${HTTP_CODE})"
  echo "Response: ${BODY}"
  exit 1
fi
