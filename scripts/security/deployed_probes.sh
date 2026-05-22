#!/usr/bin/env bash
# Deployed protected-route probes (Gate G5).
#
# Run after `npm publish` + `flyctl deploy` (or the weekly sandbox reset
# workflow) from an *external* host so we exercise real network paths
# (TLS, proxy headers, runtime middleware ordering). The probe asserts:
#
#   - Without bearer:    401 / 403 (or the manifest's expected statuses)
#   - With invalid bearer: 401
#
# Output: docs/releases/in_progress/<TAG>/post_deploy_security_probes.md
# (or `--out <path>`).
#
# Required env / args:
#   NEOTOMA_PROBE_HOSTS  — newline-separated base URLs (e.g.
#                          "https://sandbox.neotoma.io
#                           https://neotoma.markmhendrickson.com").
#                          Defaults to sandbox.neotoma.io if unset.
#   --tag vX.Y.Z         — release tag (used for the report path).
#   --out <path>         — override output path.
#   --hosts "<urls>"     — override NEOTOMA_PROBE_HOSTS.
#   --invalid-bearer "<token>" — token used for the invalid-bearer probe
#                          (default: "neotoma-deployed-probes-invalid").
#   --max-routes <n>     — cap routes probed (default: 0 = all).
#
# Exit codes:
#   0 — every probe matched expected statuses
#   1 — at least one probe returned an unexpected status
#   2 — invocation error (jq / curl missing, manifest missing, etc.)
#
# Wired into:
#   - npm run security:probes
#   - .cursor/skills/release/SKILL.md Step 5 (Deployed probes gate)
#   - .github/workflows/sandbox-weekly-reset.yml (weekly check on live sandbox)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1; pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." >/dev/null 2>&1; pwd -P)"
MANIFEST_PATH="${SCRIPT_DIR}/protected_routes_manifest.json"

TAG=""
OUT_PATH=""
HOSTS_OVERRIDE=""
INVALID_BEARER="neotoma-deployed-probes-invalid"
MAX_ROUTES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift 2 ;;
    --out) OUT_PATH="$2"; shift 2 ;;
    --hosts) HOSTS_OVERRIDE="$2"; shift 2 ;;
    --invalid-bearer) INVALID_BEARER="$2"; shift 2 ;;
    --max-routes) MAX_ROUTES="$2"; shift 2 ;;
    --help|-h)
      cat <<USAGE
Usage: deployed_probes.sh --tag vX.Y.Z [--out <path>] [--hosts "<urls>"] [--invalid-bearer <token>] [--max-routes <n>]
USAGE
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "deployed_probes.sh: curl is required." >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "deployed_probes.sh: jq is required (e.g. 'brew install jq' or 'apt-get install jq')." >&2
  exit 2
fi
if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "deployed_probes.sh: ${MANIFEST_PATH} missing. Run 'npm run security:manifest:write'." >&2
  exit 2
fi

if [[ -n "${HOSTS_OVERRIDE}" ]]; then
  HOSTS="${HOSTS_OVERRIDE}"
else
  HOSTS="${NEOTOMA_PROBE_HOSTS:-https://sandbox.neotoma.io}"
fi

# Default tag = latest tag if not provided (best-effort; only used for output path).
if [[ -z "${TAG}" ]]; then
  TAG="$(git -C "${REPO_ROOT}" describe --tags --abbrev=0 2>/dev/null || true)"
  TAG="${TAG:-untagged}"
fi

if [[ -z "${OUT_PATH}" ]]; then
  OUT_PATH="${REPO_ROOT}/docs/releases/in_progress/${TAG}/post_deploy_security_probes.md"
fi
mkdir -p "$(dirname -- "${OUT_PATH}")"

# Build the probe list: only routes that are NOT runtime-only unauth and
# do NOT contain `{` placeholders (those need real ids and are out of
# scope for the negative probe; the matrix manifest covers them).
ROUTES_JSON="$(jq -c '
  .routes
  | map(select(.requires_auth == true and (.path | contains("{") | not)))
' "${MANIFEST_PATH}")"
ROUTE_COUNT="$(echo "${ROUTES_JSON}" | jq 'length')"
if [[ "${ROUTE_COUNT}" -eq 0 ]]; then
  echo "deployed_probes.sh: no protected probeable routes in manifest." >&2
  exit 2
fi

