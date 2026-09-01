#!/usr/bin/env bash
#
# Compare a committed Fly config against the machine it would deploy to.
#
# `flyctl deploy` reapplies the committed [[vm]] and [http_service] blocks over
# the running machine. It does not merge, and it prints no warning when it
# SHRINKS one. On 2026-09-01 a deploy from a checkout 139 commits behind main
# reapplied that checkout's 1GB/shared-cpu-1x guest over an instance running
# performance/2 CPU/8GB and dropped its health check, taking it from slow to
# unreachable for ~30 minutes. `flyctl status` reported `started` throughout.
#
# Run this BEFORE deploying anything you care about:
#
#   scripts/check_fly_config_drift.sh --app <app> [--config fly.operator.toml]
#
# Exit 0 = the deploy will not resize the machine or drop its checks.
# Exit 1 = drift; the deploy WOULD change the running machine's shape.
# Exit 2 = could not determine (no flyctl, no jq, app unreachable). Deliberately
#          distinct from 1: "I could not check" must never read as "it is fine".
#
# This is intentionally NOT wired into CI. CI has no Fly credentials, and a
# check that silently degrades to exit 2 on every run is one nobody reads. The
# repo-side invariants that CAN be checked without credentials — sizing floors,
# a check being present, and its path being /ready — are asserted in
# tests/contract/fly_deploy_config.test.ts and run on every PR.

set -euo pipefail

CONFIG="fly.toml"
APP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP="${2:-}"; shift 2 ;;
    --config|-c) CONFIG="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$APP" ]]; then
  echo "error: --app is required (this repo's fly.toml deliberately names no app)" >&2
  exit 2
fi

for tool in flyctl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool not found" >&2; exit 2; }
done

[[ -f "$CONFIG" ]] || { echo "error: no such config: $CONFIG" >&2; exit 2; }

# --- what the file declares -------------------------------------------------
# Read only the [[vm]] block, so a `memory` key elsewhere cannot be mistaken
# for the guest size.
vm_block="$(awk '/^\[\[vm\]\]/{f=1;next} /^\[/{f=0} f' "$CONFIG")"
want_memory="$(grep -oE "memory *= *'[^']*'|memory *= *\"[^\"]*\"" <<<"$vm_block" | head -1 | grep -oE "[0-9]+[a-z]*" || true)"
want_cpus="$(grep -oE 'cpus *= *[0-9]+' <<<"$vm_block" | grep -oE '[0-9]+' | head -1 || true)"
want_kind="$(grep -oE "cpu_kind *= *'[^']*'|cpu_kind *= *\"[^\"]*\"" <<<"$vm_block" | head -1 | sed -E "s/.*[=] *['\"]([^'\"]*)['\"].*/\1/" || true)"
want_checks="$(grep -c '^\s*\[\[http_service\.checks\]\]' "$CONFIG" || true)"

# Normalize '8gb' / '8192' to megabytes so the comparison is apples to apples.
to_mb() {
  local raw="${1:-}" n
  n="$(grep -oE '^[0-9]+' <<<"$raw" || echo 0)"
  [[ "$raw" == *gb ]] && echo $(( n * 1024 )) || echo "$n"
}
want_mb="$(to_mb "$want_memory")"

# --- what is actually running ----------------------------------------------
if ! machines="$(flyctl machine list --app "$APP" --json 2>/dev/null)"; then
  echo "error: could not read machines for $APP (not logged in, or no such app)" >&2
  exit 2
fi

count="$(jq 'length' <<<"$machines")"
if [[ "$count" == "0" ]]; then
  echo "error: $APP has no machines to compare against" >&2
  exit 2
fi

drift=0
while read -r id got_mb got_cpus got_kind got_checks; do
  echo "machine $id: ${got_mb}MB / ${got_cpus} x ${got_kind} / ${got_checks} check(s)"

  if [[ "$want_mb" != "0" && "$got_mb" -gt "$want_mb" ]]; then
    echo "  DRIFT: deploying $CONFIG would SHRINK memory ${got_mb}MB -> ${want_mb}MB" >&2
    drift=1
  elif [[ "$want_mb" != "0" && "$got_mb" -lt "$want_mb" ]]; then
    echo "  note: deploy would GROW memory ${got_mb}MB -> ${want_mb}MB"
  fi

  if [[ -n "$want_cpus" && "$got_cpus" -gt "$want_cpus" ]]; then
    echo "  DRIFT: deploying $CONFIG would REDUCE cpus ${got_cpus} -> ${want_cpus}" >&2
    drift=1
  fi

  # performance -> shared is a downgrade even at identical core counts.
  if [[ -n "$want_kind" && "$got_kind" == "performance" && "$want_kind" != "performance" ]]; then
    echo "  DRIFT: deploying $CONFIG would downgrade cpu_kind ${got_kind} -> ${want_kind}" >&2
    drift=1
  fi

  # The half that made the outage invisible: losing the check means Fly can no
  # longer tell a serving machine from a wedged one.
  if [[ "$got_checks" -gt 0 && "$want_checks" -eq 0 ]]; then
    echo "  DRIFT: deploying $CONFIG would REMOVE all ${got_checks} health check(s)" >&2
    drift=1
  fi
  if [[ "$got_checks" -eq 0 ]]; then
    echo "  WARNING: this machine currently has NO health checks" >&2
  fi
done < <(jq -r '.[] | [
    .id,
    (.config.guest.memory_mb // 0),
    (.config.guest.cpus // 0),
    (.config.guest.cpu_kind // "unknown"),
    ((.config.checks // {}) | length)
  ] | @tsv' <<<"$machines")

if [[ "$drift" -ne 0 ]]; then
  cat >&2 <<EOF

Deploying $CONFIG to $APP would change the running machine's shape.
Either update $CONFIG to match what the machine should run, or deploy from the
config that describes this instance. Do not deploy over this.
EOF
  exit 1
fi

echo "OK: $CONFIG matches the running shape of $APP"
