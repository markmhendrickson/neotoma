#!/usr/bin/env bash
# Run Neotoma dev API (tunnel + server) for LaunchAgent. Stays running until stopped.
# Used by com.neotoma.dev-servers.plist so dev servers start at login and resume after reboot.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
# Load .env if present so NEOTOMA_* and tunnel vars are set
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi
exec npm run dev:api
