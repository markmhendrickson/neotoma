#!/bin/bash
# Debug SSL certificate issues for dev proxy

set -e

echo "=== SSL Certificate Debug ==="
echo ""

echo "1. Certificate file info:"
if [ -f .dev-certs/dev.crt ]; then
    echo "   ✓ Certificate file exists"
    openssl x509 -in .dev-certs/dev.crt -noout -subject -dates -fingerprint -sha256
    echo ""
    echo "   Subject Alternative Names:"
    openssl x509 -in .dev-certs/dev.crt -text -noout | grep -A 1 "Subject Alternative Name" | grep "DNS:" | sed 's/^[[:space:]]*/     /'
else
    echo "   ✗ Certificate file not found"
    exit 1
fi

echo ""
echo "2. Certificate being served by proxy:"
if lsof -i :443 > /dev/null 2>&1; then
    echo "   ✓ Port 443 is listening"
    echo ""
    echo "   Certificate subject:"
    echo | openssl s_client -connect localhost:443 -servername dev.dev 2>&1 | openssl x509 -noout -subject -dates 2>/dev/null | sed 's/^/     /' || echo "     ✗ Could not connect to proxy"
    echo ""
    echo "   Subject Alternative Names:"
    echo | openssl s_client -connect localhost:443 -servername dev.dev 2>&1 | openssl x509 -noout -text 2>/dev/null | grep -A 1 "Subject Alternative Name" | grep "DNS:" | sed 's/^[[:space:]]*/     /' || echo "     ✗ Could not retrieve"
else
    echo "   ✗ Port 443 is not listening"
fi

echo ""
echo "3. Certificate fingerprints (should match):"
echo "   File:    $(openssl x509 -in .dev-certs/dev.crt -noout -fingerprint -sha256 | cut -d= -f2)"
if lsof -i :443 > /dev/null 2>&1; then
    echo "   Server:  $(echo | openssl s_client -connect localhost:443 -servername dev.dev 2>&1 | openssl x509 -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 || echo 'Could not connect')"
else
    echo "   Server:  (proxy not running)"
fi

echo ""
echo "4. Chrome HSTS cache check:"
echo "   Open chrome://net-internals/#hsts"
echo "   Search for 'dev.dev' and delete any entries"
echo ""
echo "5. Keychain certificate check:"
echo "   Open Keychain Access and search for '*.dev' or 'dev.dev'"
echo "   Remove any old certificates"
echo "   Add .dev-certs/dev.crt to System keychain with 'Always Trust'"

echo ""
echo "=== Test Commands ==="
echo ""
echo "Test HTTPS connection:"
echo "  curl -k -v https://dev.dev"
echo ""
echo "Test certificate directly:"
echo "  openssl s_client -connect dev.dev:443 -servername dev.dev"



















