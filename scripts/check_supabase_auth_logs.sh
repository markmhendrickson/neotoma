#!/bin/bash
# Check Supabase authentication logs for email delivery status
#
# Usage:
#   ./scripts/check_supabase_auth_logs.sh
#
# Requires: Supabase CLI (install via: brew install supabase/tap/supabase)

set -e

# Load environment variables
if [ -f .env ]; then
  SUPABASE_PROJECT_ID=$(grep "^SUPABASE_PROJECT_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_SERVICE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
else
  echo "❌ .env file not found"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_ID" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "❌ Missing SUPABASE_PROJECT_ID or SUPABASE_SERVICE_KEY"
  exit 1
fi

SUPABASE_URL="https://${SUPABASE_PROJECT_ID}.supabase.co"

echo "📋 Checking Supabase Authentication Logs..."
echo ""

# Check if Supabase CLI is available (preferred method)
if command -v supabase &> /dev/null; then
  echo "✅ Using Supabase CLI (preferred method)"
  echo ""
  echo "=== Recent Auth Events (last 20) ==="
  
  # Check if logged in
  if ! supabase projects list &>/dev/null; then
    echo "⚠️  Not logged in to Supabase CLI"
    echo "   Run: supabase login"
    echo ""
    echo "Falling back to API method..."
  else
    # Use CLI to get logs
    echo "Fetching auth logs via CLI..."
    supabase projects logs --project-ref "${SUPABASE_PROJECT_ID}" --type auth --limit 20 2>/dev/null || {
      echo "⚠️  CLI logs command failed, trying API method..."
    }
    echo ""
  fi
fi

# Fallback to API method if CLI not available or failed
if ! command -v supabase &> /dev/null || [ $? -ne 0 ]; then
  echo "⚠️  Supabase CLI not available"
  echo "   Install via: brew install supabase/tap/supabase"
  echo "   Then run: supabase login"
  echo ""
  echo "Falling back to API method (limited)..."
  echo ""
  
  # Try to query auth.audit_log_entries (if accessible)
  echo "=== Recent Auth Events (API method - limited) ==="
  AUDIT_LOGS=$(curl -s -X GET \
    "${SUPABASE_URL}/rest/v1/auth.audit_log_entries?select=id,event_type,created_at,metadata&order=created_at.desc&limit=10" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" 2>/dev/null)

  if echo "$AUDIT_LOGS" | grep -q "error\|code"; then
    echo "⚠️  Cannot access audit logs via API"
    echo ""
    echo "To check logs, install Supabase CLI:"
    echo "  brew install supabase/tap/supabase"
    echo "  supabase login"
    echo "  supabase projects logs --project-ref ${SUPABASE_PROJECT_ID} --type auth"
    echo ""
    echo "Or use dashboard (last resort):"
    echo "  https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/logs"
  else
    echo "$AUDIT_LOGS" | python3 -m json.tool 2>/dev/null || echo "$AUDIT_LOGS"
  fi
fi

echo ""
echo "=== Recent User Signups ==="
# Query auth.users via PostgREST (if accessible)
USERS=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/auth/users?select=id,email,created_at,email_confirmed_at,last_sign_in_at&order=created_at.desc&limit=5" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" 2>/dev/null)

if echo "$USERS" | grep -q "error\|code"; then
  echo "⚠️  Cannot access auth.users via API (RLS may block access)"
  echo ""
  echo "To check signups manually:"
  echo "1. Go to Supabase Dashboard → Authentication → Users"
  echo "2. Check 'Email Confirmed' column"
  echo "3. Look for users with unconfirmed emails"
else
  echo "$USERS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for user in data:
            email = user.get('email', 'N/A')
            created = user.get('created_at', 'N/A')
            confirmed = user.get('email_confirmed_at', None)
            status = '✅ Confirmed' if confirmed else '⏳ Pending'
            print(f\"{status} | {email} | Created: {created}\")
    else:
        print(json.dumps(data, indent=2))
except:
    print(sys.stdin.read())
" 2>/dev/null || echo "$USERS"
fi

echo ""
echo "=== Email Delivery Status ==="
echo ""
echo "To check email delivery (CLI preferred):"
echo ""
echo "1. Supabase CLI (recommended):"
echo "   brew install supabase/tap/supabase"
echo "   supabase login"
echo "   supabase projects logs --project-ref ${SUPABASE_PROJECT_ID} --type auth | grep -i email"
echo ""
echo "2. SendGrid CLI (if available):"
echo "   Check SendGrid Activity Feed via API or dashboard"
echo "   Dashboard: https://app.sendgrid.com/activity"
echo ""
echo "3. Check email client:"
echo "   - Spam/junk folder"
echo "   - Email filters"
echo "   - Blocked senders list"
echo ""
echo "Note: Dashboard access is available but CLI tools are preferred for automation."
