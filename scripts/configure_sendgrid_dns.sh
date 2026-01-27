#!/bin/bash
# Configure SendGrid DNS records in Cloudflare
#
# Usage:
#   1. First, get Cloudflare API token:
#      - Go to: https://dash.cloudflare.com/profile/api-tokens
#      - Create token with: Zone:Read, Zone:Edit permissions
#      - Add to 1Password and sync: /sync_env_from_1password
#   
#   2. Then run this script:
#      ./scripts/configure_sendgrid_dns.sh
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN in .env (loaded via sync command)
#   - CLOUDFLARE_ZONE_ID in .env (optional - will be auto-detected if not set)

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

echo ""
echo "📧 Configuring SendGrid DNS records for ${DOMAIN}..."
echo ""

# Function to add DNS record
add_dns_record() {
  local record_type=$1
  local name=$2
  local content=$3
  
  echo "Adding ${record_type} record: ${name} → ${content}"
  
  # Check if record already exists
  EXISTING=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=${record_type}&name=${name}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json")
  
  EXISTING_COUNT=$(echo "$EXISTING" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('result', [])))" 2>/dev/null || echo "0")
  
  if [ "$EXISTING_COUNT" -gt 0 ]; then
    EXISTING_ID=$(echo "$EXISTING" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('result', [{}])[0].get('id', ''))" 2>/dev/null)
    EXISTING_CONTENT=$(echo "$EXISTING" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('result', [{}])[0].get('content', ''))" 2>/dev/null)
    
    if [ "$EXISTING_CONTENT" = "$content" ]; then
      echo "  ✅ Record already exists with correct value"
      return 0
    else
      echo "  ⚠️  Record exists with different value: ${EXISTING_CONTENT}"
      echo "  🔄 Updating record..."
      
      UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT \
        "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${EXISTING_ID}" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{
          \"type\": \"${record_type}\",
          \"name\": \"${name}\",
          \"content\": \"${content}\",
          \"ttl\": 3600
        }")
      
      HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
      BODY=$(echo "$UPDATE_RESPONSE" | sed '$d')
      
      if [ "$HTTP_CODE" -eq 200 ]; then
        echo "  ✅ Record updated successfully"
        return 0
      else
        echo "  ❌ Failed to update record (HTTP ${HTTP_CODE})"
        echo "  Response: $BODY" | python3 -m json.tool 2>/dev/null | head -5
        return 1
      fi
    fi
  else
    # Create new record
    CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
      "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{
        \"type\": \"${record_type}\",
        \"name\": \"${name}\",
        \"content\": \"${content}\",
        \"ttl\": 3600
      }")
    
    HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
    BODY=$(echo "$CREATE_RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
      echo "  ✅ Record created successfully"
      return 0
    else
      echo "  ❌ Failed to create record (HTTP ${HTTP_CODE})"
      echo "  Response: $BODY" | python3 -m json.tool 2>/dev/null | head -5
      return 1
    fi
  fi
}

# Add all SendGrid DNS records
# These values are from the SendGrid domain authentication setup page

add_dns_record "CNAME" "em8718.neotoma.io" "u54371015.wl016.sendgrid.net"
add_dns_record "CNAME" "s1._domainkey.neotoma.io" "s1.domainkey.u54371015.wl016.sendgrid.net"
add_dns_record "CNAME" "s2._domainkey.neotoma.io" "s2.domainkey.u54371015.wl016.sendgrid.net"
add_dns_record "TXT" "_dmarc.neotoma.io" "v=DMARC1; p=none;"
add_dns_record "CNAME" "url3931.neotoma.io" "sendgrid.net"
add_dns_record "CNAME" "54371015.neotoma.io" "sendgrid.net"

echo ""
echo "✅ SendGrid DNS records configuration complete!"
echo ""
echo "Next steps:"
echo "  1. Wait 5-10 minutes for DNS propagation"
echo "  2. Verify records in Cloudflare Dashboard → DNS → Records"
echo "  3. Check SendGrid Dashboard → Settings → Sender Authentication"
echo "  4. SendGrid will verify the records automatically (may take up to 48 hours)"
echo "  5. Once verified, test signup emails - they should now be delivered!"
echo ""
echo "To check DNS propagation:"
echo "  dig em8718.neotoma.io CNAME"
echo "  dig s1._domainkey.neotoma.io CNAME"
echo ""
