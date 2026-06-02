#!/usr/bin/env bash
# install.sh — render and install Neotoma launchagent plists
#
# Usage:
#   ./install.sh [--dry-run]
#
# Variables resolved (in order of precedence):
#   1. Env vars you export before running
#   2. Auto-detected from your environment
#
# After install, load with:
#   launchctl load ~/Library/LaunchAgents/com.neotoma.*.plist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"
DRY_RUN=false

for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

# ── Resolve variables ────────────────────────────────────────────────────────

NEOTOMA_REPO_PATH="${NEOTOMA_REPO_PATH:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Node: prefer env var, then nvm current, then which node
if [[ -z "${NODE_BIN:-}" ]]; then
  if command -v nvm &>/dev/null; then
    NODE_BIN="$(nvm which current 2>/dev/null || true)"
  fi
  NODE_BIN="${NODE_BIN:-$(command -v node)}"
fi

# npm-cli.js: derive from node path
if [[ -z "${NPM_CLI:-}" ]]; then
  NODE_DIR="$(dirname "$NODE_BIN")"
  NPM_CLI="$(ls "$NODE_DIR/../lib/node_modules/npm/bin/npm-cli.js" 2>/dev/null || echo "")"
fi

NPM_BIN="${NPM_BIN:-$(command -v npm)}"

echo "Resolved variables:"
echo "  NEOTOMA_REPO_PATH = $NEOTOMA_REPO_PATH"
echo "  NODE_BIN          = $NODE_BIN"
echo "  NPM_CLI           = $NPM_CLI"
echo "  NPM_BIN           = $NPM_BIN"
echo ""

if [[ ! -d "$NEOTOMA_REPO_PATH" ]]; then
  echo "ERROR: NEOTOMA_REPO_PATH does not exist: $NEOTOMA_REPO_PATH" >&2
  exit 1
fi

# ── Render and install ───────────────────────────────────────────────────────

for tmpl in "$SCRIPT_DIR"/*.plist.tmpl; do
  name="$(basename "$tmpl" .plist.tmpl)"
  dest="$LAUNCHAGENTS_DIR/${name}.plist"

  rendered="$(sed \
    -e "s|{{NEOTOMA_REPO_PATH}}|$NEOTOMA_REPO_PATH|g" \
    -e "s|{{NODE_BIN}}|$NODE_BIN|g" \
    -e "s|{{NPM_CLI}}|$NPM_CLI|g" \
    -e "s|{{NPM_BIN}}|$NPM_BIN|g" \
    "$tmpl")"

  if $DRY_RUN; then
    echo "── $dest (dry run) ──"
    echo "$rendered"
    echo ""
  else
    echo "Installing $dest"
    echo "$rendered" > "$dest"
  fi
done

if ! $DRY_RUN; then
  echo ""
  echo "Done. To load all agents:"
  echo "  launchctl load $LAUNCHAGENTS_DIR/com.neotoma.prod-server.plist"
  echo "  launchctl load $LAUNCHAGENTS_DIR/com.neotoma.issues-sync.plist"
  echo "  launchctl load $LAUNCHAGENTS_DIR/com.neotoma.watch-build.plist"
  echo ""
  echo "To check status:"
  echo "  launchctl list | grep neotoma"
fi
