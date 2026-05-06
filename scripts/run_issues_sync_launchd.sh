#!/usr/bin/env bash
# Periodic `neotoma issues sync` for LaunchAgent com.neotoma.issues-sync (default interval: 5 minutes).
# Prefers repo dist CLI; falls back to `neotoma` on PATH (e.g. global npm link).
# Optional secrets: copy scripts/launchd-issues-sync.env.example to data/local/launchd-issues-sync.env (gitignored under data/).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

ENV_FILE="$REPO_ROOT/data/local/launchd-issues-sync.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -f "$REPO_ROOT/dist/cli/bootstrap.js" ]]; then
  exec node "$REPO_ROOT/dist/cli/bootstrap.js" issues sync
fi
if command -v neotoma >/dev/null 2>&1; then
  exec neotoma issues sync
fi

echo "neotoma issues sync: no CLI found. Run npm run build:server in this repo, or install/link neotoma globally." >&2
exit 1
