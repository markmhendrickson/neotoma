#!/bin/bash
# Check SendGrid email logs for sent emails
# Shows recent email activity, delivery status, and detailed logs

set -e

# Load .env
if [ -f .env ]; then
  SENDGRID_API_KEY=$(grep "^SENDGRID_API_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
  SENDGRID_SENDER_EMAIL=$(grep "^SENDGRID_SENDER_EMAIL=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n' 2>/dev/null || echo "")
fi

echo "📋 SendGrid Email Logs"
echo ""

if [ -z "$SENDGRID_API_KEY" ]; then
  echo "❌ SENDGRID_API_KEY not found in .env"
  echo "   Run: /sync_env_from_1password"
  echo "   Or: npm run sync:env"
  exit 1
fi

# Check email activity (last 7 days)
echo "=== Email Activity Stats (Last 7 Days) ==="
echo ""

python3 << 'PYTHON_EOF'
import urllib.request
import json
import os
import datetime

# Load .env
env_vars = {}
if os.path.exists('.env'):
    with open('.env', 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                value = value.strip('"').strip("'").strip()
                env_vars[key] = value

api_key = env_vars.get('SENDGRID_API_KEY', '')

if not api_key:
    print("❌ SENDGRID_API_KEY not found")
    exit(1)

# Get stats for last 7 days
end_date = datetime.datetime.now(datetime.timezone.utc).date()
start_date = end_date - datetime.timedelta(days=7)

url = f"https://api.sendgrid.com/v3/stats?start_date={start_date}&end_date={end_date}&aggregated_by=day"
req = urllib.request.Request(url)
req.add_header('Authorization', f'Bearer {api_key}')
req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read())
        
        if isinstance(data, list) and len(data) > 0:
            total_delivered = 0
            total_bounces = 0
            total_drops = 0
            total_opens = 0
            total_clicks = 0
            total_requests = 0
            
            print("Daily Activity:")
            for day_data in data:
                date = day_data.get('date', 'N/A')
                stats = day_data.get('stats', [])
                for stat in stats:
                    metrics = stat.get('metrics', {})
                    delivered = metrics.get('delivered', 0)
                    bounces = metrics.get('bounces', 0)
                    drops = metrics.get('drops', 0)
                    opens = metrics.get('opens', 0)
                    clicks = metrics.get('clicks', 0)
                    requests = metrics.get('requests', 0)
                    
                    if requests > 0 or delivered > 0 or bounces > 0 or drops > 0:
                        print(f"  {date}:")
                        print(f"    Requests: {requests}")
                        print(f"    Delivered: {delivered}")
                        print(f"    Bounces: {bounces}")
                        print(f"    Drops: {drops}")
                        print(f"    Opens: {opens}")
                        print(f"    Clicks: {clicks}")
                        print("")
                    
                    total_delivered += delivered
                    total_bounces += bounces
                    total_drops += drops
                    total_opens += opens
                    total_clicks += clicks
                    total_requests += requests
            
            print("Total (Last 7 days):")
            print(f"  Requests: {total_requests}")
            print(f"  Delivered: {total_delivered}")
            print(f"  Bounces: {total_bounces}")
            print(f"  Drops: {total_drops}")
            print(f"  Opens: {total_opens}")
            print(f"  Clicks: {total_clicks}")
            print("")
            
            if total_requests == 0:
                print("⚠️  No email requests found in the last 7 days")
                print("   This could mean:")
                print("   - No emails were sent via SendGrid")
                print("   - Emails failed before reaching SendGrid (check application logs)")
                print("   - API access is limited on your plan")
        else:
            print("  No email activity data available")
            print("  (This could mean no emails were sent, or API access is limited)")
except urllib.error.HTTPError as e:
    error_body = e.read().decode('utf-8')
    print(f"  ⚠️  API Error ({e.code}): {error_body}")
    if e.code == 403:
        print("  This may require a paid SendGrid plan for API access")
except Exception as e:
    print(f"  ⚠️  Error: {e}")

print("")
print("=== Individual Email Messages ===")
print("")
print("  ⚠️  Individual message logs require SendGrid Dashboard access")
print("  The messages API endpoint requires additional authorization")
print("")
print("  Use the SendGrid Dashboard for detailed message logs:")
print("  https://app.sendgrid.com/activity")
print("")

print("=== SendGrid Dashboard Links ===")
print("")
print("For detailed email logs and individual message tracking:")
print("  - Email Activity: https://app.sendgrid.com/activity")
print("    (View individual emails, delivery status, opens, clicks, bounces)")
print("")
print("  - Stats Overview: https://app.sendgrid.com/statistics")
print("    (View aggregated statistics and trends)")
print("")
print("  - Billing/Credits: https://app.sendgrid.com/settings/billing")
print("    (Check your plan, credits, and upgrade options)")
print("")
PYTHON_EOF

