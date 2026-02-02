#!/bin/bash
# Disable DNS setup for *.dev domains
# Run this script to remove the local DNS configuration

set -e

echo "Disabling DNS for *.dev domains..."

# Stop dnsmasq service (requires sudo)
if brew services list | grep -q "dnsmasq.*started"; then
    echo "Stopping dnsmasq service (requires sudo)..."
    sudo brew services stop dnsmasq
    echo "✓ dnsmasq service stopped"
else
    echo "✓ dnsmasq service is not running"
fi

# Remove macOS resolver configuration (requires sudo)
if [ -f /etc/resolver/dev ]; then
    echo "Removing macOS resolver configuration (requires sudo)..."
    sudo rm /etc/resolver/dev
    echo "✓ macOS resolver configuration removed"
else
    echo "✓ macOS resolver configuration does not exist"
fi

# Optionally remove dnsmasq config file (optional - can keep for future use)
if [ -f /opt/homebrew/etc/dnsmasq.d/dev.conf ]; then
    read -p "Remove dnsmasq config file? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm /opt/homebrew/etc/dnsmasq.d/dev.conf
        echo "✓ dnsmasq configuration file removed"
    else
        echo "✓ dnsmasq configuration file kept (can re-enable later)"
    fi
else
    echo "✓ dnsmasq configuration file does not exist"
fi

echo ""
echo "DNS setup disabled! *.dev domains will no longer resolve to 127.0.0.1"
echo ""
echo "To verify, run: ping -c 1 test.dev"
echo "It should fail or resolve to a different address (not 127.0.0.1)"
echo ""
echo "To re-enable, run: ./scripts/setup-dns.sh"
