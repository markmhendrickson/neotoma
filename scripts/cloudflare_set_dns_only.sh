#!/usr/bin/env bash
# Set Cloudflare DNS records for the zone to "DNS only" (grey cloud) so traffic
# goes directly to the origin (e.g. GitHub Pages) and avoids 522 origin timeouts.
# Requires CLOUDFLARE_API_TOKEN in environment (or in .env in repo root).
# Usage: ./scripts/cloudflare_set_dns_only.sh [ZONE_NAME]
# Default zone: neotoma.io

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
echo "Zone id: $ZONE_ID"

echo "Listing DNS records..."
DNS_RESP=$(curl -sS -X GET "${API_BASE}/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")
if ! echo "$DNS_RESP" | grep -qE '"success"\s*:\s*true'; then
  echo "Failed to list DNS records: $DNS_RESP"
  exit 1
fi

# Get record ids that are proxied and type A, AAAA, or CNAME
RECORDS=$(echo "$DNS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
if (!d.result || !Array.isArray(d.result)) process.exit(0);
for (const r of d.result) {
  if (r.proxied && ['A','AAAA','CNAME'].includes(r.type)) {
    console.log(r.id + '\t' + r.type + '\t' + r.name);
  }
}
" 2>/dev/null || true)

if [ -z "$RECORDS" ]; then
  echo "No proxied A/AAAA/CNAME records found. Zone is already DNS-only for those types."
  exit 0
fi

while IFS=$'\t' read -r REC_ID REC_TYPE REC_NAME; do
  [ -z "$REC_ID" ] && continue
  echo "Setting $REC_NAME ($REC_TYPE) to DNS only..."
  PATCH_RESP=$(curl -sS -X PATCH "${API_BASE}/zones/${ZONE_ID}/dns_records/${REC_ID}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"proxied":false}')
  if echo "$PATCH_RESP" | grep -qE '"success"\s*:\s*true'; then
    echo "  $REC_NAME is now DNS only (grey cloud)."
  else
    echo "  Failed: $PATCH_RESP"
    exit 1
  fi
done <<< "$RECORDS"

echo "Done. Traffic for $ZONE_NAME now goes directly to origin (no Cloudflare proxy)."
