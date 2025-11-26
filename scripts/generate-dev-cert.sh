#!/bin/bash
# Generate self-signed certificate for *.dev domains

set -e

CERT_DIR=".dev-certs"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_PATH="$PROJECT_ROOT/$CERT_DIR"

mkdir -p "$CERT_PATH"

# Generate private key
openssl genrsa -out "$CERT_PATH/dev.key" 2048

# Generate certificate signing request
openssl req -new -key "$CERT_PATH/dev.key" -out "$CERT_PATH/dev.csr" -config - <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = *.dev

[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
basicConstraints = CA:FALSE

[alt_names]
DNS.1 = *.dev
DNS.2 = dev.dev
DNS.3 = dev
DNS.4 = localhost
EOF

# Generate self-signed certificate
openssl x509 -req -in "$CERT_PATH/dev.csr" -signkey "$CERT_PATH/dev.key" -out "$CERT_PATH/dev.crt" -days 365 -extensions v3_req -extfile - <<EOF
[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
basicConstraints = CA:FALSE

[alt_names]
DNS.1 = *.dev
DNS.2 = dev.dev
DNS.3 = dev
DNS.4 = localhost
EOF

# Clean up CSR
rm "$CERT_PATH/dev.csr"

echo "✓ Certificate generated: $CERT_PATH/dev.crt"
echo "✓ Private key generated: $CERT_PATH/dev.key"
echo ""
echo "To trust this certificate in macOS:"
echo "  1. Open Keychain Access"
echo "  2. Drag $CERT_PATH/dev.crt into 'System' keychain"
echo "  3. Double-click the certificate and set 'Trust' to 'Always Trust'"
echo ""
echo "If you get ERR_SSL_KEY_USAGE_INCOMPATIBLE in Chrome:"
echo "  1. Remove the old certificate from Keychain Access (search for '*.dev')"
echo "  2. Restart the dev proxy server to load the new certificate"
echo "  3. Clear Chrome's SSL state: chrome://net-internals/#hsts (Delete all domain security policies)"
echo "  4. Close and reopen Chrome"

