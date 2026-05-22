#!/usr/bin/env bash
# Shut down Neotoma LaunchAgents and their supervised processes (macOS only).
# Unloads canonical + legacy Neotoma LaunchAgents under ~/Library/LaunchAgents,
# asks the local CLI to stop dev/prod APIs, and reaps leftover launchd-owned
# repo processes that survive unload.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "shutdown_neotoma_launchagents.sh is macOS only." >&2
  exit 1
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Shut down Neotoma LaunchAgents and their supervised processes (macOS only).

Usage:
  bash scripts/shutdown_neotoma_launchagents.sh
EOF
  exit 0
fi

LA="${HOME}/Library/LaunchAgents"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSX_BIN="${REPO_ROOT}/node_modules/.bin/tsx"
killed_pids=()

append_pid_if_new() {
  local pid="$1"
  case " ${killed_pids[*]} " in
    *" ${pid} "*) ;;
    *) killed_pids+=("$pid") ;;
  esac
}

cwd_for_pid() {
  local pid="$1"
  lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}'
}

queue_ppid1_repo_matches() {
  local pid
  local ppid
  local command
  local cwd
  while IFS= read -r pid ppid command; do
    [[ -z "$pid" || -z "$ppid" ]] && continue
    [[ "$ppid" != "1" ]] && continue
    case "$command" in
      *"${REPO_ROOT}/scripts/run_dev_server_launchd.sh"*|\
      *"${REPO_ROOT}/scripts/run_prod_server_launchd.sh"*|\
      *"${REPO_ROOT}/scripts/run_watch_build_launchd.sh"*|\
      *"${REPO_ROOT}/scripts/run_watch_full_prod_launchd.sh"*|\
      *"${REPO_ROOT}/scripts/run_issues_sync_launchd.sh"*|\
      *"${REPO_ROOT}/scripts/with_branch_ports.js"*|\
      *"${REPO_ROOT}/src/actions.ts"*|\
      *"${REPO_ROOT}/dist/actions.js"*|\
      *"${REPO_ROOT}/dist/cli/bootstrap.js issues sync"*|\
      *"${REPO_ROOT}/node_modules/typescript/bin/tsc --watch --preserveWatchOutput"*|\
      *"${REPO_ROOT}/node_modules/.bin/tsc --watch --preserveWatchOutput"*|\
      *"node dist/index.js"*)
        cwd="$(cwd_for_pid "$pid")"
        case "$cwd" in
          "$REPO_ROOT"|"$REPO_ROOT"/*|/private/tmp/neotoma-*)
            append_pid_if_new "$pid"
            ;;
        esac
        ;;
    esac
  done < <(ps -eo pid=,ppid=,command=)
}

terminate_queued_pids() {
  local pid
  if [[ "${#killed_pids[@]}" -eq 0 ]]; then
    echo "No leftover launchd-owned Neotoma processes found."
    return 0
  fi

  echo "Stopping leftover Neotoma processes..."
  for pid in "${killed_pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null && echo "  TERMed PID=${pid}" || true
  done

  sleep 1
  for pid in "${killed_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null && echo "  SIGKILLed PID=${pid}" || true
    fi
  done
}

unload_label() {
  local label="$1"
  local plist="${LA}/${label}.plist"

  if [[ -f "$plist" ]]; then
    echo "Unloading ${label}..."
    launchctl unload "$plist" 2>/dev/null || true
  else
    echo "Skip ${label} (no plist)"
  fi

  launchctl remove "$label" 2>/dev/null || true
}

stop_api_env() {
  local env_name="$1"

  if [[ ! -x "$TSX_BIN" ]]; then
    echo "Skip neotoma api stop --env ${env_name} (tsx not installed in this checkout)."
    return 0
  fi

  echo "Stopping ${env_name} API via CLI..."
  "$TSX_BIN" "${REPO_ROOT}/src/cli/index.ts" api stop --env "$env_name" --json >/dev/null 2>&1 || true
}

for label in \
  com.neotoma.dev-server \
  com.neotoma.prod-server \
  com.neotoma.watch-build \
  com.neotoma.issues-sync \
  com.neotoma.dev-servers \
  com.neotoma.watch-dev \
  com.neotoma.watch-full-prod \
; do
  unload_label "$label"
done

stop_api_env dev
stop_api_env prod

rm -f \
  "${REPO_ROOT}/.dev-serve/local_http_port" \
  "${REPO_ROOT}/.dev-serve/local_http_port_dev" \
  "${REPO_ROOT}/.dev-serve/local_http_port_prod" \
  2>/dev/null || true

queue_ppid1_repo_matches
terminate_queued_pids

echo "Neotoma LaunchAgents shut down."
