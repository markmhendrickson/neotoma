#!/usr/bin/env bash
# Set apex A records for the zone to GitHub Pages IPs so the custom domain
# (e.g. neotoma.io) resolves and loads without timeout. Use after turning
# Cloudflare proxy off (DNS only). Requires CLOUDFLARE_API_TOKEN in env or .env.
# Usage: ./scripts/cloudflare_set_github_pages_apex.sh [ZONE_NAME]
# Default zone: neotoma.io

# GitHub Pages apex A record IPs (current as of GitHub docs)
GITHUB_PAGES_IPS=(
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153
)

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
# Apex name: @ for zone apex (API accepts @ or the zone name)
APEX_NAME="@"

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

# Parse apex A records only: id and content (IP). Apex name is @ or zone name.
APEX_RECORDS=$(echo "$DNS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const zone = process.argv[1];
if (!d.result || !Array.isArray(d.result)) process.exit(0);
for (const r of d.result) {
  const apex = r.name === '@' || r.name === zone || (r.name && r.name.replace(/\\.\$/, '') === zone);
  if (apex && r.type === 'A') console.log(r.id + '\t' + r.content);
}
" "$ZONE_NAME" 2>/dev/null || true)

# Delete apex A records that are not in the GitHub Pages set
while IFS=$'\t' read -r REC_ID REC_IP; do
  [ -z "$REC_ID" ] && continue
  if ! echo "${GITHUB_PAGES_IPS[*]}" | grep -qF "$REC_IP"; then
    echo "Removing apex A record $REC_IP (id $REC_ID) - not a GitHub Pages IP."
    DEL_RESP=$(curl -sS -X DELETE "${API_BASE}/zones/${ZONE_ID}/dns_records/${REC_ID}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json")
    if ! echo "$DEL_RESP" | grep -qE '"success"\s*:\s*true'; then
      echo "Failed to delete: $DEL_RESP"
      exit 1
    fi
  fi
done <<< "$APEX_RECORDS"

# IPs we already have (from original list, only those in GitHub set so we don't duplicate)
EXISTING_IPS=""
while IFS=$'\t' read -r _ REC_IP; do
  [ -z "$REC_IP" ] && continue
  for IP in "${GITHUB_PAGES_IPS[@]}"; do
    if [ "$REC_IP" = "$IP" ]; then EXISTING_IPS="$EXISTING_IPS $IP"; break; fi
  done
done <<< "$APEX_RECORDS"

# Ensure each GitHub Pages IP has an apex A record (create if missing)
for IP in "${GITHUB_PAGES_IPS[@]}"; do
  if [[ " $EXISTING_IPS " == *" $IP "* ]]; then
    echo "Apex A $IP already present."
    continue
  fi
  echo "Adding apex A record: $IP"
  CREATE_RESP=$(curl -sS -X POST "${API_BASE}/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"A\",\"name\":\"${APEX_NAME}\",\"content\":\"${IP}\",\"ttl\":1,\"proxied\":false}")
  if ! echo "$CREATE_RESP" | grep -qE '"success"\s*:\s*true'; then
    echo "Failed to create A $IP: $CREATE_RESP"
    exit 1
  fi
  echo "  Added A $APEX_NAME -> $IP (DNS only)."
done

echo "Done. Apex $ZONE_NAME should resolve to GitHub Pages. Allow a few minutes for DNS, then try https://$ZONE_NAME"
