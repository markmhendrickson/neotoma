#!/bin/bash
# Set up Cloudflare Email Routing with catch-all forwarding
#
# Usage:
#   1. First, get Cloudflare API token:
#      - Go to: https://dash.cloudflare.com/profile/api-tokens
#      - Create token with: Zone:Read, Zone:Edit, Email Routing:Edit permissions
#      - Add to 1Password and sync: /sync_env_from_1password
#   
#   2. Then run this script:
#      ./scripts/setup_cloudflare_email_routing.sh
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN in .env (loaded via sync command)
#   - Destination email: mark@hendricksonserrano.com

set -e

# Load environment variables
if [ -f .env ]; then
  CLOUDFLARE_API_TOKEN=$(grep "^CLOUDFLARE_API_TOKEN=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  CLOUDFLARE_ZONE_ID=$(grep "^CLOUDFLARE_ZONE_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
else
  echo "❌ .env file not found"
  exit 1
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN not found in .env"
  echo "   Get token from: https://dash.cloudflare.com/profile/api-tokens"
  echo "   Add to env_var_mappings and run: /sync_env_from_1password"
  exit 1
fi

DOMAIN="neotoma.io"
DESTINATION_EMAIL="mark@hendricksonserrano.com"

echo "📧 Setting up Cloudflare Email Routing for ${DOMAIN}"
echo ""

# Step 1: Get zone ID if not provided
if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "📋 Getting zone ID for ${DOMAIN}..."
  ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json")
  
  ZONE_ID=$(echo "$ZONE_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); zones = data.get('result', []); print(zones[0]['id'] if zones else '')" 2>/dev/null)
  
  if [ -z "$ZONE_ID" ]; then
    echo "❌ Could not get zone ID for ${DOMAIN}"
    echo "Response: $ZONE_RESPONSE" | python3 -m json.tool 2>/dev/null | head -10
    exit 1
  fi
  
  echo "✅ Zone ID: ${ZONE_ID}"
else
  ZONE_ID="$CLOUDFLARE_ZONE_ID"
  echo "✅ Using zone ID from .env: ${ZONE_ID}"
fi

# Step 2: Enable Email Routing DNS (non-deprecated endpoint)
echo ""
echo "📋 Enabling Email Routing DNS (adds MX/SPF records)..."
DNS_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/dns" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}')

HTTP_CODE=$(echo "$DNS_RESPONSE" | tail -n1)
BODY=$(echo "$DNS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "✅ Email Routing DNS enabled (MX/SPF records added)"
elif echo "$BODY" | grep -q "already enabled\|already exists"; then
  echo "✅ Email Routing DNS already enabled"
else
  echo "⚠️  DNS enable response (HTTP ${HTTP_CODE}):"
  echo "$BODY" | python3 -m json.tool 2>/dev/null | head -10
  echo "Note: This may require Zone:Edit permission"
fi

# Step 3: Add destination address (account-level, not zone-level)
echo ""
echo "📋 Adding destination address: ${DESTINATION_EMAIL}..."
# Get account ID first
ACCOUNT_RESPONSE=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")

ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); zone = data.get('result', {}); print(zone.get('account', {}).get('id', ''))" 2>/dev/null)

if [ -z "$ACCOUNT_ID" ]; then
  echo "⚠️  Could not get account ID, skipping destination address"
  echo "   You may need to add ${DESTINATION_EMAIL} manually in Cloudflare dashboard"
else
  DEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/email/routing/addresses" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"${DESTINATION_EMAIL}\"}")

  HTTP_CODE=$(echo "$DEST_RESPONSE" | tail -n1)
  BODY=$(echo "$DEST_RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Destination address added"
    echo "   Check ${DESTINATION_EMAIL} for verification email"
  elif echo "$BODY" | grep -q "already exists\|already verified"; then
    echo "✅ Destination address already exists"
  else
    echo "⚠️  Add destination response (HTTP ${HTTP_CODE}):"
    echo "$BODY" | python3 -m json.tool 2>/dev/null | head -10
    echo "   You may need to add ${DESTINATION_EMAIL} manually in Cloudflare dashboard"
  fi
fi

# Step 4: Set up catch-all rule
echo ""
echo "📋 Setting up catch-all forwarding rule..."
CATCHALL_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/rules/catch_all" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"enabled\": true,
    \"actions\": [
      {
        \"type\": \"forward\",
        \"value\": [\"${DESTINATION_EMAIL}\"]
      }
    ]
  }")

HTTP_CODE=$(echo "$CATCHALL_RESPONSE" | tail -n1)
BODY=$(echo "$CATCHALL_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
  echo "✅ Catch-all rule configured"
  echo "   All emails to *@${DOMAIN} will forward to ${DESTINATION_EMAIL}"
else
  echo "❌ Failed to configure catch-all (HTTP ${HTTP_CODE})"
  echo "Response:"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

echo ""
echo "✅ Email routing setup complete!"
echo ""
echo "Next steps:"
echo "  1. Check ${DESTINATION_EMAIL} for verification email from Cloudflare"
echo "  2. Click verification link to activate forwarding"
echo "  3. Test by sending email to test@${DOMAIN}"
echo ""
echo "Note: MX records are automatically added by Cloudflare"
