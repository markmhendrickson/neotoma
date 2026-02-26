#!/usr/bin/env bash
# Remove Cloudflare forwarding/redirect that sends neotoma.io to GitHub.
# Uses Rulesets API (account tokens work; Page Rules API does not).
# Requires CLOUDFLARE_API_TOKEN in environment (or in .env in repo root).
# Usage: ./scripts/remove_cloudflare_redirect.sh

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
ZONE_NAME="neotoma.io"

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

echo "Listing zone rulesets..."
RULESETS_RESP=$(curl -sS -X GET "${API_BASE}/zones/${ZONE_ID}/rulesets" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json")
if ! echo "$RULESETS_RESP" | grep -qE '"success"\s*:\s*true'; then
  echo "Failed to list rulesets: $RULESETS_RESP"
  exit 1
fi

# Get all zone ruleset IDs (redirect rules can be in http_request_dynamic_redirect or similar)
RULESET_IDS=$(echo "$RULESETS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
if (!d.result || !Array.isArray(d.result)) process.exit(0);
for (const rs of d.result) console.log(rs.id);
" 2>/dev/null || true)

REMOVED=0
for RSID in $RULESET_IDS; do
  echo "Fetching ruleset $RSID..."
  RS_RESP=$(curl -sS -X GET "${API_BASE}/zones/${ZONE_ID}/rulesets/${RSID}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json")
  if ! echo "$RS_RESP" | grep -qE '"success"\s*:\s*true'; then
    continue
  fi
  # Find rule IDs that redirect to *github*
  RULE_IDS=$(echo "$RS_RESP" | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const rs = d.result;
if (!rs || !Array.isArray(rs.rules)) process.exit(0);
for (const r of rs.rules) {
  if (r.action !== 'redirect') continue;
  const ap = r.action_parameters || {};
  const url = ap.url || (ap.to && ap.to.value) || (ap.from_value && ap.from_value.target_url && ap.from_value.target_url.value);
  const toUrl = typeof url === 'string' ? url : (url && url.value);
  if (toUrl && toUrl.includes('github')) console.log(r.id);
}
" 2>/dev/null || true)
  for RID in $RULE_IDS; do
    echo "Deleting redirect rule $RID from ruleset $RSID..."
    DEL_RESP=$(curl -sS -X DELETE "${API_BASE}/zones/${ZONE_ID}/rulesets/${RSID}/rules/${RID}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json")
    if echo "$DEL_RESP" | grep -qE '"success"\s*:\s*true'; then
      echo "Deleted rule $RID."
      REMOVED=$((REMOVED + 1))
    else
      echo "Failed to delete $RID: $DEL_RESP"
    fi
  done
done

if [ "$REMOVED" -eq 0 ]; then
  echo "No redirect rules to github found in zone rulesets."
  echo "If neotoma.io still redirects, the rule may be a Page Rule (requires zone API key in dashboard): Dashboard > Rules > Page Rules."
  echo "Or remove it manually: Dashboard > Rules > Redirect Rules (or Page Rules)."
  exit 0
fi

echo "Redirect removal complete. Verify: curl -sI https://neotoma.io should return 200 and stay on neotoma.io."
