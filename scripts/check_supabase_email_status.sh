#!/bin/bash
# Check Supabase email configuration and recent signup attempts
#
# Usage:
#   ./scripts/check_supabase_email_status.sh

set -e

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

echo "📧 Checking Supabase Email Configuration..."
echo ""

# Get auth config
CONFIG=$(curl -s -X GET \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json")

# Parse and display email settings
echo "=== Email Settings ==="
echo "External email enabled: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('external_email_enabled', 'N/A'))")"
echo "Email confirmation enabled: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('mailer_secure_email_change_enabled', 'N/A'))")"
echo "SMTP host: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('smtp_host', 'N/A'))")"
echo "SMTP admin email: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('smtp_admin_email', 'N/A'))")"
echo "SMTP sender name: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('smtp_sender_name', 'N/A'))")"
echo "Site URL: $(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('site_url', 'N/A'))")"
echo ""

# Check if SMTP is configured
SMTP_HOST=$(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('smtp_host', ''))")
if [ -z "$SMTP_HOST" ] || [ "$SMTP_HOST" = "null" ]; then
  echo "⚠️  WARNING: SMTP is not configured!"
  echo "   Run: ./scripts/configure_supabase_smtp.sh"
  echo ""
fi

# Check site_url
SITE_URL=$(echo "$CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('site_url', ''))")
if [ "$SITE_URL" != "http://localhost:5173" ] && [ "$SITE_URL" != "http://localhost:5195" ]; then
  echo "⚠️  WARNING: Site URL is set to: ${SITE_URL}"
  echo "   Frontend typically runs on http://localhost:5173 (Vite default)"
  echo "   Confirmation email links will point to the wrong URL"
  echo "   Update via: ./scripts/update_supabase_site_url.sh http://localhost:5173"
  echo ""
fi

echo "=== Troubleshooting Steps ==="
echo "1. Check Supabase Dashboard → Authentication → Logs for email delivery errors"
echo "2. Check SendGrid dashboard for delivery status (if using SendGrid)"
echo "3. Verify sender email is verified in SendGrid"
echo "4. Check spam/junk folder"
echo "5. Try disabling email confirmation for testing:"
echo "   - Dashboard → Authentication → Email → Disable 'Enable email confirmations'"
echo ""