if [[ "${MAX_ROUTES}" -gt 0 ]]; then
  ROUTES_JSON="$(echo "${ROUTES_JSON}" | jq --argjson n "${MAX_ROUTES}" '.[:$n]')"
  ROUTE_COUNT="$(echo "${ROUTES_JSON}" | jq 'length')"
fi

probe_route() {
  local host="$1"
  local method="$2"
  local route="$3"
  local bearer_state="$4"  # "absent" | "invalid"
  local url="${host%/}${route}"
  local -a curl_args=(
    -sS
    -o /dev/null
    -w "%{http_code}"
    -X "${method}"
    --max-time 10
    --retry 2
    --retry-delay 3
  )
  if [[ "${bearer_state}" == "invalid" ]]; then
    curl_args+=(-H "Authorization: Bearer ${INVALID_BEARER}")
  fi
  curl "${curl_args[@]}" "${url}" || echo "000"
}

passes=0
failures=0
results_json="[]"

while IFS= read -r host; do
  [[ -z "${host}" ]] && continue
  echo "deployed_probes.sh: probing ${host} (${ROUTE_COUNT} routes)"
  for i in $(seq 0 $((ROUTE_COUNT - 1))); do
    row="$(echo "${ROUTES_JSON}" | jq ".[${i}]")"
    method="$(echo "${row}" | jq -r '.method')"
    route="$(echo "${row}" | jq -r '.path')"
    expected_no_auth="$(echo "${row}" | jq -c '.expected_no_auth_status')"
    expected_invalid_auth="$(echo "${row}" | jq -c '.expected_invalid_auth_status')"

    no_auth_status="$(probe_route "${host}" "${method}" "${route}" "absent")"
    invalid_auth_status="$(probe_route "${host}" "${method}" "${route}" "invalid")"

    no_auth_ok="$(echo "${expected_no_auth}" | jq --argjson s "${no_auth_status}" 'index($s) != null')"
    invalid_auth_ok="$(echo "${expected_invalid_auth}" | jq --argjson s "${invalid_auth_status}" 'index($s) != null')"

    if [[ "${no_auth_ok}" == "true" && "${invalid_auth_ok}" == "true" ]]; then
      passes=$((passes + 1))
      verdict="pass"
    else
      failures=$((failures + 1))
      verdict="fail"
    fi

    results_json="$(echo "${results_json}" | jq \
      --arg host "${host}" \
      --arg method "${method}" \
      --arg route "${route}" \
      --argjson no_auth "${no_auth_status}" \
      --argjson invalid_auth "${invalid_auth_status}" \
      --argjson expected_no_auth "${expected_no_auth}" \
      --argjson expected_invalid_auth "${expected_invalid_auth}" \
      --arg verdict "${verdict}" \
      '. + [{
        host: $host,
        method: $method,
        route: $route,
        no_auth_status: $no_auth,
        expected_no_auth_status: $expected_no_auth,
        invalid_auth_status: $invalid_auth,
        expected_invalid_auth_status: $expected_invalid_auth,
        verdict: $verdict
      }]')"
  done
done <<<"${HOSTS}"

# Render Markdown report.
{
  echo "# Post-deploy security probes — ${TAG}"
  echo
  echo "Generated by \`npm run security:probes\` on $(date -u +"%Y-%m-%dT%H:%M:%SZ")."
  echo
  echo "- Hosts: $(echo "${HOSTS}" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')"
  echo "- Routes probed: ${ROUTE_COUNT}"
  echo "- Passes: ${passes}"
  echo "- Failures: ${failures}"
  echo
  echo "## Results"
  echo
  echo "| Host | Method | Route | No-auth | Expected | Invalid-auth | Expected | Verdict |"
  echo "|------|--------|-------|---------|----------|--------------|----------|---------|"
  echo "${results_json}" | jq -r '.[] | "| \(.host) | \(.method) | \(.route) | \(.no_auth_status) | \(.expected_no_auth_status) | \(.invalid_auth_status) | \(.expected_invalid_auth_status) | \(.verdict) |"'
  echo
  if [[ "${failures}" -gt 0 ]]; then
    echo "## Action required"
    echo
    echo "${failures} probe(s) returned unexpected statuses. Treat each \`fail\` row as a release blocker (see \`docs/security/threat_model.md\`)."
  else
    echo "All probes passed. Security gate G5 satisfied for \`${TAG}\`."
  fi
} > "${OUT_PATH}"

echo "deployed_probes.sh: wrote ${OUT_PATH} (passes=${passes} failures=${failures})"
if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi
exit 0
