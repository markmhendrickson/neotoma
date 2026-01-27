#!/bin/bash
# Configure Supabase SMTP settings using SendGrid credentials from .env
#
# Usage:
#   1. First, load environment variables into .env:
#      /sync_env_from_1password
#      # or: npm run sync:env
#   
#   2. Then run this script:
#      ./scripts/configure_supabase_smtp.sh
#
#   # Or set sender email explicitly (overrides .env):
#   SENDGRID_SENDER_EMAIL="noreply@yourdomain.com" ./scripts/configure_supabase_smtp.sh
#
# Prerequisites:
#   - Environment variables loaded into .env via sync command
#   - SENDGRID_API_KEY and SENDGRID_SENDER_EMAIL in .env
#   - SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN in .env

set -e

# Load only the specific environment variables we need (safer than loading all)
if [ -f .env ]; then
  # Extract only the variables we need, handling quoted values
  SUPABASE_PROJECT_ID=$(grep "^SUPABASE_PROJECT_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_ACCESS_TOKEN=$(grep "^SUPABASE_ACCESS_TOKEN=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  
  export SUPABASE_PROJECT_ID
  export SUPABASE_ACCESS_TOKEN
fi

# Check required environment variables
if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "❌ SUPABASE_PROJECT_ID not found in .env"
  exit 1
fi

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "⚠️  SUPABASE_ACCESS_TOKEN not found in .env"
  echo "Get it from: Supabase Dashboard → Account → Access Tokens"
  echo "Or run: npx supabase login"
  exit 1
fi

# Read SendGrid credentials from .env (must be loaded via sync command first)
# Variables should be in .env after running: /sync_env_from_1password

# Get SendGrid API key from .env
if [ -f .env ]; then
  SENDGRID_API_KEY=$(grep "^SENDGRID_API_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
  SENDGRID_SENDER_EMAIL=$(grep "^SENDGRID_SENDER_EMAIL=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
  
  # #region agent log - Hypothesis A,E: Log API key format/parsing
  API_KEY_LENGTH=${#SENDGRID_API_KEY}
  API_KEY_PREFIX="${SENDGRID_API_KEY:0:10}"
  API_KEY_SUFFIX="${SENDGRID_API_KEY: -10}"
  echo "{\"location\":\"configure_supabase_smtp.sh:51\",\"message\":\"API key parsed from .env\",\"data\":{\"keyLength\":${API_KEY_LENGTH},\"keyPrefix\":\"${API_KEY_PREFIX}\",\"keySuffix\":\"${API_KEY_SUFFIX}\",\"senderEmail\":\"${SENDGRID_SENDER_EMAIL}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"A,E\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
  # #endregion
else
  echo "❌ .env file not found"
  echo "   Run: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
  exit 1
fi

# Check if API key is available
if [ -z "$SENDGRID_API_KEY" ]; then
  echo "❌ SENDGRID_API_KEY not found in .env"
  echo "   Run: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
  echo "   Make sure SendGrid API key is mapped in env_var_mappings"
  exit 1
fi

# Check if sender email is available (allow override via environment variable)
if [ -z "$SENDGRID_SENDER_EMAIL" ]; then
  # Check if set via environment variable (allows override)
  if [ -n "${SENDGRID_SENDER_EMAIL}" ]; then
    echo "📧 Using SENDGRID_SENDER_EMAIL from environment: ${SENDGRID_SENDER_EMAIL}"
  else
    echo "❌ SENDGRID_SENDER_EMAIL not found in .env or environment"
    echo "   Run: /sync_env_from_1password"
    echo "   Or: npm run sync:env"
    echo "   Make sure SENDGRID_SENDER_EMAIL is mapped in env_var_mappings"
    echo "   Or set it manually in .env or as environment variable"
    exit 1
  fi
else
  echo "✅ Found SendGrid credentials in .env"
  echo "📧 Using sender email: ${SENDGRID_SENDER_EMAIL}"
fi

# Configure Supabase SMTP via Management API
echo ""
echo "🔧 Configuring Supabase SMTP settings..."

SUPABASE_URL="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth"

# Validate sender email format
if [[ ! "$SENDGRID_SENDER_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  echo "❌ Invalid email format: ${SENDGRID_SENDER_EMAIL}"
  echo "Please set a valid sender email address"
  echo "You can either:"
  echo "  1. Add SENDGRID_SENDER_EMAIL to env_var_mappings and run /sync_env_from_1password"
  echo "  2. Set SENDGRID_SENDER_EMAIL manually in .env"
  echo "  3. Set SENDGRID_SENDER_EMAIL as environment variable (overrides .env)"
  exit 1
fi

# SMTP configuration payload (using correct API field names)
# Note: smtp_port must be a string, not a number (API requirement)
# rate_limit_email_sent: Set to 30 emails/hour for development (default is 2)
SMTP_CONFIG=$(cat <<EOF
{
  "external_email_enabled": true,
  "mailer_secure_email_change_enabled": true,
  "mailer_autoconfirm": false,
  "smtp_admin_email": "${SENDGRID_SENDER_EMAIL}",
  "smtp_host": "smtp.sendgrid.net",
  "smtp_port": "587",
  "smtp_user": "apikey",
  "smtp_pass": "${SENDGRID_API_KEY}",
  "smtp_sender_name": "Neotoma",
  "rate_limit_email_sent": 30
}
EOF
)

# #region agent log - Hypothesis A,C: Log SMTP config payload (masked API key)
SMTP_CONFIG_MASKED=$(echo "$SMTP_CONFIG" | sed "s/${SENDGRID_API_KEY}/***MASKED***/g")
echo "{\"location\":\"configure_supabase_smtp.sh:118\",\"message\":\"SMTP config payload prepared\",\"data\":{\"config\":${SMTP_CONFIG_MASKED},\"apiKeyLength\":${#SENDGRID_API_KEY},\"senderEmail\":\"${SENDGRID_SENDER_EMAIL}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"A,C\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
# #endregion

# #region agent log - Hypothesis B,D: Check sender email verification and API key permissions
if [ -n "$SENDGRID_API_KEY" ]; then
  # Check sender verification
  SENDER_CHECK=$(curl -s -X GET "https://api.sendgrid.com/v3/verified_senders?email=${SENDGRID_SENDER_EMAIL}" -H "Authorization: Bearer ${SENDGRID_API_KEY}" -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"api_failed"}')
  SENDER_VERIFIED=$(echo "$SENDER_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); senders=d.get('results',[]); verified=any(s.get('verified',{}).get('status')=='verified' for s in senders if s.get('email')=='${SENDGRID_SENDER_EMAIL}'); print('true' if verified else 'false')" 2>/dev/null || echo "unknown")
  
  # Check API key scopes/permissions
  SCOPES_CHECK=$(curl -s -X GET "https://api.sendgrid.com/v3/scopes" -H "Authorization: Bearer ${SENDGRID_API_KEY}" -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"api_failed"}')
  SCOPES_COUNT=$(echo "$SCOPES_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); scopes=d.get('scopes',[]); print(len(scopes))" 2>/dev/null || echo "0")
  HAS_MAIL_SEND=$(echo "$SCOPES_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); scopes=d.get('scopes',[]); has_mail=any('mail.send' in s.lower() for s in scopes); print('true' if has_mail or len(scopes)==0 else 'false')" 2>/dev/null || echo "unknown")
  
  echo "{\"location\":\"configure_supabase_smtp.sh:123\",\"message\":\"SendGrid API checks\",\"data\":{\"senderEmail\":\"${SENDGRID_SENDER_EMAIL}\",\"senderVerified\":\"${SENDER_VERIFIED}\",\"scopesCount\":${SCOPES_COUNT},\"hasMailSend\":\"${HAS_MAIL_SEND}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"B,D\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
fi
# #endregion

# Update SMTP settings
# #region agent log - Hypothesis C: Log before API call
echo "{\"location\":\"configure_supabase_smtp.sh:130\",\"message\":\"About to call Supabase API to update SMTP config\",\"data\":{\"url\":\"${SUPABASE_URL}\",\"hasAccessToken\":$([ -n "$SUPABASE_ACCESS_TOKEN" ] && echo true || echo false),\"senderEmail\":\"${SENDGRID_SENDER_EMAIL}\",\"apiKeyLength\":${#SENDGRID_API_KEY}},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"C\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
# #endregion

RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH \
  "${SUPABASE_URL}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${SMTP_CONFIG}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# #region agent log - Hypothesis C: Log API response
BODY_ESCAPED=$(echo "$BODY" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${BODY}\"")
echo "{\"location\":\"configure_supabase_smtp.sh:142\",\"message\":\"Supabase API response received\",\"data\":{\"httpCode\":${HTTP_CODE},\"responseBody\":${BODY_ESCAPED}},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"C\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
# #endregion

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
  echo "✅ Successfully configured Supabase SMTP with SendGrid"
  echo ""
  echo "SMTP Settings:"
  echo "  Host: smtp.sendgrid.net"
  echo "  Port: 587"
  echo "  Username: apikey"
  echo "  Sender: ${SENDGRID_SENDER_EMAIL}"
  echo "  Sender Name: Neotoma"
  echo ""
  echo "📧 Test by creating a new account - emails should now be delivered to inbox!"
else
  echo "❌ Failed to configure SMTP (HTTP ${HTTP_CODE})"
  echo "Response: ${BODY}"
  exit 1
fi
