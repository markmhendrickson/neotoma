#!/usr/bin/env bash
# Ensure the zone has a CAA record allowing Let's Encrypt so GitHub Pages can
# provision HTTPS for the custom domain. If any CAA records exist but none allow
# letsencrypt.org, adds one. Requires CLOUDFLARE_API_TOKEN in env or .env.
# Usage: ./scripts/cloudflare_ensure_caa_letsencrypt.sh [ZONE_NAME]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set. Export it or add to .env."
  exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4"
ZONE_NAME="${1:-neotoma.io}"

echo "Fetching zone id for $ZONE_NAME..."
ZONE_RESP=$(curl -sS -X GET "${API_BASE}/zones?name=${ZONE_NAME}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")
if ! echo "$ZONE_RESP" | grep -qE '"success"\s*:\s*true'; then
  echo "Failed to list zones: $ZONE_RESP"
  exit 1
fi
ZONE_ID=$(echo "$ZONE_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const z = d.result && d.result[0];
console.log(z ? z.id : '');
" 2>/dev/null || true)
if [ -z "$ZONE_ID" ]; then
  echo "Zone $ZONE_NAME not found or no access."
  exit 1
fi

echo "Listing CAA records..."
DNS_RESP=$(curl -sS -X GET "${API_BASE}/zones/${ZONE_ID}/dns_records?type=CAA" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")
if ! echo "$DNS_RESP" | grep -qE '"success"\s*:\s*true'; then
  echo "Failed to list DNS records: $DNS_RESP"
  exit 1
fi

# Check if any CAA record allows Let's Encrypt (content contains letsencrypt.org)
HAS_LETSENCRYPT=$(echo "$DNS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
if (!d.result || !Array.isArray(d.result)) process.exit(1);
const has = d.result.some(r => (r.content || '').toLowerCase().includes('letsencrypt'));
process.exit(has ? 0 : 1);
" 2>/dev/null && echo "yes" || echo "")

if [ "$HAS_LETSENCRYPT" = "yes" ]; then
  echo "CAA already allows Let's Encrypt. No change needed."
  exit 0
fi

# If there are CAA records but none for Let's Encrypt, add one
CAA_COUNT=$(echo "$DNS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
console.log((d.result && d.result.length) || 0);
" 2>/dev/null || echo "0")
if [ "$CAA_COUNT" -gt 0 ]; then
  echo "Zone has $CAA_COUNT CAA record(s) but none allow Let's Encrypt. Adding one."
fi

# Add CAA record: 0 issue "letsencrypt.org" for apex
# Cloudflare API: type CAA, name @, data: flags, tag, value
CREATE_RESP=$(curl -sS -X POST "${API_BASE}/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"type":"CAA","name":"@","data":{"flags":0,"tag":"issue","value":"letsencrypt.org"},"ttl":3600}')
if ! echo "$CREATE_RESP" | grep -qE '"success"\s*:\s*true'; then
  echo "Failed to create CAA record: $CREATE_RESP"
  exit 1
fi
echo "Added CAA record: 0 issue \"letsencrypt.org\" for $ZONE_NAME."
echo "GitHub may take a few minutes to retry certificate issuance. Re-add the custom domain in Settings → Pages if needed."
exit 0
