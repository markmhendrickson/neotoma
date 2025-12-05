#!/bin/bash
# Fix SSL certificate issues by removing and re-adding certificate

set -e

echo "=== Fixing SSL Certificate ==="
echo ""

# Remove old certificates from System keychain
echo "1. Removing old certificates from System keychain..."
security delete-certificate -c "*.dev" /Library/Keychains/System.keychain 2>/dev/null || echo "   (No old certificate found or already removed)"

# Add new certificate to System keychain
echo ""
echo "2. Adding new certificate to System keychain..."
if [ -f .dev-certs/dev.crt ]; then
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain .dev-certs/dev.crt
    echo "   ✓ Certificate added to System keychain"
    
    echo ""
    echo "3. Verifying certificate trust settings..."
    security trust-settings-export -d /tmp/trust_settings.plist 2>/dev/null || echo "   (Could not export trust settings)"
    
    echo ""
    echo "4. Next steps:"
    echo "   a) Open Keychain Access"
    echo "   b) Search for '*.dev' in System keychain"
    echo "   c) Double-click the certificate"
    echo "   d) Expand 'Trust' section"
    echo "   e) Set 'When using this certificate:' to 'Always Trust'"
    echo ""
    echo "   f) Clear Chrome HSTS cache:"
    echo "      - Open chrome://net-internals/#hsts"
    echo "      - Delete 'dev.dev' and '*.dev' from HSTS"
    echo ""
    echo "   g) Close and reopen Chrome completely"
    echo ""
    echo "   h) Restart dev proxy if needed:"
    echo "      pkill -f 'dev-proxy.js' && npm run dev:serve"
else
    echo "   ✗ Certificate file not found. Run: ./scripts/generate-dev-cert.sh"
    exit 1
fi

echo ""
echo "=== Certificate Info ==="
openssl x509 -in .dev-certs/dev.crt -noout -subject -dates | sed 's/^/   /'














