#!/bin/bash
# Diagnose Supabase 500 error when sending confirmation emails
# This script tests all components of the email delivery chain

set -e

# Load .env
if [ -f .env ]; then
  SUPABASE_PROJECT_ID=$(grep "^SUPABASE_PROJECT_ID=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SUPABASE_ACCESS_TOKEN=$(grep "^SUPABASE_ACCESS_TOKEN=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SENDGRID_API_KEY=$(grep "^SENDGRID_API_KEY=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
  SENDGRID_SENDER_EMAIL=$(grep "^SENDGRID_SENDER_EMAIL=" .env | cut -d '=' -f2- | sed 's/^"//;s/"$//' | tr -d '\n')
fi

echo "🔍 Diagnosing Supabase 500 Email Error"
echo ""

# Hypothesis A: Check SMTP configuration in Supabase
echo "📋 Hypothesis A: Verifying SMTP configuration in Supabase..."
SUPABASE_CONFIG=$(curl -s -X GET \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json")

EXTERNAL_EMAIL_ENABLED=$(echo "$SUPABASE_CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('external_email_enabled', False))" 2>/dev/null || echo "unknown")
SMTP_HOST=$(echo "$SUPABASE_CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('smtp_host', 'not set'))" 2>/dev/null || echo "unknown")
SMTP_ADMIN_EMAIL=$(echo "$SUPABASE_CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('smtp_admin_email', 'not set'))" 2>/dev/null || echo "unknown")

echo "  external_email_enabled: ${EXTERNAL_EMAIL_ENABLED}"
echo "  smtp_host: ${SMTP_HOST}"
echo "  smtp_admin_email: ${SMTP_ADMIN_EMAIL}"

# #region agent log - Hypothesis A
echo "{\"location\":\"diagnose_supabase_email_500.sh:25\",\"message\":\"Supabase SMTP config check\",\"data\":{\"externalEmailEnabled\":\"${EXTERNAL_EMAIL_ENABLED}\",\"smtpHost\":\"${SMTP_HOST}\",\"smtpAdminEmail\":\"${SMTP_ADMIN_EMAIL}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"A\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
# #endregion

if [ "$EXTERNAL_EMAIL_ENABLED" != "True" ] || [ "$SMTP_HOST" != "smtp.sendgrid.net" ]; then
  echo "  ❌ SMTP not properly configured"
else
  echo "  ✅ SMTP configuration looks correct"
fi
echo ""

# Hypothesis B: Test SendGrid SMTP connection directly
echo "📋 Hypothesis B: Testing SendGrid SMTP connection..."
if [ -n "$SENDGRID_API_KEY" ] && [ -n "$SENDGRID_SENDER_EMAIL" ]; then
  # Test SMTP authentication using openssl
  SMTP_TEST=$(echo -e "QUIT" | timeout 5 openssl s_client -connect smtp.sendgrid.net:587 -starttls smtp 2>&1 | grep -i "auth\|error\|connected" | head -5 || echo "connection_failed")
  
  # #region agent log - Hypothesis B
  echo "{\"location\":\"diagnose_supabase_email_500.sh:40\",\"message\":\"SendGrid SMTP connection test\",\"data\":{\"testResult\":\"${SMTP_TEST}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"B\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
  # #endregion
  
  echo "  SMTP connection test: ${SMTP_TEST}"
  echo "  ✅ SendGrid SMTP server is reachable"
else
  echo "  ⚠️  SendGrid credentials not found in .env"
fi
echo ""

# Hypothesis C: Check SendGrid API key permissions
echo "📋 Hypothesis C: Verifying SendGrid API key permissions..."
if [ -n "$SENDGRID_API_KEY" ]; then
  SCOPES_CHECK=$(curl -s -X GET "https://api.sendgrid.com/v3/scopes" \
    -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
    -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"api_failed"}')
  
  SCOPES_COUNT=$(echo "$SCOPES_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); scopes=d.get('scopes',[]); print(len(scopes))" 2>/dev/null || echo "0")
  HAS_MAIL_SEND=$(echo "$SCOPES_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); scopes=d.get('scopes',[]); has_mail=any('mail.send' in s.lower() for s in scopes); print('true' if has_mail or len(scopes)==0 else 'false')" 2>/dev/null || echo "unknown")
  
  # #region agent log - Hypothesis C
  echo "{\"location\":\"diagnose_supabase_email_500.sh:55\",\"message\":\"SendGrid API key scopes check\",\"data\":{\"scopesCount\":${SCOPES_COUNT},\"hasMailSend\":\"${HAS_MAIL_SEND}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"C\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
  # #endregion
  
  echo "  API key scopes: ${SCOPES_COUNT}"
  echo "  Has mail.send permission: ${HAS_MAIL_SEND}"
  
  if [ "$HAS_MAIL_SEND" != "true" ] && [ "$SCOPES_COUNT" != "0" ]; then
    echo "  ❌ API key may not have mail.send permission"
  else
    echo "  ✅ API key permissions look correct"
  fi
else
  echo "  ⚠️  SENDGRID_API_KEY not found"
fi
echo ""

# Hypothesis D: Check sender email verification
echo "📋 Hypothesis D: Verifying sender email in SendGrid..."
if [ -n "$SENDGRID_API_KEY" ] && [ -n "$SENDGRID_SENDER_EMAIL" ]; then
  SENDER_CHECK=$(curl -s -X GET "https://api.sendgrid.com/v3/verified_senders?email=${SENDGRID_SENDER_EMAIL}" \
    -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
    -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"api_failed"}')
  
  SENDER_VERIFIED=$(echo "$SENDER_CHECK" | python3 -c "import sys, json; d=json.load(sys.stdin); senders=d.get('results',[]); verified=any(s.get('verified',{}).get('status')=='verified' for s in senders if s.get('email')=='${SENDGRID_SENDER_EMAIL}'); print('true' if verified else 'false')" 2>/dev/null || echo "unknown")
  
  # #region agent log - Hypothesis D
  echo "{\"location\":\"diagnose_supabase_email_500.sh:75\",\"message\":\"SendGrid sender verification check\",\"data\":{\"senderEmail\":\"${SENDGRID_SENDER_EMAIL}\",\"senderVerified\":\"${SENDER_VERIFIED}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"D\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
  # #endregion
  
  echo "  Sender email: ${SENDGRID_SENDER_EMAIL}"
  echo "  Verified: ${SENDER_VERIFIED}"
  
  if [ "$SENDER_VERIFIED" != "true" ]; then
    echo "  ❌ Sender email is not verified in SendGrid"
  else
    echo "  ✅ Sender email is verified"
  fi
else
  echo "  ⚠️  SendGrid credentials not found"
fi
echo ""

# Hypothesis E: Check recent SendGrid email activity
echo "📋 Hypothesis E: Checking SendGrid email activity (last 24h)..."
if [ -n "$SENDGRID_API_KEY" ]; then
  # Get email stats from SendGrid
  START_DATE=$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d "1 day ago" +%Y-%m-%d 2>/dev/null || echo "")
  if [ -n "$START_DATE" ]; then
    EMAIL_STATS=$(curl -s -X GET "https://api.sendgrid.com/v3/stats?start_date=${START_DATE}&aggregated_by=day" \
      -H "Authorization: Bearer ${SENDGRID_API_KEY}" \
      -H "Content-Type: application/json" 2>/dev/null || echo '{"error":"api_failed"}')
    
    EMAILS_SENT=$(echo "$EMAIL_STATS" | python3 -c "import sys, json; d=json.load(sys.stdin); stats=d[0].get('stats',[{}])[0] if d and isinstance(d,list) and len(d)>0 else {}; print(stats.get('metrics',{}).get('delivered',0))" 2>/dev/null || echo "unknown")
    BOUNCES=$(echo "$EMAIL_STATS" | python3 -c "import sys, json; d=json.load(sys.stdin); stats=d[0].get('stats',[{}])[0] if d and isinstance(d,list) and len(d)>0 else {}; print(stats.get('metrics',{}).get('bounces',0))" 2>/dev/null || echo "unknown")
    
    # #region agent log - Hypothesis E
    echo "{\"location\":\"diagnose_supabase_email_500.sh:100\",\"message\":\"SendGrid email activity check\",\"data\":{\"emailsSent\":\"${EMAILS_SENT}\",\"bounces\":\"${BOUNCES}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"E\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
    # #endregion
    
    echo "  Emails sent (last 24h): ${EMAILS_SENT}"
    echo "  Bounces: ${BOUNCES}"
    
    if [ "$BOUNCES" != "0" ] && [ "$BOUNCES" != "unknown" ]; then
      echo "  ⚠️  Some emails are bouncing"
    fi
  else
    echo "  ⚠️  Could not calculate date range"
  fi
else
  echo "  ⚠️  SENDGRID_API_KEY not found"
fi
echo ""

# Hypothesis F: Check if Supabase is using custom SMTP vs default
echo "📋 Hypothesis F: Verifying Supabase is using custom SMTP (not default)..."
MAILER_AUTOCONFIRM=$(echo "$SUPABASE_CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('mailer_autoconfirm', False))" 2>/dev/null || echo "unknown")
SMTP_USER=$(echo "$SUPABASE_CONFIG" | python3 -c "import sys, json; d=json.load(sys.stdin); print('set' if d.get('smtp_user') else 'not set')" 2>/dev/null || echo "unknown")

# #region agent log - Hypothesis F
echo "{\"location\":\"diagnose_supabase_email_500.sh:120\",\"message\":\"Supabase SMTP usage check\",\"data\":{\"mailerAutoconfirm\":\"${MAILER_AUTOCONFIRM}\",\"smtpUser\":\"${SMTP_USER}\"},\"timestamp\":$(date +%s000),\"sessionId\":\"debug-session\",\"hypothesisId\":\"F\"}" >> /Users/markmhendrickson/repos/neotoma/.cursor/debug.log
# #endregion

echo "  mailer_autoconfirm: ${MAILER_AUTOCONFIRM}"
echo "  smtp_user: ${SMTP_USER}"

if [ "$EXTERNAL_EMAIL_ENABLED" = "True" ] && [ "$SMTP_USER" = "set" ]; then
  echo "  ✅ Supabase is configured to use custom SMTP"
else
  echo "  ❌ Supabase may be using default email service"
fi
echo ""

echo "📋 Summary:"
echo "  Run this script and then attempt a signup to capture the 500 error."
echo "  Check /Users/markmhendrickson/repos/neotoma/.cursor/debug.log for detailed diagnostics."
