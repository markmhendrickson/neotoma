#!/usr/bin/env bash
# Run the sandbox DB + sources wipe + HTTP re-seed on the **same Fly Machine**
# that already mounts `persistent_sandbox` at /data.
#
# You cannot attach one Fly Volume to two Machines at once, so a separate
# `fly machines run --volume …` reset job would fail while the app is running.
# Instead we open an SSH session into the running app and execute the compiled
# reset entrypoint there (see Dockerfile: dist/scripts + tests/fixtures).
#
# Usage:
#   export FLY_API_TOKEN=…   # or `fly auth login`
#   ./scripts/schedule_sandbox_reset.sh
#
# Environment:
#   NEOTOMA_SANDBOX_FLY_APP   default neotoma-sandbox
#   NEOTOMA_SANDBOX_RESET_BASE_URL  URL the seeder uses (default http://127.0.0.1:3180)
#   NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS  pause after deleting sqlite before HTTP seed (default 3000)
#
# Automation: prefer GitHub Actions (`.github/workflows/sandbox-weekly-reset.yml`)
# on a weekly cron with repository secrets `FLY_API_TOKEN`.

set -euo pipefail

APP="${NEOTOMA_SANDBOX_FLY_APP:-neotoma-sandbox}"
BASE_URL="${NEOTOMA_SANDBOX_RESET_BASE_URL:-http://127.0.0.1:3180}"
POST_MS="${NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS:-3000}"

echo "Running sandbox reset via SSH on app=${APP}"
echo "  NEOTOMA_SANDBOX_RESET_BASE_URL=${BASE_URL}"
echo "  NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS=${POST_MS}"

# Remote defaults: same in-container paths as fly.sandbox.toml [[mounts]].
# Use /bin/sh because the runtime image is Alpine-based and does not guarantee
# bash is installed inside the app container.
flyctl ssh console \
  --app "${APP}" \
  -C "/bin/sh -lc 'cd /app && NEOTOMA_DATA_DIR=/data NEOTOMA_SANDBOX_MODE=1 NEOTOMA_SANDBOX_POST_WIPE_DELAY_MS=${POST_MS} NEOTOMA_SANDBOX_BASE_URL=${BASE_URL} node dist/scripts/reset_sandbox.js'"

echo "Reset finished."
