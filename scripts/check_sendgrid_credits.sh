#!/bin/bash
# Check SendGrid account credits and provide upgrade instructions

set -e

# Load .env
if [ -f .env ]; then
  SENDGRID_API_KEY=$(grep "^SENDGRID_API_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
fi

echo "📋 SendGrid Account Credits & Billing"
echo ""

if [ -z "$SENDGRID_API_KEY" ]; then
  echo "⚠️  SENDGRID_API_KEY not found in .env"
  echo "   Run: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
  exit 1
fi

# Check user profile
echo "📋 Account Information:"
PROFILE=$(curl -s -X GET "https://api.sendgrid.com/v3/user/profile" \
  -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
  -H "Content-Type: application/json" 2>/dev/null || echo '{}')

EMAIL=$(echo "$PROFILE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('email', 'unknown'))" 2>/dev/null || echo "unknown")
FIRST_NAME=$(echo "$PROFILE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('first_name', 'unknown'))" 2>/dev/null || echo "unknown")
LAST_NAME=$(echo "$PROFILE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('last_name', 'unknown'))" 2>/dev/null || echo "unknown")

echo "  Email: ${EMAIL}"
echo "  Name: ${FIRST_NAME} ${LAST_NAME}"
echo ""

# Check recent email activity to estimate usage
echo "📋 Recent Email Activity (last 7 days):"
START_DATE=$(date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u -d "7 days ago" +%Y-%m-%d 2>/dev/null || echo "")
if [ -n "$START_DATE" ]; then
  STATS=$(curl -s -X GET "https://api.sendgrid.com/v3/stats?start_date=${START_DATE}&aggregated_by=day" \
    -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
    -H "Content-Type: application/json" 2>/dev/null || echo '[]')
  
  TOTAL_SENT=$(echo "$STATS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total = 0
    if isinstance(data, list):
        for day in data:
            stats = day.get('stats', [])
            for stat in stats:
                metrics = stat.get('metrics', {})
                total += metrics.get('delivered', 0)
    print(total)
except:
    print('unknown')
" 2>/dev/null || echo "unknown")
  
  echo "  Total emails sent (last 7 days): ${TOTAL_SENT}"
  echo "  Average per day: $((TOTAL_SENT / 7))"
else
  echo "  ⚠️  Could not calculate date range"
fi
echo ""

# Instructions
echo "📋 How to Check Your Current Plan & Credits:"
echo ""
echo "1. Go to SendGrid Dashboard:"
echo "   https://app.sendgrid.com/"
echo ""
echo "2. Navigate to: Settings → Billing"
echo ""
echo "3. Check your:"
echo "   - Current plan (Free, Essentials, Pro, etc.)"
echo "   - Credit balance"
echo "   - Monthly email limit"
echo ""

echo "📋 How to Add More Credits:"
echo ""
echo "Option A: Upgrade Your Plan (Recommended)"
echo "  Steps:"
echo "  1. Go to: https://app.sendgrid.com/settings/billing"
echo "  2. Click 'Change Plan' or 'Upgrade'"
echo "  3. Select your desired plan:"
echo "     - Free: 100 emails/day (no cost)"
echo "     - Essentials: \$19.95/month (40,000 emails/month)"
echo "     - Pro: \$89.95/month (100,000 emails/month)"
echo "     - Higher tiers available for more volume"
echo "  4. Add payment information"
echo "  5. Submit"
echo ""
echo "  ⚠️  Note: Plan upgrades take effect immediately"
echo ""

echo "Option B: Purchase Additional Credits (Paid Plans Only)"
echo "  Steps:"
echo "  1. Go to: https://app.sendgrid.com/settings/billing"
echo "  2. Click 'Purchase Credits' (if available on your plan)"
echo "  3. Select credit package"
echo "  4. Complete purchase"
echo ""

echo "Option C: Wait for Credit Reset"
echo "  - Free tier: Resets daily at midnight UTC"
echo "  - Paid plans: Resets monthly (on billing cycle)"
echo ""

echo "⚠️  About the '451 Maximum credits exceeded' Error:"
echo "  - This means you've reached your SendGrid account's email sending limit"
echo "  - SendGrid uses 1 credit per email sent"
echo "  - Free tier: 100 credits/day"
echo "  - Paid plans: Based on your monthly limit"
echo "  - This is NOT a database configuration issue"
echo ""

echo "📋 Quick Links:"
echo "  - Dashboard: https://app.sendgrid.com/"
echo "  - Billing: https://app.sendgrid.com/settings/billing"
echo "  - Upgrade Plan: https://app.sendgrid.com/settings/billing/plan"
echo ""
