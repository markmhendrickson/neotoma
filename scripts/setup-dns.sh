#!/bin/bash
# One-time DNS setup script for branch-based dev domains
# Run this script to complete the DNS configuration

set -e

echo "Setting up DNS for *.dev domains..."

# Check if dnsmasq is installed
if ! command -v dnsmasq &> /dev/null; then
    echo "Error: dnsmasq is not installed. Please run: brew install dnsmasq"
    exit 1
fi

# Check if config file exists
if [ ! -f /opt/homebrew/etc/dnsmasq.d/dev.conf ]; then
    echo "Creating dnsmasq configuration..."
    echo "address=/.dev/127.0.0.1" > /opt/homebrew/etc/dnsmasq.d/dev.conf
    echo "✓ dnsmasq configuration created"
else
    echo "✓ dnsmasq configuration already exists"
fi

# Create resolver directory and file (requires sudo)
echo ""
echo "Creating macOS resolver configuration (requires sudo)..."
sudo mkdir -p /etc/resolver
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/dev > /dev/null
echo "✓ macOS resolver configuration created"

# Start dnsmasq service (requires sudo)
echo ""
echo "Starting dnsmasq service (requires sudo)..."
sudo brew services start dnsmasq
echo "✓ dnsmasq service started"

echo ""
echo "DNS setup complete! *.dev domains will now resolve to 127.0.0.1"
echo ""
echo "To verify, run: ping -c 1 test.dev"
echo "You should see it resolve to 127.0.0.1"
echo ""
echo "Next steps:"
echo "1. Generate SSL certificate for HTTPS support:"
echo "   ./scripts/generate-dev-cert.sh"
echo "   (Then trust the certificate in Keychain Access)"
echo ""
echo "2. Start the dev server:"
echo "   sudo npm run dev:serve"
echo "   (HTTPS will be available on port 443, HTTP on port 80)"
echo ""
echo "Or use custom ports:"
echo "   PROXY_HTTP_PORT=8000 PROXY_HTTPS_PORT=8443 npm run dev:serve"

