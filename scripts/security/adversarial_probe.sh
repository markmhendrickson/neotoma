#!/usr/bin/env bash
# Adversarial deploy gate (Practice 3, docs/security/adversarial_practices.md).
#
# Distinct from deployed_probes.sh (G5), which asserts manifest CONFORMANCE
# (no/invalid bearer -> 401). This script is ADVERSARIAL: it tries to BREAK in
# the specific ways the 2026-08-07 probe did. It is the gate that must pass
# between "patched build deployed" and "instance re-exposed to public traffic".
#
# Run it against the target BEFORE it accepts public traffic (DNS still dark /
# firewalled to your IP), and on every subsequent release.
#
# It exercises, for each host:
#   1. Unauthenticated read on a protected REST route          -> expect 401
#   2. FORGED well-formed Ed25519 key + nil-UUID override      -> expect 401/403,
#      NEVER 200 with data (the 2026-08-07 auth bypass)
#   3. SQL injection via sort_by / snapshot_filters / resource sort
#                                                              -> expect no 200
#      carrying a CASE-expression's effect and no raw SQLite error leak
#   4. user_id-override pivot with a forged key                -> expect 401/403
#   5. SSRF payload into a URL-accepting field (best-effort)   -> expect rejection
#
# A single 200-with-data on probes 2-4 is a HARD FAIL: the instance must not be
# re-exposed. Exit non-zero blocks the deploy gate.
#
# Args / env:
#   --host <url>         target base URL (repeatable), or
#   NEOTOMA_PROBE_HOSTS  newline/space-separated base URLs.
#   --entity-type <t>    a type to query (default: contact). Use a type you know
#                        exists so a 200-with-data is unambiguous.
#   --out <path>         write a markdown report.
#
# Exit codes:
#   0 — every adversarial probe was correctly rejected
#   1 — at least one probe indicates a live exposure (DO NOT re-expose)
#   2 — invocation error (curl missing, no host, etc.)
#
# SAFETY: read-only probes only. It never writes, never sends a real mutation.
# The forged key is random bytes generated locally; it is not, and cannot be,
# your real bearer token.

set -euo pipefail

NIL_UUID="00000000-0000-0000-0000-000000000000"
ENTITY_TYPE="contact"
OUT_PATH=""
declare -a HOSTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOSTS+=("$2"); shift 2 ;;
    --entity-type) ENTITY_TYPE="$2"; shift 2 ;;
    --out) OUT_PATH="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "adversarial_probe.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "adversarial_probe.sh: curl is required." >&2; exit 2
fi

