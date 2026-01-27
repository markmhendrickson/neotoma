#!/bin/bash
set -euo pipefail

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "${SENDGRID_API_KEY:-}" ]; then
  echo "❌ SENDGRID_API_KEY not found in .env"
  exit 1
fi

if [ -z "${SENDGRID_SENDER_EMAIL:-}" ]; then
  echo "❌ SENDGRID_SENDER_EMAIL not found in .env"
  exit 1
fi

echo "📋 Testing SendGrid SMTP Authentication..."
echo ""
echo "Configuration:"
echo "  Host: smtp.sendgrid.net"
echo "  Port: 587"
echo "  Username: apikey"
echo "  Password: [API key from .env]"
echo "  Sender: ${SENDGRID_SENDER_EMAIL}"
echo ""

# Test SMTP connection using openssl
echo "Testing SMTP connection..."
(
  echo "EHLO test"
  sleep 1
  echo "AUTH LOGIN"
  sleep 1
  echo -n "apikey" | base64
  sleep 1
  echo -n "${SENDGRID_API_KEY}" | base64
  sleep 1
  echo "QUIT"
) | openssl s_client -connect smtp.sendgrid.net:587 -starttls smtp -quiet 2>&1 | head -20

echo ""
echo "📋 If you see '535 Authentication failed', the API key is being rejected by SendGrid."
echo "   Solution: Regenerate the API key in SendGrid dashboard"
