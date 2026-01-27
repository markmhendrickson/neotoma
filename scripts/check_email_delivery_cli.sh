#!/bin/bash
# Check email delivery status using CLI tools
#
# Usage:
#   ./scripts/check_email_delivery_cli.sh
#
# Requires:
#   - Supabase CLI (brew install supabase/tap/supabase)
#   - psql (brew install postgresql@15) - for database queries
#   - 1Password CLI (op) - for SendGrid credentials

set -e

# Load environment variables
if [ -f .env ]; then
  SUPABASE_PROJECT_ID=$(grep "^SUPABASE_PROJECT_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_SERVICE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_ACCESS_TOKEN=$(grep "^SUPABASE_ACCESS_TOKEN=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
else
  echo "❌ .env file not found"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "❌ Missing SUPABASE_PROJECT_ID"
  exit 1
fi

echo "📧 Checking Email Delivery Status (CLI Methods)"
echo ""

# Add psql to PATH if installed via Homebrew
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# Method 1: Query database via psql (if available)
if command -v psql &> /dev/null; then
  echo "=== Method 1: Database Query (psql) ==="
  
  # Get database password from Supabase API
  echo "Retrieving database password..."
  DB_PASSWORD_RESPONSE=$(curl -s -X GET "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/password" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" 2>/dev/null)
  
  DB_PASSWORD=$(echo "$DB_PASSWORD_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('database_password', d.get('password', '')))" 2>/dev/null || echo "")
  
  # Alternative: Try getting connection string from project settings
  if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "null" ]; then
    echo "⚠️  Could not get password via API, trying project settings..."
    PROJECT_INFO=$(curl -s -X GET "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}" \
      -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" 2>/dev/null)
    DB_PASSWORD=$(echo "$PROJECT_INFO" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('db_pass', d.get('database_password', '')))" 2>/dev/null || echo "")
  fi
  
  if [ -n "$DB_PASSWORD" ] && [ "$DB_PASSWORD" != "null" ] && [ ${#DB_PASSWORD} -gt 10 ]; then
    DB_HOST="${SUPABASE_PROJECT_ID}.supabase.co"
    DB_USER="postgres"
    
    echo "Querying recent signups..."
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -t -c \
      "SELECT 
        email, 
        created_at::text, 
        CASE WHEN email_confirmed_at IS NULL THEN '⏳ Pending' ELSE '✅ Confirmed' END as status
      FROM auth.users 
      ORDER BY created_at DESC 
      LIMIT 5;" 2>&1 | grep -v "^$" | head -10
    
    echo ""
    echo "Unconfirmed emails:"
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -t -c \
      "SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NULL;" 2>&1 | grep -v "^$"
  else
    echo "⚠️  Could not retrieve database password"
  fi
  echo ""
else
  echo "⚠️  psql not installed. Install via: brew install postgresql@15"
  echo ""
fi

# Method 2: Check SendGrid Activity (if API key available)
echo "=== Method 2: SendGrid Activity (API) ==="

# Read SendGrid API key from .env (must be loaded via sync command first)
if [ -f .env ]; then
  SENDGRID_API_KEY=$(grep "^SENDGRID_API_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
  if [ -n "$SENDGRID_API_KEY" ]; then
    echo "✅ Found SendGrid API key in .env"
  else
    echo "⚠️  SendGrid API key not found in .env"
    echo "   Run: /sync_env_from_1password"
    echo "   Or: npm run sync:env"
  fi
else
  echo "⚠️  .env file not found"
  echo "   Run: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
fi

if [ -n "$SENDGRID_API_KEY" ]; then
  echo "✅ SendGrid API key found"
  echo ""
  echo "Recent email activity (last 24 hours):"
  
  # Get stats for last 24 hours
  START_DATE=$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d "1 day ago" +%Y-%m-%d)
  END_DATE=$(date -u +%Y-%m-%d)
  
  curl -s -X GET "https://api.sendgrid.com/v3/stats?start_date=${START_DATE}&end_date=${END_DATE}" \
    -H "Authorization: Bearer ${SENDGRID_API_KEY}" 2>&1 | \
    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list) and len(data) > 0:
        for day in data:
            stats = day.get('stats', [])
            for stat in stats:
                metrics = stat.get('metrics', {})
                delivered = metrics.get('delivered', 0)
                bounces = metrics.get('bounces', 0)
                drops = metrics.get('drops', 0)
                print(f\"Date: {day.get('date', 'N/A')}\")
                print(f\"  Delivered: {delivered}\")
                print(f\"  Bounces: {bounces}\")
                print(f\"  Drops: {drops}\")
    else:
        print('No activity data available')
except Exception as e:
    print(f'Error parsing response: {e}')
    print(sys.stdin.read())
" 2>/dev/null || echo "Failed to fetch SendGrid stats"
  
  echo ""
else
  echo "⚠️  SendGrid API key not found in .env"
  echo "   Load variables first: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
  echo ""
fi

# Method 3: Supabase CLI (if supports remote queries)
echo "=== Method 3: Supabase CLI ==="
if command -v supabase &> /dev/null; then
  if supabase projects list &>/dev/null; then
    echo "✅ Supabase CLI logged in"
    echo "⚠️  Note: Supabase CLI doesn't support viewing hosted auth logs directly"
    echo "   Use database query (Method 1) or dashboard instead"
  else
    echo "⚠️  Not logged in. Run: supabase login"
  fi
else
  echo "⚠️  Supabase CLI not installed. Install via: brew install supabase/tap/supabase"
fi

echo ""
echo "=== Summary ==="
echo ""
echo "✅ Best method: Database query via psql (Method 1)"
echo "✅ SendGrid stats: Check API response above"
echo ""
echo "If emails not arriving:"
echo "1. Check unconfirmed users count above"
echo "2. Check SendGrid delivery stats"
echo "3. Verify SMTP configuration: ./scripts/check_supabase_email_status.sh"
echo "4. Check dashboard (fallback): https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/logs"