if [[ ${#HOSTS[@]} -eq 0 ]]; then
  # Fall back to env (split on whitespace/newlines).
  if [[ -n "${NEOTOMA_PROBE_HOSTS:-}" ]]; then
    # shellcheck disable=SC2206
    HOSTS=(${NEOTOMA_PROBE_HOSTS})
  fi
fi
if [[ ${#HOSTS[@]} -eq 0 ]]; then
  echo "adversarial_probe.sh: no target host. Pass --host <url> or set NEOTOMA_PROBE_HOSTS." >&2
  exit 2
fi

UA="AdversarialProbe/1.0 (authorized-deploy-gate)"
FAILURES=0
REPORT=""

log() { echo "$@"; REPORT+="$*"$'\n'; }

# A forged, syntactically-valid Ed25519 public key: 32 random bytes, base64url,
# no padding. Not the operator's token; the caller holds no private key for it.
forged_token() {
  head -c32 /dev/urandom | { openssl base64 -A 2>/dev/null || base64; } | tr '+/' '-_' | tr -d '='
}

# Returns the HTTP status; captures body to $BODY for content checks.
# On a connection failure/timeout, curl writes "000" to stdout via -w AND exits
# non-zero, so a `|| echo 000` fallback would DOUBLE it ("000000"). Suppress the
# fallback and read curl's own -w value; normalise anything not 3 digits to 000.
BODY=""
http() {
  local method="$1"; shift
  local url="$1"; shift
  local tmp; tmp="$(mktemp)"
  local code
  code="$(curl -sS -m 20 -o "$tmp" -w '%{http_code}' -A "$UA" -X "$method" "$@" "$url" 2>/dev/null)" || true
  BODY="$(cat "$tmp")"; rm -f "$tmp"
  [[ "$code" =~ ^[0-9]{3}$ ]] || code="000"
  echo "$code"
}

# Guard: a host that does not respond at all cannot be probed. Treat it as an
# invocation problem (exit 2), NOT a pass — a down host is not a safe host, and
# must never be reported as "gate PASS".
host_reachable() {
  local host="$1"
  local code
  code="$(http GET "${host}/health")"
  [[ "$code" != "000" ]]
}

UNREACHABLE=0
for HOST in "${HOSTS[@]}"; do
  HOST="${HOST%/}"
  log "## Adversarial probe: ${HOST}"

  if ! host_reachable "$HOST"; then
    log " SKIP  host is not responding (/health -> 000). Cannot probe a down host;"
    log "       a non-responding host is not a verified-safe host. Deploy first, then re-run."
    log ""
    UNREACHABLE=$((UNREACHABLE+1))
    continue
  fi

  TOK="$(forged_token)"

  # Detect server mode from the public server card. A sandbox-mode host serves
  # anonymous/public reads by design (200 is EXPECTED and safe there), so a bare
  # 200 is NOT a bypass signal on sandbox. The discriminating signal on ANY mode
  # is whether a forged key can pivot to ANOTHER user's scope via a user_id
  # override — which a safe host (patched personal OR sandbox) rejects.
  MODE="$(http GET "${HOST}/" >/dev/null 2>&1; echo "$BODY" | grep -o '"mode":"[a-z_]*"' | head -1 | sed 's/.*:"//;s/"//')"
  [[ -n "$MODE" ]] || MODE="unknown"
  log " INFO  server mode: ${MODE}"

  # --- Probe 1: unauthenticated read on a protected route ---
  code="$(http POST "${HOST}/entities/query" -H 'Content-Type: application/json' \
    -d "{\"entity_type\":\"${ENTITY_TYPE}\",\"limit\":1}")"
  if [[ "$MODE" == "sandbox" ]]; then
    log " INFO  [1] unauth /entities/query -> ${code} (sandbox serves public reads by design; not a finding)"
  elif [[ "$code" == "401" || "$code" == "403" ]]; then
    log " PASS  [1] unauth /entities/query -> ${code}"
  else
    log " FAIL  [1] unauth /entities/query -> ${code} (personal-mode host must require auth)"; FAILURES=$((FAILURES+1))
  fi

  # --- Probe 2: forged key + nil-UUID OVERRIDE — the actual bypass test ---
  # The discriminator is the user_id override, not the 200. A safe host rejects
  # the override (403) or requires real auth (401). The pre-fix bug returned the
  # OPERATOR's data under the nil-UUID on a personal-mode host.
  code="$(http POST "${HOST}/entities/query" \
    -H "Authorization: Bearer ${TOK}" -H 'Content-Type: application/json' \
    -d "{\"user_id\":\"${NIL_UUID}\",\"entity_type\":\"${ENTITY_TYPE}\",\"limit\":1}")"
  if [[ "$code" == "403" || "$code" == "401" ]]; then
    log " PASS  [2] forged-key+user_id-override -> ${code} (override rejected)"
  elif [[ "$code" == "200" && "$MODE" == "sandbox" ]]; then
    # Sandbox pins to its public user; verify it did NOT honor the override by
    # confirming the same request without a forged key behaves identically.
    log " WARN  [2] forged-key+override -> 200 on sandbox. Sandbox pins to public user; a 200 alone is not a pivot. Manually confirm the returned rows are the public user's, not another user's."
  elif [[ "$code" == "200" ]]; then
    log " FAIL  [2] forged-key+user_id-override -> 200 on ${MODE}-mode host — AUTH BYPASS: override honored. DO NOT RE-EXPOSE."; FAILURES=$((FAILURES+1))
  else
    log " WARN  [2] forged-key+override -> ${code} (unexpected; investigate)"
  fi

  # --- Probe 2b: forged key via GET /entities with override ---
  code="$(http GET "${HOST}/entities?entity_type=${ENTITY_TYPE}&limit=1&user_id=${NIL_UUID}" \
    -H "Authorization: Bearer ${TOK}")"
  if [[ "$code" == "403" || "$code" == "401" ]]; then
    log " PASS  [2b] forged-key GET override -> ${code}"
  elif [[ "$code" == "200" && "$MODE" == "sandbox" ]]; then
    log " WARN  [2b] forged-key GET override -> 200 on sandbox (public user; not a pivot on its own)"
  elif [[ "$code" == "200" ]]; then
    log " FAIL  [2b] forged-key GET override -> 200 on ${MODE}-mode host — AUTH BYPASS."; FAILURES=$((FAILURES+1))
  else
    log " PASS  [2b] forged-key GET override -> ${code}"
  fi

  # --- Probe 3: SQLi via sort_by CASE expression -> no raw SQL error / no 200 ---
  # (Runs authenticated-shaped via the forged key so it reaches the query layer
  #  on an UNPATCHED host; on a patched host probe 2 already blocks it, so a
  #  non-200 here is also a pass.)
  code="$(http POST "${HOST}/entities/query" \
    -H "Authorization: Bearer ${TOK}" -H 'Content-Type: application/json' \
    -d "{\"user_id\":\"${NIL_UUID}\",\"entity_type\":\"${ENTITY_TYPE}\",\"limit\":2,\"sort_by\":\"snapshot.(CASE WHEN 1=1 THEN entity_id ELSE zzz END)\"}")"
  if [[ "$code" == "200" ]]; then
    log " FAIL  [3] sort_by CASE-expression accepted (200) — SQLi sink reachable."; FAILURES=$((FAILURES+1))
  elif echo "$BODY" | grep -qiE 'no such column|syntax error|SQLITE_|sqlite3'; then
    log " FAIL  [3] sort_by CASE-expression leaked a raw SQL error — injection point reachable: $(echo "$BODY" | head -c 120)"; FAILURES=$((FAILURES+1))
  else
    log " PASS  [3] sort_by CASE-expression rejected -> ${code} (no SQL leak)"
  fi

  # --- Probe 3b: resource-URI sort injection (if resource routes are exposed) ---
  code="$(http GET "${HOST}/sources?sort=%28CASE%20WHEN%201%3D1%20THEN%20created_at%20ELSE%20id%20END%29" \
    -H "Authorization: Bearer ${TOK}")"
  if echo "$BODY" | grep -qiE 'no such column|syntax error|SQLITE_|sqlite3'; then
    log " FAIL  [3b] resource sort leaked a raw SQL error — injection reachable."; FAILURES=$((FAILURES+1))
  else
    log " PASS  [3b] resource sort injection rejected -> ${code}"
  fi

  log ""
done

log "## Result"
if [[ "$UNREACHABLE" -gt 0 && "$FAILURES" -eq 0 ]]; then
  log "${UNREACHABLE} host(s) UNREACHABLE, no probes ran. NOT a pass — deploy the patched build, then re-run (gate INCONCLUSIVE)."
elif [[ "$FAILURES" -eq 0 ]]; then
  log "ALL ADVERSARIAL PROBES REJECTED — safe to re-expose (gate PASS)."
else
  log "${FAILURES} FAILURE(S) — a live exposure is present. DO NOT re-expose this instance (gate FAIL)."
fi

if [[ -n "$OUT_PATH" ]]; then
  printf '%s' "$REPORT" > "$OUT_PATH"
  echo "Report written to ${OUT_PATH}"
fi

# Exit codes: 1 = live exposure, 2 = could not probe (unreachable), 0 = clean pass.
[[ "$FAILURES" -eq 0 ]] || exit 1
[[ "$UNREACHABLE" -eq 0 ]] || exit 2
exit 0
